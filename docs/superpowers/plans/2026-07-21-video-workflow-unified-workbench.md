# Unified Video Workflow Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge workflow stages and video production into one project/episode-scoped page with a fixed stage rail, contextual queue, current editor, and result console.

**Architecture:** `/projects/[id]/episodes/[episodeId]/workflow` becomes the canonical assembly page. It combines Cloud Workflow API state with existing browser-local project, episode, asset, video package, and video task stores; URL parameters restore stage and shot selection. Page-private hooks own orchestration and side effects, while reusable existing video settings/generation modules remain unchanged.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Ant Design 6, Tailwind 4, Zustand/localforage, existing video services, Lucide icons.

---

### Task 1: Workflow API client and normalized view types

**Files:**
- Create: `web/src/services/api/workflow-runs.ts`
- Create: `web/src/services/api/workflow-runs.test.mts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-view-types.ts`

- [ ] **Step 1: Write failing request-shape tests**

```ts
test("starts a stage with an idempotency key", async () => {
  const request = captureApiRequest();
  await startWorkflowStage("run-1", "art-design", "idem-1");
  assert.deepEqual(request.body, { idempotencyKey: "idem-1" });
  assert.equal(request.path, "/api/v1/workflow-runs/run-1/stages/art-design/start");
});
```

- [ ] **Step 2: Verify the test fails**

Run: `cd web && node --experimental-strip-types --test 'src/services/api/workflow-runs.test.mts'`

Expected: FAIL because the API module does not exist.

- [ ] **Step 3: Add complete API types and functions**

Define workflow run, stage, artifact, gate, event, worker health, review and apply receipt types. Add `ensureWorkflowRun`, `getWorkflowRun`, `startWorkflowStage`, `cancelWorkflowStage`, `retryWorkflowStage`, `reviewWorkflowStage`, `applyWorkflowStage`, `listWorkflowEvents`, and `getWorkflowWorkerHealth`, all using the current user token.

- [ ] **Step 4: Run the API test**

Run: `cd web && node --experimental-strip-types --test 'src/services/api/workflow-runs.test.mts'`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/api/workflow-runs.ts web/src/services/api/workflow-runs.test.mts 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-view-types.ts'
git commit -m "feat: add workflow run api client"
```

### Task 2: Scoped production packages and route state

**Files:**
- Modify: `web/src/app/(user)/video/use-video-package-store.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.ts`
- Test: `web/src/app/(user)/video/use-video-package-store.test.mts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.test.mts`

- [ ] **Step 1: Write failing scope tests**

```ts
test("does not replace another episode P01", () => {
  const items = upsertScopedPackages([
    packageFixture({ id: "P01", projectId: "p1", episodeId: "e1" }),
  ], [packageFixture({ id: "P01", projectId: "p1", episodeId: "e2" })]);
  assert.equal(items.length, 2);
});

test("normalizes an invalid workflow URL selection", () => {
  assert.deepEqual(normalizeWorkflowRouteState({ stage: "bad", shot: "missing" }, ["P01"]), { stage: "script", shot: "P01" });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/video/use-video-package-store.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.test.mts'`

Expected: FAIL because packages are keyed only by `id` and route helpers are missing.

- [ ] **Step 3: Add stable scope fields and pure route helpers**

`ProductionPackage` gains required `projectId`, `episodeId`, `sceneKey`, and `order`. Store methods update by `(projectId, episodeId, id)`. Route helpers accept `script | art | assets | storyboard | video | delivery` and choose the first blocking/review/running/incomplete shot when URL selection is missing.

- [ ] **Step 4: Run scope tests**

Expected: PASS with same P number in different episodes preserved.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/(user)/video/use-video-package-store.ts web/src/app/(user)/video/use-video-package-store.test.mts 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.ts' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.test.mts'
git commit -m "feat: scope video packages by episode"
```

### Task 3: Unified page shell and stage summaries

**Files:**
- Replace: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-workbench.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-header.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-stage-rail.tsx`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts`

- [ ] **Step 1: Write failing stage-summary tests**

```ts
test("shows worker outage as blocked only for remote stages", () => {
  const result = summarizeWorkflowStages(fixture({ workerReady: false, packageCount: 3 }));
  assert.equal(result.find((x) => x.key === "art")?.status, "blocked");
  assert.notEqual(result.find((x) => x.key === "video")?.status, "blocked");
});
```

- [ ] **Step 2: Verify the test fails**

Run the single Node test and expect a missing module failure.

- [ ] **Step 3: Implement the assembly hook and shell**

`useWorkflowWorkbench` reads project/episode/local packages, ensures a remote workflow run, polls details/events while active, merges worker health, and exposes commands. `page.tsx` only renders loading/not-found/readiness or the four-region shell. Header includes project/episode, progress, blockers, read-only model summary, and “继续下一项”. Stage rail uses text plus icon status and updates URL without navigation.

- [ ] **Step 4: Run summary tests**

Expected: PASS for empty, blocked, running, review, approved, and completed stages.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow'
git commit -m "feat: add unified workflow shell"
```

### Task 4: Remote stage queue, task status, gates, and review

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-stage-queue.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-stage-panel.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-run-console.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-stage-actions.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-actions.test.mts`

- [ ] **Step 1: Write failing action-eligibility tests**

```ts
test("cannot approve a failed gate", () => {
  assert.equal(workflowStageActions(stageFixture({ status: "needs_review", gatePassed: false })).canApprove, false);
});

test("running stages expose cancel but not retry", () => {
  const actions = workflowStageActions(stageFixture({ status: "running" }));
  assert.equal(actions.canCancel, true);
  assert.equal(actions.canRetry, false);
});
```

- [ ] **Step 2: Verify test failure, then implement pure eligibility**

Implement statuses with explicit reasons, estimated credits before start, idempotent start keys, cancel/retry, artifact digest, gate issue list, approve/reject with artifact hash, and applied receipt status.

- [ ] **Step 3: Render stage workspaces**

Script stage is a read-only confirmed snapshot. Art stage shows director/art digest and asset mapping preview. Storyboard stage shows scene progress and package mapping preview. Right console displays queue position, attempt, heartbeat freshness, sanitized events, gate status, review, retry, and cancel.

- [ ] **Step 4: Run action tests and TypeScript typecheck for touched files**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-actions.test.mts'`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow'
git commit -m "feat: add workflow stage review console"
```

### Task 5: Asset preparation and reviewed apply

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-queue.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-panel.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts`

- [ ] **Step 1: Write failing artifact mapping tests**

```ts
test("maps approved art artifact without overwriting an existing image", () => {
  const result = mapArtArtifactToAssets(artifactFixture(), [existingImageAsset()]);
  assert.equal(result.items[0].action, "update_metadata");
  assert.equal(result.items[0].preserveImage, true);
});
```

- [ ] **Step 2: Verify failure and implement deterministic mapping**

Mapping produces create/update/skip rows with names, type, prompt, source stage, import key, warnings, and preserved image/version fields. Only an approved artifact may be applied.

- [ ] **Step 3: Render asset queue and panel**

Support role/scene/prop filters, missing-image focus, project asset matching, upload/replace through existing asset actions, and explicit accept-text-only risk. Applying writes to `useAssetStore`, then posts IDs/counts to the workflow apply endpoint.

- [ ] **Step 4: Run mapping tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow'
git commit -m "feat: add workflow asset preparation"
```

### Task 6: Virtualized shot queue and prompt autosave

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-queue.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-editor.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-shot-prompt-draft.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-filter.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-filter.test.mts`

- [ ] **Step 1: Write failing filter/default-selection tests**

```ts
test("prioritizes blocker then review then running", () => {
  const shots = [shot("P01", "complete"), shot("P02", "review"), shot("P03", "blocked")];
  assert.equal(selectNextWorkflowShot(shots)?.id, "P03");
});
```

- [ ] **Step 2: Implement pure search/filter/status functions**

Filter by scene, keyword, prompt, asset, task, and delivery state. Derive one primary state with `running > queued > blocked > failed > review > ready > completed`.

- [ ] **Step 3: Implement queue windowing without a new dependency**

Use fixed-height rows, scrollTop, overscan, and top/bottom spacers so a 1000-row queue renders at most 40 rows. Preserve selected row visibility and keyboard ArrowUp/ArrowDown navigation.

- [ ] **Step 4: Implement editor and safe draft lifecycle**

Render expandable source excerpt, inline reference assets, prompt editor, risks, saved state, and previous/next. Draft state is `clean | dirty | saving | saved | failed`; switching shot flushes the draft and remains on the current shot when persistence fails.

- [ ] **Step 5: Run filter tests**

Expected: PASS for 1000 items, search, scene grouping, default selection, and next incomplete.

- [ ] **Step 6: Commit**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow'
git commit -m "feat: add workflow shot editing queue"
```

### Task 7: Video result console and generation actions

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-video-console.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-video-actions.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-batch-eligibility.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-batch-eligibility.test.mts`
- Modify: `web/src/app/(user)/video/page.tsx`

- [ ] **Step 1: Write failing batch eligibility tests**

```ts
test("batch generation excludes review, blocked, and running shots", () => {
  const result = eligibleBatchPackages([readyPackage(), reviewPackage(), blockedPackage(), runningPackage()]);
  assert.deepEqual(result.included.map((x) => x.id), ["P01"]);
  assert.equal(result.excluded.length, 3);
});
```

- [ ] **Step 2: Extract existing video side effects into the page-private hook**

Reuse `preflightVideoGeneration`, `runCanvasVideoGeneration`, refresh/content download, asset archiving, error normalization, and package version updates. Do not move model/channel configuration into the workflow.

- [ ] **Step 3: Render the fixed result console**

Show main video, version thumbnails, selected version, archive state, settings summary, preflight, generate/new version, sync, error diagnosis, and details. Batch confirmation lists included/excluded counts and preserves every item's saved config.

- [ ] **Step 4: Reduce `/video` to a canonical redirect/compatibility entry**

When project and episode context are present, redirect to the canonical workflow `stage=video`. Without context, show a project-selection explanation rather than a second production interface.

- [ ] **Step 5: Run eligibility and existing video tests**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-batch-eligibility.test.mts' 'src/app/(user)/video/'*.test.mts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow' web/src/app/(user)/video/page.tsx
git commit -m "feat: merge video production into workflow"
```

### Task 8: Delivery review, legacy routing, and responsive behavior

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-delivery-panel.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-delivery-check.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-delivery-check.test.mts`
- Modify: `web/src/app/(user)/original-workflow/page.tsx`
- Modify: `web/src/app/(user)/original-workflow/video-workflow-routing.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workbench/page.tsx`

- [ ] **Step 1: Write failing delivery and route tests**

```ts
test("delivery blocks missing selected versions", () => {
  const report = buildDeliveryReport([packageFixture({ generation: undefined })]);
  assert.equal(report.blockingCount, 1);
});

test("canonical workflow href uses project route", () => {
  assert.equal(videoWorkflowHref(1, "p1", "e1"), "/projects/p1/episodes/e1/workflow");
});
```

- [ ] **Step 2: Implement delivery report and panel**

List missing assets, unconfirmed prompts, active/failed tasks, stale references, no selected result, and unarchived versions. Existing export actions remain secondary and disabled while blockers exist.

- [ ] **Step 3: Canonicalize all old workflow links**

Project episode actions navigate directly to the canonical route. `/original-workflow` and `/workbench` preserve query context and redirect. Remove the full-page cloud-disabled result because readiness now belongs to stage actions and health state.

- [ ] **Step 4: Add responsive and accessibility behavior**

At `>=1440px`, show four regions. At `1024–1439px`, make result console a persistent drawer. Below `1024px`, make queue and result separate drawers while the editor remains primary. All icon-only controls get accessible names, focus rings, 44px touch targets, and non-color status text.

- [ ] **Step 5: Run delivery, routing, and full frontend tests**

Run: `cd web && npm test`

Expected: all Node tests PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/(user)/original-workflow 'web/src/app/(user)/projects/[id]/episodes/[episodeId]' web/src/app/(user)/video
git commit -m "feat: complete unified video workflow"
```

### Task 9: Workflow documentation checkpoint

**Files:**
- Modify: `docs/workflow.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Update the canonical user path**

Document project episode -> unified workflow -> reviewed assets -> storyboard packages -> video versions -> delivery review. Remove descriptions that direct users to separate `/original-workflow` and `/video` workspaces.

- [ ] **Step 2: Move completed UI work into pending test**

Remove the implemented merge item from `docs/todo.md` and add testable UI changes to `docs/pending-test.md`. Keep only genuinely unfinished launch items in todo.

- [ ] **Step 3: Review and commit**

Run: `git diff --check`

```bash
git add docs/workflow.md docs/todo.md docs/pending-test.md
git commit -m "docs: describe unified video workflow"
```
