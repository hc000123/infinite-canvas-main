# Canvas Toolbar Auto Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant canvas top-bar actions, including the local settings shortcut, and make “整理画布” perform a deterministic connection-aware node layout before fitting the viewport.

**Architecture:** Keep layout calculation in a pure canvas utility and wire it through the existing page-actions hook. The top bar remains a presentation component and only removes obsolete props and actions.

**Tech Stack:** React, TypeScript, Zustand-backed canvas state, Node test runner.

---

### Task 1: Connection-aware canvas layout

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-auto-layout.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-auto-layout.test.mts`

- [x] Add focused cases for left-to-right connected layers, non-overlapping same-layer nodes, disconnected type lanes, cycles, and batch-child offset preservation.
- [x] Implement `organizeCanvasNodes(nodes, connections)` with stable topology and type ordering.

### Task 2: Wire true organization separately from fit-to-view

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-page-actions.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [x] Add `setNodes` to the page-action boundary.
- [x] Return `organizeCanvas` that updates node positions and then calls `fitCanvasViewport` with the organized result.
- [x] Keep `resetViewport` unchanged for the bottom fit control.

### Task 3: Remove redundant top-bar actions

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-top-bar.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [x] Remove the clickable episode badge and its callback prop.
- [x] Remove “生成图片” and “设置” from the quick-action row and hamburger menu.
- [x] Keep import, assets, organization, child-canvas navigation, save, undo, and redo.

### Task 4: Documentation and verification

**Files:**
- Modify: `docs/pending-test.md`

- [x] Record the top-bar cleanup and true organization behavior.
- [x] Run `git diff --check` and inspect the focused diff; do not run build or tests unless explicitly requested by the user.
