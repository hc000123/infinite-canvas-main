# Tencent MPS Video Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tencent MPS as a per-task video enhancement provider beside Volcengine LAS while preserving the existing canvas entry, derived-node lifecycle, recovery guarantees, and asset archival.

**Architecture:** Keep one `video_upscale_jobs` lifecycle and select an adapter from the job's frozen `provider`. Add isolated Tencent credentials and COS settings, use the official Tencent MPS and COS Go SDKs behind small wrappers, and expose provider-specific capabilities to the existing modal. Tencent uses preset templates and source-frame-rate output; Volcengine keeps its current quality and interpolation controls.

**Tech Stack:** Go, Gin, GORM, Tencent Cloud Go SDK (`mps/v20190612`), Tencent COS Go SDK v5, Next.js, React, TypeScript, Ant Design, Node test runner.

---

## File map

- `model/setting.go`: Tencent credentials, COS storage, prefixes, and default scene.
- `model/video_upscale.go`: provider-frozen Tencent scene/template/storage fields.
- `service/settings.go`: normalization, secret retention, and response masking.
- `service/video_upscale.go`: provider-aware validation, capabilities, creation, retry, and recovery.
- `service/video_upscale_volcengine.go`: LAS adapter and shared worker.
- `service/video_upscale_tencent.go`: COS upload, MPS submit/poll, result resolution, and safe connection test.
- `handler/video_upscale.go`: provider and Tencent scene multipart inputs.
- `handler/settings.go`, `router/router.go`: read-only Tencent configuration test endpoint.
- `web/src/services/api/admin.ts`: Tencent admin setting types and connection test.
- `web/src/services/api/video-upscale.ts`: provider capability and submit types.
- `web/src/app/(admin)/admin/settings/page.tsx`: form defaults, normalization, warnings, and test action.
- `web/src/app/(admin)/admin/settings/components/video-upscale-settings-section.tsx`: LAS and Tencent panels.
- `web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx`: per-task provider and scene selection.
- `web/src/app/(user)/canvas/hooks/use-canvas-video-upscale-actions.ts`: pass provider options without changing node creation.
- `docs/backend-database.md`, `docs/pending-test.md`, `docs/todo.md`: schema and testable-change records.

### Task 1: Persist and protect Tencent settings

**Files:**
- Modify: `model/setting.go`
- Modify: `service/settings.go`
- Test: `service/settings_test.go`

- [ ] **Step 1: Write failing settings tests**

Add one test that saves credentials and asserts the admin response clears values while configured flags remain true, plus one test that re-saves empty/masked values and preserves stored secrets.

```go
func TestTencentMPSVideoSecretsAreMaskedAndPreserved(t *testing.T) {
    saved := model.Settings{Private: model.PrivateSetting{TencentMPSVideo: model.TencentMPSVideoSetting{
        Enabled: true, SecretID: "id-secret", SecretKey: "key-secret",
        COSBucket: "media-1300000000", COSRegion: "ap-beijing",
    }}}
    // Save through existing settings helpers; assert returned secrets are empty,
    // configured flags are true, and a masked re-save retains repository values.
}
```

- [ ] **Step 2: Run RED**

Run: `go test ./service -run 'TestTencentMPSVideoSecrets' -count=1`

Expected: FAIL because the setting type and secret handling do not exist.

- [ ] **Step 3: Add minimal settings support**

```go
type TencentMPSVideoSetting struct {
    Enabled             bool   `json:"enabled"`
    SecretID            string `json:"secretId"`
    SecretKey           string `json:"secretKey"`
    SecretIDConfigured  bool   `json:"secretIdConfigured"`
    SecretKeyConfigured bool   `json:"secretKeyConfigured"`
    COSBucket           string `json:"cosBucket"`
    COSRegion           string `json:"cosRegion"`
    InputPrefix         string `json:"inputPrefix"`
    OutputPrefix        string `json:"outputPrefix"`
    DefaultScene        string `json:"defaultScene"`
}
```

Add `TencentMPSVideo` to `PrivateSetting`. Normalize whitespace, default region to `ap-beijing`, prefixes to `video-upscale/input/` and `video-upscale/output/`, enforce trailing slashes, and limit the scene to `comic/live/restore`. Extend masking and secret restoration like other private credential groups.

- [ ] **Step 4: Run GREEN**

Run: `go test ./service -run 'Test.*Settings|TestTencentMPSVideo' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add model/setting.go service/settings.go service/settings_test.go
git commit -m "feat: add Tencent MPS private settings"
```

### Task 2: Freeze provider choice and map Tencent templates

**Files:**
- Modify: `model/video_upscale.go`
- Modify: `handler/video_upscale.go`
- Modify: `service/video_upscale.go`
- Test: `handler/video_upscale_test.go`
- Test: `service/video_upscale_test.go`

- [ ] **Step 1: Write failing mapping and input tests**

```go
func TestTencentMPSTemplateID(t *testing.T) {
    cases := []struct{ scene, target string; want int64 }{
        {"comic", "1080p", 327004}, {"comic", "2k", 327006},
        {"live", "1080p", 327003}, {"live", "2k", 327005},
        {"restore", "1080p", 327022}, {"restore", "2k", 327023},
    }
    for _, tc := range cases {
        got, err := tencentMPSTemplateID(tc.scene, tc.target)
        if err != nil || got != tc.want { t.Fatalf("got %d err=%v want %d", got, err, tc.want) }
    }
}
```

Add handler coverage proving multipart `provider=tencent-mps` and `enhancementScene=comic` reach `VideoUpscaleCreateInput`; reject unknown providers/scenes before starting a job.

- [ ] **Step 2: Run RED**

Run: `go test ./service ./handler -run 'TestTencentMPS|TestVideoUpscaleCreateInput' -count=1`

Expected: FAIL because provider fields and mapping do not exist.

- [ ] **Step 3: Add frozen job fields and validation**

```go
EnhancementScene    string `json:"enhancementScene"`
TencentTemplateID   int64  `json:"tencentTemplateId"`
CloudBucket         string `json:"-"`
CloudRegion         string `json:"-"`
CloudInputPrefix    string `json:"-"`
CloudOutputPrefix   string `json:"-"`
TencentOutputObject string `json:"-" gorm:"type:text"`
```

Add `Provider` and `EnhancementScene` to create input. Volcengine retains existing quality/interpolation behavior. Tencent requires complete enabled settings, freezes COS/template fields, forces `FrameInterpolationMode="keep"`, clears LAS-only modes, and retains source audio. Reject unknown providers before saving the input file.

- [ ] **Step 4: Run GREEN**

Run: `go test ./service ./handler -run 'TestTencentMPS|TestVideoUpscaleCreateInput|TestCreateVideoUpscale' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add model/video_upscale.go handler/video_upscale.go handler/video_upscale_test.go service/video_upscale.go service/video_upscale_test.go
git commit -m "feat: add provider-aware video enhancement jobs"
```

### Task 3: Expose provider-specific capabilities

**Files:**
- Modify: `service/video_upscale.go`
- Test: `service/video_upscale_test.go`
- Test: `handler/video_upscale_test.go`

- [ ] **Step 1: Write a failing capabilities test**

With both fake settings configured, assert provider IDs are `volcengine-las` and `tencent-mps`, Tencent scenes are `comic/live/restore`, and only Volcengine reports interpolation.

- [ ] **Step 2: Run RED**

Run: `go test ./service ./handler -run 'TestVideoUpscaleCapabilities' -count=1`

Expected: FAIL because the response exposes one provider.

- [ ] **Step 3: Add provider records**

```go
type VideoUpscaleProviderCapability struct {
    ID                string   `json:"id"`
    Name              string   `json:"name"`
    Targets           []string `json:"targets"`
    EnhancementScenes []string `json:"enhancementScenes"`
    DefaultScene      string   `json:"defaultScene"`
    CostNotice        string   `json:"costNotice"`
    Interpolation     bool     `json:"interpolation"`
}
```

Return only complete enabled providers. Keep current top-level LAS fields for existing consumers, add `providers`, and set overall `enabled` when at least one provider is usable.

- [ ] **Step 4: Run GREEN**

Run: `go test ./service ./handler -run 'TestVideoUpscaleCapabilities' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add service/video_upscale.go service/video_upscale_test.go handler/video_upscale_test.go
git commit -m "feat: publish video enhancement provider capabilities"
```

### Task 4: Implement Tencent COS and MPS adapter

**Files:**
- Create: `service/video_upscale_tencent.go`
- Create: `service/video_upscale_tencent_test.go`
- Modify: `go.mod`
- Modify: `go.sum`

- [ ] **Step 1: Add official dependencies**

Run:

```bash
GOPROXY=https://goproxy.cn,direct go get github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/mps/v20190612 github.com/tencentyun/cos-go-sdk-v5
```

Expected: Tencent MPS and COS modules appear in `go.mod` and `go.sum`.

- [ ] **Step 2: Write failing adapter tests**

Use fake wrapper clients. Assert COS key construction, `ProcessMedia` template/storage/output path, task/request IDs, polling states, and output object parsing.

```go
func TestTencentMPSStartUsesFrozenTemplateAndCOSStorage(t *testing.T) {
    api := &fakeTencentMPSAPI{}
    provider := &tencentMPSVideoUpscaleProvider{mps: api, cos: &fakeTencentCOS{}}
    job := model.VideoUpscaleJob{
        ID: "job-1", TencentTemplateID: 327004,
        InputTOSURL: "cos://media-1300/video-upscale/input/job-1.mp4",
        CloudBucket: "media-1300", CloudRegion: "ap-beijing",
        CloudOutputPrefix: "video-upscale/output/",
    }
    runID, requestID, err := provider.StartUpscale(context.Background(), job)
    if err != nil || runID != "task-1" || requestID != "request-1" { t.Fatal(runID, requestID, err) }
}
```

- [ ] **Step 3: Run RED**

Run: `go test ./service -run 'TestTencentMPS' -count=1`

Expected: FAIL because adapter types do not exist.

- [ ] **Step 4: Implement SDK wrappers and provider**

```go
type tencentMPSAPI interface {
    Submit(context.Context, tencentMPSSubmitInput) (taskID, requestID string, err error)
    Poll(context.Context, string) (VideoUpscalePollResult, error)
}
type tencentCOSAPI interface {
    Upload(context.Context, string, io.Reader) error
    SignedGetURL(context.Context, string, time.Duration) (string, error)
    HeadBucket(context.Context) error
}
```

The production wrapper uses static credentials, uploads to the frozen input prefix, calls `ProcessMedia` with COS input/output and one transcode definition, polls `DescribeTaskDetail`, and returns a one-hour signed HTTPS result. Tencent interpolation methods return unsupported errors and are never called for frozen `keep` jobs.

- [ ] **Step 5: Run GREEN**

Run: `go test ./service -run 'TestTencentMPS' -count=1`

Expected: PASS without network calls.

- [ ] **Step 6: Commit**

```bash
git add go.mod go.sum service/video_upscale_tencent.go service/video_upscale_tencent_test.go
git commit -m "feat: add Tencent MPS video enhancement adapter"
```

### Task 5: Resume each job with its frozen provider

**Files:**
- Modify: `service/video_upscale_volcengine.go`
- Modify: `service/video_upscale.go`
- Test: `service/video_upscale_volcengine_test.go`
- Test: `service/video_upscale_tencent_test.go`

- [ ] **Step 1: Write failing selection/recovery tests**

Save a Tencent job with an existing Task ID, start recovery, and assert submit count stays zero while poll count becomes one. Also assert changing current admin defaults never changes the job provider.

- [ ] **Step 2: Run RED**

Run: `go test ./service -run 'Test.*Recovery|Test.*ProviderSelection|TestProcessVideoUpscale' -count=1`

Expected: FAIL because the starter always creates Volcengine.

- [ ] **Step 3: Add provider selection and neutral errors**

```go
func currentVideoUpscaleProvider(job model.VideoUpscaleJob) (VideoUpscaleProvider, error) {
    switch job.Provider {
    case "volcengine-las": return currentVolcengineVideoUpscaleProvider()
    case "tencent-mps": return currentTencentMPSVideoUpscaleProvider(job)
    default: return nil, errors.New("unsupported video upscale provider")
    }
}
```

Load the job before selecting its provider. Replace worker messages mentioning 火山/TOS with provider-neutral Chinese messages. Recovery and retry retain `submission_uncertain`; only Volcengine enters interpolation stages.

- [ ] **Step 4: Run GREEN**

Run: `go test ./service -run 'Test.*Recovery|Test.*ProviderSelection|TestProcessVideoUpscale|TestTencentMPS' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add service/video_upscale.go service/video_upscale_volcengine.go service/video_upscale_volcengine_test.go service/video_upscale_tencent_test.go
git commit -m "feat: route enhancement jobs to their frozen provider"
```

### Task 6: Add a no-charge Tencent connection test

**Files:**
- Modify: `service/video_upscale_tencent.go`
- Modify: `service/settings.go`
- Modify: `handler/settings.go`
- Modify: `router/router.go`
- Test: `service/settings_test.go`
- Test: `handler/settings_test.go`

- [ ] **Step 1: Write failing connection-test tests**

```go
func TestAdminTestTencentMPSVideoDoesNotSubmitPaidTask(t *testing.T) {
    fake := &fakeTencentMPSAPI{pollErr: tencentTaskNotFoundError{}}
    result, err := adminTestTencentMPSVideo(context.Background(), setting, fake, &fakeTencentCOS{})
    if err != nil || !result.OK || fake.submitCount != 0 || fake.pollCount != 1 { t.Fatal(result, err) }
}
```

- [ ] **Step 2: Run RED**

Run: `go test ./service ./handler -run 'TestAdminTestTencentMPS' -count=1`

Expected: FAIL because service and route are absent.

- [ ] **Step 3: Implement read-only endpoint**

Add `POST /api/v1/admin/settings/test-tencent-mps-video`. Restore saved masked credentials, validate Bucket/region/prefixes, call COS `HeadBucket` and a read-only nonexistent task query, accept authenticated task-not-found, and return `{ok:true,message:"腾讯 MPS 与 COS 配置可用"}`. Never call `ProcessMedia` or return signed URLs/credentials.

- [ ] **Step 4: Run GREEN**

Run: `go test ./service ./handler -run 'TestAdminTestTencentMPS' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add service/video_upscale_tencent.go service/settings.go service/settings_test.go handler/settings.go handler/settings_test.go router/router.go
git commit -m "feat: add safe Tencent MPS connection test"
```

### Task 7: Add Tencent settings to admin UI

**Files:**
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Modify: `web/src/app/(admin)/admin/settings/components/video-upscale-settings-section.tsx`
- Test: `web/src/app/(admin)/admin/settings/video-upscale-settings.test.mts`

- [ ] **Step 1: Write failing UI contract tests**

```ts
test("video settings expose isolated Tencent MPS credentials and COS storage", () => {
  assert.match(sectionSource, /腾讯 MPS 视频增强/);
  assert.match(sectionSource, /secretId/);
  assert.match(sectionSource, /cosBucket/);
  assert.match(sectionSource, /defaultScene/);
  assert.match(pageSource, /testAdminTencentMPSVideo/);
});
```

- [ ] **Step 2: Run RED**

Run: `cd web && bun test src/app/'(admin)'/admin/settings/video-upscale-settings.test.mts`

Expected: FAIL because Tencent fields are absent.

- [ ] **Step 3: Implement compact panel**

Keep one “视频处理” card with separate “火山 LAS” and “腾讯 MPS” sections. Use a segmented control for default scene, inputs for Bucket/region/prefixes, password inputs with configured placeholders, and a Tencent-only test button. Add form defaults, normalization, warnings, and API types/action in `page.tsx`; add no global CSS.

- [ ] **Step 4: Run GREEN**

Run: `cd web && bun test src/app/'(admin)'/admin/settings/video-upscale-settings.test.mts && bun run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/api/admin.ts web/src/app/'(admin)'/admin/settings/page.tsx web/src/app/'(admin)'/admin/settings/components/video-upscale-settings-section.tsx web/src/app/'(admin)'/admin/settings/video-upscale-settings.test.mts
git commit -m "feat: configure Tencent MPS video enhancement"
```

### Task 8: Add per-task provider selection to canvas

**Files:**
- Modify: `web/src/services/api/video-upscale.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-video-upscale-actions.ts`
- Test: `web/src/app/(user)/canvas/components/canvas-video-upscale.test.mts`
- Test: `web/src/app/(user)/canvas/components/canvas-video-capability-integration.test.mts`

- [ ] **Step 1: Write failing interaction tests**

```ts
test("Tencent selection shows scenes and sends provider-specific fields", () => {
  assert.match(modalSource, /腾讯 MPS/);
  assert.match(modalSource, /漫剧增强/);
  assert.match(modalSource, /真人增强/);
  assert.match(modalSource, /老片修复/);
  assert.match(apiSource, /form\.append\("provider"/);
  assert.match(apiSource, /form\.append\("enhancementScene"/);
});
```

Also assert single-provider auto-selection, Tencent cost notice, and LAS-only controls remain under the Volcengine branch.

- [ ] **Step 2: Run RED**

Run: `cd web && bun test src/app/'(user)'/canvas/components/canvas-video-upscale.test.mts src/app/'(user)'/canvas/components/canvas-video-capability-integration.test.mts`

Expected: FAIL because capabilities and submit types are single-provider.

- [ ] **Step 3: Implement provider-aware state**

```ts
export type VideoUpscaleSubmitOptions = {
  provider: "volcengine-las" | "tencent-mps";
  enhancementScene?: "comic" | "live" | "restore";
  target: VideoUpscaleTarget;
  outputQualityMode: VideoUpscaleQualityMode;
  preserveAudio: boolean;
  frameInterpolationMode: VideoFrameInterpolationMode;
  interpolationMode: VideoInterpolationProcessingMode;
};
```

Auto-select the only provider, otherwise default to Volcengine. Show provider selection only with two providers. Tencent shows scene buttons and the server cost notice, forces `keep`, hides LAS quality/audio/interpolation estimates, and labels the CTA “开始腾讯 MPS 增强”. Volcengine UI remains unchanged.

- [ ] **Step 4: Run GREEN**

Run: `cd web && bun test src/app/'(user)'/canvas/components/canvas-video-upscale.test.mts src/app/'(user)'/canvas/components/canvas-video-capability-integration.test.mts && bun run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/api/video-upscale.ts web/src/app/'(user)'/canvas/components/canvas-video-upscale-modal.tsx web/src/app/'(user)'/canvas/hooks/use-canvas-video-upscale-actions.ts web/src/app/'(user)'/canvas/components/canvas-video-upscale.test.mts web/src/app/'(user)'/canvas/components/canvas-video-capability-integration.test.mts
git commit -m "feat: choose video enhancement provider per task"
```

### Task 9: Update schema and pending-test docs

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`

- [ ] **Step 1: Document schema**

Add Tencent private setting fields and `video_upscale_jobs` provider/template/COS snapshot fields to `docs/backend-database.md`; secrets are stored private and never returned as task fields.

- [ ] **Step 2: Record testable behavior**

Move an existing Tencent MPS todo if present and add a pending-test section covering admin configuration, per-task selection, three scenes, source-frame-rate output, no numeric Tencent estimate, recovery, and no paid automated calls.

- [ ] **Step 3: Check consistency**

Run:

```bash
rg -n "腾讯 MPS|tencent-mps|327004|327022" docs/backend-database.md docs/pending-test.md docs/todo.md
git diff --check
```

Expected: schema and pending tests mention the feature; no whitespace errors.

- [ ] **Step 4: Commit**

```bash
git add docs/backend-database.md docs/pending-test.md docs/todo.md
git commit -m "docs: record Tencent MPS enhancement testing"
```

### Task 10: Targeted acceptance and scope inspection

**Files:**
- Modify only files required to fix failures caused by Tasks 1-9.

- [ ] **Step 1: Run backend acceptance**

```bash
go test ./service ./handler ./repository -count=1
go vet ./...
go mod tidy -diff
```

Expected: PASS; no network or paid task is created.

- [ ] **Step 2: Run frontend acceptance**

```bash
cd web
bun test src/app/'(admin)'/admin/settings/video-upscale-settings.test.mts src/app/'(user)'/canvas/components/canvas-video-upscale.test.mts src/app/'(user)'/canvas/components/canvas-video-capability-integration.test.mts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect scope and secrets**

```bash
git diff --check
git status --short
git diff --stat main...HEAD
git diff main...HEAD | rg -n "Secret(Id|Key).*[:=].*['\"][^'\"]+|Authorization:|X-TC-" || true
```

Expected: only planned files changed, no credential/signed URL is present, and the worktree is clean after commits.

- [ ] **Step 4: Confirm acceptance left no uncommitted files**

Run: `git status --short`

Expected: no output. If a Task 1-9 regression was fixed during acceptance, repeat that task's focused GREEN command and commit only its listed files before running this check again.
