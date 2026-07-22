# Workflow Asset Card Low-Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the asset-stage approval stack with an automatic extraction-to-prompt pipeline and editable, image-backed asset cards that ask for confirmation only when image generation incurs cost.

**Architecture:** Keep the existing two remote workflow stages and quality gates, but add a page-level automation controller that starts, approves, and advances successful text stages idempotently. Materialize approved prompt artifacts into the existing local asset store, render them through a focused card model, and represent costume/hair/makeup/age/injury entries as variants linked to a parent character while retaining stable `COSTUME-xxx` identifiers.

**Tech Stack:** Go, Gin/GORM workflow services, Next.js App Router, React 19, TypeScript, Ant Design 6, Tailwind, Zustand/localforage, Node test runner.

---

## File structure

- `service/video_workflow_gates.go`: validate character-variant parent relationships.
- `service/video_workflow.go`: update fallback prompts and preserve variant fields through the prompt stage.
- `service/workflow_skill_seed.go`: publish the new built-in extraction and prompt instructions.
- `service/video_workflow_test.go`: backend contract and quality-gate regression tests.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts`: parse and carry variant metadata.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts`: mapping and stable-binding tests.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-card-model.ts`: pure classification, grouping, selection, and edit-patch helpers.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-card-model.test.mts`: card grouping and edit-patch tests.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-automation.ts`: pure decision function for the automatic two-stage pipeline.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-automation.test.mts`: automation decision tests.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-asset-automation.ts`: execute one idempotent automatic action at a time.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-card.tsx`: preview, edit, variant, selection, and generation UI for one card.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-panel.tsx`: automatic materialization, filters, batch generation, status, and errors.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`: replace visible asset-stage approval panels with the low-confirmation desk.
- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-images.ts`: retain parent-character metadata on character-variant references.
- `docs/pending-test.md`, `docs/todo.md`, `CHANGELOG.md`: record the testable behavior without mixing unrelated work.

### Task 1: Add the character-variant workflow contract

**Files:**
- Modify: `service/video_workflow_gates.go`
- Modify: `service/video_workflow.go`
- Modify: `service/workflow_skill_seed.go`
- Test: `service/video_workflow_test.go`

- [ ] **Step 1: Write failing backend contract tests**

Add tests that accept a linked variant and reject an orphan variant:

```go
func TestValidateAssetExtractionArtifactAcceptsCharacterVariant(t *testing.T) {
    report := ValidateAssetExtractionArtifact(json.RawMessage(`{"items":[
        {"logicalAssetId":"CHAR-001","kind":"character","name":"林秋","scriptEvidence":"林秋躺在床上","description":"六十岁女性"},
        {"logicalAssetId":"COSTUME-001","kind":"costume","name":"病中旧棉衣","scriptEvidence":"林秋穿着旧棉衣","description":"褪色旧棉衣","parentLogicalAssetId":"CHAR-001","variantType":"costume","variantName":"病中旧棉衣"}
    ]}`))
    if !report.Passed { t.Fatalf("expected linked variant to pass: %+v", report.Issues) }
}

func TestValidateAssetExtractionArtifactRejectsOrphanCharacterVariant(t *testing.T) {
    report := ValidateAssetExtractionArtifact(json.RawMessage(`{"items":[
        {"logicalAssetId":"COSTUME-001","kind":"costume","name":"旧棉衣","scriptEvidence":"她穿旧棉衣","description":"褪色旧棉衣","parentLogicalAssetId":"CHAR-999","variantType":"costume","variantName":"旧棉衣"}
    ]}`))
    if report.Passed { t.Fatal("expected orphan variant to fail") }
}
```

- [ ] **Step 2: Run the focused Go tests and verify failure**

Run: `go test ./service -run 'TestValidateAssetExtractionArtifact(AcceptsCharacterVariant|RejectsOrphanCharacterVariant)'`

Expected: the orphan case fails because the current gate does not validate `parentLogicalAssetId`.

- [ ] **Step 3: Implement the variant gate**

Collect character IDs before validating rows. For `kind == "costume"`, require:

```go
parentID := workflowString(item, "parentLogicalAssetId")
if parentID == "" || !characterIDs[parentID] {
    report.add("invalid_variant_parent", "角色马甲必须绑定当前产物中的角色编号", itemID)
}
if workflowString(item, "variantType") == "" {
    report.add("missing_variant_type", "角色马甲缺少外观变化类型", itemID)
}
if workflowString(item, "variantName") == "" {
    report.add("missing_variant_name", "角色马甲缺少马甲名称", itemID)
}
```

Accept `costume`, `hair`, `makeup`, `age`, `injury`, and `other` as `variantType` values.

- [ ] **Step 4: Preserve the relationship in extraction and prompt instructions**

Bump `workflowSkillSeedVersion` to `2.0.2`. Change the extraction instructions to require `parentLogicalAssetId`, `variantType`, and `variantName` for every `costume` row and explain that costume/hair/makeup/age/injury are character variants. Change the prompt instructions to preserve those fields verbatim.

Mirror the same contract in `workflowStagePrompts` so fallback execution and replaceable Skills agree.

- [ ] **Step 5: Verify backend tests**

Run: `go test ./service -run 'Workflow|AssetExtraction|AssetImagePrompt'`

Expected: PASS.

- [ ] **Step 6: Commit the contract change**

```bash
git add service/video_workflow_gates.go service/video_workflow.go service/workflow_skill_seed.go service/video_workflow_test.go
git commit -m "feat: model character variants in workflow assets"
```

### Task 2: Build the pure asset-card model

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-card-model.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-card-model.test.mts`

- [ ] **Step 1: Write failing mapping and grouping tests**

Cover all confirmed behavior:

```ts
test("preserves character variant relationship", () => {
    const artifact = JSON.stringify({ items: [
        { logicalAssetId: "CHAR-001", kind: "character", name: "林秋", scriptEvidence: "林秋", description: "六十岁女性", imagePrompt: "角色设定", status: "ready" },
        { logicalAssetId: "COSTUME-001", kind: "costume", name: "旧棉衣", scriptEvidence: "穿旧棉衣", description: "褪色棉衣", imagePrompt: "旧棉衣造型", status: "ready", parentLogicalAssetId: "CHAR-001", variantType: "costume", variantName: "旧棉衣" },
    ] });
    const result = mapAssetDesignArtifactToAssets(artifact, [], { projectId: "p1", episodeId: "e1" });
    assert.equal(result.items[1].parentLogicalAssetId, "CHAR-001");
    assert.equal(result.items[1].variantName, "旧棉衣");
});

test("groups costume rows inside their parent character card", () => {
    const cards = buildWorkflowAssetCards(rows, assets);
    assert.deepEqual(cards.map((card) => card.logicalAssetId), ["CHAR-001", "SCENE-001", "PROP-001"]);
    assert.deepEqual(cards[0].variants.map((variant) => variant.logicalAssetId), ["CHAR-001", "COSTUME-001"]);
});
```

Also test category counts, an orphan variant in the character category with `missingParent: true`, ungenerated default selection, and preservation of an existing image/version.

- [ ] **Step 2: Run the frontend tests and verify failure**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts' \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-card-model.test.mts'
```

Expected: FAIL because the new fields and card model do not exist.

- [ ] **Step 3: Extend the mapped row type**

Add these fields to `WorkflowArtItem` and parse them with `readString`:

```ts
parentLogicalAssetId: string;
variantType: "costume" | "hair" | "makeup" | "age" | "injury" | "other" | "";
variantName: string;
```

- [ ] **Step 4: Implement the card model**

Export focused pure helpers:

```ts
export type WorkflowAssetCategory = "all" | "character" | "scene" | "prop";
export type WorkflowAssetVariant = { row: WorkflowArtifactMappingRow; asset?: Asset; logicalAssetId: string; missingParent: boolean };
export type WorkflowAssetCard = { logicalAssetId: string; category: Exclude<WorkflowAssetCategory, "all">; name: string; variants: WorkflowAssetVariant[] };

export function buildWorkflowAssetCards(rows: WorkflowArtifactMappingRow[], assets: Asset[]): WorkflowAssetCard[];
export function workflowAssetCategoryCounts(cards: WorkflowAssetCard[]): Record<WorkflowAssetCategory, number>;
export function defaultWorkflowAssetSelection(cards: WorkflowAssetCard[]): string[];
export function workflowAssetEditPatch(asset: Asset, input: { description: string; imagePrompt: string }): Partial<Asset>;
```

`costume` rows join the parent `character` card; orphan rows become character cards with `missingParent: true`. `workflowAssetEditPatch` must preserve image data, versions, and unrelated metadata while updating `originalWorkflow.description`, `originalWorkflow.imagePrompt`, `originalWorkflow.prompt`, `note`, and text content when the asset is still text.

- [ ] **Step 5: Verify focused frontend tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit the model**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts' \
  'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts' \
  'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-card-model.ts' \
  'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-card-model.test.mts'
git commit -m "feat: add workflow asset card model"
```

### Task 3: Add the idempotent automatic asset pipeline

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-automation.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-automation.test.mts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-asset-automation.ts`

- [ ] **Step 1: Write failing automation decision tests**

Define the action contract and cover every transition:

```ts
type AssetAutomationAction =
    | { type: "start-extraction" }
    | { type: "approve-extraction" }
    | { type: "start-prompts" }
    | { type: "approve-prompts" }
    | { type: "idle"; reason: string };

test("advances successful stages without user review", () => {
    assert.deepEqual(nextWorkflowAssetAction({ extraction: { status: "needs_review", gatePassed: true }, prompts: null }), { type: "approve-extraction" });
    assert.deepEqual(nextWorkflowAssetAction({ extraction: { status: "approved", gatePassed: true }, prompts: { status: "ready" } }), { type: "start-prompts" });
    assert.deepEqual(nextWorkflowAssetAction({ extraction: { status: "approved", gatePassed: true }, prompts: { status: "needs_review", gatePassed: true } }), { type: "approve-prompts" });
});

test("stops on a failed gate", () => {
    assert.deepEqual(nextWorkflowAssetAction({ extraction: { status: "needs_review", gatePassed: false }, prompts: null }).type, "idle");
});
```

Also test running/queued/busy states, already approved/applied prompts, and disabled automation outside the asset route.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-automation.test.mts'`

Expected: FAIL because the selector does not exist.

- [ ] **Step 3: Implement the pure selector**

Return only one action for the current snapshot. Gate failures, worker unavailability, current network activity, and terminal failures return `idle` with a user-facing reason.

- [ ] **Step 4: Implement the hook**

`useWorkflowAssetAutomation` receives the two `useWorkflowStageActions` results, the active route, and worker readiness. It uses one in-flight ref keyed by `stageId:attempt:action`, executes the selector result, and clears the key only after `refresh()` supplies a changed remote state. It must call `start()` directly without the page confirmation modal and call `approve()` only when the corresponding gate passed.

Expose:

```ts
{ status: "organizing" | "ready" | "error"; message: string; retry: () => void }
```

Retry starts the failed stage using the existing retry/start action and never deletes current cards.

- [ ] **Step 5: Verify the selector tests and typecheck the hook**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-automation.test.mts'
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit the automatic pipeline**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-automation.ts' \
  'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-automation.test.mts' \
  'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-asset-automation.ts'
git commit -m "feat: automate workflow asset preparation"
```

### Task 4: Build editable image-backed asset cards

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-card.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-panel.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-asset-image-actions.ts`

- [ ] **Step 1: Extract idempotent materialization from the panel**

Move the existing create/update loop into a local `materialize()` function that:

- creates missing text assets immediately after prompt approval;
- preserves existing image data and version history;
- writes `parentLogicalAssetId`, `variantType`, and `variantName` into `originalWorkflow`;
- calls `applyWorkflowStage` once after every mapped row has a target ID;
- can run again safely after refresh without duplicates.

- [ ] **Step 2: Build the reusable card component**

Use Ant Design `Image`, `Modal`, `Input.TextArea`, `Checkbox`, and existing studio theme variables. The component signature should be:

```tsx
<WorkflowAssetCard
  card={card}
  selectedIds={selectedIds}
  generatingIds={generatingIds}
  onSelectionChange={setVariantSelected}
  onSave={saveVariant}
  onGenerate={confirmAndGenerateVariant}
/>
```

Render a parent character card with variant tabs/chips. Each active variant has its own preview, evidence, description, prompt, asset version, image-workbench link, and generate action.

- [ ] **Step 3: Add original-image preview**

For image assets render:

```tsx
<Image
  src={asset.data.dataUrl || asset.coverUrl}
  alt={`${card.name} · ${variantName}`}
  preview={{ mask: <span>放大原图</span> }}
/>
```

Wrap visible images in `Image.PreviewGroup` so users can switch among card images. Ant Design supplies zoom, drag, close, and original-size rendering. Add an explicit download action that uses the existing asset download path instead of duplicating blob logic.

- [ ] **Step 4: Add edit persistence**

Open one edit modal with asset description and image prompt. On save, trim both fields, require a non-empty prompt, call `workflowAssetEditPatch`, and show “资产卡片已更新”. Do not create a new logical asset or image version for text-only edits.

- [ ] **Step 5: Reduce generation confirmation to one dialog**

Single-card and batch paths both call the same function:

```ts
modal.confirm({
    title: `生成 ${targets.length} 张资产图？`,
    content: `将使用 ${imageActions.model}，确认后自动生成、归档版本并绑定资产编号。`,
    okText: "确认生成",
    onOk: () => imageActions.generate(targets),
});
```

Remove the separate “确认写入” button. Default selection is every valid card without an image. Keep partial successes visible and attach the error to each failed card.

- [ ] **Step 6: Verify focused tests, typecheck, and lint changed files**

Run:

```bash
cd web
npm test
npm run typecheck
npx eslint --max-warnings=0 \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-card.tsx' \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-panel.tsx' \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-asset-image-actions.ts'
```

Expected: PASS with zero warnings.

- [ ] **Step 7: Commit the asset desk**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-card.tsx' \
  'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-panel.tsx' \
  'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-asset-image-actions.ts'
git commit -m "feat: add editable workflow asset cards"
```

### Task 5: Replace the visible approval stack on the asset page

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-images.ts`
- Test: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-images.test.mts`

- [ ] **Step 1: Add a reference test for character variants**

Create an image asset with `kind: "costume"`, `logicalAssetId: "COSTUME-001"`, and `parentLogicalAssetId: "CHAR-001"`. Assert that `workflowReferenceImages` returns it with `kind: "character"`, the child logical ID, and parent ID.

- [ ] **Step 2: Extend reference image metadata**

Add optional fields:

```ts
logicalAssetId?: string;
parentLogicalAssetId?: string;
variantName?: string;
```

Populate them from `originalWorkflow`. Keep costume and other character variants categorized as `character` for the prompt and video stages.

- [ ] **Step 3: Integrate automatic mode in `page.tsx`**

Call `useWorkflowAssetAutomation` unconditionally with `enabled: routeState.stage === "assets"`. Replace both `WorkflowStagePanel` instances and both subtask labels with:

```tsx
<WorkflowAssetPanel
  artifact={assetPrompt.artifact}
  automation={assetAutomation}
  extraction={extraction}
  promptStage={assetPrompt}
  episodeId={workbench.episode.id}
  projectId={workbench.project.id}
  projectTitle={workbench.project.title}
  onApplied={workbench.refreshRemote}
/>
```

Give the asset desk the full content width by removing the right run console for the asset route. Keep the console available only for explicit error details if an automatic stage fails.

- [ ] **Step 4: Verify the page and reference tests**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-images.test.mts'
npm run typecheck
npm run build
```

Expected: PASS and the workflow route remains in the build manifest.

- [ ] **Step 5: Commit the page integration**

```bash
git add 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx' \
  'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-images.ts' \
  'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-images.test.mts'
git commit -m "feat: simplify workflow asset review"
```

### Task 6: Documentation and complete verification

**Files:**
- Modify: `AGENTS.md` only if implementation exposes a repeatable rule not already captured.
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update test-facing documentation**

Move the low-confirmation card work from the relevant todo entry into `docs/pending-test.md`. Record:

- automatic extraction-to-prompt progression;
- no manual stage approval or write confirmation;
- character/scene/prop filters;
- character variants;
- edit persistence;
- preview/original-image view;
- one confirmation for paid image generation;
- automatic versioned binding.

Keep `CHANGELOG.md` to one version-level summary line.

- [ ] **Step 2: Run the complete backend and frontend suite**

Run:

```bash
go test ./...
cd web
npm test
npm run typecheck
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Run strict checks on changed frontend files**

Run ESLint with `--max-warnings=0` on every changed `.ts`, `.tsx`, and `.mts` file, then run `git diff --check`.

Expected: zero lint warnings and no whitespace errors.

- [ ] **Step 4: Perform a Codex CLI workflow smoke test**

On a temporary database, run one short script through `asset-extraction` and `asset-image-prompt`. Confirm:

- extraction contains `CHAR-xxx`, `SCENE-xxx`, `PROP-xxx`, and linked `COSTUME-xxx` variants where the script describes appearance changes;
- successful gates advance without manual review actions in the page controller;
- materialization creates one local record per logical asset;
- editing a prompt survives a refresh;
- no image generation starts before the single confirmation action.

- [ ] **Step 5: Perform the final production gate**

Build/restart the existing production Docker service, verify `/api/health`, verify the workflow route returns HTTP 200, and confirm production environment values still report API execution with local Codex disabled.

- [ ] **Step 6: Commit documentation**

Stage only files belonging to this feature. Preserve unrelated user/concurrent modifications.

```bash
git add docs/todo.md docs/pending-test.md CHANGELOG.md AGENTS.md
git commit -m "docs: record low-confirmation asset workflow"
```

- [ ] **Step 7: Report acceptance result**

Report the page URL, test counts, production gate, known non-blocking limitations, and commit list. Do not claim visual acceptance unless the actual page was opened or the user performs the final visual check.
