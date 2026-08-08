# Agent Workspace Stage Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-level Agent workspace that becomes the single production workflow entry, summarizes progress across projects and episodes, and enforces human-approved stage gates from script through video.

**Architecture:** Keep `WorkflowRun`, `WorkflowStageRun`, `WorkflowArtifact`, Skill, and Invocation as the only execution and persistence foundation. Add a read-only workflow-run summary API, derive the six user-facing Agent stages by merging remote run summaries with local project/episode data, and mount the existing episode workflow workbench inside `/agent` instead of duplicating its editor. Asset placeholders are versioned Artifact content with stable slot IDs; they never create formal assets until explicitly bound.

**Tech Stack:** Go, Gin, GORM, Next.js App Router, React 19, TypeScript, Ant Design, Tailwind, Zustand/localforage, Node test runner.

---

## File map

- `model/workflow_run.go`: query, list summary, stage summary, and asset-slot contract types.
- `repository/workflow_run.go`: user-scoped paginated Workflow Run query and latest-stage loading.
- `service/video_workflow_contracts.go`: Agent list request/response and asset-slot Artifact contracts.
- `service/video_workflow_operations.go`: filters, stage aggregation, counts, and lightweight list response.
- `handler/workflow.go`: HTTP query parsing and standard `{ code, data, msg }` response.
- `router/router.go`: authenticated `GET /api/v1/workflow-runs` route.
- `web/src/services/api/workflow-runs-contract.ts`: browser request builders and list summary types.
- `web/src/services/api/workflow-runs.ts`: list API call.
- `web/src/app/(user)/agent/agent-workspace-model.ts`: pure merge/filter/progress/stage mapping logic.
- `web/src/app/(user)/agent/components/agent-project-overview.tsx`: all-project cards and summary metrics.
- `web/src/app/(user)/agent/components/agent-episode-overview.tsx`: project episode rows and phase status.
- `web/src/app/(user)/agent/components/agent-stage-gates.tsx`: six-stage rail and gate semantics.
- `web/src/app/(user)/agent/agent-workspace.tsx`: local stores, remote summaries, query state, and view composition.
- `web/src/app/(user)/agent/page.tsx`: suspense boundary for the Agent workspace.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx`: reusable workbench receiving explicit IDs.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`: compatibility redirect to `/agent`.
- `web/src/constant/navigation-tools.ts`: Agent top navigation entry.
- Project/workbench entry files: replace direct Workflow links with `agentWorkspaceHref(...)`.
- `docs/todo.md` and `docs/pending-test.md`: move implemented Agent workspace work into user verification.

### Task 1: User-scoped Workflow Run summary API

**Files:**
- Modify: `model/workflow_run.go`
- Modify: `repository/workflow_run.go`
- Modify: `service/video_workflow_contracts.go`
- Modify: `service/video_workflow_operations.go`
- Modify: `handler/workflow.go`
- Modify: `router/router.go`
- Test: `service/video_workflow_list_test.go`
- Test: `handler/workflow_test.go`
- Test: `router/router_test.go`

- [ ] **Step 1: Write the failing service tests**

Create two owners' runs and assert that `ListWorkflowRuns("owner", query)` returns only owner rows, chooses the latest attempt per stage, excludes ScriptSnapshot and Artifact content, and correctly filters `projectId`, `episodeId`, and status. Add a pagination case with `Page: 2, PageSize: 1`.

```go
result, err := ListWorkflowRuns("owner", WorkflowRunListQuery{ProjectID: "project-1", Page: 1, PageSize: 20})
if err != nil || result.Total != 1 || result.Items[0].Run.UserID != "owner" {
    t.Fatalf("result=%#v err=%v", result, err)
}
if result.Items[0].ReviewCount != 1 || result.Items[0].Stages[0].Attempt != 2 {
    t.Fatalf("summary=%#v", result.Items[0])
}
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `go test ./service ./handler ./router -run 'WorkflowRunList|WorkflowRoutes'`

Expected: FAIL because `ListWorkflowRuns` and the list route do not exist.

- [ ] **Step 3: Add minimal contracts and repository query**

Add normalized query types and lightweight response types. Keep `ScriptSnapshot` out of `WorkflowRunListItem` by exposing only selected run header fields.

```go
type WorkflowRunListQuery struct {
    ProjectID string
    EpisodeID string
    Status    model.WorkflowRunStatus
    Page      int
    PageSize  int
}

type WorkflowRunListItem struct {
    ID            string                     `json:"id"`
    ProjectID     string                     `json:"projectId"`
    EpisodeID     string                     `json:"episodeId"`
    CurrentStageID string                    `json:"currentStageId"`
    Status        model.WorkflowRunStatus    `json:"status"`
    Stages        []WorkflowStagePollSummary `json:"stages"`
    ReviewCount   int                        `json:"reviewCount"`
    WarningCount  int                        `json:"warningCount"`
    UpdatedAt     string                     `json:"updatedAt"`
}
```

Repository query must always start with `Where("user_id = ?", userID)`, then apply optional filters, `Order("updated_at desc")`, `Count`, `Offset`, and `Limit`. Load all stage rows for returned run IDs in one query ordered by `workflow_run_id, stage_id, attempt desc, created_at desc`.

- [ ] **Step 4: Implement service aggregation, handler, and route**

Normalize page to 1 and pageSize to 20 with a maximum of 100. Deduplicate stages by `(workflowRunId, stageId)`, count `needs_review`, count warning gate results without loading Artifact bodies, and expose:

```go
func ListWorkflowRuns(w http.ResponseWriter, r *http.Request) {
    user, err := service.UserFromContext(r.Context())
    if err != nil { Fail(w, err); return }
    result, err := service.ListWorkflowRuns(user.ID, service.WorkflowRunListQuery{
        ProjectID: r.URL.Query().Get("projectId"),
        EpisodeID: r.URL.Query().Get("episodeId"),
        Status: model.WorkflowRunStatus(r.URL.Query().Get("status")),
        Page: queryInt(r, "page"), PageSize: queryInt(r, "pageSize"),
    })
    if err != nil { Fail(w, err); return }
    OK(w, result)
}
```

Register `v1.GET("/workflow-runs", gin.WrapF(handler.ListWorkflowRuns))` before `POST /workflow-runs` and the `/:id` routes.

- [ ] **Step 5: Run targeted tests and commit**

Run: `go test ./service ./handler ./router -run 'WorkflowRunList|WorkflowRoutes'`

Expected: PASS.

```bash
git add model/workflow_run.go repository/workflow_run.go service/video_workflow_contracts.go service/video_workflow_operations.go service/video_workflow_list_test.go handler/workflow.go handler/workflow_test.go router/router.go router/router_test.go
git commit -m "feat: list workflow run summaries"
```

### Task 2: Browser API contract and Agent domain model

**Files:**
- Modify: `web/src/services/api/workflow-runs-contract.ts`
- Modify: `web/src/services/api/workflow-runs.ts`
- Test: `web/src/services/api/workflow-runs-contract.test.mts`
- Create: `web/src/app/(user)/agent/agent-workspace-model.ts`
- Test: `web/src/app/(user)/agent/agent-workspace-model.test.mts`

- [ ] **Step 1: Write failing request and domain tests**

Assert encoded filters and the six-stage merge semantics:

```ts
assert.deepEqual(workflowRunRequest.list({ projectId: "p/1", status: "active", page: 2, pageSize: 10 }), {
    path: "/api/v1/workflow-runs",
    params: { projectId: "p/1", status: "active", page: 2, pageSize: 10 },
});

const view = buildAgentEpisodeView({ episode, project, run });
assert.deepEqual(view.stages.map((item) => item.label), [
    "剧本确认", "资产解析", "资产生产", "结构化分镜", "最终提示词", "视频生成与预览",
]);
assert.equal(view.stages[3].status, "ready"); // asset placeholders do not block storyboard
```

Also cover no run, pending review, failed current stage, local project absent from the backend, filtering, and overall progress based on approved/applied gates rather than task count.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd web && node --experimental-strip-types --test src/services/api/workflow-runs-contract.test.mts 'src/app/(user)/agent/agent-workspace-model.test.mts'`

Expected: FAIL because list request and Agent model are missing.

- [ ] **Step 3: Implement API types and pure Agent model**

Define `AgentStageKey`, `AgentStageStatus`, `AgentStageView`, `AgentEpisodeView`, and `AgentProjectView`. Map remote IDs as follows:

```ts
export const agentStageDefinitions = [
    { key: "script", remoteIds: ["script-adaptation"] },
    { key: "asset-extraction", remoteIds: ["asset-extraction"] },
    { key: "asset-production", remoteIds: ["asset-image-prompt"] },
    { key: "storyboard", remoteIds: ["shot-breakdown"] },
    { key: "prompt", remoteIds: ["shot-prompt"] },
    { key: "video", remoteIds: [] },
] as const;
```

`asset-production` may resolve to `warning` when placeholders remain, but `storyboard` becomes ready once `asset-extraction` is approved/applied. Never infer a generated image from a placeholder.

- [ ] **Step 4: Run tests and commit**

Run the same Node test command. Expected: PASS.

```bash
git add web/src/services/api/workflow-runs-contract.ts web/src/services/api/workflow-runs-contract.test.mts web/src/services/api/workflow-runs.ts 'web/src/app/(user)/agent/agent-workspace-model.ts' 'web/src/app/(user)/agent/agent-workspace-model.test.mts'
git commit -m "feat: derive agent workspace progress"
```

### Task 3: Agent route, overview, and top navigation

**Files:**
- Modify: `web/src/constant/navigation-tools.ts`
- Create: `web/src/app/(user)/agent/page.tsx`
- Create: `web/src/app/(user)/agent/agent-workspace.tsx`
- Create: `web/src/app/(user)/agent/components/agent-project-overview.tsx`
- Create: `web/src/app/(user)/agent/components/agent-episode-overview.tsx`
- Create: `web/src/app/(user)/agent/components/agent-stage-gates.tsx`
- Test: `web/src/app/(user)/agent/agent-workspace-wiring.test.mts`

- [ ] **Step 1: Write failing structural tests**

Read source files and assert that navigation order is `projects, agent, canvas, image, prompts, assets, cache`, `/agent` uses `useSearchParams`, remote failures retain local projects, project cards link to project Agent view, and episode links carry project, episode, and stage.

- [ ] **Step 2: Run structural tests to verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/agent/agent-workspace-wiring.test.mts'`

Expected: FAIL because the route and nav entry do not exist.

- [ ] **Step 3: Implement the responsive workspace**

Use a restrained studio layout: a compact toolbar, three summary metrics, project cards or episode rows, and a horizontal six-stage rail that becomes vertical on narrow screens. Use theme variables only. The route reads:

```ts
const projectId = searchParams.get("projectId") || "";
const episodeId = searchParams.get("episodeId") || "";
const status = normalizeAgentStatusFilter(searchParams.get("status"));
```

On API failure, render local projects and a dismissible `Alert` saying remote progress is temporarily unavailable. No read-only view may call `ensureWorkflowRun`.

- [ ] **Step 4: Run tests and commit**

Run the structural test plus the Agent model tests. Expected: PASS.

```bash
git add web/src/constant/navigation-tools.ts 'web/src/app/(user)/agent'
git commit -m "feat: add agent production overview"
```

### Task 4: Mount the existing episode workbench in Agent

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`
- Modify: `web/src/app/(user)/agent/agent-workspace.tsx`
- Test: `web/src/app/(user)/agent/agent-workbench-routing.test.mts`

- [ ] **Step 1: Write a failing routing test**

Assert that `EpisodeWorkflowWorkbench` receives `projectId` and `episodeId` props, `/agent` renders it only when both are present, and its route updates target `/agent?...` rather than the legacy pathname.

- [ ] **Step 2: Run to verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/agent/agent-workbench-routing.test.mts'`

Expected: FAIL because the workbench still owns `useParams` and the old page.

- [ ] **Step 3: Extract only the assembly boundary**

Move the current page body into:

```tsx
export function EpisodeWorkflowWorkbench({ episodeId, projectId }: { episodeId: string; projectId: string }) {
    const workbench = useWorkflowWorkbench(projectId, episodeId);
    // retain existing hooks, panels, confirmations, and persistence paths unchanged
}
```

Keep the existing workflow components and hooks in place. Mount this component beneath Agent summary/stage navigation when an episode is selected.

- [ ] **Step 4: Run affected tests and commit**

Run the new routing test and all existing `workflow-*.test.mts` tests in the legacy directory. Expected: PASS.

```bash
git add 'web/src/app/(user)/agent' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx'
git commit -m "feat: mount episode workflow in agent"
```

### Task 5: Redirect legacy routes and unify project entry actions

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workbench/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workbench/components/episode-production-header.tsx`
- Modify: relevant project episode buttons found by `rg '/workflow|开始工作流|继续生产' web/src/app/(user)/projects`
- Create: `web/src/app/(user)/projects/agent-workspace-route.ts`
- Test: `web/src/app/(user)/projects/agent-workspace-route.test.mts`

- [ ] **Step 1: Write failing URL conversion tests**

```ts
assert.equal(agentWorkspaceHref({ projectId: "p/1", episodeId: "e 1", stage: "assets", shot: "s&1" }), "/agent?projectId=p%2F1&episodeId=e+1&stage=assets&shot=s%261");
assert.equal(agentWorkspaceHref({ projectId: "p1" }), "/agent?projectId=p1");
```

- [ ] **Step 2: Run to verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/agent-workspace-route.test.mts'`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement helper and redirects**

Legacy Workflow page becomes a server redirect that preserves `stage`, `shot`, and other supported query values while forcing route project/episode IDs. Workbench redirect and project buttons use the shared helper. Change user labels from “工作流落地页” and “打开视频工作流” to “打开 Agent” or “继续生产”. Do not expose `/projects/[id]/agents` as a normal production action.

- [ ] **Step 4: Run tests and commit**

Run route tests and `project-detail-navigation.test.mts`. Expected: PASS.

```bash
git add 'web/src/app/(user)/projects/agent-workspace-route.ts' 'web/src/app/(user)/projects/agent-workspace-route.test.mts' 'web/src/app/(user)/projects/[id]'
git commit -m "refactor: route project production through agent"
```

### Task 6: Versioned asset-slot placeholder Artifact

**Files:**
- Modify: `service/video_workflow_contracts.go`
- Create: `service/video_workflow_asset_slots.go`
- Test: `service/video_workflow_asset_slots_test.go`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-slots.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-slots.test.mts`

- [ ] **Step 1: Write failing stable-identity and reference tests**

Cover add, rename, merge, split, ignore, bind, deleted-binding fallback, and prompt conversion:

```ts
assert.equal(renameAgentAssetSlot(slot, "新名字").slotId, slot.slotId);
assert.equal(agentAssetSlotReference({ ...slot, status: "placeholder" }).kind, "text");
assert.equal(agentAssetSlotReference({ ...slot, status: "bound", assetId: "asset-1" }).kind, "image");
```

Backend tests assert valid categories/statuses, unique non-empty `slotId`, bound IDs, new Artifact version, and no writes to formal asset tables.

- [ ] **Step 2: Run tests to verify RED**

Run: `go test ./service -run WorkflowAssetSlot` and the dedicated Node test. Expected: FAIL.

- [ ] **Step 3: Implement Artifact contracts and transitions**

```go
type AgentAssetSlot struct {
    SlotID string `json:"slotId"`
    Category string `json:"category"`
    Name string `json:"name"`
    Description string `json:"description"`
    Status string `json:"status"`
    SourceSceneIDs []string `json:"sourceSceneIds"`
    SourceEvidence []string `json:"sourceEvidence"`
    SubjectID string `json:"subjectId,omitempty"`
    VariantID string `json:"variantId,omitempty"`
    AssetID string `json:"assetId,omitempty"`
    CandidateID string `json:"candidateId,omitempty"`
}
```

Save user corrections as the next `WorkflowArtifact.Version` for the extraction stage and retain the prior Artifact. Placeholder and ignored slots never call formal asset-store APIs. Prompt mapping emits `@图片` only for a still-valid bound asset; all other usable slots emit text descriptions.

- [ ] **Step 4: Run tests and commit**

Run both dedicated suites. Expected: PASS.

```bash
git add service/video_workflow_contracts.go service/video_workflow_asset_slots.go service/video_workflow_asset_slots_test.go 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-slots.ts' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-slots.test.mts'
git commit -m "feat: version agent asset placeholders"
```

### Task 7: Six-stage gate semantics and manual video boundary

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-stage-rail.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-video-console.tsx`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-batch-eligibility.test.mts`

- [ ] **Step 1: Add failing gate tests**

Assert that each next stage is blocked while its predecessor needs review, approved asset extraction unlocks structured storyboard even with all slots as placeholders, prompt generation requires approved storyboard, and video requires approved prompt plus an explicit user action. Assert there is no effect that auto-invokes video generation.

- [ ] **Step 2: Run to verify RED**

Run the two existing focused test files. Expected: FAIL for the six-stage contract.

- [ ] **Step 3: Implement six-stage display and confirmations**

Split presentation stages without changing backend execution IDs. Keep stage-internal automation for extraction/prompt drafting, but do not advance across review boundaries. Before video submit, display model, shot count, estimated credits, bound reference count, and placeholder warning, then require the existing confirmation modal.

- [ ] **Step 4: Run tests and commit**

Run the focused workflow tests. Expected: PASS.

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.ts' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-stage-rail.tsx' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-video-console.tsx' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-batch-eligibility.test.mts'
git commit -m "feat: enforce agent stage gates"
```

### Task 8: Documentation and focused verification

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Update user-test documentation**

Move the implemented Agent workspace items out of todo and record these verification scenarios in `pending-test.md`: top navigation, all-project/project/episode switching, remote-offline fallback, review gates, placeholder-only flow, legacy redirects, final-prompt boundary, and manual video confirmation.

- [ ] **Step 2: Run focused verification**

Run:

```bash
go test ./service ./handler ./router -run 'WorkflowRunList|WorkflowAssetSlot|WorkflowRoutes'
cd web && node --experimental-strip-types --test \
  src/services/api/workflow-runs-contract.test.mts \
  'src/app/(user)/agent/'*.test.mts \
  'src/app/(user)/projects/agent-workspace-route.test.mts' \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts' \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-slots.test.mts'
```

Expected: all targeted tests PASS.

- [ ] **Step 3: Inspect scoped diff and commit docs**

Run: `git diff --check -- <all Agent files>` and `git status --short`.

Expected: no whitespace errors; unrelated dirty files remain unstaged.

```bash
git add docs/todo.md docs/pending-test.md
git commit -m "docs: add agent workspace verification"
```

## Self-review result

- Spec coverage: all-project summary, project and episode drill-down, six gates, manual video, local/remote merge, legacy redirect, and technical Agent-definition separation are each assigned to a task.
- Placeholder coverage: stable slot identity, human corrections, placeholder/candidate/bound/ignored states, formal asset boundary, missing binding fallback, and prompt reference conversion are covered in Task 6.
- Type consistency: route keys use `script | assets | video | delivery` only at the legacy workbench boundary; the Agent domain uses six explicit keys and maps them to existing backend stage IDs. All list API properties match the Go JSON names.
- Scope control: no new database table, no alternate progress store, no duplicated editor, and no automatic video generation.
