# 星链云 SD2 视频渠道 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the independent `xinglian-cloud` model-channel protocol that submits, polls, preflights, and downloads SD2 video jobs through the existing internal video API.

**Architecture:** The backend owns the Starlink API Key and translates the project’s normalized `/videos` contract to SD2’s submit/fetch contract. The existing frontend continues to poll the project API, while public settings expose `xinglian-cloud` as the selected model protocol so video UI routes correctly.

**Tech Stack:** Go, Gin, existing model-channel settings, React/TypeScript, Ant Design, Node test runner.

---

### Task 1: Define the protocol and normalize channels

**Files:**
- Modify: `model/setting.go`
- Modify: `service/settings.go`
- Test: `service/settings_test.go`

- [ ] Add `ModelProtocolXinglianCloud` and preserve it in `normalizeModelProtocol`.
- [ ] Give a channel without explicit capabilities the `video`, `video_query`, and `preflight` capabilities when its protocol is `xinglian-cloud`.
- [ ] Write a Go test that saves a configured SD2 channel and asserts public settings expose `sd2-720p-fast` with protocol `xinglian-cloud`.
- [ ] Run `go test ./service -run Xinglian` and confirm the test fails before implementation, then passes afterwards.

### Task 2: Implement SD2 request, result, and balance adapters

**Files:**
- Create: `service/xinglian_video.go`
- Test: `service/xinglian_video_test.go`

- [ ] Write focused tests for service URL normalization, a converted submit payload, and status normalization for `queued`, `in_progress`, `completed`, and `failed`.
- [ ] Implement a pure request builder that emits `duration`, `metadata.ratio`, `metadata.enableSound`, and only HTTPS references.
- [ ] Implement fetch-response normalization that outputs the existing `id`, `status`, `video_url`, and `error` response shape.
- [ ] Implement a balance request helper used only for non-generating channel preflight.
- [ ] Run `go test ./service -run Xinglian` and confirm all adapter tests pass.

### Task 3: Route video lifecycle through the adapter and preserve task accounting

**Files:**
- Modify: `handler/ai.go`
- Modify: `service/ai_task.go`
- Test: `handler/ai_test.go`

- [ ] Write handler tests using `httptest` that verify submit reaches `/v1/video/submit/generate` with the server-side Bearer key, fetch reaches `/v1/video/fetch/{task_id}`, and completed results download from `metadata.url` through the existing safe proxy.
- [ ] Add protocol branches for create, task query, and video content; use existing ledger creation, credit consumption, failure refund, and response headers.
- [ ] Generalize the Ark-named ledger status update helpers only as needed so both Ark and Xinglian normalized responses can update the same task record.
- [ ] Run `go test ./handler ./service -run Xinglian` and confirm the focused integration tests pass.

### Task 4: Expose protocol in configuration and client typing

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Modify: `web/src/services/api/ai-channel-boundary.ts`
- Modify: `web/src/stores/use-config-store.ts`
- Test: `web/src/services/api/ai-channel-boundary.test.mts`

- [ ] Add `xinglian-cloud` to client protocol unions and preserve it when public model protocol mappings load.
- [ ] Add a “星链云 SD2” protocol option to the existing model-channel drawer; retain the existing API address, API Key, models, capabilities, and default-model controls.
- [ ] Add a test that verifies `xinglian-cloud` is not downgraded to `openai` when a video model is selected.
- [ ] Run `cd web && npx tsx --test src/services/api/ai-channel-boundary.test.mts` and confirm it passes.

### Task 5: Document the configured route and pending validation

**Files:**
- Modify: `docs/system-settings.md`
- Modify: `docs/pending-test.md`

- [ ] Document `xinglian-cloud`, its Base URL rule, supported SD2 models, and server-only API Key handling.
- [ ] Add a pending manual test for configuration, balance preflight, text-to-video generation, task polling, and completed-video download; note that reference media must already have HTTPS URLs.
