# Workflow Asset Library Single Source Implementation Plan

> **Superseded route note:** Task 5 中关于独立 `/image` 工作台的验收已被 `2026-08-12-asset-only-image-generation-entry.md` 覆盖；当前应验证 `/image` 转发到资产主体且顶部无独立“生图”。其余任务继续有效。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make asset production and the asset library read and update the same prompt, description, preview image, version history, subject, and variant records.

**Architecture:** Keep the existing workflow `Asset` as the canonical record. Materialization ensures subject/variant bindings and prompt pointers, while gallery/detail pages resolve their display from the bound canonical asset; image generation/import updates the bound variant's current image pointer.

**Tech Stack:** Next.js App Router, React, TypeScript, Zustand, Tailwind CSS, Node test runner

---

### Task 1: Expose workflow identity and variant resolution from the canonical asset

**Files:**
- Modify: `web/src/app/(user)/assets/workflow-asset-image.test.mts`
- Modify: `web/src/app/(user)/assets/workflow-asset-image.ts`

- [ ] **Step 1: Write failing canonical-record assertions**

Extend the existing test asset with `description`, `scriptEvidence`, `variantName`, and an `assetBinding` that has a subject/name but no `variantId`. Import `workflowAssetVariantId` and assert:

```ts
const variants = [{ id: "variant-a", subjectId: "subject-a", name: "基础形象", prompt: "", referenceImageIds: [], createdAt: "now", updatedAt: "now" }];
const info = workflowAssetInfo(asset);
assert.equal(info?.description, "用户修正后的描述");
assert.equal(info?.scriptEvidence, "林夏站在门前");
assert.equal(info?.variantName, "基础形象");
assert.equal(workflowAssetVariantId(asset, variants), "variant-a");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd web/src/app/'(user)'/assets && node --experimental-strip-types --test workflow-asset-image.test.mts`

Expected: FAIL because the extra info fields and `workflowAssetVariantId` do not exist.

- [ ] **Step 3: Implement the shared resolver**

Add `description`, `scriptEvidence`, and `variantName` to `WorkflowAssetInfo`, read them from `originalWorkflow`, import `AssetVariant`, and export:

```ts
export function workflowAssetVariantId(asset: Asset | null | undefined, variants: AssetVariant[]) {
    const binding = asset?.assetBinding;
    if (!binding) return "";
    if (binding.variantId && variants.some((variant) => variant.id === binding.variantId && variant.subjectId === binding.subjectId)) return binding.variantId;
    return variants.find((variant) => variant.subjectId === binding.subjectId && variant.name === binding.variantName)?.id || "";
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `cd web/src/app/'(user)'/assets && node --experimental-strip-types --test workflow-asset-image.test.mts`

Expected: PASS.

### Task 2: Materialize workflow rows into subjects and variants once

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-slot-editor.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-panel.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-asset-image-actions.ts`

- [ ] **Step 1: Add failing wiring assertions**

Assert that `workflow-asset-panel.tsx` uses `ensureVariant`, `updateVariant`, `setVariantCurrentAsset`, writes `variantId` into `assetBinding`, materializes every approved/applied Artifact once rather than only missing assets, and updates the variant after card edits/imports. Assert the generation hook also calls `setVariantCurrentAsset` after a successful image writeback.

```ts
assert.match(assetPanel, /const ensureVariant = useAssetStore/);
assert.match(assetPanel, /const updateVariant = useAssetStore/);
assert.match(assetPanel, /const setVariantCurrentAsset = useAssetStore/);
assert.match(assetPanel, /variantId,/);
assert.doesNotMatch(assetPanel, /!needsMaterialization/);
assert.match(assetPanel, /setVariantCurrentAsset\(variantId, asset\.id\)/);
assert.match(generationHook, /setVariantCurrentAsset\(variantId, asset\.id\)/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow' && node --experimental-strip-types --test workflow-asset-slot-editor.test.mts`

Expected: FAIL because materialization only creates subjects/text assets and does not synchronize variants/current previews.

- [ ] **Step 3: Implement subject/variant alignment**

In `materialize`, preserve an existing explicit binding when present; otherwise use the ensured workflow subject. Ensure the row's variant with the final prompt, update an existing variant prompt, and write this binding:

```ts
const variantName = existingBinding?.variantName || item.variantName || (category === "character" ? "基础形象" : "基础状态");
const variantId = existingBinding?.variantId || ensureVariant({ subjectId, name: variantName, prompt: imagePrompt, referenceImageIds: [] });
updateVariant(variantId, { prompt: imagePrompt });
const assetBinding: AssetBinding = { projectId: props.projectId, subjectId, category, variantId, variantName, allEpisodes: false, episodeIds: [props.episodeId] };
```

Run materialization once for every approved/applied Artifact hash so existing old records are repaired. When an existing target is already an image, call `setVariantCurrentAsset(variantId, current.id)`.

- [ ] **Step 4: Synchronize edit, generation, and import paths**

Use `workflowAssetVariantId(asset, useAssetStore.getState().variants)` after a successful canonical asset update. Update the shape prompt on edit and set the current image after generation/import:

```ts
const variantId = workflowAssetVariantId(asset, useAssetStore.getState().variants);
if (variantId) setVariantCurrentAsset(variantId, asset.id);
```

- [ ] **Step 5: Run the wiring test and verify GREEN**

Run: `cd 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow' && node --experimental-strip-types --test workflow-asset-slot-editor.test.mts`

Expected: PASS.

### Task 3: Show the same preview and prompt in compact asset-library cards

**Files:**
- Modify: `web/src/app/(user)/assets/asset-gallery.test.mts`
- Modify: `web/src/app/(user)/assets/asset-gallery.ts`
- Modify: `web/src/app/(user)/assets/asset-subject-card-actions.test.mts`
- Modify: `web/src/app/(user)/assets/components/asset-subject-card.tsx`

- [ ] **Step 1: Write failing summary tests**

Add a workflow-bound text asset with prompt metadata and two images without a `currentAssetId`. Assert `buildAssetCenterSubjects` returns the workflow prompt and uses the newest image as the cover fallback:

```ts
assert.equal(summary.prompt, "角色统一设定提示词");
assert.equal(summary.coverAsset?.id, "newest");
```

Add a wiring assertion that `asset-subject-card.tsx` renders `summary.prompt` with `line-clamp-2`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd web/src/app/'(user)'/assets && node --experimental-strip-types --test asset-gallery.test.mts asset-subject-card-actions.test.mts`

Expected: FAIL because subject summaries do not expose a prompt and only show an explicitly selected current image.

- [ ] **Step 3: Implement summary resolution**

Extend `AssetCenterSubjectSummary` with `prompt: string`. Resolve the primary workflow asset by the primary variant's `variantId` or `variantName`, then use:

```ts
const coverAsset = formalImages.find((asset) => asset.id === primaryVariant.currentAssetId) || [...formalImages].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
const prompt = workflowAssetPrompt(workflowAsset) || primaryVariant.prompt;
```

- [ ] **Step 4: Render the compact prompt excerpt**

Below the subject name, add a two-line prompt excerpt with the existing theme tokens. Keep the current square preview, counts, upload/generate buttons, and voice action unchanged.

- [ ] **Step 5: Run the tests and verify GREEN**

Run: `cd web/src/app/'(user)'/assets && node --experimental-strip-types --test asset-gallery.test.mts asset-subject-card-actions.test.mts`

Expected: PASS.

### Task 4: Make the asset detail prompt edit the canonical workflow asset

**Files:**
- Create: `web/src/app/(user)/assets/[subjectId]/asset-workbench-workflow-sync.test.mts`
- Modify: `web/src/app/(user)/assets/[subjectId]/page.tsx`

- [ ] **Step 1: Write the failing detail wiring test**

Assert the page imports `workflowAssetInfo`, `workflowAssetPrompt`, `workflowAssetEditPatch`, and `workflowAssetVariantId`; resolves a workflow asset for the active variant; shows the canonical prompt; and updates both the asset and variant on change.

```ts
assert.match(source, /const workflowAsset =/);
assert.match(source, /workflowAssetPrompt\(workflowAsset\) \|\| activeVariant\.prompt/);
assert.match(source, /updateAsset\(workflowAsset\.id, workflowAssetEditPatch/);
assert.match(source, /updateVariant\(activeVariant\.id, \{ prompt: value \}\)/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd 'web/src/app/(user)/assets/[subjectId]' && node --experimental-strip-types --test asset-workbench-workflow-sync.test.mts`

Expected: FAIL because the detail input only reads and writes `AssetVariant.prompt`.

- [ ] **Step 3: Implement canonical prompt editing**

Resolve the bound workflow asset from all assets using `workflowAssetVariantId`. Display `workflowAssetPrompt(workflowAsset) || activeVariant.prompt`. On change, always update the variant and, when a workflow asset exists, apply `workflowAssetEditPatch` while retaining `workflowAssetInfo(workflowAsset)?.description`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `cd 'web/src/app/(user)/assets/[subjectId]' && node --experimental-strip-types --test asset-workbench-workflow-sync.test.mts`

Expected: PASS.

### Task 5: Document and verify routes with the current runtime

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Record the pending manual acceptance scope**

Add one entry covering automatic workflow asset appearance, shared prompts/previews, current-version updates, and separate `/image`/`/storyboard` navigation. Do not duplicate unrelated existing entries.

- [ ] **Step 2: Run focused tests**

Run the asset, workflow, route, and navigation tests from directories without square-bracket glob ambiguity. Expected: all PASS and no generation API calls.

- [ ] **Step 3: Check patch hygiene**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Start the current source tree and inspect both routes**

Run: `cd web && npm run dev`

Read `/image?projectId=test&episodeId=test` and `/storyboard?projectId=test&episodeId=test`. Expected: `/image` contains “生图工作台”/“生成记录”; `/storyboard` contains “分镜制作台”/“所有分镜”; top navigation contains separate “生图”和“分镜”. Do not click generation controls.

- [ ] **Step 5: Preserve the dirty worktree boundary**

Do not stage or commit implementation files because the affected workflow, asset, and documentation files already include unrelated user changes. Report the focused test and runtime verification results.
