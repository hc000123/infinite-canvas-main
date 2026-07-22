# Workflow Asset Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make legacy slug IDs and stable workflow logical IDs appear as one safe canonical asset without deleting records that old references may still use.

**Architecture:** Add one pure canonical-view utility next to the asset page. It groups only scoped workflow records, chooses a deterministic canonical record, merges non-destructive metadata into the canonical view, and exposes alias IDs for explicit group deletion. The workflow artifact mapper also reuses a same-name legacy record inside the same project and episode so new duplicates are not created.

**Tech Stack:** Next.js App Router, React, TypeScript, Zustand, Node test runner.

---

### Task 1: Canonical workflow asset view

**Files:**
- Create: `web/src/app/(user)/assets/workflow-asset-dedup.ts`
- Create: `web/src/app/(user)/assets/workflow-asset-dedup.test.mts`

- [ ] **Step 1: Write failing tests for scoped duplicate grouping**

Create fixtures for a legacy `prop_red_paper_airplane` text asset and a stable `PROP-001` image asset with the same `originalWorkflow.name`, project and episode. Assert that `buildWorkflowAssetCanonicalView()` returns one visible image asset, maps the legacy ID under the image ID, merges tags and records both logical IDs. Add separate assertions that different projects and ordinary manual assets remain separate.

```ts
const result = buildWorkflowAssetCanonicalView([legacyAsset, stableImage]);
assert.equal(result.assets.length, 1);
assert.equal(result.assets[0].id, stableImage.id);
assert.deepEqual(result.aliasIdsByCanonicalId.get(stableImage.id), [legacyAsset.id]);
assert.deepEqual(result.assets[0].tags.sort(), ["legacy", "stable"]);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/assets/workflow-asset-dedup.test.mts'
```

Expected: FAIL because `workflow-asset-dedup.ts` does not exist.

- [ ] **Step 3: Implement the pure canonical view**

Implement:

```ts
export type WorkflowAssetCanonicalView = {
    assets: Asset[];
    aliasIdsByCanonicalId: Map<string, string[]>;
};

export function buildWorkflowAssetCanonicalView(assets: Asset[]): WorkflowAssetCanonicalView;
export function workflowAssetDeleteIds(assetId: string, aliases: Map<string, string[]>): string[];
```

The grouping key must be `projectId + episodeId + normalized workflow name`; require non-empty scope and at least one stable logical ID matching `/^(CHAR|SCENE|PROP|COSTUME)-\d{3}$/`. Choose image first, then stable ID, then newest `updatedAt`, then ID. Merge tags, `metadata.generations`, `metadata.assetVersions`, missing note/source/cover, and stable `originalWorkflow`; record `aliasAssetIds` and `legacyLogicalAssetIds` without replacing image data.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Task 1 test command. Expected: all tests pass.

### Task 2: Prevent future old/new ID duplicates

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts:16-31`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts`

- [ ] **Step 1: Write a failing legacy reuse test**

Add a legacy asset with `logicalAssetId: prop_red_paper_airplane`, `name: 红色纸飞机`, and matching project/episode. Map an artifact containing stable `PROP-001` with the same name. Assert `targetAssetId` equals the legacy library asset ID and action is `update_metadata`.

- [ ] **Step 2: Run the mapping test and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts'
```

Expected: FAIL because mapping currently matches only import key or logical ID.

- [ ] **Step 3: Add scoped workflow-name fallback matching**

After exact import-key/logical-ID matching, search workflow assets with the same project, episode and normalized `originalWorkflow.name` (falling back to title). Do not match unscoped assets or assets from another project/episode.

- [ ] **Step 4: Run mapping tests and verify GREEN**

Run the Task 2 command. Expected: all mapping tests pass.

### Task 3: Use canonical assets throughout the asset page

**Files:**
- Modify: `web/src/app/(user)/assets/use-asset-page-query.ts:48-58`
- Modify: `web/src/app/(user)/assets/page.tsx:120-311`
- Modify: `web/src/app/(user)/assets/use-asset-media-actions.ts:12-99`
- Modify: `web/src/app/(user)/assets/use-asset-bulk-actions.ts:8-73`
- Modify: `web/src/app/(user)/assets/workflow-asset-dedup.test.mts`

- [ ] **Step 1: Add failing delete-group assertions**

Assert that `workflowAssetDeleteIds(canonicalId, aliasMap)` returns the canonical ID and every alias ID exactly once, and a non-canonical ID returns only itself.

- [ ] **Step 2: Run the canonical-view test and verify RED**

Expected: FAIL until delete ID expansion is implemented.

- [ ] **Step 3: Connect canonical view to query, export and delete**

In `useAssetPageQuery`, canonicalize `supportedAssetList(assets)` before calculating counts, filters, search, pagination and `validAssets`, then return `assetAliasIdsByCanonicalId`.

Pass that map to media and bulk actions. Replace direct removal with:

```ts
workflowAssetDeleteIds(asset.id, assetAliasIdsByCanonicalId).forEach(removeAsset);
```

Because selection and export already consume `validAssets`, they will automatically exclude aliases.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/assets/workflow-asset-dedup.test.mts' \
  'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.test.mts' \
  'src/app/(user)/assets/asset-page-filters.test.mts' \
  'src/app/(user)/assets/asset-download.test.mts'
```

Expected: all tests pass.

### Task 4: Documentation and page verification

**Files:**
- Modify: `docs/pending-test.md`
- Review: `docs/todo.md`

- [ ] **Step 1: Document the testable change**

Add a pending-test entry stating that old semantic IDs and stable logical IDs are collapsed only within the same project/episode workflow scope, and that download/export/delete operate on the canonical group.

- [ ] **Step 2: Verify the real page behavior**

Load the local assets page with the screenshot-equivalent fixtures or existing browser data. Confirm the header total, type-group counts, search results, export-all payload and explicit delete all use one canonical record per concept.

- [ ] **Step 3: Final checks**

Run focused tests again and `git diff --check` on changed files. Do not run the full build unless explicitly requested.
