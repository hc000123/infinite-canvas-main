# Image Upscale Admin Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure administrator UI for persisting, testing, enabling, and disabling the existing Alibaba Cloud image-upscale integration.

**Architecture:** Extend the existing private settings JSON with an `imageUpscale` object and reuse the established secret-mask/restore pattern. Resolve one effective server-side configuration for both capabilities and job creation, and expose a separate admin-only STS identity test that never submits image work. Render the configuration as a page-private settings component without changing canvas generation logic.

**Tech Stack:** Go, Gin, GORM settings repository, Alibaba Cloud Go SDK, Next.js App Router, React, TypeScript, Ant Design.

---

### Task 1: Private settings contract and secret lifecycle

**Files:**
- Modify: `model/setting.go`
- Modify: `service/settings.go`
- Test: `service/settings_test.go`

- [ ] Add `ImageUpscaleSetting` with enabled, provider, three secret inputs, and three configured flags.
- [ ] Add failing service tests proving admin reads hide all three secrets and blank saves retain them.
- [ ] Normalize provider to `aliyun`, trim inputs, and set configured flags from stored secret values.
- [ ] Extend hide/restore helpers so no saved image-upscale secret is returned to the frontend.
- [ ] Run the focused settings tests and confirm they pass.

### Task 2: Effective runtime configuration and safe credential test

**Files:**
- Modify: `service/image_upscale_provider.go`
- Create: `service/image_upscale_admin.go`
- Modify: `service/image_upscale.go`
- Modify: `service/image_upscale_aliyun.go`
- Test: `service/image_upscale_provider_test.go`
- Test: `service/image_upscale_admin_test.go`
- Modify: `go.mod`
- Modify: `go.sum`

- [ ] Add failing tests for persisted-setting precedence, environment fallback before first save, disabled state, and secret restoration for tests.
- [ ] Resolve the effective provider configuration from persisted private settings, falling back to environment configuration only when the setting is unmanaged.
- [ ] Add an injectable Alibaba STS caller and `AdminTestImageUpscale` service that calls `GetCallerIdentity` without an image request.
- [ ] Ensure capabilities and job creation use the same effective enabled/configured state.
- [ ] Run focused service tests and confirm no job record is created by the credential test.

### Task 3: Admin API

**Files:**
- Modify: `handler/settings.go`
- Modify: `router/router.go`
- Modify: `router/router_test.go`
- Test: `handler/settings_test.go`

- [ ] Add a failing route test proving `POST /api/admin/settings/image-upscale-test` is admin protected.
- [ ] Add a request DTO containing only the image-upscale setting and a handler returning a safe status message.
- [ ] Register the route beside existing settings channel-test routes.
- [ ] Run focused handler and router tests.

### Task 4: Admin settings UI

**Files:**
- Create: `web/src/app/(admin)/admin/settings/components/image-upscale-settings-section.tsx`
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Modify: `web/src/services/api/admin.ts`
- Test: `web/src/app/(admin)/admin/settings/image-upscale-settings.test.mts`

- [ ] Add a failing source-contract test for the private form path, configured flags, password inputs, and test API.
- [ ] Extend TypeScript settings types, empty values, normalization, warning generation, and secret merge behavior.
- [ ] Implement the page-private collapse section using existing Ant Design tokens and saved-secret copy.
- [ ] Wire “测试连接” to the admin API using current form values without saving or mutating canvas data.
- [ ] Run the focused frontend tests.

### Task 5: Documentation and browser verification

**Files:**
- Modify: `.env.example`
- Modify: `docs/pending-test.md`

- [ ] Document that environment variables are initial server fallback and the admin UI is the normal configuration entry.
- [ ] Add manual verification for save, masked reload, partial overwrite, enable/disable, connection test, and existing canvas upscale entry.
- [ ] Run `git diff --check` and focused deterministic tests.
- [ ] Open `/admin/settings`, verify the private settings layout, and confirm no secret value appears in the DOM or API response.
- [ ] Open a canvas image node and verify the existing 2× / 4× modal still uses `/api/v1/image-upscale`.

