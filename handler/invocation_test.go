package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestInvocationCreateReturnsPreflightWithoutStartingAttempt(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	if err := service.EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{
			AvailableModels: []string{"text-test"}, DefaultTextModel: "text-test",
		}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			ID: "text-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "text",
			BaseURL: "https://example.invalid/v1", APIKey: "test-key", Models: []string{"text-test"},
			Capabilities: []string{"text"}, Enabled: true,
		}}},
	}); err != nil {
		t.Fatal(err)
	}
	input, err := service.CreateArtifact("user-1", service.CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		Payload: []byte(`{"text":"第一集"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	body := fmt.Sprintf(`{"source":"direct","projectId":"project-1","episodeId":"episode-1","skillId":"skill-system-workflow-script","expectedOutputArtifactType":"production_script","inputArtifactRefs":[{"bindingName":"source_text","artifactId":%q,"contentHash":%q}],"parameters":{},"idempotencyKey":"Authorization: Bearer sk-live"}`, input.Artifact.ID, input.Artifact.ContentHash)
	awaiting := invocationHandlerRequest(http.MethodPost, "/api/v1/invocations", body, "user-1")
	CreateInvocation(awaiting.recorder, awaiting.request)
	if !strings.Contains(awaiting.recorder.Body.String(), `"status":"awaiting_confirmation"`) ||
		!strings.Contains(awaiting.recorder.Body.String(), `"latestAttempt":0`) ||
		strings.Contains(awaiting.recorder.Body.String(), `"attempt":{`) ||
		strings.Contains(awaiting.recorder.Body.String(), "Authorization: Bearer sk-live") ||
		strings.Contains(awaiting.recorder.Body.String(), `"channelId"`) {
		t.Fatalf("awaiting preflight unexpectedly started execution: %s", awaiting.recorder.Body.String())
	}
	var preflight struct {
		Data struct {
			Run                      service.InvocationRunSummary `json:"run"`
			ConfirmationRequirements []string                     `json:"confirmationRequirements"`
		} `json:"data"`
	}
	if err := json.Unmarshal(awaiting.recorder.Body.Bytes(), &preflight); err != nil {
		t.Fatal(err)
	}
	confirmation, _ := json.Marshal(service.InvocationConfirmation{RequirementCodes: preflight.Data.ConfirmationRequirements})
	confirmed := invocationHandlerRequest(http.MethodPost, "/api/v1/invocations/"+preflight.Data.Run.ID+"/confirm", string(confirmation), "user-1")
	ConfirmInvocation(confirmed.recorder, confirmed.request, preflight.Data.Run.ID)
	if !strings.Contains(confirmed.recorder.Body.String(), `"status":"queued"`) ||
		strings.Contains(confirmed.recorder.Body.String(), "Authorization: Bearer sk-live") ||
		strings.Contains(confirmed.recorder.Body.String(), `"channelId"`) || strings.Contains(confirmed.recorder.Body.String(), `"agentRunId"`) {
		t.Fatalf("confirmed response leaked internals: %s", confirmed.recorder.Body.String())
	}

	blocked := invocationHandlerRequest(http.MethodPost, "/api/v1/invocations", `{"source":"direct","projectId":"project-1","capability":"missing.capability","parameters":{}}`, "user-1")
	CreateInvocation(blocked.recorder, blocked.request)
	if !strings.Contains(blocked.recorder.Body.String(), `"status":"blocked"`) ||
		!strings.Contains(blocked.recorder.Body.String(), `"latestAttempt":0`) {
		t.Fatalf("blocked preflight unexpectedly started execution: %s", blocked.recorder.Body.String())
	}
}

func TestInvocationCreateAcceptsClientSourcesAndRejectsInternalUnknownTrailingAndOversizedBodies(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	for _, source := range []string{"direct", "image", "canvas_chat"} {
		request := invocationHandlerRequest(http.MethodPost, "/api/v1/invocations", `{"source":"`+source+`","projectId":"project-1","capability":"missing.capability"}`, "user-1")
		CreateInvocation(request.recorder, request.request)
		if !strings.Contains(request.recorder.Body.String(), `"code":0`) || !strings.Contains(request.recorder.Body.String(), `"source":"`+source+`"`) {
			t.Fatalf("source=%s body=%s", source, request.recorder.Body.String())
		}
	}
	tests := []struct {
		name string
		body string
	}{
		{"workflow source", `{"source":"workflow","projectId":"project-1"}`},
		{"agent plan source", `{"source":"agent_plan","projectId":"project-1"}`},
		{"unknown status", `{"source":"direct","status":"running"}`},
		{"trailing json", `{"source":"direct"}{}`},
		{"oversized", `{"source":"direct","parameters":{"value":"` + strings.Repeat("x", (2<<20)+1) + `"}}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := invocationHandlerRequest(http.MethodPost, "/api/v1/invocations", test.body, "user-1")
			CreateInvocation(request.recorder, request.request)
			if !strings.Contains(request.recorder.Body.String(), `"code":1`) {
				t.Fatalf("body=%s", request.recorder.Body.String())
			}
		})
	}
}

func TestInvocationLifecycleBodiesAreStrictAndLimited(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	tests := []struct {
		name  string
		body  string
		limit int
		call  func(http.ResponseWriter, *http.Request)
	}{
		{"repreflight status", `{"source":"direct","status":"running"}`, 0, func(w http.ResponseWriter, r *http.Request) { RepreflightInvocation(w, r, "missing") }},
		{"confirm receipt", `{"requirementCodes":[],"receipt":{"forged":true}}`, 0, func(w http.ResponseWriter, r *http.Request) { ConfirmInvocation(w, r, "missing") }},
		{"revalidate status", `{"attempt":1,"expectedRawOutputHash":"hash","output":{},"status":"approved"}`, 0, func(w http.ResponseWriter, r *http.Request) { RevalidateInvocation(w, r, "missing") }},
		{"review receipt", `{"decision":"approved","attempt":1,"artifactSetHash":"hash","receipt":{}}`, 0, func(w http.ResponseWriter, r *http.Request) { ReviewInvocation(w, r, "missing") }},
		{"apply status", `{"idempotencyKey":"key","attempt":1,"artifactSetHash":"hash","target":"test_sink","targetId":"target","status":"applied"}`, 0, func(w http.ResponseWriter, r *http.Request) { ApplyInvocation(w, r, "missing") }},
		{"cancel arbitrary", `{"status":"cancelled"}`, 0, func(w http.ResponseWriter, r *http.Request) { CancelInvocation(w, r, "missing") }},
		{"retry arbitrary", `{"attempt":99}`, 0, func(w http.ResponseWriter, r *http.Request) { RetryInvocation(w, r, "missing") }},
		{"confirmation oversized", `{"requirementCodes":["` + strings.Repeat("x", (128<<10)+1) + `"]}`, 0, func(w http.ResponseWriter, r *http.Request) { ConfirmInvocation(w, r, "missing") }},
		{"review oversized", `{"decision":"approved","attempt":1,"artifactSetHash":"hash","comment":"` + strings.Repeat("x", (128<<10)+1) + `"}`, 0, func(w http.ResponseWriter, r *http.Request) { ReviewInvocation(w, r, "missing") }},
		{"apply oversized", `{"idempotencyKey":"key","attempt":1,"artifactSetHash":"hash","target":"test_sink","targetId":"` + strings.Repeat("x", (128<<10)+1) + `"}`, 0, func(w http.ResponseWriter, r *http.Request) { ApplyInvocation(w, r, "missing") }},
		{"repreflight oversized", `{"source":"direct","parameters":{"value":"` + strings.Repeat("x", (2<<20)+1) + `"}}`, 0, func(w http.ResponseWriter, r *http.Request) { RepreflightInvocation(w, r, "missing") }},
		{"retry oversized", `{"value":"` + strings.Repeat("x", (32<<10)+1) + `"}`, 0, func(w http.ResponseWriter, r *http.Request) { RetryInvocation(w, r, "missing") }},
		{"cancel oversized", `{"value":"` + strings.Repeat("x", (32<<10)+1) + `"}`, 0, func(w http.ResponseWriter, r *http.Request) { CancelInvocation(w, r, "missing") }},
		{"revalidation oversized", `{"attempt":1,"expectedRawOutputHash":"hash","output":{"value":"` + strings.Repeat("x", (4<<20)+1) + `"}}`, 0, func(w http.ResponseWriter, r *http.Request) { RevalidateInvocation(w, r, "missing") }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := invocationHandlerRequest(http.MethodPost, "/api/v1/invocations/missing", test.body, "user-1")
			test.call(request.recorder, request.request)
			if !strings.Contains(request.recorder.Body.String(), `"code":1`) {
				t.Fatalf("body=%s", request.recorder.Body.String())
			}
		})
	}
}

func TestInvocationStrictDecoderRejectsNull(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/invocations", strings.NewReader("null"))
	recorder := httptest.NewRecorder()
	if decodeStrictBody(recorder, request, &struct{}{}, 1024) {
		t.Fatal("null accepted")
	}
	if !strings.Contains(recorder.Body.String(), `"code":1`) {
		t.Fatalf("response=%s", recorder.Body.String())
	}
}

func TestInvocationCancelRetryBodiesRequireZeroBytes(t *testing.T) {
	empty := httptest.NewRequest(http.MethodPost, "/api/v1/invocations/id/cancel", nil)
	if !decodeZeroByteBody(httptest.NewRecorder(), empty, 32<<10) {
		t.Fatal("zero-byte body was rejected")
	}
	for _, body := range []string{"{}", " \t\r\n", "null", `{"value":1}`, strings.Repeat("x", (32<<10)+1)} {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/invocations/id/retry", strings.NewReader(body))
		recorder := httptest.NewRecorder()
		if decodeZeroByteBody(recorder, request, 32<<10) {
			t.Fatalf("non-empty body accepted: %q", body[:min(len(body), 20)])
		}
		if !strings.Contains(recorder.Body.String(), `"code":1`) {
			t.Fatalf("response=%s", recorder.Body.String())
		}
	}
}

func TestInvocationLifecycleCannotMutateAnotherUserRun(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	stamp := "2026-01-01T00:00:00Z"
	run := model.InvocationRun{
		ID: "invocation-private", UserID: "user-owner", Source: "direct", ProjectID: "shared-project",
		Status: model.InvocationStatusBlocked, LatestRevision: 1, CreatedAt: stamp, UpdatedAt: stamp,
	}
	if err := db.Create(&run).Error; err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		body string
		call func(http.ResponseWriter, *http.Request)
	}{
		{"repreflight", `{"source":"direct","projectId":"shared-project","capability":"missing"}`, func(w http.ResponseWriter, r *http.Request) { RepreflightInvocation(w, r, run.ID) }},
		{"confirm", `{"requirementCodes":[]}`, func(w http.ResponseWriter, r *http.Request) { ConfirmInvocation(w, r, run.ID) }},
		{"cancel", ``, func(w http.ResponseWriter, r *http.Request) { CancelInvocation(w, r, run.ID) }},
		{"retry", ``, func(w http.ResponseWriter, r *http.Request) { RetryInvocation(w, r, run.ID) }},
		{"revalidate", `{"attempt":1,"expectedRawOutputHash":"hash","output":{}}`, func(w http.ResponseWriter, r *http.Request) { RevalidateInvocation(w, r, run.ID) }},
		{"review", `{"decision":"approved","attempt":1,"artifactSetHash":"hash"}`, func(w http.ResponseWriter, r *http.Request) { ReviewInvocation(w, r, run.ID) }},
		{"apply", `{"idempotencyKey":"key","attempt":1,"artifactSetHash":"hash","target":"test_sink","targetId":"target"}`, func(w http.ResponseWriter, r *http.Request) { ApplyInvocation(w, r, run.ID) }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := invocationHandlerRequest(http.MethodPost, "/api/v1/invocations/"+run.ID, test.body, "user-other")
			test.call(request.recorder, request.request)
			if !strings.Contains(request.recorder.Body.String(), `"code":1`) {
				t.Fatalf("foreign mutation accepted: %s", request.recorder.Body.String())
			}
		})
	}
	stored, found, err := repository.GetUserInvocation(run.UserID, run.ID)
	if err != nil || !found || stored.Status != model.InvocationStatusBlocked || stored.LatestRevision != 1 || stored.LatestAttempt != 0 {
		t.Fatalf("foreign lifecycle changed owner run: stored=%+v found=%v err=%v", stored, found, err)
	}
}

func TestInvocationForeignRetryCannotQueueOwnerRun(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	if err := service.EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"text-test"}, DefaultTextModel: "text-test"}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			ID: "text-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "text", BaseURL: "https://example.invalid/v1",
			APIKey: "test-key", Models: []string{"text-test"}, Capabilities: []string{"text"}, Enabled: true,
		}}},
	}); err != nil {
		t.Fatal(err)
	}
	input, err := service.CreateArtifact("user-1", service.CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1",
		Payload: json.RawMessage(`{"text":"retry fixture"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := service.PreflightClientInvocation("user-1", service.InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillID: "skill-system-workflow-script",
		ExpectedOutputArtifactType: "production_script", Parameters: json.RawMessage(`{}`),
		InputArtifactRefs: []service.ArtifactRefInput{{BindingName: "source_text", ArtifactID: input.Artifact.ID, ContentHash: input.Artifact.ContentHash}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ConfirmInvocation("user-1", preflight.Run.ID, service.InvocationConfirmation{RequirementCodes: preflight.ConfirmationRequirements}); err != nil {
		t.Fatal(err)
	}
	cancelled, err := service.CancelInvocation("user-1", preflight.Run.ID)
	if err != nil || cancelled.Run.Status != model.InvocationStatusCancelled || cancelled.Attempt == nil || cancelled.Attempt.Status != string(model.AgentRunStatusCancelled) {
		t.Fatalf("cancelled=%+v err=%v", cancelled, err)
	}
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	beforeRun, found, err := repository.GetUserInvocation("user-1", preflight.Run.ID)
	if err != nil || !found {
		t.Fatalf("before run found=%v err=%v", found, err)
	}
	beforeAttempts, err := repository.ListInvocationAttempts("user-1", preflight.Run.ID)
	if err != nil || len(beforeAttempts) != 1 {
		t.Fatalf("before attempts=%+v err=%v", beforeAttempts, err)
	}
	var beforeAgents int64
	if err := db.Model(&model.AgentRun{}).Where("invocation_id = ?", preflight.Run.ID).Count(&beforeAgents).Error; err != nil || beforeAgents != 1 {
		t.Fatalf("before agents=%d err=%v", beforeAgents, err)
	}

	request := invocationHandlerRequest(http.MethodPost, "/api/v1/invocations/"+preflight.Run.ID+"/retry", "", "user-other")
	RetryInvocation(request.recorder, request.request, preflight.Run.ID)
	if !strings.Contains(request.recorder.Body.String(), `"code":1`) {
		t.Fatalf("foreign retry accepted: %s", request.recorder.Body.String())
	}
	afterRun, found, err := repository.GetUserInvocation("user-1", preflight.Run.ID)
	if err != nil || !found || afterRun.Status != beforeRun.Status || afterRun.LatestAttempt != beforeRun.LatestAttempt || afterRun.UpdatedAt != beforeRun.UpdatedAt {
		t.Fatalf("owner run changed: before=%+v after=%+v found=%v err=%v", beforeRun, afterRun, found, err)
	}
	afterAttempts, err := repository.ListInvocationAttempts("user-1", preflight.Run.ID)
	if err != nil || len(afterAttempts) != len(beforeAttempts) || afterAttempts[0].ID != beforeAttempts[0].ID || afterAttempts[0].Status != beforeAttempts[0].Status {
		t.Fatalf("owner attempts changed: before=%+v after=%+v err=%v", beforeAttempts, afterAttempts, err)
	}
	var afterAgents int64
	if err := db.Model(&model.AgentRun{}).Where("invocation_id = ?", preflight.Run.ID).Count(&afterAgents).Error; err != nil || afterAgents != beforeAgents {
		t.Fatalf("owner AgentRuns changed: before=%d after=%d err=%v", beforeAgents, afterAgents, err)
	}
}

func TestInvocationListDetailEventsAreUserScopedPaginatedAndRedacted(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	stamp := "2026-01-01T00:00:00Z"
	run := model.InvocationRun{ID: "invocation-owner", UserID: "user-owner", Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", Status: model.InvocationStatusBlocked, LatestRevision: 1, CreatedAt: stamp, UpdatedAt: stamp}
	run.RequestHash, run.AggregateErrorSummary = "Authorization: Bearer sk-live-run", "Authorization: Bearer sk-live-run-error"
	revision := model.InvocationPreflightRevision{
		ID: "revision-owner", UserID: run.UserID, InvocationID: run.ID, Revision: 1, SkillID: "skill-1",
		SkillSnapshotJSON:            `{"package":{"files":{"SKILL.md":"PRIVATE_SYSTEM_PROMPT"},"systemPrompt":"PRIVATE_SYSTEM_PROMPT"}}`,
		InputSnapshotJSON:            `[{"bindingName":"source","snapshot":{"artifactId":"artifact-1"}}]`,
		ParametersJSON:               `{"prompt":"caller-visible"}`,
		ExecutionPolicyJSON:          `{"model":"text-test","channelId":"Authorization: Bearer sk-live-policy","apiKey":"PRIVATE_API_KEY"}`,
		RouteTraceJSON:               `{"finalSkillVersionId":"skill-version-1","selectedChannelId":"Authorization: Bearer sk-live-route"}`,
		ConfirmationRequirementsJSON: `["api_cost"]`,
		BlockReasonsJSON:             `[{"code":"blocked","message":"blocked"}]`, CreatedAt: stamp,
	}
	attempt := model.InvocationAttempt{
		ID: "attempt-owner", UserID: run.UserID, InvocationID: run.ID, Attempt: 1, Revision: 1, Status: "failed",
		AgentRunID: "Authorization: Bearer sk-live-agent", RawOutput: "PRIVATE_RAW_OUTPUT", StructuredOutputJSON: `{"private":true}`, ErrorClass: "provider", ErrorMessage: "Authorization: Bearer sk-live-attempt-error", ChannelID: "Authorization: Bearer sk-live-attempt-channel", Model: "text-test",
		ToolTraceJSON: `{"apiKey":"PRIVATE_API_KEY"}`, CorrectionTraceJSON: `{"systemPrompt":"PRIVATE_SYSTEM_PROMPT"}`,
		CreatedAt: stamp, UpdatedAt: stamp,
	}
	ref := model.InvocationArtifactRef{
		ID: "ref-owner", UserID: run.UserID, InvocationID: run.ID, Direction: "input", BindingName: "source",
		ArtifactID: "artifact-1", ArtifactHash: "artifact-hash", ArtifactType: "source_text",
		SchemaVersion: "1.0.0", SchemaContentHash: "schema-hash", Revision: 1, Attempt: 0, CreatedAt: stamp,
	}
	if err := db.Create(&run).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&revision).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&attempt).Error; err != nil {
		t.Fatal(err)
	}
	apply := model.InvocationApplyAttempt{
		ID: "apply-owner", UserID: run.UserID, InvocationID: run.ID, IdempotencyKey: "Authorization: Bearer sk-live-idempotency",
		RequestHash: "Authorization: Bearer sk-live-apply-request", ArtifactSetHash: "set-hash", Target: "test_sink", TargetID: "target-safe",
		Status: "failed", ReceiptJSON: `{"secret":"Authorization: Bearer sk-live-receipt"}`, ErrorMessage: "Authorization: Bearer sk-live-apply-error",
		Attempt: 1, CreatedAt: stamp, UpdatedAt: stamp,
	}
	if err := db.Create(&apply).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&ref).Error; err != nil {
		t.Fatal(err)
	}
	for index := 1; index <= 101; index++ {
		event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "event", DataJSON: `{"secret":"PRIVATE_API_KEY"}`, CreatedAt: stamp}
		if err := db.Create(&event).Error; err != nil {
			t.Fatal(err)
		}
	}

	owner := invocationHandlerRequest(http.MethodGet, "/api/v1/invocations/"+run.ID, "", run.UserID)
	Invocation(owner.recorder, owner.request, run.ID)
	body := owner.recorder.Body.String()
	var detailPage struct {
		Data struct {
			Events          []json.RawMessage `json:"events"`
			EventsHasMore   bool              `json:"eventsHasMore"`
			EventsNextAfter uint64            `json:"eventsNextAfter"`
			EventsLimit     int               `json:"eventsLimit"`
		} `json:"data"`
	}
	if err := json.Unmarshal(owner.recorder.Body.Bytes(), &detailPage); err != nil {
		t.Fatal(err)
	}
	if len(detailPage.Data.Events) != 100 || !detailPage.Data.EventsHasMore || detailPage.Data.EventsNextAfter == 0 || detailPage.Data.EventsLimit != 100 {
		t.Fatalf("detail events page=%+v", detailPage.Data)
	}
	for _, secret := range []string{"PRIVATE_SYSTEM_PROMPT", "PRIVATE_API_KEY", "PRIVATE_RAW_OUTPUT", `"files"`, "Authorization: Bearer sk-live"} {
		if strings.Contains(body, secret) {
			t.Fatalf("detail leaked %q: %s", secret, body)
		}
	}
	for _, expected := range []string{"confirmationRequirements", "blockReasons", "artifactSetHash", "authoritativeArtifactRefs", "artifact-1", `"errorClass":"provider"`, `"targetId":"target-safe"`} {
		if !strings.Contains(body, expected) {
			t.Fatalf("detail missing %q: %s", expected, body)
		}
	}

	foreign := invocationHandlerRequest(http.MethodGet, "/api/v1/invocations/"+run.ID, "", "user-other")
	Invocation(foreign.recorder, foreign.request, run.ID)
	if !strings.Contains(foreign.recorder.Body.String(), `"code":1`) || strings.Contains(foreign.recorder.Body.String(), run.ProjectID) {
		t.Fatalf("foreign detail leaked: %s", foreign.recorder.Body.String())
	}

	list := invocationHandlerRequest(http.MethodGet, "/api/v1/invocations?project=project-1&source=direct&status=blocked&skillId=skill-1", "", run.UserID)
	Invocations(list.recorder, list.request)
	if !strings.Contains(list.recorder.Body.String(), run.ID) {
		t.Fatalf("list=%s", list.recorder.Body.String())
	}

	events := invocationHandlerRequest(http.MethodGet, fmt.Sprintf("/api/v1/invocations/%s/events?after=%d&limit=1", run.ID, detailPage.Data.EventsNextAfter), "", run.UserID)
	InvocationEvents(events.recorder, events.request, run.ID)
	if strings.Count(events.recorder.Body.String(), `"type":"event"`) != 1 || strings.Contains(events.recorder.Body.String(), "PRIVATE_API_KEY") {
		t.Fatalf("events=%s", events.recorder.Body.String())
	}

	foreignEvents := invocationHandlerRequest(http.MethodGet, "/api/v1/invocations/"+run.ID+"/events", "", "user-other")
	InvocationEvents(foreignEvents.recorder, foreignEvents.request, run.ID)
	if !strings.Contains(foreignEvents.recorder.Body.String(), `"code":1`) {
		t.Fatalf("foreign events=%s", foreignEvents.recorder.Body.String())
	}
}

type invocationHandlerExchange struct {
	request  *http.Request
	recorder *httptest.ResponseRecorder
}

func invocationHandlerRequest(method, target, body, userID string) invocationHandlerExchange {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	if userID != "" {
		request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: userID, Role: model.UserRoleUser}))
	}
	return invocationHandlerExchange{request: request, recorder: httptest.NewRecorder()}
}
