# Storyboard Production Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split storyboard editor with a natural-language shot stream, auto-advance approved breakdowns, present prompt-stage production packages, preserve project navigation context, and move runtime details into a compact floating console.

**Architecture:** Keep `WorkflowShotDraft` as the structured source of truth and add an optional `narrative` override for direct prose editing. Pure helpers decide automation and navigation; page components only render the stream, production package, and floating console. Existing prompt freshness hashing remains authoritative.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Ant Design, Tailwind, Zustand, Node test runner.

---

### Task 1: Project-aware navigation and duplicate overview removal

**Files:**
- Modify: `web/src/components/layout/app-top-nav.tsx`
- Modify: `web/src/app/(user)/projects/project-workspace-shell.tsx`
- Modify: `web/src/app/(user)/agent/agent-workspace.tsx`
- Test: `web/src/app/(user)/agent/agent-workspace-wiring.test.mts`

- [ ] Add failing source assertions that project paths and `projectId` queries produce contextual `/agent?projectId=...`, and that selected episodes do not render `AgentEpisodeOverview` or `AgentStageGates` above the workbench.
- [ ] Run `cd web && node --experimental-strip-types --test 'src/app/(user)/agent/agent-workspace-wiring.test.mts'`; expect the new assertions to fail.
- [ ] Add one shared `workspaceProjectId(pathname, searchParams)` helper and use it in both top bars for Agent and Assets destinations.
- [ ] Render project/episode summaries only while no concrete episode is selected.
- [ ] Re-run the focused test; expect PASS.

### Task 2: Automatic storyboard approval and package loading

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-automation.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-automation.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-shot-automation.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-draft.ts`

- [ ] Replace the existing human-gate test with failing cases for `approve` at `needs_review + gatePassed`, `load` at `approved + gatePassed`, and `idle` for failed gates or empty output.
- [ ] Run the focused automation test and verify RED.
- [ ] Implement a pure `nextWorkflowShotAction` decision and execute approval through `reviewWorkflowStage`, then load/apply through the existing package path.
- [ ] Materialize loaded shots as confirmed production packages; keep failures retryable and never auto-start breakdown extraction.
- [ ] Re-run focused automation and draft tests; expect PASS.

### Task 3: Natural-language storyboard model

**Files:**
- Modify: `web/src/app/(user)/video/use-video-package-store.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-narrative.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-narrative.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-production-state.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-production-state.test.mts`

- [ ] Write failing tests proving that a structured draft formats into one readable paragraph, an explicit narrative override wins, and editing it invalidates an existing prompt while leaving structured fields intact.
- [ ] Run both focused tests and verify RED.
- [ ] Add `narrative?: string` to `WorkflowShotDraft`, implement `workflowShotNarrative`, and update draft mutation to persist the prose override with `shotStatus: 'confirmed'`.
- [ ] Re-run focused tests; expect PASS.

### Task 4: Storyboard scroll and production package UI

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-storyboard-scroll.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-production-package.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-editor.tsx`
- Test: `web/src/app/(user)/agent/agent-workspace-wiring.test.mts`

- [ ] Add failing source assertions for the scroll component, production-package component, absence of `确认分镜`, and absence of the desktop queue column in storyboard/prompt modes.
- [ ] Run the source test and verify RED.
- [ ] Render all shots as horizontal prose cards in storyboard mode; expand a card in place to edit its narrative and save on blur.
- [ ] Render prompt mode as one selected-shot production package containing prose, references, continuity state, prompt review, and final prompt editing; do not render the structured form.
- [ ] Remove `shotStatus === confirmed` gating from prompt generation because loaded/edited packages are confirmed automatically.
- [ ] Re-run focused tests; expect PASS.

### Task 5: Floating runtime console

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-run-console.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/episode-workflow-workbench.tsx`
- Test: `web/src/app/(user)/agent/agent-workspace-wiring.test.mts`

- [ ] Add failing assertions for a fixed bottom-right translucent trigger and removal of the fixed 320px console grid column.
- [ ] Run the source test and verify RED.
- [ ] Add compact/expanded rendering to `WorkflowRunConsole`, place it as a fixed desktop overlay, and keep the existing mobile Drawer.
- [ ] Re-run the source test; expect PASS.

### Task 6: Documentation and verification

**Files:**
- Modify: `docs/pending-test.md`

- [ ] Update the current production-control acceptance item with automatic storyboard approval, prose scroll, production packages, floating console, contextual navigation, and duplicate-summary removal.
- [ ] Run all focused tests from Tasks 1-5.
- [ ] Run `git diff --check` on the touched files; expect no output.
