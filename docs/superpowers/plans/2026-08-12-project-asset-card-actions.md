# Project Asset Card Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the active project when entering Assets and add direct upload, generation-workbench, and character voice matching actions to every subject card.

**Architecture:** Reuse the existing subject workbench for paid image generation, keep card uploads as non-destructive candidate images, and represent character voice choice as an audio asset relationship on `AssetSubject`. A small page-level action hook owns file upload and voice selection so cards remain presentational.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Ant Design, Tailwind, Zustand/localforage, existing image/file storage services, Node test runner.

---

### Task 1: Preserve project context in Assets navigation

**Files:**
- Modify: `web/src/components/layout/app-top-nav.tsx`
- Modify: `web/src/app/(user)/projects/project-workspace-shell.tsx`
- Modify: `web/src/app/(user)/assets/asset-project-filter-wiring.test.mts`
- Modify: `web/src/app/(user)/assets/[subjectId]/page.tsx`

- [ ] Add failing assertions that top navigation builds `/assets?projectId=...` from either a project path or a `projectId` query and that the subject back link retains `subject.projectId`.
- [ ] Run the focused wiring test and verify RED.
- [ ] Use the shared project-context helper in both top bars and preserve project ID in the subject workbench back link.
- [ ] Re-run the focused test; expect PASS.

### Task 2: Card action contract

**Files:**
- Modify: `web/src/app/(user)/assets/components/asset-subject-card.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`
- Create: `web/src/app/(user)/assets/asset-subject-card-actions.test.mts`

- [ ] Add failing source assertions for persistent `上传`, `生成`, and character-only `匹配声音` buttons plus callback props.
- [ ] Run the focused test and verify RED.
- [ ] Add explicit buttons, stop card navigation propagation, route Generate to `/assets/:subjectId`, and expose upload/voice callbacks through `AssetResultsSection`.
- [ ] Re-run the focused test; expect PASS.

### Task 3: Non-destructive card image upload

**Files:**
- Create: `web/src/app/(user)/assets/asset-subject-actions.ts`
- Create: `web/src/app/(user)/assets/asset-subject-actions.test.mts`
- Modify: `web/src/app/(user)/assets/page.tsx`

- [ ] Write a failing test for building a candidate `AssetWorkbenchImage` input from the subject primary variant and uploaded image without changing `currentAssetId`.
- [ ] Run the focused test and verify RED.
- [ ] Implement the pure input builder and page-level hidden image input; upload with `uploadImage`, then call `addWorkbenchImage` for the selected subject and primary variant.
- [ ] Re-run the focused test; expect PASS.

### Task 4: Character voice matching

**Files:**
- Modify: `web/src/stores/use-asset-store.ts`
- Modify: `web/src/app/(user)/assets/asset-subject-actions.ts`
- Modify: `web/src/app/(user)/assets/asset-subject-actions.test.mts`
- Create: `web/src/app/(user)/assets/components/asset-voice-match-modal.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`

- [ ] Add failing tests for a `voiceAssetId` subject patch and an audio asset binding scoped to the same project and character subject.
- [ ] Run the focused test and verify RED.
- [ ] Add optional `voiceAssetId` to `AssetSubject` and `updateSubject`, implement the pure binding patch, and add a modal listing current-project audio assets.
- [ ] Support uploading a new audio file through the existing media storage service, then bind it without triggering any generation.
- [ ] Re-run the focused test; expect PASS.

### Task 5: Documentation and verification

**Files:**
- Modify: `docs/pending-test.md`

- [ ] Add page acceptance steps for contextual Assets navigation, direct candidate upload, generation routing, and character voice binding.
- [ ] Run focused tests from Tasks 1-4.
- [ ] Run `git diff --check` on all touched files; expect no output.
