# Volcengine Video Upscale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canvas video upscaling through Volcengine VOD scene-based enhancement while reusing the existing Volcengine asset-review credentials and the image-upscale interaction model.

**Architecture:** Add a credential-free `videoUpscale` private setting beside the existing `volcengineAsset` credentials, then implement an isolated server-side job lifecycle for local input, VOD upload, `StartExecution`, `GetExecution`, result download, and retry. The canvas creates a rightward derived video node and connection using focused hooks/utilities that mirror image upscale without altering video-generation providers.

**Tech Stack:** Go, Gin, GORM, Volcengine Go SDK/universal signed API client, Next.js App Router, React, TypeScript, Ant Design, Zustand, localforage.

---

### Task 1: Video-upscale private setting and credential reuse

**Files:**
- Modify: `model/setting.go`
- Modify: `service/settings.go`
- Modify: `service/settings_test.go`
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Create: `web/src/app/(admin)/admin/settings/components/video-upscale-settings-section.tsx`
- Create: `web/src/app/(admin)/admin/settings/video-upscale-settings.test.mts`

- [ ] Write failing Go tests proving `videoUpscale` persists `enabled`, provider, VOD space, scenario, level and output defaults without copying AK/SK.
- [ ] Run `go test ./service -run 'Test.*VideoUpscaleSetting' -count=1` and confirm the missing setting contract fails.
- [ ] Add `VideoUpscaleSetting` with `Enabled`, `Provider`, `SpaceName`, `Scenario`, `EnhanceLevel`, `MaxTarget`, then normalize defaults to `volcengine`, `aigc`, `Standard`, `2k`.
- [ ] Write a failing source-contract test requiring the private form path, shared credential status, VOD console link and no AK/SK password input inside the new section.
- [ ] Run `node --experimental-strip-types --test 'src/app/(admin)/admin/settings/video-upscale-settings.test.mts'` from `web/` and confirm failure.
- [ ] Implement the private collapse section, TypeScript types, empty setting, normalization and warnings. Derive credential status only from `private.volcengineAsset.accessKeyConfigured` and `secretKeyConfigured`.
- [ ] Run the focused Go test, frontend contract test and `npm run typecheck` from `web/`.
- [ ] Commit the setting and UI as `feat: configure volcengine video upscale`.

### Task 2: Safe VOD connection test

**Files:**
- Create: `service/video_upscale_admin.go`
- Create: `service/video_upscale_admin_test.go`
- Modify: `handler/settings.go`
- Modify: `router/router.go`
- Modify: `router/router_test.go`
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`

- [ ] Write failing service tests with an injected VOD space reader proving the test reuses saved Volcengine AK/SK, requires a space name, returns a safe status and never creates a video-upscale job.
- [ ] Write a failing router test proving `POST /api/admin/settings/video-upscale-test` exists behind administrator authentication.
- [ ] Run focused service/router tests and verify failures are caused by the missing service and route.
- [ ] Implement `AdminTestVideoUpscale`: load normalized saved settings, validate shared AK/SK and VOD space, call only a read-only VOD space operation, and return provider/message without secrets.
- [ ] Add the admin handler, route and `testAdminVideoUpscale()` frontend function. Wire the button to current form values without saving settings first.
- [ ] Run focused Go tests, the frontend setting test and TypeScript check.
- [ ] Commit as `feat: test volcengine video upscale access`.

### Task 3: Persistent job model and input validation

**Files:**
- Create: `model/video_upscale.go`
- Create: `repository/video_upscale.go`
- Create: `repository/video_upscale_test.go`
- Modify: `repository/db.go`
- Create: `service/video_upscale.go`
- Create: `service/video_upscale_test.go`
- Modify: `docs/backend-database.md`

- [ ] Write failing repository tests for ownership, active-job recovery fields, status updates and preservation of Volcengine `Vid` / `RunId`.
- [ ] Write failing service tests for supported MP4/WebM/MOV input, maximum input size, valid target selection, aspect-ratio target calculation and source dimensions/duration extraction.
- [ ] Run focused repository/service tests and confirm the missing model and functions fail.
- [ ] Add `VideoUpscaleJob` with queued/uploading/processing/downloading/succeeded/failed lifecycle, source/target media metadata, private input path, public result path, VOD identifiers and safe diagnostics.
- [ ] Add repository save/get/user-get/list-active operations and migration registration.
- [ ] Implement upload persistence and validation with a provider interface and injected starter; allow 1080p for sub-1080p input and 2K for 1080p-to-sub-2K input, preserving aspect ratio.
- [ ] Document the exact `video_upscale_jobs` table and confirm credentials are not stored.
- [ ] Run focused tests and `git diff --check`.
- [ ] Commit as `feat: persist video upscale jobs`.

### Task 4: Volcengine upload, enhancement submission and polling

**Files:**
- Create: `service/video_upscale_volcengine.go`
- Create: `service/video_upscale_volcengine_test.go`
- Modify: `service/video_upscale.go`
- Modify: `service/video_upscale_test.go`

- [ ] Write failing adapter tests for VOD upload result mapping, `StartExecution` payload (`Config: aigc`, `EnhanceLevel: Standard`, target resolution, original FPS/audio), `GetExecution` status mapping, result URI resolution and safe upstream diagnostics.
- [ ] Run `go test ./service -run 'Test.*VolcengineVideoUpscale' -count=1` and confirm failure.
- [ ] Implement the Volcengine adapter using the project’s existing static credentials and signed universal client; reuse `volcengineAsset.AccessKey/SecretKey` and use `videoUpscale.SpaceName`.
- [ ] Implement the state machine: upload local input once, submit once, poll existing `RunId`, download successful output once, persist result, and never resubmit a paid upstream task after downstream failure.
- [ ] Ensure retries resume from the last durable phase: reuse `Vid`, reuse successful `RunId`, or re-download an existing result URL.
- [ ] Map only Volcengine error code, RequestId/RunId and safe Chinese copy into the job; never persist signed URLs beyond the private task row or expose request headers.
- [ ] Run focused adapter/lifecycle tests.
- [ ] Commit as `feat: process volcengine video upscale jobs`.

### Task 5: Authenticated video-upscale API

**Files:**
- Create: `handler/video_upscale.go`
- Create: `handler/video_upscale_test.go`
- Modify: `router/router.go`
- Modify: `router/router_test.go`
- Create: `web/src/services/api/video-upscale.ts`
- Create: `web/src/services/api/video-upscale.test.mts`

- [ ] Write failing handler tests proving capabilities contain no space/credentials, create enforces multipart limits and ownership, polling hides input paths, and retry preserves the same job ID.
- [ ] Write a failing router test for authenticated capabilities/create/get/retry endpoints.
- [ ] Implement `GET /api/v1/video-upscale/capabilities`, `POST /jobs`, `GET /jobs/:id`, and `POST /jobs/:id/retry` beside image-upscale routes.
- [ ] Add typed frontend API calls and a contract test fixing route names and secret-free response fields.
- [ ] Run focused Go and frontend API tests.
- [ ] Commit as `feat: expose video upscale api`.

### Task 6: Canvas derived-video interaction

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-video-upscale.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-video-upscale.test.mts`
- Create: `web/src/app/(user)/canvas/hooks/use-canvas-video-upscale-actions.ts`
- Create: `web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-media-node-controls.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/types.ts`

- [ ] Write failing utility tests for a rightward derived video node, one connection, preserved source node, target metadata and update-in-place on failure/retry/success.
- [ ] Write failing source-contract tests proving only populated video nodes show the real upscale action and that the modal contains source/target specification plus cloud billing notice.
- [ ] Run focused frontend tests and confirm failure.
- [ ] Implement `CanvasVideoUpscaleMetadata`, draft construction and job-to-node update helpers using the existing rightward placement and source metadata patterns.
- [ ] Implement the hook to load capabilities, create one child node, poll the same job, restore jobs on refresh, retry in place, cache the result with existing video-cache helpers and archive through the existing asset store.
- [ ] Add the video-node control and modal. Match image upscale naming, spacing, progress language and disabled-state behavior; do not add the action to empty video nodes.
- [ ] Wire the hook and modal through canvas assembly without adding video-upscale logic to existing video-generation hooks.
- [ ] Run focused tests and `npm run typecheck`.
- [ ] Commit as `feat: add canvas video upscale flow`.

### Task 7: Recovery, documentation and local verification

**Files:**
- Modify: `main.go` or the existing startup recovery entry that calls `RecoverInterruptedImageUpscaleJobs`
- Modify: `.env.example`
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`

- [ ] Write a failing service test proving startup recovery preserves submitted `RunId` jobs for polling and marks only non-resumable local phases retryable.
- [ ] Implement startup recovery and confirm it does not submit upstream work during application boot.
- [ ] Document that video upscale reuses Volcengine AK/SK and requires VOD space/permissions; add manual checks for connection test, 1080p/2K, refresh recovery, retry, derived node, asset archive and no duplicate paid job.
- [ ] Confirm `docs/todo.md` needs no new item because the implemented scope moves into `docs/pending-test.md`.
- [ ] Run focused Go tests for settings/admin/jobs/adapter/handler/router.
- [ ] Run focused frontend settings/API/canvas tests and `npm run typecheck`.
- [ ] Run `git diff --check`.
- [ ] Restart the local Go backend, verify the admin private-setting card and canvas video-node action in the browser without submitting a paid enhancement job.
- [ ] Commit as `docs: record video upscale verification`.

