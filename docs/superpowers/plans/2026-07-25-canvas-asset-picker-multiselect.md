# Canvas Asset Picker Multiselect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent multi-selection, batch insertion, and comprehensive tab-specific filters to the canvas asset picker.

**Architecture:** Keep selection and batch import ownership in `AssetPickerModal`, while each tab supplies selectable items and its own filters. Move local asset filtering into a pure utility so project, episode, folder, category, favorite, keyword, and sort behavior stays testable and out of the React component.

**Tech Stack:** React, TypeScript, Ant Design, Tailwind, Zustand, TanStack Query

---

### Task 1: Local picker filtering

**Files:**
- Create: `web/src/app/(user)/canvas/utils/asset-picker-filter.ts`
- Create: `web/src/app/(user)/canvas/utils/asset-picker-filter.test.mts`

- [x] Define scope, category, folder, favorite, allowed-kind, keyword and sort inputs.
- [x] Filter project membership from structured asset binding or project folders.
- [x] Search title, tags, notes, source, variant and subject name, then sort by update time, creation time or natural title.
- [x] Add focused assertions for project / episode scope, unclassified assets, combined filters and sorting.

### Task 2: Unified modal selection and batch import

**Files:**
- Modify: `web/src/app/(user)/canvas/components/asset-picker-modal.tsx`

- [x] Store selected items in one keyed map and reset it only when the modal opens.
- [x] Replace click-to-insert cards with selectable cards and visible checkboxes.
- [x] Add a bottom action bar for selected count, clear and asynchronous batch import.
- [x] Preserve selections across tabs, filters and pagination; deduplicate local assets by ID.

### Task 3: Complete tab filters

**Files:**
- Modify: `web/src/app/(user)/canvas/components/asset-picker-modal.tsx`

- [x] Add category, subject, applicability and sort controls to the episode tab.
- [x] Add type, category, project scope, folder, favorite and sort controls to the local-assets tab.
- [x] Add multi-tag filtering to the remote library tab and keep server pagination.
- [x] Add select-all-result or select-current-page actions and reset controls.

### Task 4: Batch-safe canvas insertion

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-assistant-write-actions.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`

- [x] Make asset insertion awaitable and stop closing the picker after every single payload.
- [x] Add collision-safe image node IDs for rapid batch insertion.
- [x] Let the picker close only after the batch finishes or the user cancels.

### Task 5: Acceptance records

**Files:**
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`

- [x] Record multi-select, cross-tab persistence, filter coverage, reset, partial failure and batch layout checks.
- [x] Run `git diff --check`; leave build and automated test execution to an explicitly requested full validation pass.
