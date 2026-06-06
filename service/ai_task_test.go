package service

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestSanitizeAIJSONRedactsSecretsAndMedia(t *testing.T) {
	body := []byte(`{
		"model": "test-model",
		"api_key": "sk-secret",
		"authorization": "Bearer token-secret",
		"image_url": {"url": "data:image/png;base64,AAAA"},
		"preview": "blob:http://localhost/image",
		"prompt": "保留普通提示词"
	}`)

	sanitized := SanitizeAIJSON(body, "application/json")
	for _, forbidden := range []string{"sk-secret", "token-secret", "data:image", "base64,AAAA", "blob:http"} {
		if strings.Contains(sanitized, forbidden) {
			t.Fatalf("sanitized json still contains %q: %s", forbidden, sanitized)
		}
	}
	if !strings.Contains(sanitized, "保留普通提示词") {
		t.Fatalf("sanitized json dropped normal prompt: %s", sanitized)
	}
}

func TestAITaskSuccessStoresSanitizedResponse(t *testing.T) {
	setupAITaskTestDB(t)

	task, err := CreateAITask(CreateAITaskInput{
		UserID:      "user-task-success",
		TaskType:    "image_generation",
		Provider:    "cloud",
		Protocol:    "openai",
		Model:       "image-model",
		Path:        "/images/generations",
		RequestBody: []byte(`{"model":"image-model","prompt":"画一张图"}`),
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatalf("CreateAITask returned error: %v", err)
	}
	err = MarkAITaskSucceeded(task.ID, []byte(`{"data":[{"b64_json":"data:image/png;base64,AAAA"}]}`), "application/json")
	if err != nil {
		t.Fatalf("MarkAITaskSucceeded returned error: %v", err)
	}

	saved, ok, err := repository.GetAITask(task.ID)
	if err != nil || !ok {
		t.Fatalf("GetAITask ok=%v err=%v", ok, err)
	}
	if saved.Status != model.AITaskStatusSucceeded {
		t.Fatalf("status = %q", saved.Status)
	}
	if strings.Contains(saved.ResponseJSON, "data:image") || strings.Contains(saved.ResponseJSON, "base64,AAAA") {
		t.Fatalf("response was not sanitized: %s", saved.ResponseJSON)
	}
}

func TestAITaskFailureRefundUsesTaskRelatedID(t *testing.T) {
	setupAITaskTestDB(t)

	_, err := repository.SaveUser(model.User{
		ID:        "user-task-refund",
		Username:  "task-refund",
		Role:      model.UserRoleUser,
		Status:    model.UserStatusActive,
		Credits:   10,
		AffCode:   "REFUND01",
		CreatedAt: now(),
		UpdatedAt: now(),
	})
	if err != nil {
		t.Fatalf("SaveUser returned error: %v", err)
	}
	task, err := CreateAITask(CreateAITaskInput{
		UserID:      "user-task-refund",
		TaskType:    "chat",
		Provider:    "cloud",
		Protocol:    "openai",
		Model:       "chat-model",
		Path:        "/chat/completions",
		Credits:     4,
		RequestBody: []byte(`{"model":"chat-model","messages":[{"role":"user","content":"hi"}]}`),
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatalf("CreateAITask returned error: %v", err)
	}
	if err := ConsumeUserCreditsForTask("user-task-refund", "chat-model", 4, "/chat/completions", task.ID); err != nil {
		t.Fatalf("ConsumeUserCreditsForTask returned error: %v", err)
	}
	if err := MarkAITaskFailed(task.ID, "upstream failed", []byte(`{"error":{"message":"failed"}}`), "application/json"); err != nil {
		t.Fatalf("MarkAITaskFailed returned error: %v", err)
	}
	if err := RefundUserCreditsForTask("user-task-refund", "chat-model", 4, "/chat/completions", task.ID); err != nil {
		t.Fatalf("RefundUserCreditsForTask returned error: %v", err)
	}

	user, ok, err := repository.GetUserByID("user-task-refund")
	if err != nil || !ok {
		t.Fatalf("GetUserByID ok=%v err=%v", ok, err)
	}
	if user.Credits != 10 {
		t.Fatalf("credits = %d, want 10", user.Credits)
	}
	logs, _, err := repository.ListCreditLogs(model.Query{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("ListCreditLogs returned error: %v", err)
	}
	if len(logs) != 2 {
		t.Fatalf("logs len = %d, want 2", len(logs))
	}
	for _, item := range logs {
		if item.RelatedID != task.ID {
			t.Fatalf("credit log related id = %q, want %q", item.RelatedID, task.ID)
		}
	}
}

func TestAITaskArkCreatedStoresUpstreamTaskIDAndInitialStatus(t *testing.T) {
	setupAITaskTestDB(t)

	task, err := CreateAITask(CreateAITaskInput{
		UserID:      "user-task-ark",
		TaskType:    "video_create",
		Provider:    "ark",
		Protocol:    "volcengine-ark",
		Model:       "ep-test",
		Path:        "/videos",
		RequestBody: []byte(`{"model":"ep-test","content":[{"type":"text","text":"生成视频"}]}`),
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatalf("CreateAITask returned error: %v", err)
	}
	if err := MarkAITaskArkCreated(task.ID, []byte(`{"id":"cgt-test","status":"running"}`)); err != nil {
		t.Fatalf("MarkAITaskArkCreated returned error: %v", err)
	}
	saved, ok, err := repository.GetAITask(task.ID)
	if err != nil || !ok {
		t.Fatalf("GetAITask ok=%v err=%v", ok, err)
	}
	if saved.UpstreamTaskID != "cgt-test" {
		t.Fatalf("upstream task id = %q", saved.UpstreamTaskID)
	}
	if saved.Status != model.AITaskStatusRunning {
		t.Fatalf("status = %q, want running", saved.Status)
	}
}

func TestSyncArkVideoAITaskRunningDoesNotRefund(t *testing.T) {
	task := setupVideoAITaskWithConsumedCredits(t, "task-running", 4)

	if err := SyncArkVideoAITaskStatus("task-running", []byte(`{"id":"task-running","status":"running","raw_status":"Running"}`)); err != nil {
		t.Fatalf("SyncArkVideoAITaskStatus returned error: %v", err)
	}

	user, ok, err := repository.GetUserByID(task.UserID)
	if err != nil || !ok {
		t.Fatalf("GetUserByID ok=%v err=%v", ok, err)
	}
	if user.Credits != 6 {
		t.Fatalf("credits = %d, want 6", user.Credits)
	}
	logs, _, err := repository.ListCreditLogs(model.Query{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("ListCreditLogs returned error: %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("logs len = %d, want only consume log", len(logs))
	}
	saved, _, _ := repository.GetAITask(task.ID)
	if saved.Status != model.AITaskStatusRunning || saved.RawStatus != "Running" {
		t.Fatalf("task status/raw = %q/%q", saved.Status, saved.RawStatus)
	}
}

func TestSyncArkVideoAITaskFailedRefundsOnce(t *testing.T) {
	task := setupVideoAITaskWithConsumedCredits(t, "task-failed", 4)

	body := []byte(`{"id":"task-failed","status":"failed","raw_status":"Failed","error":{"code":"BadInput","message":"素材不合规"}}`)
	if err := SyncArkVideoAITaskStatus("task-failed", body); err != nil {
		t.Fatalf("SyncArkVideoAITaskStatus returned error: %v", err)
	}
	if err := SyncArkVideoAITaskStatus("task-failed", body); err != nil {
		t.Fatalf("second SyncArkVideoAITaskStatus returned error: %v", err)
	}

	user, ok, err := repository.GetUserByID(task.UserID)
	if err != nil || !ok {
		t.Fatalf("GetUserByID ok=%v err=%v", ok, err)
	}
	if user.Credits != 10 {
		t.Fatalf("credits = %d, want refunded balance 10", user.Credits)
	}
	logs, _, err := repository.ListCreditLogs(model.Query{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("ListCreditLogs returned error: %v", err)
	}
	if len(logs) != 2 {
		t.Fatalf("logs len = %d, want consume + one refund", len(logs))
	}
	saved, _, _ := repository.GetAITask(task.ID)
	if saved.Status != model.AITaskStatusFailed || saved.ErrorCode != "BadInput" || saved.ErrorMessage != "素材不合规" {
		t.Fatalf("task failure fields = status:%q code:%q message:%q", saved.Status, saved.ErrorCode, saved.ErrorMessage)
	}
	if saved.RefundedAt == "" {
		t.Fatal("RefundedAt was not set")
	}
}

func TestSyncArkVideoAITaskSucceededDoesNotRefund(t *testing.T) {
	task := setupVideoAITaskWithConsumedCredits(t, "task-succeeded", 4)

	if err := SyncArkVideoAITaskStatus("task-succeeded", []byte(`{"id":"task-succeeded","status":"completed","raw_status":"Succeeded","video_url":"https://example.com/video.mp4","video_url_expires_at":1700000000}`)); err != nil {
		t.Fatalf("SyncArkVideoAITaskStatus returned error: %v", err)
	}

	user, ok, err := repository.GetUserByID(task.UserID)
	if err != nil || !ok {
		t.Fatalf("GetUserByID ok=%v err=%v", ok, err)
	}
	if user.Credits != 6 {
		t.Fatalf("credits = %d, want 6", user.Credits)
	}
	saved, _, _ := repository.GetAITask(task.ID)
	if saved.Status != model.AITaskStatusSucceeded || saved.VideoURL != "https://example.com/video.mp4" || saved.VideoURLExpiresAt != 1700000000 {
		t.Fatalf("task success fields = status:%q url:%q expires:%d", saved.Status, saved.VideoURL, saved.VideoURLExpiresAt)
	}
}

func TestMarkArkVideoAITaskContentFetchedSetsFinishedAt(t *testing.T) {
	task := setupVideoAITaskWithConsumedCredits(t, "task-content", 4)

	if err := MarkArkVideoAITaskContentFetched("task-content"); err != nil {
		t.Fatalf("MarkArkVideoAITaskContentFetched returned error: %v", err)
	}

	saved, ok, err := repository.GetAITask(task.ID)
	if err != nil || !ok {
		t.Fatalf("GetAITask ok=%v err=%v", ok, err)
	}
	if saved.FinishedAt == "" {
		t.Fatal("FinishedAt was not set")
	}
}

func TestAITaskFrontendTraceAndArtifactsAreHydrated(t *testing.T) {
	setupAITaskTestDB(t)
	_, _ = saveAITaskTestUser("user-frontend-trace", 20)
	task, err := CreateAITask(CreateAITaskInput{
		UserID:        "user-frontend-trace",
		TaskType:      "image_generation",
		Provider:      "openai",
		Protocol:      "openai",
		Model:         "image-model",
		Path:          "/images/generations",
		Credits:       2,
		RequestBody:   []byte(`{"model":"image-model","prompt":"画一张图"}`),
		ContentType:   "application/json",
		FrontendTrace: `{"projectId":"project-1","canvasId":"canvas-1","nodeId":"node-1","shotGroupId":"shot-group-1","shotIds":["shot-1"],"apiKey":"sk-secret","preview":"data:image/png;base64,AAAA"}`,
	})
	if err != nil {
		t.Fatalf("CreateAITask returned error: %v", err)
	}
	if _, err := RecordUserAITaskFrontendArtifact(task.ID, "user-frontend-trace", model.AITaskFrontendArtifact{
		AssetID:     "asset-1",
		CanvasID:    "canvas-1",
		NodeID:      "node-1",
		ProjectID:   "project-1",
		ShotGroupID: "shot-group-1",
		ShotIDs:     []string{"shot-1"},
		Kind:        "image",
		CreatedAt:   "2026-06-06T00:00:00.000Z",
	}); err != nil {
		t.Fatalf("RecordUserAITaskFrontendArtifact returned error: %v", err)
	}

	detail, err := GetAdminAITaskDetail(task.ID)
	if err != nil {
		t.Fatalf("GetAdminAITaskDetail returned error: %v", err)
	}
	if detail.Task.FrontendTrace.ProjectID != "project-1" || detail.Task.FrontendTrace.CanvasID != "canvas-1" || detail.Task.FrontendTrace.NodeID != "node-1" {
		t.Fatalf("frontend trace = %#v", detail.Task.FrontendTrace)
	}
	if strings.Contains(detail.Task.RequestJSON, "sk-secret") || strings.Contains(detail.Task.RequestJSON, "data:image") {
		t.Fatalf("frontend trace was not sanitized: %s", detail.Task.RequestJSON)
	}
	if len(detail.Task.FrontendArtifacts) != 1 || detail.Task.FrontendArtifacts[0].AssetID != "asset-1" {
		t.Fatalf("frontend artifacts = %#v", detail.Task.FrontendArtifacts)
	}
	if _, err := RecordUserAITaskFrontendArtifact(task.ID, "other-user", model.AITaskFrontendArtifact{AssetID: "asset-other", NodeID: "node-1"}); err == nil {
		t.Fatal("RecordUserAITaskFrontendArtifact allowed another user")
	}
}

func TestAITaskFrontendArtifactsSurviveArkStatusSync(t *testing.T) {
	task := setupVideoAITaskWithConsumedCredits(t, "task-artifact-preserve", 4)
	if _, err := RecordUserAITaskFrontendArtifact(task.ID, task.UserID, model.AITaskFrontendArtifact{
		AssetID: "asset-video-1",
		NodeID:  "video-node-1",
		Kind:    "video",
	}); err != nil {
		t.Fatalf("RecordUserAITaskFrontendArtifact returned error: %v", err)
	}
	if err := SyncArkVideoAITaskStatus("task-artifact-preserve", []byte(`{"id":"task-artifact-preserve","status":"completed","video_url":"https://example.com/video.mp4"}`)); err != nil {
		t.Fatalf("SyncArkVideoAITaskStatus returned error: %v", err)
	}

	detail, err := GetAdminAITaskDetail(task.ID)
	if err != nil {
		t.Fatalf("GetAdminAITaskDetail returned error: %v", err)
	}
	if len(detail.Task.FrontendArtifacts) != 1 || detail.Task.FrontendArtifacts[0].AssetID != "asset-video-1" {
		t.Fatalf("frontend artifacts after sync = %#v", detail.Task.FrontendArtifacts)
	}
}

func TestListAdminAITasksFiltersByTaskFields(t *testing.T) {
	setupAITaskTestDB(t)
	_, _ = saveAITaskTestUser("user-list-a", 20)
	_, _ = saveAITaskTestUser("user-list-b", 20)
	matching := saveAITaskForAdminTest(t, model.AITask{
		UserID:         "user-list-a",
		Kind:           "video",
		TaskType:       "video_create",
		ActionType:     "extend",
		Provider:       "ark-primary",
		Protocol:       "volcengine-ark",
		Model:          "ep-video",
		Path:           "/videos",
		Status:         model.AITaskStatusFailed,
		Credits:        4,
		UpstreamTaskID: "upstream-list-match",
		ErrorMessage:   "list error",
	})
	_ = saveAITaskForAdminTest(t, model.AITask{
		UserID:         "user-list-b",
		Kind:           "chat",
		TaskType:       "chat",
		ActionType:     "chat",
		Provider:       "openai",
		Protocol:       "openai",
		Model:          "chat-model",
		Path:           "/chat/completions",
		Status:         model.AITaskStatusSucceeded,
		Credits:        1,
		UpstreamTaskID: "upstream-list-other",
	})

	result, err := ListAdminAITasks(model.AITaskQuery{
		User:           "user-list-a",
		Status:         string(model.AITaskStatusFailed),
		Kind:           "video",
		ActionType:     "extend",
		Model:          "ep-video",
		Provider:       "ark-primary",
		UpstreamTaskID: "upstream-list-match",
		Keyword:        "list error",
		Page:           1,
		PageSize:       10,
	})
	if err != nil {
		t.Fatalf("ListAdminAITasks returned error: %v", err)
	}
	if result.Total != 1 || len(result.Items) != 1 || result.Items[0].ID != matching.ID {
		t.Fatalf("list result = total:%d items:%#v", result.Total, result.Items)
	}
}

func TestGetAdminAITaskDetailReturnsUserLogsAndSanitizedPayloads(t *testing.T) {
	setupAITaskTestDB(t)
	_, _ = saveAITaskTestUser("user-detail", 20)
	task := saveAITaskForAdminTest(t, model.AITask{
		UserID:       "user-detail",
		Kind:         "image",
		TaskType:     "image_generation",
		ActionType:   "generate",
		Provider:     "openai",
		Protocol:     "openai",
		Model:        "image-model",
		Path:         "/images/generations",
		Status:       model.AITaskStatusSucceeded,
		Credits:      2,
		RequestJSON:  SanitizeAIJSON([]byte(`{"api_key":"sk-secret","prompt":"保留"}`), "application/json"),
		ResponseJSON: SanitizeAIJSON([]byte(`{"b64_json":"data:image/png;base64,AAAA"}`), "application/json"),
	})
	if err := ConsumeUserCreditsForTask("user-detail", "image-model", 2, "/images/generations", task.ID); err != nil {
		t.Fatalf("ConsumeUserCreditsForTask returned error: %v", err)
	}

	detail, err := GetAdminAITaskDetail(task.ID)
	if err != nil {
		t.Fatalf("GetAdminAITaskDetail returned error: %v", err)
	}
	if detail.Task.ID != task.ID || detail.User.ID != "user-detail" || len(detail.CreditLogs) != 1 {
		t.Fatalf("detail = %#v", detail)
	}
	if strings.Contains(detail.Task.RequestJSON, "sk-secret") || strings.Contains(detail.Task.ResponseJSON, "data:image") {
		t.Fatalf("detail contains unsanitized payloads: request=%s response=%s", detail.Task.RequestJSON, detail.Task.ResponseJSON)
	}
}

func TestAdminRefreshAITaskSyncsArkAndRefundsFailedOnce(t *testing.T) {
	task := setupVideoAITaskWithConsumedCredits(t, "task-admin-refresh", 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/contents/generations/tasks/task-admin-refresh") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"task-admin-refresh","status":"failed","error":{"code":"BadInput","message":"素材失败"}}`))
	}))
	defer server.Close()
	saveArkChannelForAITaskTest(t, server.URL)

	refreshed, err := RefreshAdminAITask(task.ID)
	if err != nil {
		t.Fatalf("RefreshAdminAITask returned error: %v", err)
	}
	if refreshed.Status != model.AITaskStatusFailed || refreshed.ErrorCode != "BadInput" || refreshed.RefundedAt == "" || refreshed.CreditsRefunded != 4 {
		t.Fatalf("refreshed task = %#v", refreshed)
	}
	user, _, _ := repository.GetUserByID(task.UserID)
	if user.Credits != 10 {
		t.Fatalf("credits = %d, want refunded balance 10", user.Credits)
	}
	if _, err := RefreshAdminAITask(task.ID); err != nil {
		t.Fatalf("second RefreshAdminAITask returned error: %v", err)
	}
	user, _, _ = repository.GetUserByID(task.UserID)
	if user.Credits != 10 {
		t.Fatalf("credits after second refresh = %d, want 10", user.Credits)
	}
}

func TestAdminRefundAITaskRefundsFailedTaskAndBlocksRepeatedRefund(t *testing.T) {
	task := setupVideoAITaskWithConsumedCredits(t, "task-admin-refund", 4)
	saved, _, _ := repository.GetAITask(task.ID)
	saved.Status = model.AITaskStatusFailed
	saved.ErrorCode = "Bad"
	saved.ErrorMessage = "bad"
	if _, err := repository.SaveAITask(saved); err != nil {
		t.Fatalf("SaveAITask returned error: %v", err)
	}

	refunded, err := RefundAdminAITask(task.ID)
	if err != nil {
		t.Fatalf("RefundAdminAITask returned error: %v", err)
	}
	if refunded.RefundedAt == "" || refunded.CreditsRefunded != 4 {
		t.Fatalf("refunded task = %#v", refunded)
	}
	if _, err := RefundAdminAITask(task.ID); err == nil {
		t.Fatal("second RefundAdminAITask returned nil error")
	}
	user, _, _ := repository.GetUserByID(task.UserID)
	if user.Credits != 10 {
		t.Fatalf("credits = %d, want refunded balance 10", user.Credits)
	}
}

func setupVideoAITaskWithConsumedCredits(t *testing.T, upstreamTaskID string, credits int) model.AITask {
	t.Helper()
	setupAITaskTestDB(t)
	userID := "user-" + upstreamTaskID
	_, err := repository.SaveUser(model.User{
		ID:        userID,
		Username:  userID,
		Role:      model.UserRoleUser,
		Status:    model.UserStatusActive,
		Credits:   10,
		AffCode:   strings.ToUpper(strings.ReplaceAll(upstreamTaskID, "-", ""))[:8],
		CreatedAt: now(),
		UpdatedAt: now(),
	})
	if err != nil {
		t.Fatalf("SaveUser returned error: %v", err)
	}
	task, err := CreateAITask(CreateAITaskInput{
		UserID:      userID,
		TaskType:    "video_create",
		Provider:    "ark",
		Protocol:    "volcengine-ark",
		Model:       "ep-test",
		Path:        "/videos",
		Credits:     credits,
		RequestBody: []byte(`{"model":"ep-test","content":[{"type":"text","text":"生成视频"}]}`),
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatalf("CreateAITask returned error: %v", err)
	}
	if err := ConsumeUserCreditsForTask(userID, "ep-test", credits, "/videos", task.ID); err != nil {
		t.Fatalf("ConsumeUserCreditsForTask returned error: %v", err)
	}
	if err := MarkAITaskArkCreated(task.ID, []byte(`{"id":"`+upstreamTaskID+`","status":"queued","raw_status":"Queued"}`)); err != nil {
		t.Fatalf("MarkAITaskArkCreated returned error: %v", err)
	}
	return task
}

func saveAITaskTestUser(id string, credits int) (model.User, error) {
	return repository.SaveUser(model.User{
		ID:        id,
		Username:  id,
		Role:      model.UserRoleUser,
		Status:    model.UserStatusActive,
		Credits:   credits,
		AffCode:   testAffCode(id),
		CreatedAt: now(),
		UpdatedAt: now(),
	})
}

func testAffCode(value string) string {
	text := strings.ToUpper(strings.ReplaceAll(value+"00000000", "-", ""))
	if len(text) > 8 {
		return text[len(text)-8:]
	}
	return text
}

func saveAITaskForAdminTest(t *testing.T, task model.AITask) model.AITask {
	t.Helper()
	if task.ID == "" {
		task.ID = newID("aitask")
	}
	if task.CreatedAt == "" {
		task.CreatedAt = now()
	}
	if task.UpdatedAt == "" {
		task.UpdatedAt = task.CreatedAt
	}
	saved, err := repository.SaveAITask(task)
	if err != nil {
		t.Fatalf("SaveAITask returned error: %v", err)
	}
	return saved
}

func saveArkChannelForAITaskTest(t *testing.T, baseURL string) {
	t.Helper()
	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol: string(model.ModelProtocolVolcengineArk),
				Name:     "ark",
				BaseURL:  baseURL,
				APIKey:   "ark-key",
				Models:   []string{"ep-test"},
				Weight:   1,
				Enabled:  true,
			}},
		},
	}, now())
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}

func setupAITaskTestDB(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		repository.ResetForTest()
	})
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	repository.ResetForTest()
}
