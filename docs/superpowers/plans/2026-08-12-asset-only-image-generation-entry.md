# Asset-Only Image Generation Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone image-generation workbench while preserving all image generation inside bound asset subject workbenches.

**Architecture:** Remove the global navigation item and replace `/image` with a compatibility redirect that resolves a bound local asset to `/assets/[subjectId]`, otherwise falls back to the project asset library. Change workflow and revision links to target asset subject routes directly; do not change image-generation APIs or asset storage.

**Tech Stack:** Next.js App Router, React, TypeScript, Zustand/localforage, Node test runner.

---

### Task 1: Lock the route and navigation contract

**Files:**
- Modify: `web/src/constant/navigation-tools.test.mts`
- Modify: `web/src/app/(user)/image/image-workbench-mode-wiring.test.mts`
- Create: `web/src/app/(user)/image/image-route.test.mts`

- [ ] **Step 1: Write the failing navigation test**

Assert that `navigationTools.map(tool => tool.slug)` equals `['projects', 'agent', 'canvas', 'storyboard', 'assets', 'cache']` and that only the storyboard production entry remains among image/storyboard tools.

- [ ] **Step 2: Write the failing compatibility-route test**

Import `legacyImageDestination` from `image-route.ts` and assert:

```ts
assert.equal(legacyImageDestination(new URLSearchParams('libraryAssetId=image-a&projectId=p1'), [boundAsset]), '/assets/subject-a');
assert.equal(legacyImageDestination(new URLSearchParams('projectId=p1'), []), '/assets?projectId=p1');
assert.equal(legacyImageDestination(new URLSearchParams(), []), '/assets');
```

Update the page wiring assertion so `page.tsx` contains `router.replace(destination)` and contains neither `AssetImageWorkbench` nor image request functions.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test src/constant/navigation-tools.test.mts 'src/app/(user)/image/image-route.test.mts' 'src/app/(user)/image/image-workbench-mode-wiring.test.mts'
```

Expected: FAIL because the image navigation entry and standalone workbench still exist and `image-route.ts` is missing.

### Task 2: Replace the standalone workbench with compatibility routing

**Files:**
- Create: `web/src/app/(user)/image/image-route.ts`
- Replace: `web/src/app/(user)/image/page.tsx`
- Modify: `web/src/constant/navigation-tools.ts`

- [ ] **Step 1: Implement the pure destination resolver**

Add:

```ts
export function legacyImageDestination(params: Pick<URLSearchParams, 'get'>, assets: Asset[]) {
  const asset = assets.find(item => item.id === params.get('libraryAssetId'));
  if (asset?.assetBinding?.subjectId) return `/assets/${encodeURIComponent(asset.assetBinding.subjectId)}`;
  const projectId = params.get('projectId')?.trim();
  return projectId ? `/assets?projectId=${encodeURIComponent(projectId)}` : '/assets';
}
```

- [ ] **Step 2: Replace `/image` with a non-generating redirect page**

The client page reads `useSearchParams()`, local `assets`, and `router`; its only effect calls `router.replace(legacyImageDestination(searchParams, assets))`. Render a small theme-compatible loading state reading `正在转到资产生图…`. Do not import request-generation APIs.

- [ ] **Step 3: Remove the image navigation tool**

Remove `ImagePlus` and the `{ slug: 'image', ... }` entry while leaving storyboard unchanged.

- [ ] **Step 4: Run the route tests and verify GREEN**

Run the Task 1 command. Expected: all tests PASS.

### Task 3: Point every asset action at the canonical asset workbench

**Files:**
- Modify: `web/src/app/(user)/assets/use-workflow-asset-image-actions.ts`
- Modify: `web/src/app/(user)/assets/asset-image-revision.ts`
- Modify: `web/src/app/(user)/assets/asset-image-revision.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-card.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-slot-editor.test.mts`

- [ ] **Step 1: Write failing direct-link tests**

Assert workflow and revision builders return `/assets/subject-a` with optional `variantId` and `returnTo`, never `/image`, and assert the workflow card label is `资产生图`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-image-revision.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-slot-editor.test.mts'
```

Expected: FAIL because current builders still target `/image`.

- [ ] **Step 3: Implement direct asset routes**

Return `/assets/${encodeURIComponent(subjectId)}` when the asset binding has a subject. Preserve `variantId` and an internal `returnTo` query. Fall back to `/assets?projectId=...` if the asset has no subject binding. Rename the workflow button to `资产生图`.

- [ ] **Step 4: Run focused and adjacent tests**

Run the commands from Tasks 1 and 3 plus the asset subject workbench tests. Expected: all PASS.

### Task 4: Document and run browser acceptance

**Files:**
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Record the testable change**

Add an Unreleased item covering removal of the global image entry, legacy redirect behavior, direct workflow-to-asset navigation, and preserved storyboard route.

- [ ] **Step 2: Run deterministic checks**

Run `git diff --check` and the focused tests above. Expected: PASS.

- [ ] **Step 3: Rebuild the local container and inspect without generating**

Open the legacy URL from the browser comment and confirm it lands on the bound asset subject. Confirm top navigation has no `生图`, retains `分镜`, and the asset page still contains its generation controls. Do not click any real generation action.
