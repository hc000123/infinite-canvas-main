# Video Workflow Two-Stage Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a four-step user workflow whose two production stages are Asset Design and Shot Production, with stable asset bindings, editable shot drafts, multimodal prompt generation, real video generation, and previous-shot tail-frame continuity references.

**Architecture:** Keep the page as the user-facing orchestrator and browser-local stores as the current business-data boundary. The Go worker owns durable text/multimodal subtask execution, Skill snapshots, quality gates, review, and apply receipts; image and video generation continue through the existing configured media APIs. The UI aggregates subtask states into four visible stages and never treats a text artifact as a generated image or video.

**Tech Stack:** Go, Gin, GORM, SQLite, Next.js App Router, React, TypeScript, Ant Design, Tailwind, Zustand, localforage, Node test runner.

---

## File map

- `service/video_workflow*.go`: workflow v2 stage order, prompts, dependency rules, gates, contextual per-shot runs.
- `service/workflow_skill*.go`: map four replaceable production subtasks to independently published Skill snapshots.
- `handler/workflow.go`: accept bounded per-run context for confirmed shot prompt generation.
- `web/src/services/api/workflow-runs*.ts`: typed context payload for stage starts.
- `web/src/app/(user)/video/use-video-package-store.ts`: authoritative local shot-production record.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-production-state.ts`: pure freshness, continuity, and stage aggregation logic.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-design.tsx`: asset extraction, binding, generation, and confirmation UI.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-editor.tsx`: source script, structured shot editing, shot confirmation, prompt review.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-shot-prompt-actions.ts`: per-shot Codex/API prompt task with reference images.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/video-last-frame.ts`: provider-returned tail-frame handling and local video-frame fallback.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`: four visible stages and responsive two-stage page composition.

## Task 0: Preserve and verify the independent asset-run baseline

**Files:**
- Modify: `service/video_workflow.go`
- Modify: `service/video_workflow_contracts.go`
- Modify: `service/video_workflow_gates.go`
- Test: `service/video_workflow_test.go`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts`

- [ ] **Step 1: Inspect the pending diff and confirm it only contains the already tested asset-stage fix and its documentation**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; no unrelated canvas or model-settings files.

- [ ] **Step 2: Re-run the focused baseline tests**

Run: `go test ./service -run 'TestWorkflowIncludesIndependentAssetGenerationStage|TestVideoWorkflowHappyPath'`

Expected: PASS.

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts'`

Expected: PASS.

- [ ] **Step 3: Commit the verified baseline before semantic restructuring**

Run:

```bash
git add service web/src/app/\(user\)/projects/\[id\]/episodes/\[episodeId\]/workflow CHANGELOG.md docs/pending-test.md docs/todo.md
git commit -m "fix: run asset generation as independent workflow stage"
```

Expected: one commit that preserves the real `codex-cli` asset task, quality gate, review, and apply flow.

## Task 1: Add workflow v2 subtask contracts and confirmed-shot context

**Files:**
- Modify: `service/video_workflow_contracts.go`
- Modify: `service/video_workflow.go`
- Modify: `service/video_workflow_gates.go`
- Modify: `service/workflow_skill.go`
- Modify: `service/workflow_skill_seed.go`
- Modify: `handler/workflow.go`
- Modify: `web/src/services/api/workflow-runs-contract.ts`
- Modify: `web/src/services/api/workflow-runs.ts`
- Test: `service/video_workflow_test.go`
- Test: `service/video_workflow_skill_snapshot_test.go`
- Create: `web/src/services/api/workflow-runs-contract.test.mts`

- [ ] **Step 1: Write failing Go tests for the v2 stage order and dependencies**

Add assertions equivalent to:

```go
func TestWorkflowV2UsesAssetAndShotSubtasks(t *testing.T) {
    detail := ensureVideoWorkflowTestRun(t)
    assertStageOrder(t, detail, []string{
        WorkflowStageScriptAdaptation,
        WorkflowStageAssetExtraction,
        WorkflowStageAssetImagePrompt,
        WorkflowStageShotBreakdown,
        WorkflowStageShotPrompt,
    })
    if _, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageShotBreakdown, "before-assets"); err == nil {
        t.Fatal("shot breakdown must wait for approved asset image prompts")
    }
}
```

Add a second test proving `shot-prompt` accepts a bounded context containing `shotId`, `sourceScript`, `shotDraft`, and frozen reference descriptors only after `shot-breakdown` is approved.

- [ ] **Step 2: Run the focused Go tests and observe the expected failure**

Run: `go test ./service -run 'TestWorkflowV2|TestShotPrompt'`

Expected: FAIL because v2 constants and contextual starts do not exist.

- [ ] **Step 3: Add the minimal v2 stage constants and dependency chain**

Use these canonical IDs:

```go
const (
    VideoWorkflowVersion          = "2.0.0"
    WorkflowStageAssetExtraction  = "asset-extraction"
    WorkflowStageAssetImagePrompt = "asset-image-prompt"
    WorkflowStageShotBreakdown    = "shot-breakdown"
    WorkflowStageShotPrompt       = "shot-prompt"
)
```

Create new workflow runs when the default version changes; do not migrate old run rows. Initialize the stages in the listed order and gate each one on approval/application of its direct dependency.

- [ ] **Step 4: Extend stage start with validated context**

Add a bounded command field:

```go
type workflowCommandInput struct {
    IdempotencyKey string          `json:"idempotencyKey"`
    MediaBatchID   string          `json:"mediaBatchId"`
    Context        json.RawMessage `json:"context"`
}
```

Accept context only for `shot-prompt`, reject more than 256 KiB, and validate this contract before putting it into the user prompt:

```json
{
  "shotId": "shot-001",
  "sourceScript": "原剧本片段",
  "shotDraft": {
    "shotSize": "中景",
    "camera": "固定机位",
    "movement": "缓慢推近",
    "action": "人物抬头",
    "performance": "克制",
    "dialogue": "",
    "durationSeconds": 6,
    "continuityMode": "continuous"
  },
  "references": [{ "logicalAssetId": "CHAR-001", "libraryAssetId": "asset-1", "version": "v1", "usage": "角色一致性" }]
}
```

- [ ] **Step 5: Add subtask-specific prompts and gates**

Require:

- `asset-extraction`: `items[].logicalAssetId/kind/name/scriptEvidence/description`.
- `asset-image-prompt`: the same logical IDs plus `imagePrompt/status=ready`.
- `shot-breakdown`: `shots[].shotId/sceneKey/sourceScript/shotDraft` with no final prompt.
- `shot-prompt`: exactly one `shotId`, `prompt`, `referenceEvidence`, and `promptInputHash`.

Map the subtasks to independently published admin Skill slots: `art`, `assets`, `storyboard`, and `video` respectively. Keep actual video generation outside Skill execution.

- [ ] **Step 6: Add the matching typed frontend request and watch its test fail then pass**

The public call should be:

```ts
startWorkflowStage(runId, stageId, idempotencyKey, { mediaBatchId, context })
```

Run: `cd web && node --experimental-strip-types --test src/services/api/workflow-runs-contract.test.mts`

Expected before implementation: FAIL; after implementation: PASS.

- [ ] **Step 7: Run service tests and commit**

Run: `go test ./service`

Expected: PASS.

Commit:

```bash
git add service handler/workflow.go web/src/services/api/workflow-runs.ts web/src/services/api/workflow-runs-contract.ts web/src/services/api/workflow-runs-contract.test.mts
git commit -m "feat: add workflow v2 production subtasks"
```

## Task 2: Extend production-package state with editable shots and freshness rules

**Files:**
- Modify: `web/src/app/(user)/video/use-video-package-store.ts`
- Modify: `web/src/app/(user)/video/video-package-builders.ts`
- Create: `web/src/app/(user)/video/video-package-builders.test.mts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-production-state.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-production-state.test.mts`

- [ ] **Step 1: Write failing tests for prompt staleness and continuity semantics**

```ts
test("marks a confirmed prompt stale when the shot draft changes", () => {
    const original = packageFixture({ shotStatus: "confirmed", promptStatus: "已确认" });
    const next = updateShotDraft(original, { action: "人物转身" });
    assert.equal(next.promptStatus, "需修改");
    assert.equal(next.promptInputHash, "");
});

test("maps previous tail frame as continuity reference rather than first frame", () => {
    const reference = buildContinuityReference(previousShotFixture());
    assert.equal(reference.role, "continuity_reference");
    assert.notEqual(reference.role, "first_frame");
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-production-state.test.mts'`

Expected: FAIL because the types and helpers do not exist.

- [ ] **Step 3: Add the minimal package fields**

```ts
export type WorkflowShotDraft = {
    shotSize: string;
    camera: string;
    movement: string;
    action: string;
    performance: string;
    dialogue: string;
    durationSeconds: number;
    continuityMode: "continuous" | "cut";
};

export type WorkflowReferenceBinding = {
    logicalAssetId: string;
    libraryAssetId: string;
    version: string;
    usage: string;
};

export type WorkflowContinuityReference = {
    sourceShotId: string;
    sourceVideoVersion: string;
    libraryAssetId: string;
    version: string;
    role: "continuity_reference";
    updateAvailable?: boolean;
};
```

Extend `ProductionPackage` with `sourceScript`, `shotDraft`, `shotStatus`, `promptInputHash`, `referenceBindings`, `continuityReference`, `lastFrameAssetId`, and `lastFrameVersion`.

- [ ] **Step 4: Implement deterministic input hashing and invalidation**

The hash input must include normalized source script, shot draft, sorted reference IDs/versions, and continuity version. `updateShotDraft`, `updateReferenceBindings`, and `updateContinuityReference` must preserve the old prompt text for comparison but set `promptStatus: "需修改"` and clear `promptInputHash`.

- [ ] **Step 5: Run tests and commit**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-production-state.test.mts' 'src/app/(user)/video/video-package-builders.test.mts'`

Expected: PASS.

Commit:

```bash
git add web/src/app/\(user\)/video/use-video-package-store.ts web/src/app/\(user\)/video/video-package-builders.ts web/src/app/\(user\)/projects/\[id\]/episodes/\[episodeId\]/workflow/workflow-production-state.ts web/src/app/\(user\)/projects/\[id\]/episodes/\[episodeId\]/workflow/workflow-production-state.test.mts
git commit -m "feat: add editable shot production state"
```

## Task 3: Build Asset Design with stable IDs and image-workbench writeback

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-panel.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-design.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-asset-image-actions.ts`
- Modify: `web/src/app/(user)/assets/use-workflow-asset-image-actions.ts`
- Modify: `web/src/app/(user)/assets/workflow-asset-image.ts`
- Create: `web/src/app/(user)/assets/workflow-asset-image.test.mts`

- [ ] **Step 1: Write failing mapping tests for stable logical asset IDs**

```ts
test("keeps one library record for every logical asset across prompt and image updates", () => {
    const mapped = mapAssetDesignArtifactToAssets(fixtureJson, existingAssets, scope);
    assert.equal(mapped.items[0].logicalAssetId, "CHAR-001");
    assert.equal(mapped.items[0].targetAssetId, "library-char-1");
    assert.equal(mapped.items[0].preserveImage, true);
});
```

Verify RED with the focused Node test.

- [ ] **Step 2: Extend mapping and asset metadata**

Store this shape under `metadata.originalWorkflow`:

```ts
{
    logicalAssetId,
    libraryAssetId,
    projectId,
    episodeId,
    scriptEvidence,
    description,
    imagePrompt,
    status,
    importKey: `${projectId}:${episodeId}:${logicalAssetId}`,
}
```

Use the existing asset record ID as `libraryAssetId`; image updates must version and mutate that record rather than create a second logical asset.

- [ ] **Step 3: Add asset cards and filters**

`WorkflowAssetDesign` renders character, scene, prop, and costume filters; each card shows logical ID, script evidence, description, prompt, current image/version, and confirmation status. Export the existing image-workbench URL builder so the card can open `/image` with `libraryAssetId`, `assetId`, and `returnTo`.

- [ ] **Step 4: Add explicit batch image generation**

The hook must:

1. accept selected library asset IDs;
2. show one modal with model, count, and cost message before invocation;
3. generate sequentially so a single failure does not cancel successful cards;
4. call `buildWorkflowGeneratedImagePatch` for the same library asset record;
5. report `{ succeededIds, failed: [{ id, message }] }`.

No generation starts from extraction alone.

- [ ] **Step 5: Run focused tests, typecheck, and commit**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts' 'src/app/(user)/assets/workflow-asset-image.test.mts'
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add web/src/app/\(user\)/projects/\[id\]/episodes/\[episodeId\]/workflow web/src/app/\(user\)/assets/use-workflow-asset-image-actions.ts web/src/app/\(user\)/assets/workflow-asset-image.ts web/src/app/\(user\)/assets/workflow-asset-image.test.mts
git commit -m "feat: add asset design image workflow"
```

## Task 4: Import shot breakdowns and make each shot editable before prompt generation

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-storyboard-sync.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-editor.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-shot-draft.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-queue.tsx`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-draft.test.mts`

- [ ] **Step 1: Write failing tests for source-script preservation and shot confirmation**

```ts
test("imports breakdown output without pretending the final prompt is confirmed", () => {
    const item = buildShotPackage(breakdownShotFixture());
    assert.equal(item.sourceScript, "她把红色纸飞机放在桌上。\n");
    assert.equal(item.shotStatus, "draft");
    assert.equal(item.prompt, "");
    assert.equal(item.promptStatus, "待审核");
});
```

- [ ] **Step 2: Verify RED, then change the sync parser**

Parse `shotId`, `sceneKey`, `sourceScript`, and `shotDraft` from `shot-breakdown`. Build packages without final prompts and apply a receipt only after the local package write succeeds.

- [ ] **Step 3: Replace the prompt-only editor with the confirmed editing chain**

The center column order must be:

1. read-only original script card;
2. structured inputs for shot size, camera, movement, action, performance, dialogue, duration, and continuity mode;
3. save and confirm-shot actions;
4. prompt generation area, initially locked;
5. prompt editor and confirmation after a prompt exists.

Saving failure must keep the current shot selected. Changing a confirmed draft invalidates the prompt through Task 2 helpers.

- [ ] **Step 4: Update queue status derivation**

Queue labels must distinguish `待修改`, `待确认分镜`, `待生成提示词`, `待确认提示词`, `可生成视频`, `生成中`, `已完成`, and `阻断`.

- [ ] **Step 5: Run tests and commit**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-draft.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-filter.test.mts'`

Expected: PASS.

Commit:

```bash
git add web/src/app/\(user\)/projects/\[id\]/episodes/\[episodeId\]/workflow web/src/app/\(user\)/video
git commit -m "feat: add editable shot breakdown workflow"
```

## Task 5: Generate one multimodal prompt from the confirmed shot and bound images

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-shot-prompt-actions.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-prompt-input.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-prompt-input.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-editor.tsx`

- [ ] **Step 1: Write failing tests for frozen multimodal input**

Assert that `buildShotPromptInput`:

- rejects an unconfirmed shot;
- includes source script and every structured field;
- includes bound image IDs and versions;
- includes `continuity_reference` without `first_frame`;
- adds the approved continuity instruction;
- produces a deterministic `promptInputHash`.

- [ ] **Step 2: Run the test and verify RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-prompt-input.test.mts'`

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement the pure input builder and media selection**

Return:

```ts
{
    context: { shotId, sourceScript, shotDraft, references, promptInputHash },
    images: ReferenceImage[],
    continuityInstruction: string,
}
```

Every image must have a stable label containing its logical asset ID. The continuity image uses `seedanceRole: "reference_image"`.

- [ ] **Step 4: Implement the task hook**

The hook creates a one-time media batch, uploads bound asset images plus optional continuity image, starts `shot-prompt` with the confirmed context, polls the durable run, exposes gate/review actions, and writes the approved prompt only to the matching shot. The apply receipt targets `video_package_store` with the scoped package ID.

- [ ] **Step 5: Connect the editor actions**

Show `生成提示词`, task status, image-evidence review, approve/reject, and `写入当前镜头`. Disable the action until the shot is confirmed and all required assets are bound.

- [ ] **Step 6: Run focused tests and commit**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-prompt-input.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-evidence.test.mts'`

Expected: PASS.

Commit:

```bash
git add web/src/app/\(user\)/projects/\[id\]/episodes/\[episodeId\]/workflow
git commit -m "feat: generate multimodal prompts per confirmed shot"
```

## Task 6: Archive every successful video's tail frame and bind continuity references

**Files:**
- Modify: `web/src/services/api/video.ts`
- Create: `web/src/services/api/video.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-runner.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/video-last-frame.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/video-last-frame.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-video-actions.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-video-console.tsx`
- Modify: `web/src/app/(user)/video/video-package-builders.ts`

- [ ] **Step 1: Write failing normalization and continuity tests**

```ts
test("keeps the upstream last frame URL", () => {
    assert.equal(normalizeVideoTaskForTest({ id: "task-1", status: "succeeded", last_frame_url: "https://example.com/last.png" }).lastFrameUrl, "https://example.com/last.png");
});

test("adds previous tail frame as an ordinary continuity reference", () => {
    const images = resolveWorkflowReferenceImages(nextShotWithContinuity(), assets);
    assert.equal(images.at(-1)?.seedanceRole, "reference_image");
});
```

- [ ] **Step 2: Verify RED and preserve upstream tail-frame fields**

Add `last_frame_url`, `last_frame`, and `last_frame_image_url` to `VideoResponse`; normalize the first non-empty value into `NormalizedVideoTask.lastFrameUrl`.

- [ ] **Step 3: Implement provider-first and local-fallback extraction**

Expose:

```ts
export async function resolveVideoLastFrame(input: {
    upstreamUrl?: string;
    videoBlob: Blob;
}): Promise<{ blob: Blob; source: "provider" | "local-extract" }>;
```

Fetch the upstream image when present. Otherwise create an object URL for the downloaded video, wait for metadata, seek to `max(0, duration - 0.05)`, draw the frame to a canvas, encode PNG, and always revoke the object URL.

- [ ] **Step 4: Archive the tail frame and update package lineage**

After video archival succeeds, save an image asset titled `${shotId} 尾帧`, with metadata containing project, episode, shot, source video asset/version, extraction source, and role `continuity_reference`. Add its ID/version to the completed generation and package.

If the next package is in the same `sceneKey` and its draft uses `continuityMode: "continuous"`, attach a frozen continuity reference. A regenerated previous shot sets `updateAvailable` on an already frozen next-shot reference instead of silently replacing it.

- [ ] **Step 5: Show tail-frame and continuity state in the right column**

Display the tail-frame thumbnail, extraction source, referenced-by shot, missing-frame retry action, and update-available confirmation.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
cd web
node --experimental-strip-types --test src/services/api/video.test.mts 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/video-last-frame.test.mts' 'src/app/(user)/video/video-package-builders.test.mts'
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add web/src/services/api/video.ts web/src/services/api/video.test.mts web/src/app/\(user\)/canvas/utils/canvas-generation-runner.ts web/src/app/\(user\)/projects/\[id\]/episodes/\[episodeId\]/workflow web/src/app/\(user\)/video
git commit -m "feat: chain shots with tail frame continuity references"
```

## Task 7: Merge the visible workflow into Asset Design and Shot Production

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-view-types.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-stage-rail.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`

- [ ] **Step 1: Write failing route and aggregation tests**

Require the only visible keys to be:

```ts
export const workflowStageKeys = ["script", "assets", "production", "delivery"] as const;
```

Asset Design aggregates `asset-extraction`, `asset-image-prompt`, and local asset confirmation counts. Shot Production aggregates `shot-breakdown`, the latest per-shot `shot-prompt` task, prompt confirmation counts, and video generation counts.

- [ ] **Step 2: Verify RED, then implement the four-stage rail**

Labels are `剧本确认`, `资产设计`, `镜头生产`, and `审核交付`. Use the current theme variables and existing low-weight rail styling.

- [ ] **Step 3: Compose Asset Design**

Render the extraction and image-prompt task controls as substeps above `WorkflowAssetDesign`. Do not show the shot queue on this stage.

- [ ] **Step 4: Compose Shot Production**

Render the shot queue only on this stage. If no packages exist, show the `shot-breakdown` task and apply action. When a shot is selected, render the source-script/shot/prompt editor in the center and references/video/tail-frame console on the right.

- [ ] **Step 5: Preserve responsive behavior**

At desktop width use `168px / 252px / minmax(520px, 1fr) / 340px`. Below desktop, keep the four-stage horizontal selector and open queue/result panels as accessible drawers.

- [ ] **Step 6: Run route, state, and type checks, then commit**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts'
npm run typecheck
```

Expected: PASS.

Commit: `git commit -am "feat: merge video workflow into two production stages"`

## Task 8: Full verification loop, real workflow acceptance, docs, and production restore

**Files:**
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run deterministic quality gates**

Run in parallel where safe:

```bash
go test ./...
cd web && npm run typecheck
cd web && npm test
cd web && npm run lint
```

Expected: every gate PASS with no new warnings from the workflow page.

- [ ] **Step 2: Run the production build**

Run: `cd web && npm run build`

Expected: successful Next production build.

- [ ] **Step 3: Start local Codex validation mode and execute the real no-cost text path**

Validate in the browser:

1. create/refresh a v2 workflow;
2. execute asset extraction and asset image-prompt with `codex-cli` and 0 application credits;
3. bind at least one existing/test image to its stable logical asset ID;
4. execute shot breakdown;
5. edit and confirm one shot;
6. execute one multimodal shot-prompt task and inspect image evidence;
7. approve and write the prompt;
8. verify the video request preview includes prompt, asset images, and optional continuity reference.

- [ ] **Step 4: Perform only the authorized minimum real media generation**

Use the current configured image channel for the smallest single asset image if a suitable existing image is unavailable. Use the enterprise video API's minimum allowed model/seconds/resolution for at most the already authorized smoke scope; do not submit an additional paid video if the existing successful video can validate tail-frame extraction from its stored blob.

- [ ] **Step 5: Verify tail-frame continuity**

Confirm that the completed shot has a tail-frame image asset. On the next same-scene continuous shot, confirm it appears as `上一镜连续性参考`, is sent as an ordinary reference image, and the UI never labels it as `首帧`.

- [ ] **Step 6: Repeat verify → diagnose → minimal fix**

Cycle up to five times. Stop only when there are no P0/P1 issues, the complete path has no blocker, and desktop plus narrow layouts remain usable. Re-run the failed gate first after each fix, then all dependent gates.

- [ ] **Step 7: Update project documentation**

Move completed work into `docs/pending-test.md`, update the corresponding `docs/todo.md` status, and add a concise Unreleased summary to `CHANGELOG.md`. Do not claim cloud asset synchronization.

- [ ] **Step 8: Restore and verify production execution boundaries**

Rebuild and start `docker-compose.local.yml`. Verify inside the container:

```bash
test "$APP_ENV" = production
test "$WORKFLOW_TEXT_EXECUTOR" = api
test "$WORKFLOW_LOCAL_CODEX_ENABLED" = false
! command -v codex
```

Verify `/api/health`, reload the final Asset Design and Shot Production pages, and leave the accepted page open for the user.

- [ ] **Step 9: Commit the accepted implementation**

Run: `git status --short`, inspect the final diff, stage only task files, and commit with `feat: build two-stage video production workflow`.
