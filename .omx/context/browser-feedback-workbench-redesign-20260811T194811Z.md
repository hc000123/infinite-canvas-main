# Task statement

Complete all product and UI changes requested through the browser comments in this thread without waiting for further decisions.

# Desired outcome

- The six-stage episode workflow is compact, automatic where requested, and does not duplicate information or require unnecessary approvals.
- Workflow assets and the local asset center are one source of truth, with direct upload/generate/voice-match/bind-existing actions.
- Storyboards are natural-language, scrollable shot rows; image generation is asset-only and distinct from storyboard production.
- Project context survives navigation to control, assets, storyboard, prompts, and back.
- Cache supports selected downloads and generated-video prompt inspection.
- Prompt library is a top-level destination showing company prompts plus personal prompts and folders, organized into scene/prop/character/video/text and custom tags.
- The obsolete server-backed admin/public asset library is removed while browser-local assets remain intact.

# Known facts and evidence

- The worktree contains implementation and tests for all major browser-feedback groups, plus design and implementation documents under `docs/superpowers/`.
- The server-backed public asset library has already been removed, tested, rebuilt, and browser-verified; old database data is not actively deleted.
- The app uses Next.js App Router, React, TypeScript, Ant Design, Tailwind, Zustand/localforage, and Go/Gin/GORM.
- The Docker production app is served on `http://localhost:3000` with `./data` mounted for persistence.

# Constraints

- Preserve unrelated dirty-worktree changes and never reset or overwrite user work.
- Do not trigger real image/video generation, paid model calls, or delete business data.
- Keep local assets in localforage; do not reintroduce server-backed common asset tables.
- Keep video generation manual and keep prior-shot tail frames as ordinary continuity references only.
- Use minimal, direct code consistent with existing architecture and update `docs/todo.md` and `docs/pending-test.md`.

# Unknowns / open verification

- Whether every implementation group passes its focused tests together in the current dirty worktree.
- Whether cross-group TypeScript, Go, production build, Docker, and browser paths remain compatible.
- Whether visible labels and navigation still expose obsolete or duplicate concepts after integration.

# Likely codebase touchpoints

- `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/`
- `web/src/app/(user)/agent/`, `storyboard/`, `assets/`, `cache/`, `image/`, `prompts/`
- `web/src/components/layout/`, `web/src/stores/`, `web/src/services/api/`
- `web/src/app/(admin)/admin/prompts/`, admin layout and settings
- Go handlers/services/repositories for project cache, usage export, workflow asset projection, prompt taxonomy, and media upload
- `docs/pending-test.md`, `docs/todo.md`, `CHANGELOG.md`
