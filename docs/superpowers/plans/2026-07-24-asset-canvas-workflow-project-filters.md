# Asset Canvas and Workflow Project Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact, mutually exclusive workflow-project and canvas selectors to the asset library, with reliable canvas-origin matching.

**Architecture:** Keep metadata parsing in the existing pure asset helpers, hold both filter values in `useAssetPageQuery`, and keep reset/interlock behavior in `useAssetFilterActions`. `AssetFilterPanel` remains presentational and renders two searchable Ant Design selects in the existing low-weight filter rail.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand/localForage asset data, Node test runner.

---

## File map

- `web/src/app/(user)/assets/asset-canvas-library.ts`: determine whether an asset belongs to a canvas through library membership or generation lineage.
- `web/src/app/(user)/assets/asset-canvas-library.test.mts`: unit coverage for current and legacy canvas metadata.
- `web/src/app/(user)/assets/asset-page-filters.test.mts`: composition coverage for canvas, kind, and favorite filters.
- `web/src/app/(user)/assets/use-asset-page-query.ts`: own canvas filter state, expose selector options, clear stale selections.
- `web/src/app/(user)/assets/use-asset-filter-actions.ts`: reset pagination and switch mutually exclusive project scopes.
- `web/src/app/(user)/assets/components/asset-filter-panel.tsx`: replace the expanding project tag list with compact searchable selectors.
- `web/src/app/(user)/assets/page.tsx`: connect query state, actions, options, and values.
- `docs/pending-test.md`: record the real-page acceptance steps.
- `docs/todo.md`: confirm no pending roadmap item needs moving.

### Task 1: Canvas ownership matcher

**Files:**
- Modify: `web/src/app/(user)/assets/asset-canvas-library.test.mts`
- Modify: `web/src/app/(user)/assets/asset-canvas-library.ts`
- Modify: `web/src/app/(user)/assets/asset-page-filters.test.mts`

- [ ] **Step 1: Write failing matcher tests**

Add cases proving that `assetInCanvasLibrary` accepts all supported lineage shapes and rejects unrelated assets:

```ts
test("matches canvas membership and generated canvas lineage", () => {
    assert.equal(assetInCanvasLibrary(asset({ canvasLibraries: [{ canvasId: "canvas-1", addedAt: "old", updatedAt: "old" }] }), "canvas-1"), true);
    assert.equal(assetInCanvasLibrary(asset({ generation: { source: "canvas", canvasId: "canvas-1" } }), "canvas-1"), true);
    assert.equal(assetInCanvasLibrary(asset({ generations: [{ source: "canvas", canvasId: "canvas-1" }] }), "canvas-1"), true);
    assert.equal(assetInCanvasLibrary(asset({ canvasSource: { canvasId: "canvas-1" } }), "canvas-1"), true);
    assert.equal(assetInCanvasLibrary(asset({ generation: { source: "canvas", canvasId: "canvas-2" } }), "canvas-1"), false);
});
```

Add a `filterAssetList` case with `canvasLibraryFilter: "canvas-1"`, `favoriteOnly: true`, and `kindFilter: "video"`; expect only the matching favorite canvas video.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/assets/asset-canvas-library.test.mts' 'src/app/(user)/assets/asset-page-filters.test.mts'
```

Expected: the generated-lineage assertions fail because the current helper only reads `canvasLibraries`.

- [ ] **Step 3: Implement the minimal matcher**

Import existing generation helpers and extend the membership predicate:

```ts
import { assetGenerationRecords, readString } from "./asset-generation";

export function assetInCanvasLibrary(asset: Asset | null | undefined, canvasId: string) {
    if (!canvasId) return false;
    if (assetCanvasLibraryEntries(asset).some((entry) => entry.canvasId === canvasId)) return true;
    const canvasSource = asset?.metadata?.canvasSource;
    if (canvasSource && typeof canvasSource === "object" && !Array.isArray(canvasSource) && readString((canvasSource as Record<string, unknown>).canvasId) === canvasId) return true;
    return assetGenerationRecords(asset).some((generation) => readString(generation.canvasId) === canvasId);
}
```

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

Expected: all tests in both files pass.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(user)/assets/asset-canvas-library.ts' 'web/src/app/(user)/assets/asset-canvas-library.test.mts' 'web/src/app/(user)/assets/asset-page-filters.test.mts'
git commit -m "feat: match assets by canvas lineage"
```

### Task 2: Query state and mutually exclusive actions

**Files:**
- Modify: `web/src/app/(user)/assets/use-asset-page-query.ts`
- Modify: `web/src/app/(user)/assets/use-asset-filter-actions.ts`

- [ ] **Step 1: Replace fixed canvas filter with state**

In `useAssetPageQuery`, replace the constant with state and expose both options and setter:

```ts
const [canvasLibraryFilter, setCanvasLibraryFilter] = useState("");
const workflowProjectOptions = useMemo(
    () => projectFolderRows.map(({ project }) => ({ label: project.title || "未命名工作流项目", value: project.id })),
    [projectFolderRows],
);
const canvasProjectOptions = useMemo(
    () => projects.map((project) => ({ label: project.title || "未命名画布", value: project.id })),
    [projects],
);
```

Return `canvasProjectOptions`, `workflowProjectOptions`, and `setCanvasLibraryFilter`.

- [ ] **Step 2: Clear stale canvas values**

Add an effect so deleting a selected canvas restores the unfiltered state:

```ts
useEffect(() => {
    if (canvasLibraryFilter && !projects.some((project) => project.id === canvasLibraryFilter)) setCanvasLibraryFilter("");
}, [canvasLibraryFilter, projects]);
```

- [ ] **Step 3: Add canvas action support**

Add `setCanvasLibraryFilter` to `useAssetFilterActions` props and return:

```ts
changeCanvasLibraryFilter(value: string) {
    resetPage();
    setCanvasLibraryFilter(value);
},
```

Keep mutual exclusion in the panel's single user actions so clearing one selector does not recursively clear the other.

- [ ] **Step 4: Run TypeScript**

Run:

```bash
cd web
npm run typecheck
```

Expected: TypeScript passes before UI consumers are changed because the new return values are additive.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(user)/assets/use-asset-page-query.ts' 'web/src/app/(user)/assets/use-asset-filter-actions.ts'
git commit -m "feat: add asset canvas filter state"
```

### Task 3: Compact workflow and canvas selectors

**Files:**
- Modify: `web/src/app/(user)/assets/components/asset-filter-panel.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`

- [ ] **Step 1: Update filter panel contracts**

Add `canvasLibraryFilter` to values, add `canvasProjectOptions` and `workflowProjectOptions` to options, and add `onCanvasLibraryFilterChange` to actions. Remove the project-expansion state, `PROJECT_FILTER_COLLAPSED_COUNT`, and project tag memo because selectors replace them.

- [ ] **Step 2: Implement the selector handlers**

Use mutually exclusive handlers:

```ts
const selectWorkflowProject = (projectId: string) => {
    onCanvasLibraryFilterChange("");
    const row = projectFolderRows.find(({ project }) => project.id === projectId);
    if (!row) return selectAllProjects();
    selectProjectFolder(projectId, row.folder.id);
};

const selectCanvas = (canvasId: string) => {
    onCanvasLibraryFilterChange(canvasId);
    onProjectContextFilterChange("");
    onFolderFilterChange("all");
    onStoryboardGroupFilterChange("");
    onProjectLibraryFilterChange("all");
    onReferenceVersionFilterChange("all");
    onClearSelectedOutdatedUsages();
};
```

Also clear `canvasLibraryFilter` inside `selectAllProjects` and `selectProjectFolder`.

- [ ] **Step 3: Replace project tags with compact controls**

Keep the existing all-project tag and render two searchable selects:

```tsx
<Select
    allowClear
    showSearch
    className="min-w-52"
    placeholder="工作流项目"
    value={projectContextFilter || undefined}
    options={workflowProjectOptions}
    optionFilterProp="label"
    disabled={!workflowProjectOptions.length}
    onChange={(value) => (value ? selectWorkflowProject(value) : selectAllProjects())}
/>
<Select
    allowClear
    showSearch
    className="min-w-52"
    placeholder="画布"
    value={canvasLibraryFilter || undefined}
    options={canvasProjectOptions}
    optionFilterProp="label"
    disabled={!canvasProjectOptions.length}
    onChange={(value) => (value ? selectCanvas(value) : selectAllProjects())}
/>
```

The all-project tag is active only when the workflow project, canvas, and folder filters are all clear/default.

- [ ] **Step 4: Wire the page**

Destructure the new values from `useAssetPageQuery`, pass `setCanvasLibraryFilter` into `useAssetFilterActions`, and connect the filter panel:

```ts
onCanvasLibraryFilterChange: assetFilterActions.changeCanvasLibraryFilter
```

Pass the two option arrays and `canvasLibraryFilter` in their corresponding `options` and `values` objects.

- [ ] **Step 5: Run typecheck and focused lint**

Run:

```bash
cd web
npm run typecheck
npx eslint 'src/app/(user)/assets/components/asset-filter-panel.tsx' 'src/app/(user)/assets/page.tsx' 'src/app/(user)/assets/use-asset-page-query.ts' 'src/app/(user)/assets/use-asset-filter-actions.ts' 'src/app/(user)/assets/asset-canvas-library.ts'
```

Expected: both commands exit 0 with no warnings introduced by removed imports or unused state.

- [ ] **Step 6: Commit**

```bash
git add 'web/src/app/(user)/assets/components/asset-filter-panel.tsx' 'web/src/app/(user)/assets/page.tsx'
git commit -m "feat: filter assets by workflow or canvas"
```

### Task 4: Documentation and verification loop

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Record acceptance coverage**

Append a concise pending-test item under “素材库全面整理与跨流程一致性”:

```markdown
- 素材库项目筛选拆分为可搜索的“工作流项目”和“画布”选择器；两类筛选互斥。画布筛选同时识别画布生成记录和加入画布素材库的记录。
- 待页面确认：分别选择工作流项目、画布和全部项目，确认筛选结果准确、依赖筛选被正确清理，并与类型、收藏和名称排序叠加正常。
```

Confirm `docs/todo.md` has no matching unfinished item to move; do not edit it if none exists.

- [ ] **Step 2: Run the full relevant verification loop**

Run:

```bash
cd web
npm test
npm run typecheck
npm run build
```

Expected: all tests pass, TypeScript exits 0, and Next.js production build succeeds.

- [ ] **Step 3: Perform browser acceptance**

Open the local asset page and verify:

1. the project row stays one line on a normal desktop width and wraps cleanly when narrow;
2. selecting a workflow project clears canvas selection and exposes workflow-only advanced filters;
3. selecting a canvas clears workflow/folder dependencies and shows only matching generated or linked assets;
4. selecting all projects restores the full list;
5. favorite, type, search, and title sort still compose correctly;
6. the browser console has no new errors.

- [ ] **Step 4: Fix and repeat**

If any check fails, add the smallest regression test that reproduces it, make the minimal fix, then rerun the failed check and the focused tests before continuing.

- [ ] **Step 5: Commit documentation and verification result**

```bash
git add 'docs/pending-test.md'
git commit -m "docs: add asset project filter acceptance"
```

Run `git status --short` and `git diff --check`; expected output is empty.
