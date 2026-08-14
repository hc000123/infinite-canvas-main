# LAS Video Subtitle Erase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent, paid-safe LAS hard-subtitle erase action for populated canvas video nodes, producing a cached and archived derived video node without changing video upscale or interpolation behavior.

**Architecture:** Add a dedicated `video_subtitle_erase_jobs` lifecycle and HTTP API, while reusing the existing LAS client, TOS credentials, safe result downloader, media probe and canvas derivative-node patterns. Upload the source to TOS, generate an ephemeral signed HTTPS input URL for `las_subtitle_erase`, submit with the local job ID as `client_token`, poll the stored task ID, and immediately persist the 24-hour output URL. The frontend gets a separate modal, API module, hook and node metadata field.

**Tech Stack:** Go, Gin, GORM, Volcengine TOS SDK, LAS REST API, Next.js, React, TypeScript, Ant Design, Zustand, Node test runner.

---

### Task 1: Configuration, job model, migration and repository

**Files:**
- Modify: `model/setting.go`
- Create: `model/video_subtitle_erase.go`
- Modify: `repository/db.go`
- Create: `repository/video_subtitle_erase.go`
- Create: `repository/video_subtitle_erase_test.go`
- Modify: `service/settings.go`
- Modify: `service/settings_test.go`
- Modify: `docs/backend-database.md`

- [ ] **Step 1: Write failing repository and setting tests**

Add tests proving user ownership, active-job recovery, stable LAS identifiers, secret-preserving settings updates, and default `subtitleEraseEnabled: false`.

```go
func TestVideoSubtitleEraseJobOwnershipAndActiveRecovery(t *testing.T) {
    resetRepositoryTestDB(t)
    _, _ = SaveVideoSubtitleEraseJob(model.VideoSubtitleEraseJob{ID: "erase-1", UserID: "user-a", Status: model.VideoSubtitleEraseJobStatusProcessing})
    if _, ok, _ := GetUserVideoSubtitleEraseJob("user-b", "erase-1"); ok { t.Fatal("cross-user read") }
    active, err := ListActiveVideoSubtitleEraseJobs()
    if err != nil || len(active) != 1 { t.Fatalf("active=%v err=%v", active, err) }
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `go test ./repository ./service -run 'Test.*(VideoSubtitleErase|SubtitleEraseSetting)' -count=1`

Expected: FAIL because the model, repository and setting field do not exist.

- [ ] **Step 3: Add the minimal model and repository**

Define `VideoSubtitleEraseJobStatus` with `queued / uploading / processing / downloading / succeeded / failed`, and `VideoSubtitleEraseJob` fields from the design: ownership/source refs, private input/TOS fields, media specs, task/request IDs, lifecycle, result, price snapshot and safe errors.

Add to `VideoUpscaleSetting`:

```go
SubtitleEraseEnabled bool `json:"subtitleEraseEnabled"`
```

Add `&model.VideoSubtitleEraseJob{}` to `repository/db.go` AutoMigrate. Implement `SaveVideoSubtitleEraseJob`, `GetVideoSubtitleEraseJob`, `GetUserVideoSubtitleEraseJob`, and `ListActiveVideoSubtitleEraseJobs` following `repository/video_upscale.go`.

- [ ] **Step 4: Document the table and run GREEN tests**

Run: `go test ./repository ./service -run 'Test.*(VideoSubtitleErase|SubtitleEraseSetting)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add model/setting.go model/video_subtitle_erase.go repository/db.go repository/video_subtitle_erase.go repository/video_subtitle_erase_test.go service/settings.go service/settings_test.go docs/backend-database.md
git commit -m "feat: persist subtitle erase jobs"
```

### Task 2: Pricing, input validation and lifecycle service

**Files:**
- Create: `service/video_subtitle_erase_pricing.go`
- Create: `service/video_subtitle_erase_pricing_test.go`
- Create: `service/video_subtitle_erase.go`
- Create: `service/video_subtitle_erase_test.go`

- [ ] **Step 1: Write failing pure-function tests**

Cover `12.34s`, `60s`, unknown duration, accepted extensions and the 2K maximum boundary.

```go
func TestEstimateVideoSubtitleEraseCost(t *testing.T) {
    estimate, ok := estimateVideoSubtitleEraseCost(90)
    if !ok || estimate.BillableMinutes != 1.5 || estimate.CostCNY != 0.6 { t.Fatalf("%+v", estimate) }
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./service -run 'Test.*VideoSubtitleErase(Cost|Input|Create|Recover|Retry)' -count=1`

Expected: FAIL because pricing and lifecycle functions do not exist.

- [ ] **Step 3: Implement pure rules**

Use constants:

```go
const videoSubtitleEraseUnitPriceCNY = 0.4
const videoSubtitleErasePricingRuleVersion = "las-subtitle-erase-2026-08"
```

Accept the documented extensions, require probed dimensions at or below the 2K envelope, and calculate `durationSeconds / 60 * 0.4` without rounding the stored value.

- [ ] **Step 4: Add failing lifecycle tests**

Test that `CreateVideoSubtitleEraseJob` validates and probes before calling `videoSubtitleEraseJobStarter`, snapshots cost, persists local input, isolates users, and that restart recovery resumes only jobs with a durable task/result boundary. Test retry reuses the same job and increments `Attempt`.

- [ ] **Step 5: Implement minimal lifecycle service**

Provide:

```go
func CreateVideoSubtitleEraseJob(ctx context.Context, userID string, reader io.Reader, input VideoSubtitleEraseCreateInput) (model.VideoSubtitleEraseJob, error)
func GetUserVideoSubtitleEraseJob(userID, jobID string) (model.VideoSubtitleEraseJob, bool, error)
func RetryVideoSubtitleEraseJob(ctx context.Context, userID, jobID string) (model.VideoSubtitleEraseJob, error)
func RecoverInterruptedVideoSubtitleEraseJobs() error
func VideoSubtitleEraseCapabilities() VideoSubtitleEraseCapabilitiesResult
```

Reuse `videoUpscaleMetadataProbe` and the existing work directory under a `subtitle-erase` child directory. Capability availability requires video LAS enabled, subtitle erase enabled, LAS key configured, and TOS credentials/path ready.

- [ ] **Step 6: Run GREEN tests and commit**

Run: `go test ./service -run 'Test.*VideoSubtitleErase(Cost|Input|Create|Recover|Retry)' -count=1`

Expected: PASS.

```bash
git add service/video_subtitle_erase.go service/video_subtitle_erase_test.go service/video_subtitle_erase_pricing.go service/video_subtitle_erase_pricing_test.go
git commit -m "feat: define subtitle erase lifecycle"
```

### Task 3: LAS provider, TOS signed input and result persistence

**Files:**
- Modify: `service/video_upscale_volcengine.go`
- Modify: `service/video_upscale_volcengine_test.go`
- Create: `service/video_subtitle_erase_volcengine.go`
- Create: `service/video_subtitle_erase_volcengine_test.go`
- Modify: `main.go`

- [ ] **Step 1: Write failing LAS client parsing test**

Extend `lasTaskResponse.Data` to parse subtitle output:

```go
VideoURL string  `json:"video_url"`
Duration float64 `json:"duration"`
```

The test must prove existing upscale/interpolation fields still parse.

- [ ] **Step 2: Write failing provider tests**

Use a fake provider to assert upload, stable signed HTTPS input, Submit payload and Poll behavior:

```go
want := map[string]interface{}{
    "operator_id": "las_subtitle_erase",
    "operator_version": "v1",
    "data": map[string]interface{}{"video_url": "https://signed.example/input.mp4", "client_token": "erase-1"},
}
```

Cover `RUNNING`, `COMPLETED`, `FAILED`, result download retry and same-token recovery after uncertain submission.

- [ ] **Step 3: Verify RED**

Run: `go test ./service -run 'Test.*(LAS.*Subtitle|VideoSubtitleEraseProvider|ProcessVideoSubtitleErase)' -count=1`

Expected: FAIL because provider and worker do not exist.

- [ ] **Step 4: Implement provider and worker**

Define a focused provider interface with `Upload`, `SignedInputURL`, `Start`, `Poll`. Store only `tos://bucket/key`; generate the signed URL immediately before Submit. Use `video-subtitle-erase/input/<job-id>.<ext>`, `client_token = job.ID`, and the shared LAS client.

Persist results through the existing safe public-HTTP downloader rules into `/api/uploaded-assets/video-subtitle-erase/<job-id>.mp4`. Never persist signed query strings.

- [ ] **Step 5: Register restart recovery and run GREEN tests**

Call `RecoverInterruptedVideoSubtitleEraseJobs()` from `main.go` beside video upscale recovery.

Run: `go test ./service -run 'Test.*(LAS.*Subtitle|VideoSubtitleEraseProvider|ProcessVideoSubtitleErase)' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add service/video_upscale_volcengine.go service/video_upscale_volcengine_test.go service/video_subtitle_erase_volcengine.go service/video_subtitle_erase_volcengine_test.go main.go
git commit -m "feat: process LAS subtitle erase jobs"
```

### Task 4: HTTP routes and private-field protection

**Files:**
- Create: `handler/video_subtitle_erase.go`
- Create: `handler/video_subtitle_erase_test.go`
- Modify: `router/router.go`
- Modify: `router/router_test.go`

- [ ] **Step 1: Write failing handler and route tests**

Prove authentication, multipart validation, user ownership, retry routing, capability response, and that `inputPath`, TOS paths and signed URLs never appear in JSON.

- [ ] **Step 2: Verify RED**

Run: `go test ./handler ./router -run 'Test.*VideoSubtitleErase' -count=1`

Expected: FAIL because routes are absent.

- [ ] **Step 3: Implement minimal handlers and routes**

Register the four routes from the design. Follow `handler/video_upscale.go`: parse HTTP input only, call service, and return the project-standard `{ code, data, msg }` envelope.

- [ ] **Step 4: Run GREEN tests and commit**

Run: `go test ./handler ./router -run 'Test.*VideoSubtitleErase' -count=1`

Expected: PASS.

```bash
git add handler/video_subtitle_erase.go handler/video_subtitle_erase_test.go router/router.go router/router_test.go
git commit -m "feat: expose subtitle erase api"
```

### Task 5: Frontend API contract and derived-node model

**Files:**
- Create: `web/src/services/api/video-subtitle-erase.ts`
- Create: `web/src/services/api/video-subtitle-erase.test.mts`
- Modify: `web/src/app/(user)/canvas/types.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-video-subtitle-erase.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-video-subtitle-erase.test.mts`

- [ ] **Step 1: Write failing API and pure-node tests**

Assert exact route/multipart fields, status normalization, active-state detection, rightward child placement, title, connection and isolated `subtitleErase` metadata.

```ts
assert.equal(draft.node.title, "已擦字幕 · 镜 01");
assert.equal(draft.node.metadata?.subtitleErase?.jobId, "erase-1");
assert.equal(draft.node.metadata?.videoUpscale, undefined);
```

- [ ] **Step 2: Verify RED**

Run from `web`: `node --experimental-strip-types --test src/services/api/video-subtitle-erase.test.mts 'src/app/(user)/canvas/utils/canvas-video-subtitle-erase.test.mts'`

Expected: FAIL because modules and types are absent.

- [ ] **Step 3: Implement API module, metadata and pure transformations**

Define capabilities, public job response, create/get/retry calls, `CanvasVideoSubtitleEraseMetadata`, `buildVideoSubtitleEraseDraft`, `applyVideoSubtitleEraseJobToNode`, and active-state helper. Keep all pricing values server-provided.

- [ ] **Step 4: Run GREEN tests and commit**

Run the same Node command; expected PASS.

```bash
git add web/src/services/api/video-subtitle-erase.ts web/src/services/api/video-subtitle-erase.test.mts 'web/src/app/(user)/canvas/types.ts' 'web/src/app/(user)/canvas/utils/canvas-video-subtitle-erase.ts' 'web/src/app/(user)/canvas/utils/canvas-video-subtitle-erase.test.mts'
git commit -m "feat: model subtitle erase canvas results"
```

### Task 6: Canvas hook, modal and action wiring

**Files:**
- Create: `web/src/app/(user)/canvas/hooks/use-canvas-video-subtitle-erase-actions.ts`
- Create: `web/src/app/(user)/canvas/components/canvas-video-subtitle-erase-modal.tsx`
- Create: `web/src/app/(user)/canvas/components/canvas-video-subtitle-erase.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-info-modal.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-tool-actions.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [ ] **Step 1: Write failing wiring tests**

Test populated-video-only visibility, separate action callback, retry precedence, cost copy, 1080P warning, source suitability warning, and overlay wiring.

- [ ] **Step 2: Verify RED**

Run from `web`: `node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-video-subtitle-erase.test.mts'`

Expected: FAIL because action and modal are absent.

- [ ] **Step 3: Implement the hook**

Mirror the proven video-upscale lifecycle: fetch capabilities on open, fetch the source Blob, create one child node, poll one server job, download/cache result, archive with `addCanvasNodeToAssets`, recover active jobs after hydration, and retry on the same node.

- [ ] **Step 4: Implement restrained canvas UI**

Add a compact existing-theme modal with no custom visual system. Show source spec, output cap, `0.4 元/分钟` estimate from capabilities, paid confirmation and suitability warning. Add “擦字幕” beside video enhancement actions using a Lucide eraser/subtitles icon. Loading text must say “字幕擦除” rather than “超分”.

- [ ] **Step 5: Run GREEN tests and commit**

Run the same Node command; expected PASS.

```bash
git add 'web/src/app/(user)/canvas/hooks/use-canvas-video-subtitle-erase-actions.ts' 'web/src/app/(user)/canvas/components/canvas-video-subtitle-erase-modal.tsx' 'web/src/app/(user)/canvas/components/canvas-video-subtitle-erase.test.mts' 'web/src/app/(user)/canvas/components/canvas-page-overlays.tsx' 'web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx' 'web/src/app/(user)/canvas/components/canvas-node-inspector.tsx' 'web/src/app/(user)/canvas/components/canvas-node-content.tsx' 'web/src/app/(user)/canvas/components/canvas-node-info-modal.tsx' 'web/src/app/(user)/canvas/hooks/use-canvas-node-tool-actions.ts' 'web/src/app/(user)/canvas/[id]/canvas-client-page.tsx'
git commit -m "feat: add canvas subtitle erase action"
```

### Task 7: Admin enablement and documentation

**Files:**
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/settings/components/video-upscale-settings-section.tsx`
- Modify: `web/src/app/(admin)/admin/settings/video-upscale-settings.test.mts`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Write failing admin contract test**

Assert the settings type and form expose `subtitleEraseEnabled`, the card is named “LAS 视频处理”, and the copy makes clear that the same key supports independent video upscale, interpolation and subtitle erase capabilities.

- [ ] **Step 2: Verify RED**

Run from `web`: `node --experimental-strip-types --test 'src/app/(admin)/admin/settings/video-upscale-settings.test.mts'`

Expected: FAIL because the toggle and copy are absent.

- [ ] **Step 3: Implement minimal admin UI and docs**

Add the independent switch without moving credentials or changing existing field names. Record the feature in `pending-test.md`; do not claim it in `features.md` until user acceptance. Update `todo.md` to keep the larger production-chain goal visible.

- [ ] **Step 4: Run GREEN test and commit**

Run the same Node command; expected PASS.

```bash
git add web/src/services/api/admin.ts 'web/src/app/(admin)/admin/settings/components/video-upscale-settings-section.tsx' 'web/src/app/(admin)/admin/settings/video-upscale-settings.test.mts' docs/todo.md docs/pending-test.md
git commit -m "feat: configure LAS subtitle erase"
```

### Task 8: Focused verification and regression audit

**Files:**
- Modify if necessary: files changed by Tasks 1-7 only

- [ ] **Step 1: Run focused Go verification**

Run:

```bash
go test ./repository ./service ./handler ./router -run 'Test.*(VideoSubtitleErase|LAS.*Subtitle|SubtitleEraseSetting)' -count=1
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend verification**

Run from `web`:

```bash
node --experimental-strip-types --test \
  src/services/api/video-subtitle-erase.test.mts \
  'src/app/(user)/canvas/utils/canvas-video-subtitle-erase.test.mts' \
  'src/app/(user)/canvas/components/canvas-video-subtitle-erase.test.mts' \
  'src/app/(admin)/admin/settings/video-upscale-settings.test.mts'
```

Expected: PASS.

- [ ] **Step 3: Run adjacent video enhancement regression tests**

Run:

```bash
go test ./repository ./service ./handler ./router -run 'Test.*(VideoUpscale|Interpolation)' -count=1
cd web && node --experimental-strip-types --test \
  src/services/api/video-upscale.test.mts \
  'src/app/(user)/canvas/utils/canvas-video-upscale.test.mts' \
  'src/app/(user)/canvas/utils/video-upscale-cost.test.mts' \
  'src/app/(user)/canvas/components/canvas-video-upscale.test.mts'
```

Expected: PASS with no real LAS call.

- [ ] **Step 4: Run compile checks**

Run: `go test ./... -run '^$'` and from `web`, `npm run typecheck`.

Expected: PASS.

- [ ] **Step 5: Inspect diff and document paid-test boundary**

Run: `git diff --check` and inspect `git status --short`. Confirm no secret, signed URL, generated media or unrelated user file is staged. Do not call the real subtitle erase operator until the user separately confirms the paid sample.
