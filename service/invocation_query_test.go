package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestPreflightClientInvocationAdmitsOnlyUserSurfaces(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{"direct", "image", "canvas_chat"} {
		result, err := PreflightClientInvocation("user-1", InvocationRequest{Source: source, ProjectID: "project-1", Capability: "missing.capability", IdempotencyKey: "client-" + source})
		if err != nil || result.Run.Source != source || result.Run.Status != model.InvocationStatusBlocked {
			t.Fatalf("source=%s run=%+v err=%v", source, result.Run, err)
		}
	}
	for _, source := range []string{"workflow", "agent_plan"} {
		if _, err := PreflightClientInvocation("user-1", InvocationRequest{Source: source, ProjectID: "project-1", Capability: "missing.capability"}); err == nil {
			t.Fatalf("source=%s should be rejected", source)
		}
	}
	image, err := PreflightClientInvocation("user-1", InvocationRequest{Source: "image", ProjectID: "project-1", Capability: "missing.capability", IdempotencyKey: "client-repreflight"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := RepreflightClientInvocation("user-1", image.Run.ID, InvocationRequest{Source: "canvas_chat", ProjectID: "project-1", Capability: "missing.capability"}); err == nil {
		t.Fatal("repreflight changed the client source")
	}
}

func TestInvocationDetailAuthoritativeRefsFollowLatestRevision(t *testing.T) {
	run := needsReviewLifecycleFixture(t)
	refs, err := repository.ListInvocationArtifactRefs("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	oldOutputID := ""
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 1 {
			oldOutputID = ref.ArtifactID
		}
	}
	if oldOutputID == "" {
		t.Fatal("fixture missing revision-one output")
	}
	if _, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "rejected", Attempt: 1, ArtifactSetHash: invocationArtifactSetHash(refs, 1)}); err != nil {
		t.Fatal(err)
	}
	if _, err := RetryInvocation("user-1", run.ID); err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "detail-wrong-target", LeaseDuration: time.Minute, Executor: invocationWrongExecutor{}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveSettings(model.Settings{
		Public:  model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"text-test"}, DefaultTextModel: "text-test"}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{ID: "detail-replacement", Protocol: string(model.ModelProtocolOpenAI), Name: "replacement", BaseURL: "https://example.invalid/v1", APIKey: "test-detail-replacement-key", Models: []string{"text-test"}, Capabilities: []string{"text"}, Enabled: true}}},
	}); err != nil {
		t.Fatal(err)
	}
	current, found, err := repository.GetUserInvocation("user-1", run.ID)
	if err != nil || !found {
		t.Fatalf("run found=%v err=%v", found, err)
	}
	snapshot, err := loadInvocationPreflightSnapshot("user-1", current)
	if err != nil {
		t.Fatal(err)
	}
	input := snapshot.InputArtifactRefs[0]
	repreflight, err := RepreflightInvocation("user-1", run.ID, InvocationRequest{
		Source: current.Source, ProjectID: current.ProjectID, EpisodeID: current.EpisodeID,
		SkillVersionID:    snapshot.Revision.SkillVersionID,
		InputArtifactRefs: []ArtifactRefInput{{BindingName: input.BindingName, ArtifactID: input.ArtifactID, ContentHash: input.ArtifactHash}}, Parameters: json.RawMessage(`{}`),
	})
	if err != nil || repreflight.Revision.Revision != 2 || repreflight.Run.LatestAttempt != 2 {
		t.Fatalf("repreflight=%#v err=%v", repreflight, err)
	}
	detail, err := GetInvocationDetail("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	assertInvocationDetailRefs(t, detail, 2, 0, oldOutputID)

	confirmed, err := ConfirmInvocation("user-1", run.ID, InvocationConfirmation{RequirementCodes: repreflight.ConfirmationRequirements})
	if err != nil || confirmed.Attempt == nil || confirmed.Attempt.Revision != 2 || confirmed.Attempt.Attempt != 3 {
		t.Fatalf("confirmed=%#v err=%v", confirmed, err)
	}
	detail, err = GetInvocationDetail("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	assertInvocationDetailRefs(t, detail, 2, 3, oldOutputID)
}

func TestInvocationHTTPSummariesRedactInternalFields(t *testing.T) {
	secret := "Authorization: Bearer sk-live"
	run := model.InvocationRun{
		ID: "invocation-safe", UserID: "user-1", Source: "direct", ProjectID: "project-1", Status: model.InvocationStatusFailed,
		IdempotencyKey: &secret, RequestHash: secret, AggregateErrorSummary: secret, LatestRevision: 1, LatestAttempt: 1,
	}
	revision := model.InvocationPreflightRevision{
		ID: "revision-safe", InvocationID: run.ID, Revision: 1, SkillID: "skill-1", SkillVersionID: "version-1",
		SkillSnapshotJSON:            `{"files":{"SKILL.md":"Authorization: Bearer sk-live"}}`,
		ExecutionPolicyJSON:          `{"model":"text-test","channelId":"Authorization: Bearer sk-live"}`,
		RouteTraceJSON:               `{"finalSkillVersionId":"version-1","selectedChannelId":"Authorization: Bearer sk-live"}`,
		ConfirmationRequirementsJSON: `["api_cost"]`, BlockReasonsJSON: `[]`,
	}
	attempt := model.InvocationAttempt{
		ID: "attempt-safe", InvocationID: run.ID, Status: "failed", Revision: 1, Attempt: 1, ErrorClass: "provider",
		ErrorMessage: secret, ChannelID: secret, AgentRunID: secret, RawOutput: secret, StructuredOutputJSON: secret,
		ToolTraceJSON: secret, CorrectionTraceJSON: secret,
	}
	apply := model.InvocationApplyAttempt{
		ID: "apply-safe", InvocationID: run.ID, IdempotencyKey: secret, RequestHash: secret, ArtifactSetHash: "set-hash",
		Target: "test_sink", TargetID: "target-1", Status: "failed", ErrorMessage: secret, ReceiptJSON: secret, Attempt: 1,
	}
	values := []any{
		SafeInvocationPreflight(InvocationPreflightSnapshot{
			Run: run, Revision: revision, ExecutionPolicy: InvocationExecutionPolicy{Model: "text-test", ChannelID: secret, OutputCount: 2, ImageRequestJSON: secret},
			RouteTrace: InvocationRouteTrace{FinalSkillVersionID: "version-1", SelectedChannelID: secret}, ConfirmationRequirements: []string{"api_cost"},
		}),
		SafeInvocationLifecycle(InvocationResponse{Run: run, Revision: 1, Attempt: &attempt}),
		SafeInvocationApplyAttempt(apply),
	}
	for _, value := range values {
		raw, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(raw), secret) || strings.Contains(string(raw), "channelId") || strings.Contains(string(raw), "errorMessage") || strings.Contains(string(raw), "requestHash") || strings.Contains(string(raw), "idempotencyKey") {
			t.Fatalf("safe HTTP response leaked internal data: %s", raw)
		}
	}
	preflightJSON, _ := json.Marshal(values[0])
	lifecycleJSON, _ := json.Marshal(values[1])
	applyJSON, _ := json.Marshal(values[2])
	if !strings.Contains(string(preflightJSON), "api_cost") || !strings.Contains(string(lifecycleJSON), `"errorClass":"provider"`) || !strings.Contains(string(applyJSON), `"targetId":"target-1"`) {
		t.Fatalf("safe responses lost business fields: preflight=%s lifecycle=%s apply=%s", preflightJSON, lifecycleJSON, applyJSON)
	}
	if !strings.Contains(string(preflightJSON), `"outputCount":2`) || strings.Contains(string(preflightJSON), "imageRequestJson") {
		t.Fatalf("safe policy count/redaction mismatch: %s", preflightJSON)
	}
}

func TestSafeInvocationPreflightSerializesEmptyCollectionsAsArrays(t *testing.T) {
	value := SafeInvocationPreflight(InvocationPreflightSnapshot{})
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{`"inputArtifactRefs":[]`, `"confirmationRequirements":[]`, `"blockReasons":[]`} {
		if !strings.Contains(string(raw), field) {
			t.Fatalf("missing empty array %s in %s", field, raw)
		}
	}
}

func TestGetInvocationPollReturnsOnlyLatestAttemptAndIncrementalEvents(t *testing.T) {
	setupAITaskTestDB(t)
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	run := model.InvocationRun{ID: "invocation-poll", UserID: "user-poll", Source: "direct", Status: model.InvocationStatusRunning, LatestRevision: 1, LatestAttempt: 2, CreatedAt: now(), UpdatedAt: now()}
	if err := database.Create(&run).Error; err != nil {
		t.Fatal(err)
	}
	attempts := []model.InvocationAttempt{
		{ID: "attempt-poll-1", UserID: run.UserID, InvocationID: run.ID, Revision: 1, Attempt: 1, Status: "failed", CreatedAt: now(), UpdatedAt: now()},
		{ID: "attempt-poll-2", UserID: run.UserID, InvocationID: run.ID, Revision: 1, Attempt: 2, Status: "running", Model: "text-test", CreatedAt: now(), UpdatedAt: now()},
	}
	if err := database.Create(&attempts).Error; err != nil {
		t.Fatal(err)
	}
	events := []model.InvocationEvent{
		{UserID: run.UserID, InvocationID: run.ID, Type: "attempt.started", Level: "info", Revision: 1, Attempt: 1, CreatedAt: now()},
		{UserID: run.UserID, InvocationID: run.ID, Type: "attempt.failed", Level: "error", Revision: 1, Attempt: 1, CreatedAt: now()},
		{UserID: run.UserID, InvocationID: run.ID, Type: "attempt.started", Level: "info", Revision: 1, Attempt: 2, CreatedAt: now()},
	}
	if err := database.Create(&events).Error; err != nil {
		t.Fatal(err)
	}

	poll, err := GetInvocationPoll(run.UserID, run.ID, events[0].ID)
	if err != nil {
		t.Fatalf("GetInvocationPoll returned error: %v", err)
	}
	if poll.Run.ID != run.ID || poll.Run.Status != model.InvocationStatusRunning {
		t.Fatalf("run = %#v", poll.Run)
	}
	if poll.Attempt == nil || poll.Attempt.Attempt != 2 || poll.Attempt.Model != "text-test" {
		t.Fatalf("attempt = %#v", poll.Attempt)
	}
	if len(poll.Events) != 2 || poll.Events[0].ID != events[1].ID || poll.NextAfter != events[2].ID {
		t.Fatalf("events=%#v nextAfter=%d", poll.Events, poll.NextAfter)
	}
	if _, err := GetInvocationPoll("other-user", run.ID, 0); err == nil {
		t.Fatal("foreign user read invocation poll")
	}
}

func assertInvocationDetailRefs(t *testing.T, detail InvocationDetail, revision, inputAttempt int, forbiddenOutputID string) {
	t.Helper()
	if detail.EventsHasMore || detail.EventsNextAfter != 0 || detail.EventsLimit != invocationDetailEventsLimit {
		t.Fatalf("unexpected terminal event page metadata: hasMore=%v next=%d limit=%d", detail.EventsHasMore, detail.EventsNextAfter, detail.EventsLimit)
	}
	if len(detail.AuthoritativeArtifactRefs) != 1 {
		t.Fatalf("authoritative refs=%#v", detail.AuthoritativeArtifactRefs)
	}
	input := detail.AuthoritativeArtifactRefs[0]
	if input.Direction != "input" || input.Revision != revision || input.Attempt != inputAttempt {
		t.Fatalf("authoritative input=%#v", input)
	}
	if len(detail.OutputArtifacts) != 0 || detail.ArtifactSetHash != "" {
		t.Fatalf("outputs=%#v hash=%s", detail.OutputArtifacts, detail.ArtifactSetHash)
	}
	for _, ref := range detail.AuthoritativeArtifactRefs {
		if ref.ArtifactID == forbiddenOutputID {
			t.Fatalf("old revision output remained authoritative: %#v", ref)
		}
	}
}
