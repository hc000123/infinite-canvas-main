# Video Workflow Release Validation Loop Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** 用可重复的自动化检查与真实浏览器体验循环，验证单页视频工作台和云端 Worker 达到上线标准，并在无 P0/P1、30 项核心场景至少通过 29 项、预估用户满意度至少 95% 后停止。

**Architecture:** 验收分为确定性假上游集成测试、完整静态与构建检查、真实浏览器主路径体验、问题分级与回归四层。所有生成类测试默认走本地假上游，不消耗真实额度；仅在用户另行明确授权后执行一次真实付费通道烟测。每轮都保留验收记录，并在修复后重跑受影响场景和完整主路径。

**Tech Stack:** Go test/httptest、Node.js 内置 test runner、Next.js build、浏览器自动化、SQLite 临时数据库、Markdown 验收报告

---

### Task 1: Build a deterministic fake upstream for worker integration tests

**Files:**
- Create: `service/workflow_worker_integration_test.go`
- Modify: `service/agent_run_worker.go`
- Test: `service/workflow_worker_integration_test.go`

**Step 1: Write the failing integration test**

```go
func TestWorkflowWorkerCompletesWithFakeUpstream(t *testing.T) {
    upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        _, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\\"shots\\":[]}"}}]}`))
    }))
    defer upstream.Close()

    run := createQueuedWorkflowRun(t, upstream.URL)
    worker := NewWorkflowWorker(testWorkflowWorkerOptions(t))
    require.NoError(t, worker.RunOnce(context.Background()))

    got := mustGetWorkflowRun(t, run.ID)
    require.Equal(t, model.WorkflowRunSucceeded, got.Status)
    require.NotEmpty(t, mustListWorkflowArtifacts(t, run.ID))
}
```

**Step 2: Run the test to verify it fails**

Run: `go test ./service -run TestWorkflowWorkerCompletesWithFakeUpstream -count=1`
Expected: FAIL because the worker does not yet expose deterministic one-cycle execution or injectable upstream configuration.

**Step 3: Add the minimum test seam**

```go
type WorkflowWorkerOptions struct {
    PollInterval time.Duration
    LeaseDuration time.Duration
    Now func() time.Time
}

func (w *WorkflowWorker) RunOnce(ctx context.Context) error {
    task, err := w.claim(ctx)
    if errors.Is(err, repository.ErrQueueEmpty) {
        return nil
    }
    if err != nil {
        return err
    }
    return w.execute(ctx, task)
}
```

Keep production defaults unchanged and inject only clock/poll timing in tests.

**Step 4: Add failure-mode cases**

Add table tests for:

```go
[]struct {
    name       string
    statusCode int
    wantStatus model.WorkflowTaskStatus
}{
    {"rate limited then retry", http.StatusTooManyRequests, model.WorkflowTaskQueued},
    {"invalid request fails", http.StatusBadRequest, model.WorkflowTaskFailed},
    {"cancelled before dispatch", http.StatusOK, model.WorkflowTaskCancelled},
}
```

Also verify idempotent replay creates no duplicate artifact and no duplicate credit charge.

**Step 5: Run the integration tests**

Run: `go test ./service -run 'TestWorkflowWorker|TestWorkflowRunIdempotency' -count=1`
Expected: PASS.

**Step 6: Commit**

```bash
git add service/agent_run_worker.go service/workflow_worker_integration_test.go
git commit -m "test: cover workflow worker integration"
```

### Task 2: Add frontend state and interaction regression tests

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-state.test.mts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-state.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-actions.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-state.test.mts`

**Step 1: Write the route/state/action regression tests**

```ts
test('restores the selected stage and shot from the URL', () => {
  assert.deepEqual(parseWorkflowRouteState('?stage=storyboard&shot=S012'), {
    stage: 'storyboard',
    shotId: 'S012',
  })
})

test('keeps queue selection when a background task refreshes', () => {
  const next = reduceWorkflowState(currentState, tasksRefreshedAction)
  assert.equal(next.selectedShotId, currentState.selectedShotId)
})

test('does not expose apply before review approval', () => {
  assert.equal(workflowStageActions(stageFixture({ status: 'needs_review' })).canApply, false)
  assert.equal(workflowStageActions(stageFixture({ status: 'approved' })).canApply, true)
})
```

**Step 2: Run the tests to verify they fail**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-state.test.mts'`
Expected: FAIL until route restoration, stable selection, and review/apply boundaries are implemented.

**Step 3: Implement only missing pure state transitions**

Keep server task state separate from local editing state. Component-level accessible labels and keyboard behavior are verified in the real-browser pass because this project intentionally uses Node's built-in TypeScript test runner and does not include a DOM test framework.

**Step 4: Run the focused tests**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-state.test.mts'`
Expected: PASS.

**Step 5: Commit**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow'
git commit -m "test: cover workflow workbench state"
```

### Task 3: Create the 30-scenario acceptance matrix and report template

**Files:**
- Create: `docs/release-acceptance-report.md`
- Modify: `docs/pending-test.md`
- Test: `docs/release-acceptance-report.md`

**Step 1: Create the scenario table from the approved design**

```md
| ID | Area | Scenario | Result | Evidence | Issue |
| --- | --- | --- | --- | --- | --- |
| WF-01 | Entry | Open canonical episode workflow route | Pending |  |  |
| WF-02 | Recovery | Refresh restores stage and selection | Pending |  |  |
| ... | ... | ... | ... | ... | ... |
| WF-30 | Responsive | 1024px layout remains operable | Pending |  |  |
```

Include the complete 30 cases from the design specification, grouped by entry/navigation, queue execution, review/apply, asset preparation, shot editing, video output, failure recovery, permissions/accounting, performance/accessibility, and responsive behavior.

**Step 2: Add release thresholds**

```md
Release gate:
- Pass >= 29/30
- P0 = 0
- P1 = 0
- Main path rerun after the last fix = Pass
- Estimated satisfaction >= 95%
```

**Step 3: Record validation constraints**

State that generated content uses the fake upstream, browser-local projects/assets are never described as cloud-synced, and paid-channel smoke testing requires separate authorization.

**Step 4: Validate coverage mechanically**

Run: `rg -n '^\| WF-[0-9]{2} ' docs/release-acceptance-report.md | wc -l`
Expected: `30`.

**Step 5: Commit**

```bash
git add docs/release-acceptance-report.md docs/pending-test.md
git commit -m "docs: add workflow release acceptance matrix"
```

### Task 4: Run the complete automated release checks

**Files:**
- Modify if needed: files implicated by failures only
- Test: all backend and frontend suites

**Step 1: Run backend tests**

Run: `go test ./... -count=1`
Expected: PASS.

**Step 2: Run frontend unit tests**

Run: `cd web && npm test`
Expected: PASS.

**Step 3: Run TypeScript and lint checks**

Run: `cd web && npm run typecheck`
Expected: PASS.

Run: `cd web && npm run lint:fast`
Expected: PASS.

**Step 4: Build the production frontend**

Run: `cd web && npm run build`
Expected: PASS and the canonical workflow route appears in the build output.

**Step 5: Fix failures one root cause at a time**

For every failure:

1. Record the failing command and cause in the acceptance report.
2. Add or tighten a regression test.
3. Apply the smallest scoped fix.
4. Rerun the failing command.
5. Rerun the complete check group before moving on.

**Step 6: Commit**

```bash
git add <files-fixed-from-automated-checks>
git commit -m "fix: pass workflow release checks"
```

Skip this commit when all checks pass without source changes.

### Task 5: Start an isolated release-like environment

**Files:**
- Modify: `.env.example`
- Create: `docs/testing/video-workflow-local-acceptance.md`
- Test: isolated local runtime

**Step 1: Document non-secret local acceptance configuration**

```env
WORKFLOW_WORKER_ENABLED=true
WORKFLOW_WORKER_POLL_INTERVAL=250ms
WORKFLOW_WORKER_LEASE_DURATION=30s
```

Document fake-upstream configuration without adding credentials or committing actual secrets.

**Step 2: Create an isolated database directory**

Run:

```bash
ACCEPTANCE_DIR="$(mktemp -d)"
echo "$ACCEPTANCE_DIR"
```

Use the printed explicit path for the acceptance database and generated artifacts. Do not point tests at the developer's normal database.

**Step 3: Start backend and frontend in release-like mode**

Run the backend with the isolated database and fake upstream, then start the built frontend on a known local port. Capture process IDs so both processes can be stopped after validation.

**Step 4: Verify readiness**

Run: `curl -fsS http://localhost:<backend-port>/api/v1/health/workflow-worker`
Expected: JSON reports enabled worker, a recent heartbeat, and no stale lease count.

Run: `curl -fsS http://localhost:<frontend-port>/`
Expected: HTTP 200.

**Step 5: Commit documentation**

```bash
git add .env.example docs/testing/video-workflow-local-acceptance.md
git commit -m "docs: document workflow acceptance runtime"
```

### Task 6: Perform the first real-browser acceptance pass

**Files:**
- Modify: `docs/release-acceptance-report.md`
- Create: `docs/testing/evidence/video-workflow/.gitkeep`
- Test: 30 browser scenarios

**Step 1: Validate the primary desktop viewport**

Open the built app at 1440x900 and execute WF-01 through WF-30. For each case, record Pass/Fail, concise evidence, and an issue ID when failed.

**Step 2: Validate the wide desktop viewport**

Repeat layout-critical scenarios at 1920x1080:

- fixed stage rail remains visible;
- queue/editor/result console use available width without excessive dead space;
- preview and controls remain above the fold where practical.

**Step 3: Validate the compact desktop viewport**

Repeat navigation, editing, review, and generation scenarios at 1024px width. Confirm the result console collapses or overlays without hiding the primary action.

**Step 4: Exercise keyboard and recovery paths**

Use Tab/Shift+Tab/Enter/Escape for the main path. Refresh during a queued task, retry a transient failure, cancel a queued task, reopen a reviewed artifact, and confirm URL/state restoration.

**Step 5: Record the pass count and problem severity**

Classify every problem:

- P0: data loss, security/ownership breach, duplicate charge, unusable main path;
- P1: core stage cannot complete, task cannot recover, primary action inaccessible;
- P2: localized usability, wording, spacing, or non-blocking state issue;
- P3: cosmetic polish.

**Step 6: Commit the first-pass report**

```bash
git add docs/release-acceptance-report.md docs/testing/evidence/video-workflow/.gitkeep
git commit -m "test: record workflow browser acceptance pass"
```

### Task 7: Run the fix-and-retest loop until the gate is met

**Files:**
- Modify: only files tied to recorded issues
- Modify: `docs/release-acceptance-report.md`
- Test: issue regressions plus complete main path

**Step 1: Select the highest-severity unresolved issue**

Do not batch unrelated fixes. Start with P0, then P1, P2, and only then P3 items that materially affect perceived quality.

**Step 2: Add a failing regression test or reproducible browser step**

```md
Issue: WF-I07
Reproduction: Open S012 → edit prompt → switch stage → return
Expected: unsaved edit is restored or an explicit leave warning appears
Actual: edit disappears
```

**Step 3: Apply the minimum fix**

Keep the change inside the video workflow, worker, or directly related production-package persistence. Do not change canvas behavior or backend model-setting screens.

**Step 4: Rerun the focused test and affected browser scenario**

Expected: PASS.

**Step 5: Rerun the complete main path**

At minimum rerun:

```text
open episode → prepare assets → submit stage → observe queue → review result
→ apply locally → edit shot → generate video → inspect result → refresh and recover
```

**Step 6: Update the report and commit the fix**

```bash
git add <issue-files> docs/release-acceptance-report.md
git commit -m "fix: resolve <workflow-issue-id>"
```

**Step 7: Repeat**

Stop only when all are true:

- 30 scenarios have current evidence;
- at least 29 pass;
- no P0/P1 remains;
- the latest complete main path passes;
- automated release checks pass after the final source change;
- estimated satisfaction is at least 95%.

### Task 8: Perform performance, accessibility, and operational checks

**Files:**
- Modify if needed: workflow files implicated by measurements only
- Modify: `docs/release-acceptance-report.md`
- Test: browser performance and worker operations

**Step 1: Test large queue behavior**

Load a fixture with at least 1,000 shots. Confirm the queue renders a bounded visible window, selection remains stable, and scrolling does not freeze the page.

**Step 2: Test task polling behavior**

Keep a queued/running task open for at least two polling intervals. Confirm there is one active poller, requests stop after completion/unmount, and retry backoff does not create a request storm.

**Step 3: Test accessibility basics**

Confirm visible focus, logical tab order, named controls, non-color-only status, modal focus containment, and Escape handling.

**Step 4: Test worker operations**

Restart the backend while a task is leased. After lease expiry, confirm the task is reclaimed once, artifacts remain idempotent, credits are not charged twice, and health returns to ready.

**Step 5: Record measured results**

Add concise observations and any accepted residual P2/P3 item to `docs/release-acceptance-report.md`.

### Task 9: Close the release gate and clean the environment

**Files:**
- Modify: `docs/release-acceptance-report.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`
- Modify: `CHANGELOG.md`
- Test: final full verification

**Step 1: Run final automated verification**

Run:

```bash
go test ./... -count=1
cd web && npm test
cd web && npm run typecheck
cd web && npm run lint:fast
cd web && npm run build
```

Expected: all PASS.

**Step 2: Rerun the complete browser main path**

Expected: PASS at 1440x900 and no regression at 1920x1080 or 1024px.

**Step 3: Finalize the acceptance report**

Record:

```md
Result: Ready / Not ready
Scenarios passed: 29 or 30 / 30
P0/P1: 0 / 0
Automated checks: Pass
Main path: Pass
Estimated satisfaction: >= 95%
Paid channel smoke: Not run unless separately authorized
```

**Step 4: Update project documentation**

Move completed workflow items from `docs/todo.md` to `docs/pending-test.md`. Summarize the version-level change under `CHANGELOG.md` `Unreleased` without duplicating implementation details. Do not claim cloud sync for browser-local project/assets.

**Step 5: Stop local acceptance processes and remove isolated data**

Stop only the explicitly captured backend/frontend process IDs. Remove only the printed temporary acceptance directory after confirming it contains no user data.

**Step 6: Commit**

```bash
git add docs/release-acceptance-report.md docs/pending-test.md docs/todo.md CHANGELOG.md
git commit -m "docs: close workflow release gate"
```
