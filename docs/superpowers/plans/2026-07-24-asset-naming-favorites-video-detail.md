# Asset Naming, Favorites, and Video Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Name new canvas-generated assets by canvas/node/version, add persistent favorites with a dedicated filter, and replace the duplicated fixed-ratio video detail preview with one adaptive player.

**Architecture:** Extend the existing pure canvas asset builder with deterministic naming helpers and pass the real canvas title through current generation/archive hooks. Persist favorite state on the existing localForage-backed asset model, keep filtering in the existing query utility, and route toggle callbacks through the asset page. Keep video layout private to the detail drawer and derive its size from stored media dimensions.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand, localForage, Node test runner.

---

### Task 1: Canvas asset naming contract

**Files:**

- Modify: `web/src/app/(user)/canvas/utils/canvas-generated-asset.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generated-asset.ts`
- Modify: `web/src/app/(user)/canvas/types.ts`

- [ ] Add failing tests that require `画布名称 · 节点 007 · v3`, a persisted node number, media-version precedence, production-version fallback, and `v1` fallback.
- [ ] Run the focused test and confirm it fails because generated assets still use node title/prompt.
- [ ] Add `assetNodeNumber?: number`, a pure node-number resolver, a pure version resolver, and the shared generated-asset title formatter.
- [ ] Use the formatted title for generated image and video assets and include canvas title/number in source metadata.
- [ ] Re-run the focused test until green.

### Task 2: Connect real canvas title and stable node number

**Files:**

- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-generation-node-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-image-generation-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-video-generation-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-generation-retry-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-generated-asset-archive.ts`

- [ ] Add `canvasTitle` and current-node access to generation/archive options without changing project metadata.
- [ ] Resolve the node number from the latest node collection immediately before each archive.
- [ ] Write an assigned number back to node metadata so later versions reuse it.
- [ ] Pass the numbered node and canvas title to every image/video asset builder call, including retry and recovered-task archive paths.
- [ ] Run the canvas generated-asset and media-version tests.

### Task 3: Favorite model and filter

**Files:**

- Modify: `web/src/stores/use-asset-store.ts`
- Modify: `web/src/app/(user)/assets/asset-page-filters.test.mts`
- Modify: `web/src/app/(user)/assets/asset-page-filters.ts`
- Modify: `web/src/app/(user)/assets/use-asset-page-query.ts`
- Modify: `web/src/app/(user)/assets/use-asset-filter-actions.ts`

- [ ] Add a failing filter test showing that `favoriteOnly` returns only starred assets and composes with kind filtering.
- [ ] Run the focused filter test and confirm the missing behavior.
- [ ] Add `favorite?: boolean` to the persisted asset base type and `favoriteOnly` to the list filter contract.
- [ ] Add favorite state to the page query and page-reset filter actions.
- [ ] Re-run the focused filter tests until green.

### Task 4: Favorite interface

**Files:**

- Modify: `web/src/app/(user)/assets/components/asset-filter-panel.tsx`
- Modify: `web/src/app/(user)/assets/components/compact-video-asset-card.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-card.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`

- [ ] Add an always-available “收藏” CheckableTag beside type choices.
- [ ] Add accessible star buttons to compact video cards and other material rows, using existing theme variables.
- [ ] Route one `onToggleFavorite(asset)` callback from the page through the result section and update with `updateAsset`.
- [ ] Ensure star clicks stop propagation and do not alter current selection or open the drawer.
- [ ] Run typecheck and fix only favorite-interface wiring errors.

### Task 5: Single adaptive video player

**Files:**

- Modify: `web/src/app/(user)/assets/components/asset-drawer.tsx`

- [ ] For ordinary videos, skip the generic top preview and render title/tags before media.
- [ ] Render exactly one controlled video player using stored width/height for its aspect ratio.
- [ ] Constrain the element by drawer width and `70vh` instead of forcing 16:9/full width.
- [ ] Keep media information below the player and preserve all non-video detail branches.
- [ ] Verify a portrait and landscape asset in the browser, including playback controls and drawer scrolling.

### Task 6: Documentation and verification loop

**Files:**

- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] Record the naming, favorite/filter, and adaptive-player changes in pending test documentation; remove any matching completed todo item if present.
- [ ] Run focused tests for generated assets and asset filters.
- [ ] Run all web tests, TypeScript typecheck, lint, and production build.
- [ ] For each failure, classify it, apply the smallest scoped fix, and re-run the failed gate before dependent gates, up to five cycles.
- [ ] Inspect git diff/status and confirm no unrelated files changed.
