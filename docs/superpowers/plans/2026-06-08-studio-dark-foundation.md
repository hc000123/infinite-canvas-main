# Studio Dark Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first UI foundation pass for a professional, restrained, immersive Studio Dark AI film creation workspace.

**Architecture:** Keep the change in the design-system layer first: Ant Design theme tokens, global `studio-*` utilities, canvas theme tokens, and the shared user workspace shell. Page-specific rewrites and canvas tool information architecture stay in later phases.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand theme store, existing `canvasThemes`.

---

### Task 1: Global Theme Tokens

**Files:**
- Modify: `web/src/lib/app-theme.ts`

- [ ] Replace teal-centered Ant Design tokens with Studio Dark tokens.
- [ ] Keep light theme usable but make dark theme the authoritative visual target.
- [ ] Update Button, Menu, Select, Table, Card, Modal, Drawer, Tabs, Input, and Tooltip token defaults where useful.

### Task 2: Global Studio Utility Classes

**Files:**
- Modify: `web/src/app/globals.css`

- [ ] Add shared CSS variables for Studio Dark.
- [ ] Rework `studio-shell`, `studio-panel`, `studio-panel-muted`, `studio-card`, `studio-collapse`, prompt filter tags, and scrollbars to use the shared tokens.
- [ ] Avoid page-specific selectors beyond existing global utility classes.

### Task 3: Canvas Theme Tokens

**Files:**
- Modify: `web/src/lib/canvas-theme.ts`

- [ ] Update the dark canvas background, grid, node, and toolbar tokens to match Studio Dark.
- [ ] Keep light canvas theme usable and close to current behavior.

### Task 4: User Workspace Shell

**Files:**
- Modify: `web/src/app/(user)/projects/project-workspace-shell.tsx`

- [ ] Replace hard-coded cyan/slate shell colors with Studio Dark colors.
- [ ] Keep navigation structure and actions unchanged.
- [ ] Preserve the existing sidebar collapse behavior.

### Task 5: Documentation Check

**Files:**
- Inspect: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [ ] Add a pending-test entry for Studio Dark foundation verification.
- [ ] Do not move unrelated pending items.
- [ ] Do not run build or tests unless the user explicitly asks.
