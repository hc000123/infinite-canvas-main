# Prompt Business Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single “system” prompt category with five business categories shared by admin management and the external prompt library.

**Architecture:** Keep `Prompt.Category` as the single server-filtered taxonomy field. Define the five categories in the repository, classify bundled seeds without overwriting edited prompt content, and expose matching constants to the two frontend pages.

**Tech Stack:** Go, GORM, Next.js App Router, React, TypeScript, Ant Design, TanStack Query, Node test runner.

---

### Task 1: Repository taxonomy and seed classification

**Files:**
- Modify: `repository/db.go`
- Modify: `repository/prompt_seed.go`
- Modify: `repository/prompt_test.go`

- [ ] Write failing repository tests asserting the exact five category codes and representative scene/character/prop seed categories.
- [ ] Run `go test ./repository -run 'TestPromptCategories|TestSeedSystemPrompts'` and confirm the old single-system expectation fails.
- [ ] Define the five `PromptCategory` entries and classify seeds from their stable IDs/node groups.
- [ ] Preserve edited content while converting only existing bundled prompts still carrying `system` or an empty category.
- [ ] Re-run the focused repository tests and confirm they pass.

### Task 2: Shared frontend taxonomy

**Files:**
- Create: `web/src/components/prompts/prompt-category.ts`
- Create: `web/src/components/prompts/prompt-category.test.mts`

- [ ] Write failing tests for the exact five options and Chinese labels.
- [ ] Run the focused Node test and confirm the module is missing.
- [ ] Add typed category options, label lookup and color lookup.
- [ ] Re-run the focused Node test and confirm it passes.

### Task 3: Admin prompt management

**Files:**
- Modify: `web/src/app/(admin)/admin/prompts/page.tsx`
- Create: `web/src/app/(admin)/admin/prompts/prompt-taxonomy-wiring.test.mts`

- [ ] Write a failing source contract test requiring “业务分类”, the fixed category options and free-form tag input.
- [ ] Run the test and confirm the old “分组” implementation fails.
- [ ] Replace dynamic system categories with the shared five options, require category selection, render colored category tags, and keep comma-separated custom tags.
- [ ] Remove the duplicate node-group/scenario controls while preserving advanced template fields.
- [ ] Re-run the focused test and admin prompt tests.

### Task 4: External prompt library category navigation

**Files:**
- Modify: `web/src/app/(user)/prompts/page.tsx`
- Modify: `web/src/app/(user)/prompts/prompt-project-selector.test.mts`

- [ ] Add a failing test requiring five backend category navigation entries and server category query wiring.
- [ ] Run the test and confirm the current source-only rail fails.
- [ ] Add backend category scope, counts and labels while retaining personal prompts/folders.
- [ ] Pass the selected category into `usePromptList` so the server remains the source of truth.
- [ ] Re-run prompt-related tests and TypeScript.

### Task 5: Documentation and release verification

**Files:**
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`
- Modify: `CHANGELOG.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] Record the five-category behavior and manual acceptance path.
- [ ] Run focused Go and frontend tests, TypeScript, production build and `git diff --check`.
- [ ] Rebuild `docker-compose.local.yml` and confirm the container is healthy.
- [ ] Verify `/admin/prompts` and `/prompts` in the local browser without creating paid generation tasks.
