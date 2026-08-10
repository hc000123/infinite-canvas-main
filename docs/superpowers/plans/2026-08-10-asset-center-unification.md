# Asset Center Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify assets around subject → optional variant → pending/current/history, add an unorganized inbox, and make canvas insertion subject-first without replacing the existing asset store.

**Architecture:** Keep `useAssetStore` as the only persisted source. Add pure selectors for subject summaries and the inbox, add atomic collection planners for organizing existing assets, then recompose the asset page, subject workbench, and canvas picker around those views. Keep external library items file-based and preserve fixed-version insertion payloads.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand, Ant Design, Tailwind CSS, Node test runner.

---

### Task 1: Build the unified asset-center read model

**Files:**
- Modify: `web/src/app/(user)/assets/asset-gallery.ts`
- Create: `web/src/app/(user)/assets/asset-center-model.test.mts`

- [ ] **Step 1: Write the failing selector tests**

Create explicit fixtures for one subject, two ordered variants, two formal images, two pending candidates, one related video, and one unbound image, then assert the complete read model:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetCenterSubjects, unorganizedAssets } from "./asset-gallery.ts";

test("builds subject summaries from variants, candidates, versions and related media", () => {
    const summaries = buildAssetCenterSubjects({ subjects: [subject], variants, assets, workbenchImages, projectId: "project-1" });
    assert.equal(summaries[0].primaryVariant.id, "variant-base");
    assert.equal(summaries[0].coverAsset?.id, "current-image");
    assert.equal(summaries[0].pendingCount, 2);
    assert.equal(summaries[0].versionCount, 2);
    assert.equal(summaries[0].relatedMediaCount, 1);
    assert.equal(summaries[0].readiness, "ready");
});

test("keeps only unbound local assets in the inbox", () => {
    assert.deepEqual(unorganizedAssets(assets, "project-1").map((asset) => asset.id), ["loose-image"]);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-center-model.test.mts'
```

Expected: FAIL because `buildAssetCenterSubjects` and `unorganizedAssets` do not exist.

- [ ] **Step 3: Implement the derived model**

Extend `asset-gallery.ts` with:

```ts
export type AssetSubjectSummary = {
    subject: AssetSubject;
    variants: AssetVariant[];
    primaryVariant: AssetVariant;
    coverAsset?: ImageAsset;
    variantCount: number;
    pendingCount: number;
    versionCount: number;
    relatedMediaCount: number;
    readiness: "empty" | "pending" | "ready";
};

export function buildAssetCenterSubjects(input: {
    subjects: AssetSubject[];
    variants: AssetVariant[];
    assets: Asset[];
    workbenchImages: AssetWorkbenchImage[];
    projectId: string;
}) {
    return input.subjects
        .filter((subject) => subject.projectId === input.projectId)
        .map((subject) => {
            const variants = input.variants.filter((variant) => variant.subjectId === subject.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            const primaryVariant = variants[0];
            const formalImages = input.assets.filter((asset): asset is ImageAsset => asset.kind === "image" && asset.assetBinding?.subjectId === subject.id);
            const coverAsset = formalImages.find((asset) => asset.id === primaryVariant?.currentAssetId);
            const pendingCount = input.workbenchImages.filter((image) => image.subjectId === subject.id && image.role === "candidate" && !image.selectedAssetId).length;
            const relatedMediaCount = input.assets.filter((asset) => asset.kind !== "image" && asset.assetBinding?.subjectId === subject.id).length;
            return { subject, variants, primaryVariant, coverAsset, variantCount: variants.length, pendingCount, versionCount: formalImages.length, relatedMediaCount, readiness: coverAsset ? "ready" : pendingCount ? "pending" : "empty" };
        })
        .filter((summary): summary is AssetSubjectSummary => Boolean(summary.primaryVariant));
}

export function unorganizedAssets(assets: Asset[], projectId: string) {
    return assets.filter((asset) => !asset.assetBinding?.subjectId && (!projectId || asset.metadata?.generation?.projectId === projectId || asset.metadata?.projectLibraries?.some((item) => item.projectId === projectId)));
}
```

- [ ] **Step 4: Run the selector tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit the read model**

```bash
git add 'web/src/app/(user)/assets/asset-gallery.ts' 'web/src/app/(user)/assets/asset-center-model.test.mts'
git commit -m 'feat: add unified asset center model'
```

### Task 2: Add atomic organizing actions to the asset store

**Files:**
- Modify: `web/src/stores/asset-workbench-state.ts`
- Modify: `web/src/stores/use-asset-store.ts`
- Create: `web/src/stores/asset-organize.test.mts`

- [ ] **Step 1: Write failing collection-planner tests**

Test that organizing an image writes `assetBinding` and `currentAssetId`, while organizing video binds it without changing the current image:

```ts
test("organizes an image as the current formal version", () => {
    const result = organizeAssetCollections({ assets, variants, assetId: "image-1", subject, variantId: "variant-1", allEpisodes: true, episodeIds: [], setCurrent: true, now });
    assert.equal(result.assets[0].assetBinding?.subjectId, subject.id);
    assert.equal(result.assets[0].assetBinding?.variantId, "variant-1");
    assert.equal(result.variants[0].currentAssetId, "image-1");
});

test("organizes related media without replacing the current image", () => {
    const result = organizeAssetCollections({ assets, variants, assetId: "video-1", subject, variantId: "variant-1", allEpisodes: true, episodeIds: [], setCurrent: true, now });
    assert.equal(result.assets[1].assetBinding?.subjectId, subject.id);
    assert.equal(result.variants[0].currentAssetId, "image-1");
});

test("creates a subject and base variant while organizing an existing image", () => {
    const result = createSubjectFromAssetCollections({ assets, subjects: [], variants: [], assetId: "image-1", projectId: "project-1", category: "character", name: "林默", subjectId: "subject-new", variantId: "variant-new", now });
    assert.equal(result.subjects[0].name, "林默");
    assert.equal(result.variants[0].currentAssetId, "image-1");
    assert.equal(result.assets[0].assetBinding?.subjectId, "subject-new");
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
cd web && node --experimental-strip-types --test src/stores/asset-organize.test.mts
```

Expected: FAIL because `organizeAssetCollections` does not exist.

- [ ] **Step 3: Implement the pure planner and store action**

Add to `asset-workbench-state.ts`:

```ts
export function organizeAssetCollections(input: {
    assets: Asset[];
    variants: AssetVariant[];
    assetId: string;
    subject: AssetSubject;
    variantId: string;
    allEpisodes: boolean;
    episodeIds: string[];
    setCurrent: boolean;
    now: string;
}) {
    const variant = input.variants.find((item) => item.id === input.variantId && item.subjectId === input.subject.id);
    if (!variant) throw new Error("请选择这个资产主体下的形态");
    const asset = input.assets.find((item) => item.id === input.assetId);
    if (!asset) throw new Error("待整理内容不存在");
    const binding = { projectId: input.subject.projectId, subjectId: input.subject.id, category: input.subject.category, variantId: variant.id, variantName: variant.name, allEpisodes: input.allEpisodes, episodeIds: input.allEpisodes ? [] : [...new Set(input.episodeIds)] };
    return {
        assets: input.assets.map((item) => item.id === asset.id ? { ...item, assetBinding: binding, updatedAt: input.now } as Asset : item),
        variants: asset.kind === "image" && input.setCurrent ? input.variants.map((item) => item.id === variant.id ? { ...item, currentAssetId: asset.id, updatedAt: input.now } : item) : input.variants,
    };
}
```

Expose from `useAssetStore`:

```ts
organizeAsset: (input) => set((state) => {
    const subject = state.subjects.find((item) => item.id === input.subjectId);
    if (!subject) throw new Error("资产主体不存在");
    return organizeAssetCollections({ ...input, subject, assets: state.assets, variants: state.variants, now: new Date().toISOString() });
}),
createSubjectFromAsset: (input) => set((state) => createSubjectFromAssetCollections({ ...input, assets: state.assets, subjects: state.subjects, variants: state.variants, subjectId: nanoid(), variantId: nanoid(), now: new Date().toISOString() })),
```

Keep candidate promotion asynchronous because fingerprint deduplication is asynchronous, but expose it as one store method. The method first calls `addAssetOnce(candidateAssetInput)`, then performs one final `set` that writes `selectedAssetId`, the formal binding, and `currentAssetId`. If `addAssetOnce` rejects, it must leave the candidate unchanged.

- [ ] **Step 4: Run organizing tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit the store action**

```bash
git add web/src/stores/asset-workbench-state.ts web/src/stores/use-asset-store.ts web/src/stores/asset-organize.test.mts
git commit -m 'feat: organize loose media into asset subjects'
```

### Task 3: Recompose the asset page around subjects and the inbox

**Files:**
- Create: `web/src/app/(user)/assets/components/asset-center-nav.tsx`
- Create: `web/src/app/(user)/assets/components/asset-inbox-section.tsx`
- Create: `web/src/app/(user)/assets/components/asset-organize-modal.tsx`
- Create: `web/src/app/(user)/assets/use-asset-organize-actions.ts`
- Modify: `web/src/app/(user)/assets/components/asset-subject-card.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`
- Create: `web/src/app/(user)/assets/asset-center-wiring.test.mts`

- [ ] **Step 1: Write the page wiring test**

Assert the page renders the new nav, inbox, and organize modal, and that `AssetResultsSection` no longer renders `ProductionBibleSummaryCard`:

```ts
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const results = readFileSync(new URL("./components/asset-results-section.tsx", import.meta.url), "utf8");
assert.match(page, /<AssetCenterNav/);
assert.match(page, /<AssetInboxSection/);
assert.match(page, /<AssetOrganizeModal/);
assert.doesNotMatch(results, /ProductionBibleSummaryCard/);
```

- [ ] **Step 2: Run the wiring test and verify it fails**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-center-wiring.test.mts'
```

Expected: FAIL because the new components are not wired.

- [ ] **Step 3: Implement the center navigation**

`AssetCenterNav` accepts `value`, category counts, inbox count, and `onChange`, and renders flat Ant Design `Tag.CheckableTag` controls for `all`, `character`, `scene`, `prop`, `blocking`, `other`, and `inbox`. Keep colors on theme variables and label inbox as `待整理`.

- [ ] **Step 4: Implement inbox organization**

`AssetInboxSection` renders existing `CompactMediaAssetCard` cards plus a primary `整理` action. `AssetOrganizeModal` requires a subject and variant, defaults to the subject's earliest variant, shows the resulting binding, and exposes `setCurrent` only for images. Its second mode collects `category` and `name` and calls `createSubjectFromAsset`. `useAssetOrganizeActions` calls these store actions, keeps failures in the inbox, and reports `message.success/error`.

- [ ] **Step 5: Simplify formal results**

Change `AssetResultsSection` so its default path renders only `AssetSubjectCard` entries. Keep outdated-reference mode intact. Remove Production Bible cards and ordinary loose media from the formal grid; the latter moves to `AssetInboxSection`. Do not delete `ProductionBibleItem` data or its workbench; only remove its parallel rendering from the formal asset grid.

- [ ] **Step 6: Wire page state**

In `page.tsx`, add:

```ts
const [centerView, setCenterView] = useState<AssetCenterView>("all");
const subjectSummaries = useMemo(() => buildAssetCenterSubjects({ subjects, variants, assets, workbenchImages, projectId: projectContextFilter }), [assets, projectContextFilter, subjects, variants, workbenchImages]);
const inboxAssets = useMemo(() => unorganizedAssets(assets, projectContextFilter), [assets, projectContextFilter]);
```

Require a selected project before creating or organizing formal subjects. Render `AssetCenterNav`, then either `AssetInboxSection` or the filtered subject grid. Keep export, import, deletion, version-reference, and media detail overlays reachable from the inbox path.

- [ ] **Step 7: Run the model and wiring tests**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-center-model.test.mts' 'src/app/(user)/assets/asset-center-wiring.test.mts' src/stores/asset-organize.test.mts
```

Expected: PASS.

- [ ] **Step 8: Commit the asset center UI**

```bash
git add 'web/src/app/(user)/assets' web/src/stores
git commit -m 'feat: make asset subjects the primary asset center view'
```

### Task 4: Clarify the subject workbench hierarchy

**Files:**
- Modify: `web/src/app/(user)/assets/[subjectId]/page.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/components/asset-candidate-grid.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/components/asset-version-panel.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/components/asset-variant-nav.tsx`
- Create: `web/src/app/(user)/assets/asset-workbench-hierarchy.test.mts`

- [ ] **Step 1: Write the hierarchy wiring test**

Verify the workbench contains `当前版本`, `待选结果`, `历史版本`, `参考资料`, and no visible `候选资产` wording. Verify the variant nav receives `compact={subjectVariants.length === 1}`.

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-workbench-hierarchy.test.mts'
```

- [ ] **Step 3: Reorder and rename the existing sections**

Keep the current version first. Rename `生成候选` to `生成待选结果`, candidate-pool headings to `待选结果`, the promotion action to `设为当前版本`, and formal image list to `历史版本`. Replace the page's inline `addAssetOnce → updateWorkbenchImage → setVariantCurrentAsset` sequence with `promoteWorkbenchImage`. When only one variant exists, show its name as a small `基础形态` status instead of a full navigation rail; retain an `添加形态` action.

- [ ] **Step 4: Demote generation controls**

Wrap model/settings controls in an Ant Design `Collapse` labelled `生成设置`; keep the prompt and primary `生成待选结果` action visible. Do not move generation logic or persistence.

- [ ] **Step 5: Run the hierarchy test**

Expected: PASS.

- [ ] **Step 6: Commit the workbench hierarchy**

```bash
git add 'web/src/app/(user)/assets/[subjectId]' 'web/src/app/(user)/assets/asset-workbench-hierarchy.test.mts'
git commit -m 'feat: clarify asset workbench hierarchy'
```

### Task 5: Make the canvas picker subject-first

**Files:**
- Create: `web/src/app/(user)/canvas/utils/asset-subject-picker.ts`
- Create: `web/src/app/(user)/canvas/utils/asset-subject-picker.test.mts`
- Modify: `web/src/app/(user)/canvas/components/asset-picker-modal.tsx`
- Create: `web/src/app/(user)/canvas/components/asset-subject-picker-card.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`

- [ ] **Step 1: Write failing picker-model tests**

Cover defaulting to the earliest base variant, excluding unready subjects from one-click insertion, filtering by episode, and resolving an explicit historical image:

```ts
const items = buildAssetSubjectPickerItems({ subjects, variants, assets, projectId: "project-1", episodeId: "ep-1" });
assert.equal(items[0].primaryVariant.id, "base");
assert.equal(items[0].currentAsset?.id, "base-current");
assert.equal(items[1].status, "incomplete");
assert.equal(resolveSubjectPickerAsset(items[0], { variantId: "night", assetId: "night-old" })?.id, "night-old");
```

- [ ] **Step 2: Run the picker test and verify it fails**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/asset-subject-picker.test.mts'
```

- [ ] **Step 3: Implement the picker model**

Create `buildAssetSubjectPickerItems` returning each subject, its ordered variants, applicable formal images, primary variant, current asset, and `ready/incomplete` status. Reuse `assetsForEpisode` and existing fixed-version `buildInsertAssetPayload` rather than introducing a new insert contract.

- [ ] **Step 4: Implement subject cards**

`AssetSubjectPickerCard` shows subject name/code/category, current image, variant count, and an `选择形态或版本` popover. Clicking a ready card selects the current image. Clicking an incomplete card navigates to `/assets/[subjectId]` and does not insert a placeholder.

- [ ] **Step 5: Recompose picker tabs**

Rename local tabs to `本集资产` and `全部资产`; both render subject cards. Keep `外部素材库` file-based. Preserve cross-tab selection, allowedKinds, pagination for the external library, and existing insertion payload resolution. Do not show inbox assets in either formal subject tab.

- [ ] **Step 6: Run picker tests and existing picker regression tests**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/asset-subject-picker.test.mts' 'src/app/(user)/canvas/utils/asset-picker-filter.test.mts' 'src/app/(user)/canvas/utils/asset-insert-payload.test.mts'
```

Expected: PASS.

- [ ] **Step 7: Commit the canvas picker**

```bash
git add 'web/src/app/(user)/canvas/components' 'web/src/app/(user)/canvas/utils'
git commit -m 'feat: select canvas assets by subject'
```

### Task 6: Update project docs and verify the complete feature

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/superpowers/plans/2026-08-10-asset-center-unification.md`

- [ ] **Step 1: Update documentation**

Add a concise pending-test section covering subject-first asset center, inbox organization, workbench hierarchy, and subject-first canvas insertion. Move only actually completed related todo items; leave cloud assets and unimplemented workflow cleanup in `docs/todo.md`.

- [ ] **Step 2: Run targeted feature tests**

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/assets/asset-center-model.test.mts' \
  'src/app/(user)/assets/asset-center-wiring.test.mts' \
  'src/app/(user)/assets/asset-workbench-hierarchy.test.mts' \
  'src/app/(user)/canvas/utils/asset-subject-picker.test.mts' \
  'src/app/(user)/canvas/utils/asset-picker-filter.test.mts' \
  'src/app/(user)/canvas/utils/asset-insert-payload.test.mts' \
  src/stores/asset-organize.test.mts
```

Expected: all tests PASS.

- [ ] **Step 3: Run TypeScript validation for touched UI boundaries**

Run:

```bash
cd web && npm run typecheck
```

Expected: exit code 0. If pre-existing unrelated errors exist, record the exact files and confirm no error references the touched asset or canvas picker files.

- [ ] **Step 4: Inspect the final diff**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only planned asset, canvas picker, test, and documentation files remain.

- [ ] **Step 5: Mark every completed plan checkbox and commit docs**

```bash
git add docs/todo.md docs/pending-test.md 'docs/superpowers/plans/2026-08-10-asset-center-unification.md'
git commit -m 'docs: record unified asset center verification'
```
