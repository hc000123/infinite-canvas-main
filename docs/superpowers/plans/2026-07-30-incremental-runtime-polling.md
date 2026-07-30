# Incremental Runtime Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace repeated full Workflow and Invocation detail polling with compatible lightweight status and incremental-event endpoints.

**Architecture:** Keep existing detail endpoints unchanged. Add poll services that read only run headers, latest attempts, stage rows, batched invocation headers, events after a cursor, and worker health; clients request full detail only when a meaningful state fingerprint changes.

**Tech Stack:** Go, Gin, GORM, Next.js, React, TypeScript, TanStack Query.

---

### Task 1: Invocation poll contract

**Files:**
- Modify: `repository/invocation.go`
- Modify: `service/invocation_contracts.go`
- Modify: `service/invocation_query.go`
- Test: `service/invocation_query_test.go`

- [ ] Write `TestGetInvocationPollReturnsOnlyLatestAttemptAndIncrementalEvents` first. Create a run with two attempts and events, call `GetInvocationPoll(userID, id, firstEventID)`, and assert the response contains the safe run summary, attempt 2 only, later events only, and `NextAfter` equal to the last returned ID.
- [ ] Run `go test ./service -run TestGetInvocationPollReturnsOnlyLatestAttemptAndIncrementalEvents -count=1`; expect failure because `GetInvocationPoll` is undefined.
- [ ] Add `GetInvocationAttempt(userID, invocationID string, attempt int)` using one constrained query. Add:

```go
type InvocationPoll struct {
    Run       InvocationRunSummary      `json:"run"`
    Attempt   *InvocationAttemptSummary `json:"attempt,omitempty"`
    Events    []model.InvocationEvent   `json:"events"`
    NextAfter uint64                    `json:"nextAfter"`
}
```

Implement `GetInvocationPoll` with `GetUserInvocation`, the latest-attempt query, and `ListInvocationEvents(after, 100)`. Do not call `GetInvocationDetail`.
- [ ] Re-run the test; expect PASS.
- [ ] Add a foreign-user assertion; expect `ErrInvocationNotFound` and no data.
- [ ] Commit only Task 1 files with `feat: add lightweight invocation poll service`.

### Task 2: Invocation poll HTTP and client

**Files:**
- Modify: `handler/invocation.go`
- Modify: `handler/invocation_test.go`
- Modify: `router/router.go`
- Modify: `web/src/services/api/invocations-contract.ts`
- Modify: `web/src/services/api/invocations-contract.test.mts`
- Modify: `web/src/services/api/invocations.ts`

- [ ] Add failing handler and TypeScript contract tests for `GET /api/v1/invocations/:id/poll?after=17`.
- [ ] Run `go test ./handler -run TestInvocationPoll -count=1` and `node --test web/src/services/api/invocations-contract.test.mts`; expect route/client failures.
- [ ] Add `InvocationPoll` handler that parses `after`, calls `service.GetInvocationPoll`, and uses `invocationResult`. Register the route before the generic detail route.
- [ ] Add `InvocationPoll` TypeScript type, `invocationRequest.poll(id)`, and `pollInvocation(id, after)` using compact query params.
- [ ] Re-run both tests; expect PASS.
- [ ] Commit Task 2 files with `feat: expose invocation poll endpoint`.

### Task 3: Workflow poll backend

**Files:**
- Modify: `repository/invocation.go`
- Modify: `service/video_workflow_contracts.go`
- Modify: `service/video_workflow_operations.go`
- Modify: `handler/workflow.go`
- Modify: `handler/workflow_test.go`
- Modify: `router/router.go`
- Test: `service/video_workflow_test.go`

- [ ] Add a failing service test that creates five Workflow stages with multiple Invocation IDs and asserts `GetWorkflowRunPoll` returns mapped status / attempt / aggregate error, only events after the cursor, and Worker health without Artifacts, Gates, Reviews, Apply data, or Agent Runs.
- [ ] Run `go test ./service -run TestGetWorkflowRunPollUsesInvocationHeadersAndEventCursor -count=1`; expect undefined service failure.
- [ ] Add `ListUserInvocationsByIDs(userID string, ids []string)` with one `IN ?` query.
- [ ] Add `WorkflowStagePollSummary` and `WorkflowRunPoll` contracts. Implement `GetWorkflowRunPoll` using `GetUserWorkflowRun`, `ListWorkflowStageRuns`, the new batch query, `ListWorkflowEvents(after, 100)`, and `GetWorkflowWorkerHealth`. Map Invocation status with existing `workflowStageStatusFromInvocation`.
- [ ] Add handler, route, and permission test for `GET /api/v1/workflow-runs/:id/poll?after=17`.
- [ ] Run the service and handler tests; expect PASS.
- [ ] Commit Task 3 files with `feat: add lightweight workflow poll endpoint`.

### Task 4: Workflow incremental client state

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-poll-state.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-poll-state.test.mts`
- Modify: `web/src/services/api/workflow-runs-contract.ts`
- Modify: `web/src/services/api/workflow-runs-contract.test.mts`
- Modify: `web/src/services/api/workflow-runs.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-workbench.ts`

- [ ] Write failing pure-function tests for `appendWorkflowEvents` ID de-duplication, `workflowPollFingerprint`, and `workflowPollNeedsDetail` returning true only when status / attempt / error changes.
- [ ] Run `node --test web/src/app/\(user\)/projects/\[id\]/episodes/\[episodeId\]/workflow/workflow-poll-state.test.mts`; expect module/function failure.
- [ ] Implement the three pure helpers without React state.
- [ ] Add `WorkflowRunPoll` client types, `workflowRunRequest.poll`, and `pollWorkflowRun(id, after)`.
- [ ] Change `useWorkflowWorkbench`: initial/manual refresh loads full detail; timer calls only Poll; keep an event cursor ref; append events; merge lightweight stage state; call full detail once when fingerprint changes; use 2s foreground / 6s hidden interval; stop when no active stage.
- [ ] Run the pure-function and API contract tests; expect PASS.
- [ ] Commit Task 4 files with `perf: poll workflow state incrementally`.

### Task 5: Invocation consumers stop full-detail polling

**Files:**
- Create: `web/src/services/api/invocation-poll-state.ts`
- Create: `web/src/services/api/invocation-poll-state.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/agents/components/agent-run-console.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-agent-plan.ts`

- [ ] Write failing tests for active/terminal status detection and fingerprint change detection.
- [ ] Implement `invocationPollActive` and `invocationPollNeedsDetail` as pure functions.
- [ ] Replace detail `refetchInterval` with a separate Poll query. Seed full detail once; while active, poll lightweight state; when the fingerprint changes, invalidate/refetch full detail once; disable Poll at terminal status.
- [ ] Run `node --test web/src/services/api/invocation-poll-state.test.mts` and the invocation contract tests; expect PASS.
- [ ] Commit Task 5 files with `perf: stop polling full invocation details`.

### Task 6: Documentation and verification

**Files:**
- Modify: `docs/api-response.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] Document both Poll responses and event cursor semantics; add manual checks for hidden-page cadence, terminal stop, and one-time detail refresh.
- [ ] Run focused Go tests for workflow / invocation handlers and services.
- [ ] Run the new TypeScript tests and `git diff --check`.
- [ ] Review `docs/todo.md`; move an item only if an existing todo exactly matches this work.
- [ ] Commit documentation with `docs: record incremental runtime polling`.
