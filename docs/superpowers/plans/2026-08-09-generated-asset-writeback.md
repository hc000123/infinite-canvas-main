# Generated Asset Writeback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache every generated media result while automatically writing back only results with an explicit asset, brief, setting, or shot destination.

**Architecture:** Add one pure policy helper that separates cache persistence from asset persistence. Reuse the existing asset workbench and asset revision payload builders for candidates and versions, and keep existing Brief, production-bible, storyboard, and shot-group reference updates intact.

**Tech Stack:** Next.js App Router, React, TypeScript, Zustand, localforage, Node test runner

---

### Task 1: Encode the canvas persistence policy

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-generated-asset-writeback.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-generated-asset-writeback.test.mts`

- [ ] **Step 1: Write the policy tests**

Cover generic canvas image/video results, image Brief and production-bible results, and storyboard/shot-group video results. Generic results must return `false`; explicit destinations must return `true`.

- [ ] **Step 2: Implement the minimal policy helper**

Export `shouldWriteGeneratedAsset(asset)` and inspect only stable IDs inside `asset.metadata.generation`; do not inspect titles, prompts, or tags.

- [ ] **Step 3: Review the test command without executing it**

Document the focused command `cd web && node --test --experimental-strip-types 'src/app/(user)/canvas/utils/canvas-generated-asset-writeback.test.mts'`. Project instructions reserve execution for explicit validation requests.

### Task 2: Separate cache persistence from asset writeback

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-generated-asset-archive.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [ ] **Step 1: Cache generated images before the asset policy decision**

Use a stable cache record ID based on the asset ID when one exists, otherwise the canvas/node/version identity. Keep cache failure non-blocking.

- [ ] **Step 2: Apply the writeback policy before `addAssetOnce`**

Return `undefined` for ordinary canvas results after caching. Preserve existing Brief, asset-breakdown, production-bible, storyboard, and shot-group result updates for explicit destinations.

- [ ] **Step 3: Stop ordinary results from opening the classification modal**

Only enqueue classification for records that were deliberately written to the asset store and still require classification.

### Task 3: Preserve asset-origin candidate and version behavior

**Files:**
- Modify: `web/src/app/(user)/image/page.tsx`
- Modify if required: `web/src/app/(user)/assets/[subjectId]/page.tsx`
- Modify if required: `web/src/app/(user)/assets/asset-workbench.ts`
- Test: `web/src/app/(user)/assets/asset-image-revision.test.mts`
- Test: `web/src/app/(user)/assets/asset-workbench.test.mts`

- [ ] **Step 1: Add regression coverage for inherited bindings and candidate destinations**

Assert that revised images preserve the original binding and that workbench candidates retain subject and variant identity when promoted.

- [ ] **Step 2: Automatically persist asset-revision generation results**

After a successful asset-origin generation, reuse `revisedImageAssetInput`, `addAssetOnce`, `boundVariantId`, and `setVariantCurrentAsset`. Do not run this branch for ordinary workbench generation.

- [ ] **Step 3: Keep workbench generation as candidate-first**

Reuse `addWorkbenchImage`; do not promote candidates to formal assets until the user selects one.

### Task 4: Update project-facing change records

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Reconcile the todo list**

Remove or adjust only an existing matching item. Do not add an unrelated todo.

- [ ] **Step 2: Add a pending-test entry**

Record the ordinary-canvas cache-only behavior, automatic asset-origin candidate/version writeback, and the manual checks required for both paths.

### Task 5: Inspect the completed diff

**Files:**
- Review all files changed by Tasks 1-4.

- [ ] **Step 1: Inspect only scoped changes**

Run `git diff --check` and `git diff -- <scoped files>`. Do not run syntax checks, builds, or tests unless the user explicitly requests validation.

- [ ] **Step 2: Report verification honestly**

State that tests were added but not executed under the project default, and list the focused test command for later validation.

