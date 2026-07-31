# Tool Stability and Hot-Path Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Skill lifecycle dead end and reduce avoidable Skill registry and canvas hot-path work.

**Architecture:** Keep existing APIs and stores. Add small pure helpers for draft planning and canvas hierarchy selection, batch existing Skill repository reads, and narrow the canvas store subscription to direct children.

**Tech Stack:** Go, GORM, Next.js App Router, React, TypeScript, TanStack Query, Zustand.

---

### Task 1: Recover empty Skill definitions

**Files:**
- Modify: `web/src/app/(admin)/admin/skills/skill-view.ts`
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/skills/page.tsx`

- [x] Add a pure draft-plan helper that returns `1.0.0` without a source version and the next patch for an existing source.
- [x] Let the draft mutation fetch the newest source package when no version is active, or use a default package when no versions exist.
- [x] Enable “新草稿” whenever a Skill is selected.
- [x] Apply the same empty-version recovery and archived read-only behavior to project Skill management.

### Task 2: Batch Skill registry reads

**Files:**
- Modify: `repository/skill.go`
- Modify: `service/skill.go`

- [x] Add repository batch readers for versions, evaluations, audits, and referenced recommended versions.
- [x] Group batch results by Skill and preserve current ordering and per-owner audit limits inside database queries.
- [x] Scope workflow binding reads to the selected Skill version IDs.
- [x] Remove request-time `EnsureSkillSeeds` calls because startup already performs seed initialization.

### Task 3: Make episode canvas hierarchy deterministic

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/episode-canvas-hierarchy.ts`
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [x] Resolve one explicit or deterministic fallback main canvas per project episode.
- [x] Use the shared predicate before promoting a fallback canvas or creating children.
- [x] Prevent secondary untyped canvases from becoming additional main canvases.

### Task 4: Narrow canvas subscriptions

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-workspace-stores.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [x] Replace the full canvas-project subscription with a shallow direct-child subscription.
- [x] Return the ready-to-render child-canvas summary from the workspace hook.
- [x] Remove filtering work from the canvas root page.

### Task 5: Document and inspect

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [x] Add manual checks for empty-version recovery, deterministic main-canvas selection, and list refresh behavior.
- [x] Review the final diff for unrelated changes and preserve existing user work.
