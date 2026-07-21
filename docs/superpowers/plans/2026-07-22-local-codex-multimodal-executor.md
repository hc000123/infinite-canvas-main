# Local Codex Multimodal Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-only Codex CLI executor with multimodal image inputs while preserving the existing Worker state machine and hard-blocking CLI in production.

**Architecture:** Configuration selects an API or Codex executor once at service startup. Agent Runs freeze that executor. Browser-local images are uploaded into one-time server batches, validated, bound atomically to the run, and supplied to `codex exec` through repeated `-i` arguments.

**Tech Stack:** Go `os/exec`, Gin multipart handling, GORM, Next.js, localforage, Codex CLI.

---

### Task 1: Add production-safe executor configuration

**Files:**
- Modify: `config/config.go`
- Modify: `config/config_test.go`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.local.yml`

- [ ] **Step 1: Write production rejection tests**

```go
func TestProductionRejectsLocalCodexExecutor(t *testing.T) {
    for _, key := range []string{"APP_ENV", "GIN_MODE", "GO_ENV", "NODE_ENV"} {
        t.Run(key, func(t *testing.T) {
            clearProductionEnv(t)
            t.Setenv(key, map[string]string{"GIN_MODE":"release"}[key])
            if key != "GIN_MODE" { t.Setenv(key, "production") }
            t.Setenv("WORKFLOW_TEXT_EXECUTOR", "codex-cli")
            t.Setenv("WORKFLOW_LOCAL_CODEX_ENABLED", "true")
            if err := Load(); err == nil || !strings.Contains(err.Error(), "生产环境禁止 Codex CLI") { t.Fatalf("err=%v", err) }
        })
    }
}
```

- [ ] **Step 2: Add validated fields**

Add `WorkflowTextExecutor`, `WorkflowLocalCodexEnabled`, `WorkflowCodexBin`, `WorkflowCodexWorkdir`, and `WorkflowCodexModel`. Defaults are `api`, `false`, `codex`, current working directory, and empty model. Reject unknown executors, CLI without the enable flag, and any CLI flag in production.

- [ ] **Step 3: Pin deployment examples to API**

Both compose files set `APP_ENV=production`, `WORKFLOW_TEXT_EXECUTOR=api`, and `WORKFLOW_LOCAL_CODEX_ENABLED=false`. `.env.example` documents a separate host-development block without enabling it by default.

- [ ] **Step 4: Run and commit**

Run: `go test ./config -count=1`
Expected: PASS.

```bash
git add config/config.go config/config_test.go .env.example docker-compose.yml docker-compose.local.yml
git commit -m "feat: gate local Codex executor by environment"
```

### Task 2: Extract API executor and implement Codex CLI executor

**Files:**
- Create: `service/agent_run_executor.go`
- Create: `service/agent_run_codex_executor.go`
- Modify: `service/agent_run_worker.go`
- Modify: `main.go`
- Test: `service/agent_run_codex_executor_test.go`

- [ ] **Step 1: Write command construction tests**

```go
func TestCodexExecutorBuildsReadOnlyMultimodalCommand(t *testing.T) {
    command := buildCodexCommand(CodexExecutorOptions{Bin:"codex", Workdir:"/workspace", Model:"gpt-test"}, "/tmp/final.txt", []string{"/staged/1.png", "/staged/2.webp"})
    expected := []string{"exec","--ephemeral","--sandbox","read-only","--color","never","--cd","/workspace","--output-last-message","/tmp/final.txt","-i","/staged/1.png","-i","/staged/2.webp","--model","gpt-test","-"}
    if !reflect.DeepEqual(command.Args[1:], expected) { t.Fatalf("args=%q", command.Args) }
}
```

- [ ] **Step 2: Define the executor interface**

```go
type AgentRunExecutor interface {
    Kind() string
    Available(context.Context) error
    ResolveRun(CreateAgentRunInput) (resolvedAgentRunExecution, error)
    Call(context.Context, model.AgentRun) agentRunCallResult
    ReserveCredits(*model.AgentRun) error
    RefundCredits(*model.AgentRun) error
}
```

Move current channel HTTP logic into `APIAgentRunExecutor`. Keep identical request parsing, retry classification, charge, and refund behavior.

- [ ] **Step 3: Implement the CLI executor**

Use `exec.CommandContext`, stdin prompt, `--ephemeral`, `--sandbox read-only`, fixed workdir, optional model, repeated images, and `--output-last-message` in a private temporary directory. Limit stderr to 16 KiB, delete the temporary result directory with `defer`, and map cancellation, timeout, empty output, and nonzero exit to safe errors. CLI credits are always zero and never touch the application ledger.

- [ ] **Step 4: Inject one executor at startup**

`main.go` creates the validated executor and passes it through `AgentRunWorkerOptions`. Task creation uses the same runtime executor to freeze `AgentRun.Executor`; a Worker must refuse a queued run whose frozen executor differs from its own kind.

- [ ] **Step 5: Run tests and commit**

Run: `go test ./service -run 'Test.*AgentRun.*Executor|TestAgentRunWorker' -count=1`
Expected: PASS.

```bash
git add service/agent_run_executor.go service/agent_run_codex_executor.go service/agent_run_codex_executor_test.go service/agent_run_worker.go main.go
git commit -m "feat: add local Codex workflow executor"
```

### Task 3: Add one-time image upload batches

**Files:**
- Create: `model/workflow_run_media.go`
- Create: `repository/workflow_run_media.go`
- Create: `service/workflow_run_media.go`
- Create: `handler/workflow_run_media.go`
- Modify: `router/router.go`
- Modify: `handler/workflow.go`
- Modify: `service/video_workflow.go`
- Test: `service/workflow_run_media_test.go`

- [ ] **Step 1: Write isolation and signature tests**

```go
func TestWorkflowMediaBatchRejectsAnotherUserAndInvalidImage(t *testing.T) {
    batch := mustCreateMediaBatch(t, "user-1", "workflow-1", "storyboard", "start-1")
    if err := UploadWorkflowMedia("user-2", batch.ID, fakePNG("x.png")); err == nil { t.Fatal("expected ownership error") }
    if err := UploadWorkflowMedia("user-1", batch.ID, fakeFile("x.png", []byte("not png"))); err == nil { t.Fatal("expected signature error") }
}
```

- [ ] **Step 2: Persist batches and items**

Store batch ownership, workflow, stage, idempotency key, status, run ID, expiry, and items containing asset ID, label, kind, version, order, SHA-256, MIME, size, and server path. Server paths are never serialized to user responses.

- [ ] **Step 3: Add bounded endpoints**

Implement authenticated create-batch, multipart upload, list-summary, and delete-unused-batch endpoints. Accept PNG/JPEG/WebP only, verify magic bytes, max 9 images, max 10 MiB each, normalize filenames, and store under `WORKFLOW_LOCAL_MEDIA_DIR`.

- [ ] **Step 4: Atomically claim the batch**

Extend the stage start input with `mediaBatchId`. In one transaction verify user/workflow/stage/idempotency binding, freeze ordered items, bind Agent Run ID, and mark the batch claimed before enqueue. Retries reuse the frozen manifest. Missing expected assets block; zero references write an explicit text-only degradation flag.

- [ ] **Step 5: Run and commit**

Run: `go test ./service ./handler ./router -run 'Test.*WorkflowMedia' -count=1`
Expected: PASS.

```bash
git add model/workflow_run_media.go repository/workflow_run_media.go service/workflow_run_media.go handler/workflow_run_media.go handler/workflow.go router/router.go service/video_workflow.go service/workflow_run_media_test.go
git commit -m "feat: stage workflow image inputs"
```

### Task 4: Upload browser assets and expose multimodal run summaries

**Files:**
- Modify: `web/src/services/api/workflow-runs-contract.ts`
- Modify: `web/src/services/api/workflow-runs.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-stage-actions.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-image-inputs.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-stage-panel.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-run-console.tsx`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-image-inputs.test.mts`

- [ ] **Step 1: Write deterministic selection tests**

```ts
test("selects at most nine images in character scene prop order", () => {
  const selected = selectWorkflowImageInputs(fixtures, 9);
  assert.deepEqual(selected.map((item) => item.kind), ["character", "character", "scene", "prop"]);
  assert.ok(selected.length <= 9);
});
```

- [ ] **Step 2: Implement browser upload flow**

Resolve image blobs from localforage-backed assets, sort main characters, main scene, key props, then variants, create a batch, upload sequentially with metadata, and pass the batch ID to stage start. If a referenced image cannot be read, show the asset name and do not start. If no images are referenced, require an explicit text-only confirmation and record it.

- [ ] **Step 3: Show immutable run evidence**

The stage panel and run console show executor label, Skill version/hash, image count, ordered image labels/types/versions, and degradation status. Never display server paths.

- [ ] **Step 4: Run and commit**

Run: `cd web && npm test && npm run typecheck`
Expected: PASS.

```bash
git add web/src/services/api/workflow-runs* web/src/app/'(user)'/projects/'[id]'/episodes/'[episodeId]'/workflow
git commit -m "feat: add multimodal workflow image inputs"
```

### Task 5: Verify executor health and cleanup

**Files:**
- Modify: `service/video_workflow_operations.go`
- Create: `service/workflow_local_media_cleanup.go`
- Modify: `main.go`
- Test: `service/workflow_executor_health_test.go`

- [ ] **Step 1: Add health tests**

CLI health requires non-production mode, enabled flag, executable lookup, existing workdir, and a successful short `codex --version`. API health keeps the current text-channel check. Response adds only `executor` and `executorLabel`.

- [ ] **Step 2: Add cleanup**

On startup and every hour, delete unclaimed expired batches and terminal-run files older than the configured retention. Only delete descendants of the validated staging root after resolving the absolute path.

- [ ] **Step 3: Run and commit**

Run: `go test ./service -run 'TestWorkflowExecutorHealth|TestWorkflowLocalMediaCleanup' -count=1`
Expected: PASS.

```bash
git add service/video_workflow_operations.go service/workflow_local_media_cleanup.go service/workflow_executor_health_test.go main.go
git commit -m "feat: report and clean local workflow executor"
```
