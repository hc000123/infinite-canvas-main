# Asset Library Project Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the asset library filter by top-level project and child workflow/canvas scope, keep each project intact across pagination, use compact hyphenated canvas asset names, and prevent version suffixes from becoming type groups.

**Architecture:** Add pure helpers for project/source membership, type grouping, and project-page packing; keep the page hook responsible for composing those helpers and the filter panel responsible only for hierarchical controls. Continue using existing local stores and metadata, including `CreativeProject.canvasIds`, `CanvasProject.projectId`, project folders, project library entries, workflow metadata, generation lineage, and canvas lineage.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand, Node test runner.

---

### Task 1: Compact asset names and stable type grouping

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-generated-asset.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generated-asset.test.mts`
- Create: `web/src/app/(user)/assets/asset-type-groups.ts`
- Create: `web/src/app/(user)/assets/asset-type-groups.test.mts`
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`

- [ ] **Step 1: Write failing compact-name assertions**

Update all generated-asset title expectations to the exact compact format:

```ts
assert.equal(asset?.title, "毕业典礼画布-节点001-v1");
assert.equal(asset?.title, "毕业典礼画布-节点007-v3");
assert.equal(buildGeneratedVideoAsset(videoNode({ assetNodeNumber: 2, productionVideoVersionNumber: 5 }), context)?.title, "毕业典礼画布-节点002-v5");
```

- [ ] **Step 2: Write a failing type-group test**

Create `asset-type-groups.test.mts` with a video named `47-1-节点027-v3`, an image with `originalWorkflow.type = "角色"`, and a plain audio asset. Assert the group titles are exactly `视频`, `角色`, and `音频`; no group title may equal `v3`.

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-generated-asset.test.mts' \
  'src/app/(user)/assets/asset-type-groups.test.mts'
```

Expected: generated-name assertions fail on `·`; the new type-group module is missing.

- [ ] **Step 4: Implement compact naming**

Change the generated title helper to return:

```ts
return `${canvasTitle}-节点${String(nodeNumber).padStart(3, "0")}-v${versionNumber}`;
```

- [ ] **Step 5: Implement metadata-first type grouping**

Create an exported `buildAssetTypeGroups(assets)` helper. Use `workflowAssetInfo(asset)?.type?.trim()` when present; otherwise use `assetKindLabel(asset.kind)`. Do not parse any title suffix. Move `AssetTypeGroup`, group ID normalization, and type ordering from the component into this helper and import it in `asset-results-section.tsx`.

- [ ] **Step 6: Run focused tests and commit**

Run the two focused test files again; expect all tests to pass. Commit:

```bash
git add web/src/app/\(user\)/canvas/utils/canvas-generated-asset.ts \
  web/src/app/\(user\)/canvas/utils/canvas-generated-asset.test.mts \
  web/src/app/\(user\)/assets/asset-type-groups.ts \
  web/src/app/\(user\)/assets/asset-type-groups.test.mts \
  web/src/app/\(user\)/assets/components/asset-results-section.tsx
git commit -m "fix: stabilize asset names and type groups"
```

### Task 2: Project and source-scope membership

**Files:**
- Create: `web/src/app/(user)/assets/asset-project-scope.ts`
- Create: `web/src/app/(user)/assets/asset-project-scope.test.mts`
- Modify: `web/src/app/(user)/assets/asset-page-filters.ts`
- Modify: `web/src/app/(user)/assets/asset-page-filters.test.mts`

- [ ] **Step 1: Write failing project-membership tests**

Cover these exact cases for project `project-1`:

```ts
[
  "asset-in-project-folder",
  "asset-in-project-library",
  "asset-with-generation-project",
  "asset-with-original-workflow-project",
  "asset-referenced-by-project",
  "asset-from-bound-canvas",
]
```

Also assert that an unrelated asset is excluded and an asset with only `canvasId = canvas-2` is excluded when `canvas-2` belongs to another project.

- [ ] **Step 2: Write failing source-scope tests**

Define `AssetSourceScope = "all" | "workflow" | "canvas"`. Assert:

```ts
assetMatchesSourceScope(workflowAsset, "workflow", projectCanvasIds, "") === true;
assetMatchesSourceScope(canvasAsset, "canvas", projectCanvasIds, "") === true;
assetMatchesSourceScope(canvasAsset, "canvas", projectCanvasIds, "canvas-1") === true;
assetMatchesSourceScope(canvasAsset, "canvas", projectCanvasIds, "canvas-2") === false;
```

An asset with both workflow and canvas lineage must match both child scopes but appear once after normal list filtering.

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/assets/asset-project-scope.test.mts' \
  'src/app/(user)/assets/asset-page-filters.test.mts'
```

Expected: missing project-scope exports or incorrect project filtering.

- [ ] **Step 4: Implement pure membership helpers**

Implement helpers that collect project IDs from:

```ts
type AssetProjectScopeContext = {
  folderProjectIdByFolderId: Map<string, string>;
  canvasProjectIdByCanvasId: Map<string, string>;
  referencedAssetIdsByProject: Map<string, Set<string>>;
};
```

Read project IDs from project folders, project library entries, generation records, `canvasSource`, `originalWorkflow`, project reference sets, and any canvas lineage whose canvas belongs to the project. Reuse `assetCanvasLibraryEntries`, `assetGenerationRecords`, `assetProjectLibraryEntries`, and safe record/string readers.

- [ ] **Step 5: Apply project/source IDs in list filtering**

Extend the filter input with:

```ts
projectAssetIds?: Set<string>;
sourceScope?: AssetSourceScope;
projectCanvasIds?: Set<string>;
```

Reject an asset when a project is selected and `projectAssetIds` does not contain its ID. Apply workflow/canvas source scope after project membership and before search. Keep regular folder filtering independent.

- [ ] **Step 6: Run focused tests and commit**

Run both test files and expect pass. Commit:

```bash
git add web/src/app/\(user\)/assets/asset-project-scope.ts \
  web/src/app/\(user\)/assets/asset-project-scope.test.mts \
  web/src/app/\(user\)/assets/asset-page-filters.ts \
  web/src/app/\(user\)/assets/asset-page-filters.test.mts
git commit -m "feat: model asset project source scope"
```

### Task 3: Hierarchical project, workflow, and canvas controls

**Files:**
- Modify: `web/src/app/(user)/assets/use-asset-page-query.ts`
- Modify: `web/src/app/(user)/assets/use-asset-filter-actions.ts`
- Modify: `web/src/app/(user)/assets/components/asset-filter-panel.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`
- Modify: `web/src/app/(user)/assets/asset-project-filter-wiring.test.mts`

- [ ] **Step 1: Replace the mutually-exclusive wiring test**

Assert the panel contains `placeholder="项目"`, the three source labels `全部`, `工作流`, `画布`, and `placeholder="选择画布"`. Assert it no longer contains `placeholder="工作流项目"` and does not clear the project from the canvas selection handler.

- [ ] **Step 2: Run the wiring test and verify failure**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/assets/asset-project-filter-wiring.test.mts'
```

Expected: current mutually-exclusive UI fails the hierarchical assertions.

- [ ] **Step 3: Compose project scope in the query hook**

Add `sourceScope` state, defaulting to `"all"`. Build project options from `CreativeProject`. Build child canvas options with `canvasIdsForCreativeProject(selectedProject, projects)` so only canvases bound by `canvasIds` or `projectId` appear. Build `projectAssetIds` with the pure project-scope helper and pass it, `sourceScope`, and selected project canvas IDs to `filterAssetList`.

- [ ] **Step 4: Reset dependent state safely**

When the project changes, reset page, source scope, selected canvas, episode, storyboard group, project-library mode, reference-version mode, and folder filter. When source scope changes away from `canvas`, clear the selected canvas. If a selected canvas is deleted or no longer belongs to the project, clear only the canvas selection and retain the project.

- [ ] **Step 5: Render the hierarchy**

Render one searchable project selector. After project selection, render three `Tag.CheckableTag` source choices. Render the child canvas selector only for the `canvas` scope, with options already limited to the selected project. Keep existing advanced filters and low-visual-weight theme classes.

- [ ] **Step 6: Run wiring, scope, and filter tests and commit**

Run the three focused test files from Tasks 2 and 3; expect pass. Commit:

```bash
git add web/src/app/\(user\)/assets/use-asset-page-query.ts \
  web/src/app/\(user\)/assets/use-asset-filter-actions.ts \
  web/src/app/\(user\)/assets/components/asset-filter-panel.tsx \
  web/src/app/\(user\)/assets/page.tsx \
  web/src/app/\(user\)/assets/asset-project-filter-wiring.test.mts
git commit -m "feat: filter assets through project hierarchy"
```

### Task 4: Keep complete projects together during pagination

**Files:**
- Modify: `web/src/app/(user)/assets/asset-project-groups.ts`
- Create: `web/src/app/(user)/assets/asset-project-groups.test.mts`
- Modify: `web/src/app/(user)/assets/use-asset-page-query.ts`
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`

- [ ] **Step 1: Write failing group-page tests**

Create groups with asset counts `[20, 15, 5]` and target size 30. Assert pages are `[[20], [15, 5]]`. Create one group with 37 assets and assert it produces one page containing all 37 assets, never 30 + 7.

- [ ] **Step 2: Run the group test and verify failure**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/assets/asset-project-groups.test.mts'
```

Expected: the project-page packing helper is missing.

- [ ] **Step 3: Implement group-page packing**

Export a pure helper that accumulates complete `AssetProjectResultGroup` objects until adding the next group would exceed 30 assets. An oversized first group occupies one page intact. Return an array of project-group pages.

- [ ] **Step 4: Group before pagination in the query hook**

Build all project result groups from the complete filtered asset list. If a project is selected, expose all groups and a page count of 1. Otherwise pack complete groups and select the current project page. Clamp `page` against the computed page count.

- [ ] **Step 5: Replace item pagination UI**

Remove the 30 / 60 / 100 size changer. Show pagination only when project-page count exceeds 1, using one logical unit per project page:

```tsx
<Pagination current={page} pageSize={1} total={pageCount} showSizeChanger={false} onChange={onPageChange} />
```

Keep the toolbar count as the full filtered asset count and project headers as complete group counts.

- [ ] **Step 6: Run focused tests and commit**

Run project-group, project-scope, page-filter, and wiring tests; expect pass. Commit:

```bash
git add web/src/app/\(user\)/assets/asset-project-groups.ts \
  web/src/app/\(user\)/assets/asset-project-groups.test.mts \
  web/src/app/\(user\)/assets/use-asset-page-query.ts \
  web/src/app/\(user\)/assets/components/asset-results-section.tsx \
  web/src/app/\(user\)/assets/page.tsx
git commit -m "fix: paginate complete asset projects"
```

### Task 5: Documentation and full verification loop

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Update acceptance notes**

Replace the old mutually-exclusive workflow/canvas acceptance note with the project hierarchy, compact naming, stable type groups, and complete-project pagination checks. Confirm whether `docs/todo.md` has a matching item; move it only if present.

- [ ] **Step 2: Run all asset and naming tests**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/assets/'*.test.mts \
  'src/app/(user)/canvas/utils/canvas-generated-asset.test.mts'
```

Expected: all selected tests pass.

- [ ] **Step 3: Run the full frontend suite and typecheck**

Run:

```bash
cd web
npm test
npm run typecheck
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 4: Run focused lint**

Run ESLint on every changed TypeScript/TSX file. Expected: no errors.

- [ ] **Step 5: Verify the running page**

At the local asset-library page, verify:

1. Selecting a project shows `全部 / 工作流 / 画布`.
2. The child canvas selector lists only that project's canvases.
3. Selecting another project clears the old canvas.
4. A 37-item project stays on one page.
5. `47-1-节点027-v3` appears under `视频`, not `v3`.
6. Existing favorite, type, keyword, episode, open, download, and selection interactions remain usable.

- [ ] **Step 6: Fix any verification failure one at a time**

For each failure, add the smallest reproducing test, run it red, apply one root-cause fix, and rerun the focused test before repeating the full checks.

- [ ] **Step 7: Commit documentation and final fixes**

```bash
git add docs/pending-test.md docs/todo.md web/src
git commit -m "docs: add asset hierarchy acceptance checks"
```

- [ ] **Step 8: Review the final diff**

Run `git status --short`, `git diff main...HEAD --check`, and `git diff main...HEAD --stat`. Confirm only asset-library, generated-name, tests, and required documentation files changed.
