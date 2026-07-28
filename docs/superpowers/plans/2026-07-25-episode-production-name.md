# Episode Production Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify episode display and downstream canvas/asset labels as cross-platform-safe `EP01-title` production names.

**Architecture:** Add one pure formatter beside the existing episode-code normalization and reuse it everywhere code and title are combined. Preserve the original episode title in storage while synchronizing existing episode main-canvas titles when they are reopened.

**Tech Stack:** TypeScript, React, Zustand, Node test runner

---

### Task 1: Add the production-name formatter

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/script-management.ts`
- Test: `web/src/app/(user)/canvas/utils/script-episode-code.test.mts`

- [x] Add assertions for `EP01-1`, whitespace normalization, punctuation cleanup, Chinese retention, and empty-title fallback.
- [x] Export `episodeProductionName(code, title)` using NFKC normalization and a Unicode letter/number allowlist.

### Task 2: Reuse the formatter in project and asset UI

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/assets/asset-episode.ts`
- Modify: `web/src/app/(user)/assets/components/asset-binding-fields.tsx`

- [x] Replace local `code · title` composition with `episodeProductionName`.
- [x] Keep status and project context as separate UI metadata rather than part of the production name.

### Task 3: Keep canvas names aligned

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts`

- [x] Pass the production name when creating or opening a main canvas.
- [x] Synchronize an existing main canvas title and episode snapshot when ensuring it.
- [x] Change generated child-canvas titles to a short-hyphen format.

### Task 4: Record acceptance coverage

**Files:**
- Modify: `docs/pending-test.md`

- [x] Add page checks for `EP01-1`, punctuation cleanup, asset episode options, and existing canvas title synchronization.
- [x] Run `git diff --check`; project policy leaves build and automated tests for explicitly requested full validation.
