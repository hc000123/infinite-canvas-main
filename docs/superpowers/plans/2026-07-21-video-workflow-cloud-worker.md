# Video Workflow Cloud Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disabled synchronous Agent Run path with a durable, user-isolated Cloud Worker that supports queueing, leases, retries, cancellation, review, apply receipts, and correct credit accounting.

**Architecture:** Gin accepts idempotent workflow commands and writes jobs to GORM-backed tables. An embedded worker atomically claims queued `agent_runs`, calls the existing server-side text channel, heartbeats the lease, writes versioned artifacts and deterministic gate results, and leaves all formal writes behind review/apply APIs. The same worker can later run as a separate process because API and worker coordinate only through the database.

**Tech Stack:** Go 1.25, Gin, GORM, SQLite/MySQL/Postgres, existing model-channel selector, existing credit ledger, `httptest` fake upstream.

---

### Task 1: Durable workflow models and schema

**Files:**
- Create: `model/workflow_run.go`
- Modify: `model/agent_run.go`
- Modify: `repository/db.go`
- Modify: `docs/backend-database.md`
- Test: `repository/workflow_run_test.go`

- [ ] **Step 1: Write the failing migration test**

```go
func TestWorkflowTablesMigrate(t *testing.T) {
    setupWorkflowRepositoryTestDB(t)
    db, err := DB()
    if err != nil { t.Fatal(err) }
    for _, item := range []any{&model.WorkflowRun{}, &model.WorkflowStageRun{}, &model.WorkflowArtifact{}, &model.WorkflowQualityGateResult{}, &model.WorkflowEvent{}} {
        if !db.Migrator().HasTable(item) { t.Fatalf("missing table %T", item) }
    }
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `go test ./repository -run TestWorkflowTablesMigrate -count=1`

Expected: FAIL because workflow model types do not exist.

- [ ] **Step 3: Add workflow records and queue fields**

Define explicit status enums and records with JSON/GORM tags. `AgentRun` adds `queued`, `cancel_requested`, `cancelled`, `Attempt`, `MaxAttempts`, `AvailableAt`, `LeaseOwner`, `LeaseExpiresAt`, `HeartbeatAt`, `IdempotencyKey`, `CreditsReserved`, and `CreditsRefunded`. Add a unique composite index for `UserID + IdempotencyKey`.

```go
type WorkflowRunStatus string
const (
    WorkflowRunStatusActive WorkflowRunStatus = "active"
    WorkflowRunStatusCompleted WorkflowRunStatus = "completed"
    WorkflowRunStatusFailed WorkflowRunStatus = "failed"
)

type WorkflowRun struct {
    ID string `json:"id" gorm:"primaryKey"`
    UserID string `json:"userId" gorm:"index"`
    ProjectID string `json:"projectId" gorm:"index"`
    EpisodeID string `json:"episodeId" gorm:"index"`
    WorkflowID string `json:"workflowId" gorm:"index"`
    WorkflowVersion string `json:"workflowVersion"`
    ScriptHash string `json:"scriptHash" gorm:"index"`
    ScriptSnapshot string `json:"scriptSnapshot" gorm:"type:text"`
    CurrentStageID string `json:"currentStageId"`
    Status WorkflowRunStatus `json:"status" gorm:"index"`
    CreatedAt string `json:"createdAt"`
    UpdatedAt string `json:"updatedAt"`
}
```

- [ ] **Step 4: Migrate all records and document fields**

Add all new records to `AutoMigrate`. Document status values, ownership indexes, artifact hashes, gate results, event cursors, queue leases, and credit fields in `docs/backend-database.md`.

- [ ] **Step 5: Run the migration test**

Run: `go test ./repository -run TestWorkflowTablesMigrate -count=1`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add model/agent_run.go model/workflow_run.go repository/db.go repository/workflow_run_test.go docs/backend-database.md
git commit -m "feat: add durable workflow records"
```

### Task 2: Atomic queue repository and idempotency

**Files:**
- Create: `repository/workflow_run.go`
- Modify: `repository/agent_run.go`
- Test: `repository/agent_run_queue_test.go`

- [ ] **Step 1: Write failing queue tests**

```go
func TestClaimAgentRunOnlyOnce(t *testing.T) {
    setupWorkflowRepositoryTestDB(t)
    run := saveQueuedAgentRun(t, "idem-1")
    first, ok, err := ClaimNextAgentRun("worker-a", time.Now(), time.Minute)
    if err != nil || !ok || first.ID != run.ID { t.Fatalf("first claim = %#v %v", first, err) }
    if _, ok, err := ClaimNextAgentRun("worker-b", time.Now(), time.Minute); err != nil || ok { t.Fatalf("second claim ok=%v err=%v", ok, err) }
}

func TestSaveAgentRunIdempotently(t *testing.T) {
    setupWorkflowRepositoryTestDB(t)
    first, created, _ := SaveAgentRunIdempotently(queuedRun("user-1", "same-key"))
    second, createdAgain, _ := SaveAgentRunIdempotently(queuedRun("user-1", "same-key"))
    if !created || createdAgain || first.ID != second.ID { t.Fatalf("idempotency failed") }
}
```

- [ ] **Step 2: Verify tests fail**

Run: `go test ./repository -run 'TestClaimAgentRunOnlyOnce|TestSaveAgentRunIdempotently' -count=1`

Expected: FAIL because queue repository functions are missing.

- [ ] **Step 3: Implement conditional claim, heartbeat, recovery, and cancel**

Implement transactions that:

```go
func ClaimNextAgentRun(workerID string, now time.Time, lease time.Duration) (model.AgentRun, bool, error)
func RenewAgentRunLease(id, workerID string, now time.Time, lease time.Duration) (bool, error)
func RequeueExpiredAgentRuns(now time.Time) (int64, error)
func RequestAgentRunCancel(userID, id string) (model.AgentRun, error)
func SaveAgentRunIdempotently(run model.AgentRun) (model.AgentRun, bool, error)
```

Claim uses an ordered queued candidate followed by `WHERE id = ? AND status = 'queued'` conditional update. Recovery increments attempts, clears the lease, and either requeues or fails when `Attempt >= MaxAttempts`.

- [ ] **Step 4: Run queue tests**

Run: `go test ./repository -run 'AgentRun|Workflow' -count=1`

Expected: PASS including concurrent claim and expired lease cases.

- [ ] **Step 5: Commit**

```bash
git add repository/agent_run.go repository/agent_run_queue_test.go repository/workflow_run.go
git commit -m "feat: add durable agent run queue"
```

### Task 3: Make Agent Run creation asynchronous

**Files:**
- Modify: `service/agent_run.go`
- Modify: `handler/agent_run.go`
- Modify: `web/src/services/api/agent-runs.ts`
- Test: `service/agent_run_test.go`

- [ ] **Step 1: Write a failing asynchronous creation test**

```go
func TestCreateUserAgentRunQueuesWithoutCallingUpstream(t *testing.T) {
    setupAgentRunTest(t)
    calls := atomic.Int32{}
    upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
    defer upstream.Close()
    saveTextChannel(t, upstream.URL)
    run, err := CreateUserAgentRun("user-1", CreateAgentRunInput{AgentKind: "asset_extractor", IdempotencyKey: "create-1", UserPrompt: "test"})
    if err != nil { t.Fatal(err) }
    if run.Status != model.AgentRunStatusQueued || calls.Load() != 0 { t.Fatalf("run=%s calls=%d", run.Status, calls.Load()) }
}
```

- [ ] **Step 2: Verify the test fails**

Run: `go test ./service -run TestCreateUserAgentRunQueuesWithoutCallingUpstream -count=1`

Expected: FAIL because creation calls upstream synchronously.

- [ ] **Step 3: Queue requests and expose new statuses**

Add `IdempotencyKey` to `CreateAgentRunInput`. Resolve model/channel and build `RequestJSON`, but save the run as `queued` without consuming credits or calling upstream. Update TypeScript status and fields:

```ts
export type RemoteAgentRunStatus = "queued" | "running" | "cancel_requested" | "needs_review" | "approved" | "rejected" | "applied" | "failed" | "cancelled";
```

- [ ] **Step 4: Run service and TypeScript API tests**

Run: `go test ./service -run AgentRun -count=1`

Expected: PASS and no upstream call during HTTP creation.

- [ ] **Step 5: Commit**

```bash
git add service/agent_run.go service/agent_run_test.go handler/agent_run.go web/src/services/api/agent-runs.ts
git commit -m "feat: enqueue agent runs asynchronously"
```

### Task 4: Worker executor with leases, retries, cancellation, and credits

**Files:**
- Create: `service/agent_run_worker.go`
- Create: `service/agent_run_worker_test.go`
- Modify: `service/agent_run.go`

- [ ] **Step 1: Write failing worker lifecycle tests**

Cover success, 429 retry, permanent 400, cancellation before call, and expired lease recovery. The success assertion is:

```go
func TestAgentRunWorkerExecutesQueuedRun(t *testing.T) {
    fixture := newWorkerFixture(t, http.StatusOK, `{"choices":[{"message":{"content":"{\"items\":[]}"}}]}`)
    run := fixture.queueRun("worker-success")
    if err := fixture.worker.ProcessOne(context.Background()); err != nil { t.Fatal(err) }
    saved := fixture.getRun(run.ID)
    if saved.Status != model.AgentRunStatusNeedsReview || saved.RawOutput == "" { t.Fatalf("saved=%#v", saved) }
    fixture.assertOneDebitNoRefund(run.ID)
}
```

- [ ] **Step 2: Verify worker tests fail**

Run: `go test ./service -run AgentRunWorker -count=1`

Expected: FAIL because worker types are missing.

- [ ] **Step 3: Implement Worker**

```go
type AgentRunWorker struct {
    ID string
    PollInterval time.Duration
    LeaseDuration time.Duration
    MaxConcurrency int
}

func (w *AgentRunWorker) Run(ctx context.Context)
func (w *AgentRunWorker) ProcessOne(ctx context.Context) error
```

`ProcessOne` claims a job, reserves credits once, starts a lease heartbeat, calls the existing text request with the worker context, checks cancellation before artifact write, and finalizes status. Retry only 429/5xx/network timeout; refund exactly once when no reviewable artifact exists.

- [ ] **Step 4: Run worker and credit tests**

Run: `go test ./service -run 'AgentRunWorker|Credits' -count=1`

Expected: PASS with one debit on success, one debit plus one refund on permanent failure, and no charge on pre-call cancellation.

- [ ] **Step 5: Commit**

```bash
git add service/agent_run.go service/agent_run_worker.go service/agent_run_worker_test.go
git commit -m "feat: execute agent runs in cloud worker"
```

### Task 5: Workflow orchestration, artifacts, gates, and review

**Files:**
- Create: `service/video_workflow.go`
- Create: `service/video_workflow_contracts.go`
- Create: `service/video_workflow_gates.go`
- Create: `service/video_workflow_test.go`
- Modify: `repository/workflow_run.go`

- [ ] **Step 1: Write failing workflow state-machine tests**

```go
func TestStoryboardStageRequiresApprovedArtDesign(t *testing.T) {
    fixture := newWorkflowFixture(t)
    run := fixture.createRun()
    _, err := StartWorkflowStage("user-1", run.ID, "seedance-storyboard", "idem-storyboard")
    if err == nil || !strings.Contains(err.Error(), "美术") { t.Fatalf("err=%v", err) }
}

func TestReviewRejectsArtifactHashMismatch(t *testing.T) {
    fixture := newWorkflowFixture(t)
    stage := fixture.needsReviewStage()
    _, err := ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: "old"})
    if err == nil { t.Fatal("expected hash conflict") }
}
```

- [ ] **Step 2: Verify state tests fail**

Run: `go test ./service -run Workflow -count=1`

Expected: FAIL because workflow service is missing.

- [ ] **Step 3: Implement versioned contracts and deterministic gates**

Add `video-workflow-v1` with `script-adaptation`, `art-design`, and `seedance-storyboard`. Server prompts accept only the saved script and approved upstream artifact. Parse structured JSON and validate required asset fields, unique IDs, scene/P IDs, prompt text, `@图N` references, duration, and dialogue budget.

```go
type WorkflowGateIssue struct { Code, Message, ItemID string; Blocking bool }
type WorkflowGateReport struct { Passed bool; Version string; Issues []WorkflowGateIssue }
func ValidateArtDesignArtifact(raw json.RawMessage) WorkflowGateReport
func ValidateStoryboardArtifact(raw json.RawMessage) WorkflowGateReport
```

- [ ] **Step 4: Implement stage start, completion, review, apply receipt, and events**

```go
func EnsureWorkflowRun(userID string, input EnsureWorkflowRunInput) (model.WorkflowRunDetail, error)
func StartWorkflowStage(userID, workflowRunID, stageID, idempotencyKey string) (model.WorkflowStageRun, error)
func ReviewWorkflowStage(userID, stageRunID string, input WorkflowReviewInput) (model.WorkflowStageRun, error)
func ApplyWorkflowStage(userID, stageRunID string, input WorkflowApplyInput) (model.WorkflowStageRun, error)
```

Every state transition writes a monotonic `workflow_events` record. Approval requires a passing gate and matching artifact hash. Apply requires approval and records target IDs/counts without writing browser-local stores on the server.

- [ ] **Step 5: Run workflow tests**

Run: `go test ./service ./repository -run Workflow -count=1`

Expected: PASS for dependency gates, hash conflicts, ownership, idempotent stage start, and apply receipts.

- [ ] **Step 6: Commit**

```bash
git add service/video_workflow.go service/video_workflow_contracts.go service/video_workflow_gates.go service/video_workflow_test.go repository/workflow_run.go
git commit -m "feat: orchestrate production video workflow"
```

### Task 6: Workflow HTTP API and health gate

**Files:**
- Create: `handler/workflow.go`
- Modify: `router/router.go`
- Test: `handler/workflow_test.go`
- Test: `router/router_test.go`

- [ ] **Step 1: Write failing authenticated route tests**

Assert create/get/start/cancel/retry/review/apply/events/health routes reach auth, reject another user's record, and return `{ code, data, msg }`.

```go
func TestWorkflowRoutesRequireAuth(t *testing.T) {
    engine := router.New()
    for _, path := range []string{"/api/v1/workflow-runs/run-1", "/api/v1/workflow-worker/health"} {
        recorder := httptest.NewRecorder()
        engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
        if recorder.Code == http.StatusNotFound { t.Fatalf("route missing: %s", path) }
    }
}
```

- [ ] **Step 2: Verify route tests fail**

Run: `go test ./handler ./router -run Workflow -count=1`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Add thin handlers and routes**

Handlers decode bounded JSON, call service methods with the authenticated user ID, and return `OK`/`FailError`. Health returns enabled state, last worker heartbeat, queue depth, and whether a text channel resolves; it never returns secrets.

- [ ] **Step 4: Run API tests**

Run: `go test ./handler ./router -run Workflow -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add handler/workflow.go handler/workflow_test.go router/router.go router/router_test.go
git commit -m "feat: expose workflow worker api"
```

### Task 7: Graceful process lifecycle

**Files:**
- Modify: `config/config.go`
- Modify: `main.go`
- Modify: `.env.example`
- Create: `service/agent_run_worker_lifecycle_test.go`

- [ ] **Step 1: Write failing lifecycle test**

```go
func TestWorkerStopsClaimingAfterCancellation(t *testing.T) {
    fixture := newWorkerFixture(t, http.StatusOK, successBody)
    ctx, cancel := context.WithCancel(context.Background())
    cancel()
    fixture.worker.Run(ctx)
    if fixture.claimCount() != 0 { t.Fatalf("claimed after shutdown") }
}
```

- [ ] **Step 2: Add deployment-only worker configuration**

Add `WORKFLOW_WORKER_ENABLED`, `WORKFLOW_WORKER_CONCURRENCY`, `WORKFLOW_WORKER_USER_CONCURRENCY`, `WORKFLOW_WORKER_POLL_MS`, and `WORKFLOW_WORKER_LEASE_SECONDS` to `config.Config` and `.env.example`; do not add them to admin model settings.

- [ ] **Step 3: Replace `gin.Run` with graceful HTTP server lifecycle**

Use `signal.NotifyContext`, start prompt sync and Worker with the same root context, stop claims on cancellation, call `http.Server.Shutdown`, then wait for worker exit or lease release.

- [ ] **Step 4: Run lifecycle and full Go tests**

Run: `go test ./...`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/config.go main.go .env.example service/agent_run_worker_lifecycle_test.go
git commit -m "feat: run workflow worker with graceful shutdown"
```

### Task 8: Cloud Worker documentation checkpoint

**Files:**
- Modify: `docs/api-response.md`
- Modify: `docs/workflow.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Document user APIs and state transitions**

Record the workflow endpoints, idempotency key behavior, queued/running/review/approved/applied/failed/cancelled states, ownership, credit behavior, and worker health response.

- [ ] **Step 2: Move the completed Worker foundation item**

Remove the implemented cloud Worker foundation item from `docs/todo.md` and add a concise, testable record to `docs/pending-test.md`. Keep real channel smoke testing as pending until separately authorized.

- [ ] **Step 3: Review the diff**

Run: `git diff --check && rg -n "local-runner|Codex CLI" handler service model repository docs/workflow.md`

Expected: no new executable local-runner path; documentation only mentions it as prohibited.

- [ ] **Step 4: Commit**

```bash
git add docs/api-response.md docs/workflow.md docs/todo.md docs/pending-test.md
git commit -m "docs: describe cloud workflow worker"
```
