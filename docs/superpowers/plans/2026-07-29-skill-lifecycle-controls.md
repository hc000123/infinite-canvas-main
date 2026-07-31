# Skill Lifecycle Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Skill renaming, draft deletion, published-version archiving, and archived-version visibility controls to the admin Skill center.

**Architecture:** Reuse the existing Skill definition update and version lifecycle endpoints. Keep all UI state local to the admin Skill page and add only the two missing API wrappers.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, TanStack Query.

---

### Task 1: Add lifecycle API wrappers

**Files:**
- Modify: `web/src/services/api/admin-skills.ts`

- [x] Import `apiDelete`.
- [x] Add `archiveAdminSkillVersion(token, id)` using `POST /api/v1/skill-versions/:id/archive`.
- [x] Add `deleteAdminSkillVersion(token, id)` using `DELETE /api/v1/skill-versions/:id`.

### Task 2: Add Skill definition editing

**Files:**
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`

- [x] Add an edit button beside the active Skill title.
- [x] Open a modal prefilled with the active Skill name and summary.
- [x] Save through `updateAdminSkill`, refresh the registry, and display the updated name immediately.

### Task 3: Add version lifecycle actions

**Files:**
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`

- [x] Add a destructive confirmation action: draft versions show `删除草稿`; published versions show `停用版本`.
- [x] Call the matching lifecycle API, clear the active version selection, and refresh queries.
- [x] Disable normal actions for archived versions and render their status as `已停用`.

### Task 4: Hide archived versions by default

**Files:**
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`

- [x] Add a `显示已停用` switch in the version-track header.
- [x] Filter archived versions unless the switch is enabled.
- [x] Keep empty-state guidance when all versions are archived.

### Task 5: Record the testable change

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [x] Record the four user-visible behaviors and lifecycle safety rules in `docs/pending-test.md`.
- [x] Confirm no existing todo changes state; leave `docs/todo.md` unchanged.
- [x] Per project instructions, do not run syntax checks, builds, or tests unless the user requests them.
