package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestEnsureWorkflowRunReturnsStandardResponse(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs", strings.NewReader(`{"projectId":"project-1","episodeId":"episode-1","scriptSnapshot":"第一场","scriptConfirmed":true}`))
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-1", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()

	EnsureWorkflowRun(recorder, request)

	var payload struct {
		Code int             `json:"code"`
		Data json.RawMessage `json:"data"`
		Msg  string          `json:"msg"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response json error: %v", err)
	}
	if payload.Code != 0 || payload.Msg != "ok" || len(payload.Data) == 0 {
		t.Fatalf("payload=%#v", payload)
	}
	var detail struct {
		Stages []struct {
			InvocationID string `json:"invocationId"`
		} `json:"stages"`
		Artifacts []struct {
			ID              string   `json:"id"`
			ArtifactSetHash string   `json:"artifactSetHash"`
			ArtifactIDs     []string `json:"artifactIds"`
		} `json:"artifacts"`
	}
	if err := json.Unmarshal(payload.Data, &detail); err != nil || len(detail.Stages) == 0 || len(detail.Artifacts) != 1 {
		t.Fatalf("workflow detail=%#v err=%v", detail, err)
	}
	if !strings.Contains(string(payload.Data), `"invocationId":`) || detail.Artifacts[0].ArtifactSetHash == "" || len(detail.Artifacts[0].ArtifactIDs) != 1 || detail.Artifacts[0].ArtifactIDs[0] != detail.Artifacts[0].ID {
		t.Fatalf("missing Invocation projection coordinates: %s", payload.Data)
	}
}

func TestWorkflowRunListReturnsStandardLightweightResponse(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if _, err := service.EnsureWorkflowRun("user-owner", service.EnsureWorkflowRunInput{ProjectID: "project-1", EpisodeID: "episode-1", ScriptSnapshot: "第一场：不应出现在列表", ScriptConfirmed: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.EnsureWorkflowRun("user-other", service.EnsureWorkflowRunInput{ProjectID: "project-1", EpisodeID: "episode-other", ScriptSnapshot: "其他用户剧本", ScriptConfirmed: true}); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/workflow-runs?projectId=project-1&page=1&pageSize=10", nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-owner", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()

	WorkflowRuns(recorder, request)

	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"code":0`) || !strings.Contains(recorder.Body.String(), `"total":1`) {
		t.Fatalf("body=%s", recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "scriptSnapshot") || strings.Contains(recorder.Body.String(), "其他用户剧本") {
		t.Fatalf("list leaked heavy or foreign data: %s", recorder.Body.String())
	}
}

func TestWorkflowRunDoesNotExposeAnotherUserRecord(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	detail, err := service.EnsureWorkflowRun("user-owner", service.EnsureWorkflowRunInput{ProjectID: "project-1", EpisodeID: "episode-1", ScriptSnapshot: "第一场", ScriptConfirmed: true})
	if err != nil {
		t.Fatalf("EnsureWorkflowRun returned error: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/workflow-runs/"+detail.Run.ID, nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-other", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()

	WorkflowRun(recorder, request, detail.Run.ID)

	if !strings.Contains(recorder.Body.String(), `"code":1`) || !strings.Contains(recorder.Body.String(), "工作流不存在") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "scriptSnapshot") {
		t.Fatalf("response leaked owner workflow: %s", recorder.Body.String())
	}
}

func TestWorkflowRunPollReturnsIncrementalEventsAndRejectsForeignUser(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	detail, err := service.EnsureWorkflowRun("user-owner", service.EnsureWorkflowRunInput{ProjectID: "project-1", EpisodeID: "episode-1", ScriptSnapshot: "第一场", ScriptConfirmed: true})
	if err != nil {
		t.Fatal(err)
	}
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	event := model.WorkflowEvent{UserID: "user-owner", WorkflowRunID: detail.Run.ID, Type: "stage.running", CreatedAt: detail.Run.UpdatedAt}
	if err := database.Create(&event).Error; err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/workflow-runs/"+detail.Run.ID+"/poll?after="+strconv.FormatUint(event.ID-1, 10), nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-owner", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()
	WorkflowRunPoll(recorder, request, detail.Run.ID)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"type":"stage.running"`) || !strings.Contains(recorder.Body.String(), `"nextAfter":`+strconv.FormatUint(event.ID, 10)) {
		t.Fatalf("owner poll=%s", recorder.Body.String())
	}
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-other", Role: model.UserRoleUser}))
	recorder = httptest.NewRecorder()
	WorkflowRunPoll(recorder, request, detail.Run.ID)
	if !strings.Contains(recorder.Body.String(), `"code":1`) || strings.Contains(recorder.Body.String(), "scriptSnapshot") {
		t.Fatalf("foreign poll=%s", recorder.Body.String())
	}
}

func setupWorkflowHandlerTestDB(t *testing.T) {
	t.Helper()
	oldDriver := config.Cfg.StorageDriver
	oldDSN := config.Cfg.DatabaseDSN
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(t.TempDir(), "handler.db")
	repository.ResetForTest()
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldDriver
		config.Cfg.DatabaseDSN = oldDSN
		repository.ResetForTest()
	})
}
