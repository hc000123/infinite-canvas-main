# Project Episode Asset Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project episodes the only workflow/canvas entry, introduce structured role/scene/prop asset subjects with multi-episode image variants, and let an episode canvas filter and batch-insert all applicable assets.

**Architecture:** Extend the existing local Zustand stores rather than creating a second asset database. Keep episode-code, asset-binding, subject grouping, episode filtering, and canvas hierarchy rules in pure utilities; wire them into the existing project page, asset editor/library, workflow archive, and canvas picker. Preserve the existing file-version model as media history under one image variant.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand, localForage, Node test runner.

---

### Task 1: Standard episode codes

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/script-management.ts`
- Modify: `web/src/app/(user)/canvas/stores/use-script-store.ts`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Create: `web/src/app/(user)/canvas/utils/script-episode-code.test.mts`

- [ ] Add a failing utility test asserting that `ep1` is rejected, `ep01` normalizes to `EP01`, `EP108` is valid, and duplicate codes in one project are rejected.
- [ ] Add required `code` to `ScriptEpisode`, implement `normalizeEpisodeCode`, `isValidEpisodeCode`, and project-scoped uniqueness checks in `addEpisode`/`updateEpisode`.
- [ ] Add a required “分集编号” field to the import modal with `EP01` placeholder and keep the existing title field free-form.
- [ ] Change project episode labels and video-workflow episode keys to use the saved code rather than deriving identity from title.
- [ ] Remove any import path that creates an episode from a canvas title without a standard code.

### Task 2: Asset subjects and structured image bindings

**Files:**
- Modify: `web/src/stores/use-asset-store.ts`
- Modify: `web/src/stores/asset-dedupe.ts`
- Create: `web/src/app/(user)/assets/asset-subjects.ts`
- Create: `web/src/app/(user)/assets/asset-subjects.test.mts`
- Modify: `web/src/app/(user)/assets/asset-episode.ts`

- [ ] Define `AssetCategory`, `AssetSubject`, and `AssetBinding`; persist `subjects` beside assets and folders.
- [ ] Implement `assetCategoryLabel`, `nextAssetSubjectCode`, `normalizeAssetBinding`, `ensureAssetSubject`, `subjectsWithAssets`, and `assetsForEpisode` as pure helpers.
- [ ] Add Store actions to create/update/remove subjects and bind/unbind assets. Removing a subject unbinds its files without deleting media.
- [ ] Merge an incoming binding only when a deduplicated existing asset is still unbound; never replace an explicit subject binding.
- [ ] Extend episode-key helpers to include every structured `assetBinding.episodeIds` value and handle `allEpisodes` separately.

### Task 3: Asset editor and project asset-center view

**Files:**
- Modify: `web/src/app/(user)/assets/components/asset-editor-modal.tsx`
- Modify: `web/src/app/(user)/assets/use-asset-editor-actions.ts`
- Create: `web/src/app/(user)/assets/components/asset-binding-fields.tsx`
- Create: `web/src/app/(user)/assets/components/asset-subject-section.tsx`
- Modify: `web/src/app/(user)/assets/use-asset-page-query.ts`
- Modify: `web/src/app/(user)/assets/components/asset-filter-panel.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`

- [ ] Add project, category, existing/new subject, variant name, and all-episodes/episode multi-select fields for image assets.
- [ ] Validate that the selected subject and episodes belong to the selected project; require category, subject, variant, and episode scope before an image enters the project asset view.
- [ ] Add category filtering and make structured bindings the primary source for type grouping, before workflow metadata or media kind fallback.
- [ ] Render image results as subject cards containing variant thumbnails, episode badges, tags, and file-version count.
- [ ] Keep unbound legacy/plain media visible in the ordinary file view with a clear “待分类” state, but exclude it from episode batch selection.
- [ ] Reuse the same binding fields for single-image editing; bulk-import UI may apply a common binding then override rows individually.

### Task 4: Normalize workflow assets into the subject model

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-artifact-mapping.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-card-model.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-panel.tsx`
- Modify: `web/src/app/(user)/assets/workflow-asset-image.ts`
- Create: `web/src/app/(user)/assets/workflow-asset-binding.ts`
- Create: `web/src/app/(user)/assets/workflow-asset-binding.test.mts`

- [ ] Map `character`, `scene`, and `prop` stable logical IDs to subjects in the current project.
- [ ] Map `costume.parentLogicalAssetId` to the character subject and use `variantName` as the image variant.
- [ ] Write the current real episode ID into `episodeIds`; never trust free-form episode labels from workflow output.
- [ ] Preserve uploaded/generated image files and existing version history while updating their structured binding.

### Task 5: Episode main canvas and one-level child canvases

**Files:**
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts`
- Create: `web/src/app/(user)/canvas/utils/episode-canvas-hierarchy.ts`
- Create: `web/src/app/(user)/canvas/utils/episode-canvas-hierarchy.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-toolbar.tsx`

- [ ] Add `canvasRole` and `parentCanvasId` to `CanvasProject` and Store actions `ensureEpisodeMainCanvas` and `createEpisodeChildCanvas`.
- [ ] Make each episode row expose “进入工作流” and “进入画布”; the latter creates or opens the unique main canvas.
- [ ] Remove project-level independent canvas creation/binding from the primary project page.
- [ ] Add “新建子画布” to main canvas only; child creation inherits project, episode, script snapshot, preset, and title prefix.
- [ ] Add main/child navigation to the canvas header and prevent child canvases from creating nested descendants or changing episode binding.

### Task 6: Episode-aware canvas asset picker and batch insertion

**Files:**
- Modify: `web/src/app/(user)/canvas/components/asset-picker-modal.tsx`
- Create: `web/src/app/(user)/canvas/components/episode-asset-picker.tsx`
- Create: `web/src/app/(user)/canvas/utils/episode-asset-node-layout.ts`
- Create: `web/src/app/(user)/canvas/utils/episode-asset-node-layout.test.mts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-assistant-write-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-insertion-actions.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`

- [ ] Read project and episode from the current canvas; do not render editable context controls.
- [ ] Filter images through `assetsForEpisode`, then by category and keyword; group results by subject and expose multi-select.
- [ ] Add “导入本集素材” with all visible variants selected by default and a review step for deselection.
- [ ] Build deterministic node groups in category order `character → scene → prop → other`, preserving each asset ID and version reference.
- [ ] Report individual media failures without cancelling successful inserts.

### Task 7: Classify canvas-uploaded and canvas-generated images

**Files:**
- Create: `web/src/app/(user)/canvas/components/canvas-asset-binding-modal.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-file-node-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-generated-asset-archive.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-asset-actions.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [ ] Keep project and episode read-only in the classification modal; require category, subject, variant, and episode scope.
- [ ] Show the modal after local image upload and before explicitly saving/generated image results into the structured project asset view.
- [ ] Allow the media node to remain on canvas when classification is cancelled, but do not treat the file as a classified project asset.
- [ ] Keep video/audio behavior unchanged except for existing project-folder placement.

### Task 8: Documentation and verification handoff

**Files:**
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`
- Reference: `docs/superpowers/specs/2026-07-25-project-episode-asset-management-design.md`

- [ ] Record standard episode codes, episode-first workflow/canvas entry, subject/variant management, multi-episode use, child canvases, and canvas batch import in `docs/pending-test.md`.
- [ ] Move or update a matching todo only if one already exists; do not duplicate roadmap items.
- [ ] Run focused tests for episode codes, subjects/bindings, workflow binding, canvas hierarchy, and node layout when explicitly requested under the repository test policy.
- [ ] Run `git diff --check` and inspect that unrelated files remain untouched.
