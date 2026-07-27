package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestAgentRunWorkerExecutesQueuedRun(t *testing.T) {
	fixture := newAgentRunWorkerFixture(t, http.StatusOK, `{"choices":[{"message":{"content":"{\"items\":[]}"}}]}`)
	run := fixture.queueRun(t, "worker-success")
	if err := fixture.worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	saved := fixture.getRun(t, run.ID)
	if saved.Status != model.AgentRunStatusNeedsReview || saved.RawOutput == "" {
		t.Fatalf("saved=%#v", saved)
	}
	fixture.assertCreditLogs(t, run.ID, 1, 0)
}

func TestAgentRunWorkerResolvesEachFrozenExecutor(t *testing.T) {
	api := workerRecordingExecutor{kind: AgentRunExecutorAPI}
	codex := workerRecordingExecutor{kind: AgentRunExecutorCodexCLI}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{Executors: []AgentRunExecutor{api, codex}})

	if resolved, ok := worker.executorFor(AgentRunExecutorAPI); !ok || resolved.Kind() != AgentRunExecutorAPI {
		t.Fatalf("api resolved=%T ok=%v", resolved, ok)
	}
	if resolved, ok := worker.executorFor(AgentRunExecutorCodexCLI); !ok || resolved.Kind() != AgentRunExecutorCodexCLI {
		t.Fatalf("codex resolved=%T ok=%v", resolved, ok)
	}
	if _, ok := worker.executorFor("unknown"); ok {
		t.Fatal("unknown executor must not resolve")
	}
}

type workerRecordingExecutor struct{ kind string }

func (executor workerRecordingExecutor) Kind() string           { return executor.kind }
func (workerRecordingExecutor) Available(context.Context) error { return nil }
func (workerRecordingExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	return agentRunCallResult{}
}
func (workerRecordingExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (workerRecordingExecutor) RefundCredits(*model.AgentRun) error  { return nil }

func TestAgentRunWorkerRetriesRateLimitAndRefunds(t *testing.T) {
	fixture := newAgentRunWorkerFixture(t, http.StatusTooManyRequests, `{"error":{"message":"slow down"}}`)
	run := fixture.queueRun(t, "worker-rate-limit")
	if err := fixture.worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	saved := fixture.getRun(t, run.ID)
	if saved.Status != model.AgentRunStatusQueued || saved.Attempt != 1 || saved.AvailableAt <= fixture.now.Format(time.RFC3339Nano) {
		t.Fatalf("saved=%#v", saved)
	}
	fixture.assertCreditLogs(t, run.ID, 1, 1)
}

func TestAgentRunWorkerFailsPermanentErrorAndRefunds(t *testing.T) {
	fixture := newAgentRunWorkerFixture(t, http.StatusBadRequest, `{"error":{"message":"bad input"}}`)
	run := fixture.queueRun(t, "worker-bad-input")
	if err := fixture.worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	saved := fixture.getRun(t, run.ID)
	if saved.Status != model.AgentRunStatusFailed || saved.ErrorMessage == "" {
		t.Fatalf("saved=%#v", saved)
	}
	fixture.assertCreditLogs(t, run.ID, 1, 1)
}

func TestAgentRunWorkerSkipsCancelledRunWithoutCharge(t *testing.T) {
	fixture := newAgentRunWorkerFixture(t, http.StatusOK, `{"choices":[{"message":{"content":"ok"}}]}`)
	run := fixture.queueRun(t, "worker-cancelled")
	if _, err := repository.RequestAgentRunCancel(run.UserID, run.ID); err != nil {
		t.Fatalf("RequestAgentRunCancel returned error: %v", err)
	}
	if err := fixture.worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	if fixture.calls.Load() != 0 {
		t.Fatalf("upstream calls=%d, want 0", fixture.calls.Load())
	}
	fixture.assertCreditLogs(t, run.ID, 0, 0)
}

func TestAgentRunWorkerSeesCancellationRequestedAfterClaimWithoutModelCall(t *testing.T) {
	fixture := newAgentRunWorkerFixture(t, http.StatusOK, `{"choices":[{"message":{"content":"不应调用"}}]}`)
	run := fixture.queueRun(t, "worker-cancelled-after-claim")
	claimed, ok, err := repository.ClaimNextAgentRun("worker-test", fixture.now, time.Minute)
	if err != nil || !ok || claimed.ID != run.ID {
		t.Fatalf("claimed=%#v ok=%v err=%v", claimed, ok, err)
	}
	if cancelled, err := repository.RequestAgentRunCancel(run.UserID, run.ID); err != nil || cancelled.Status != model.AgentRunStatusCancelRequested {
		t.Fatalf("cancelled=%#v err=%v", cancelled, err)
	}
	if err := fixture.worker.execute(context.Background(), claimed); err != nil {
		t.Fatal(err)
	}
	if fixture.calls.Load() != 0 {
		t.Fatalf("upstream calls=%d, want 0", fixture.calls.Load())
	}
	if saved := fixture.getRun(t, run.ID); saved.Status != model.AgentRunStatusCancelled {
		t.Fatalf("saved=%#v", saved)
	}
	fixture.assertCreditLogs(t, run.ID, 0, 0)
}

func TestAgentRunWorkerKeepsSuperAdminUsageWithoutBalanceReservation(t *testing.T) {
	fixture := newAgentRunWorkerFixture(t, http.StatusOK, `{"choices":[{"message":{"content":"{\"items\":[]}"}}]}`)
	user, ok, err := repository.GetUserByID("user-1")
	if err != nil || !ok {
		t.Fatalf("GetUserByID ok=%v err=%v", ok, err)
	}
	user.Role = model.UserRoleSuperAdmin
	user.Credits = 0
	if _, err := repository.SaveUser(user); err != nil {
		t.Fatalf("SaveUser returned error: %v", err)
	}
	run := fixture.queueRun(t, "worker-superadmin")
	if err := fixture.worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	saved := fixture.getRun(t, run.ID)
	if saved.Status != model.AgentRunStatusNeedsReview || saved.Credits <= 0 || saved.CreditsReserved != 0 || saved.CreditsRefunded != 0 {
		t.Fatalf("saved=%#v", saved)
	}
	if user, ok, err = repository.GetUserByID("user-1"); err != nil || !ok || user.Credits != 0 {
		t.Fatalf("superadmin after run=%#v ok=%v err=%v", user, ok, err)
	}
	fixture.assertCreditLogs(t, run.ID, 0, 0)
}

func TestAgentRunWorkerCompletesWorkflowStageArtifact(t *testing.T) {
	fixture := newAgentRunWorkerFixture(t, http.StatusOK, `{"choices":[{"message":{"content":"{\"items\":[{\"assetId\":\"character-001\",\"kind\":\"character\",\"name\":\"阿宁\",\"sourceEvidence\":[\"阿宁进入房间。\"],\"coreFacts\":[\"主要角色\"]}]}"}}]}`)
	detail, err := EnsureWorkflowRun("user-1", EnsureWorkflowRunInput{
		ProjectID:       "project-worker",
		EpisodeID:       "episode-worker",
		ScriptSnapshot:  "阿宁进入房间。",
		ScriptConfirmed: true,
	})
	if err != nil {
		t.Fatalf("EnsureWorkflowRun returned error: %v", err)
	}
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageArtDesign, "worker-workflow-stage")
	if err != nil {
		t.Fatalf("StartWorkflowStage returned error: %v", err)
	}
	if err := fixture.worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	detail, err = GetWorkflowRunDetail("user-1", detail.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	saved := workflowTestStage(detail, WorkflowStageAssetExtraction)
	if saved.ID != stage.ID || saved.Status != model.WorkflowStageRunStatusNeedsReview || saved.OutputArtifactID == "" {
		t.Fatalf("saved=%#v", saved)
	}
	if len(detail.Gates) != 2 || !detail.Gates[1].Passed || detail.Gates[1].ArtifactID != saved.OutputArtifactID {
		t.Fatalf("gates=%#v", detail.Gates)
	}
}

type agentRunWorkerFixture struct {
	worker *AgentRunWorker
	now    time.Time
	calls  *atomic.Int32
}

func newAgentRunWorkerFixture(t *testing.T, status int, body string) agentRunWorkerFixture {
	t.Helper()
	setupAITaskTestDB(t)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(upstream.Close)
	saveAgentRunTextChannel(t, upstream.URL)
	stamp := now()
	if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "worker-user", Credits: 100, Status: model.UserStatusActive, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatalf("SaveUser returned error: %v", err)
	}
	fixedNow := time.Now().UTC().Add(time.Minute)
	return agentRunWorkerFixture{
		worker: NewAgentRunWorker(AgentRunWorkerOptions{
			ID:                "worker-test",
			LeaseDuration:     time.Minute,
			HeartbeatInterval: time.Hour,
			Now:               func() time.Time { return fixedNow },
		}),
		now:   fixedNow,
		calls: &calls,
	}
}

func (f agentRunWorkerFixture) queueRun(t *testing.T, key string) model.AgentRun {
	t.Helper()
	run, err := CreateUserAgentRun("user-1", CreateAgentRunInput{
		AgentKind:       "asset_extractor",
		IdempotencyKey:  key,
		ModelPreference: "text-test",
		UserPrompt:      "test",
	})
	if err != nil {
		t.Fatalf("CreateUserAgentRun returned error: %v", err)
	}
	return run
}

func (f agentRunWorkerFixture) getRun(t *testing.T, id string) model.AgentRun {
	t.Helper()
	run, ok, err := repository.GetAgentRun(id)
	if err != nil || !ok {
		t.Fatalf("GetAgentRun ok=%v err=%v", ok, err)
	}
	return run
}

func (f agentRunWorkerFixture) assertCreditLogs(t *testing.T, id string, consume int64, refund int64) {
	t.Helper()
	consumed, err := repository.CountCreditLogsByRelatedIDAndType(id, model.CreditLogTypeAIConsume)
	if err != nil {
		t.Fatalf("count consume logs: %v", err)
	}
	refunded, err := repository.CountCreditLogsByRelatedIDAndType(id, model.CreditLogTypeAIRefund)
	if err != nil {
		t.Fatalf("count refund logs: %v", err)
	}
	if consumed != consume || refunded != refund {
		t.Fatalf("credit logs consume=%d refund=%d, want %d/%d", consumed, refunded, consume, refund)
	}
}
