# Tencent MPS Template Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only Tencent MPS enhancement-template synchronization, an administrator allowlist, and per-task template selection that freezes the chosen Definition ID without changing retry or billing safeguards.

**Architecture:** Persist a normalized template snapshot inside the existing private Tencent settings JSON. A new admin-only endpoint reads `DescribeTranscodeTemplates` with saved credentials and returns sanitized snapshots without saving; canvas capabilities expose only enabled/supported entries, and job creation resolves all trusted fields from that allowlist before any COS upload or paid `ProcessMedia` call.

**Tech Stack:** Go, Gin, GORM, Tencent Cloud MPS Go SDK, Next.js App Router, React, TypeScript, Ant Design, Bun test.

---

## File map

- `model/setting.go`: persisted Tencent template snapshot.
- `model/video_upscale.go`: frozen template display name on jobs.
- `service/video_upscale_tencent_templates.go`: seeds, normalization, merge, SDK pagination, allowlist lookup.
- `service/video_upscale_tencent_templates_test.go`: mapping, pagination, merge, allowlist tests.
- `service/settings.go`, `service/settings_test.go`: settings normalization and secret preservation.
- `service/video_upscale_admin.go`, `service/video_upscale_admin_test.go`: read-only sync service.
- `handler/settings.go`, `router/router.go`, `router/router_test.go`: admin sync route.
- `service/video_upscale.go`, `service/video_upscale_test.go`, `handler/video_upscale.go`: validate and freeze selected template.
- `web/src/services/api/admin.ts`, `web/src/services/api/video-upscale.ts`: frontend contracts.
- `web/src/app/(admin)/admin/settings/tencent-mps-template-settings.ts`: pure form merge helper.
- `web/src/app/(admin)/admin/settings/tencent-mps-template-settings.test.mts`: merge tests.
- `web/src/app/(admin)/admin/settings/components/tencent-mps-template-settings.tsx`: allowlist UI.
- `web/src/app/(admin)/admin/settings/components/video-upscale-settings-section.tsx`, `page.tsx`, `video-upscale-settings.test.mts`: settings wiring.
- `web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx`, `canvas-video-upscale.test.mts`: per-task template selection.
- `docs/backend-database.md`, `docs/pending-test.md`, `docs/todo.md`, `CHANGELOG.md`: documentation.

### Task 1: Persist and normalize Tencent template snapshots

**Files:**
- Modify: `model/setting.go`
- Create: `service/video_upscale_tencent_templates.go`
- Create: `service/video_upscale_tencent_templates_test.go`
- Modify: `service/settings.go`
- Modify: `service/settings_test.go`

- [ ] **Step 1: Write failing seed and merge tests**

```go
func TestNormalizeTencentMPSTemplatesSeedsBuiltIns(t *testing.T) {
    templates := normalizeTencentMPSTemplates(nil)
    if len(templates) != 6 { t.Fatalf("templates=%#v", templates) }
    for _, item := range templates {
        if item.Definition == 0 || !item.Enabled || !item.Supported || item.Target == "" { t.Fatalf("seed=%#v", item) }
    }
}

func TestMergeTencentMPSTemplatesPreservesAdminFields(t *testing.T) {
    saved := []model.TencentMPSTemplateSetting{{Definition: 400001, DisplayName: "我的清晰化", Scene: "custom", Target: "1080p", Enabled: true, Supported: true}}
    remote := []model.TencentMPSTemplateSetting{{Definition: 400001, UpstreamName: "Remote Name", SourceType: "Custom", Width: 1920, Height: 1080, Target: "1080p", Supported: true}}
    result := mergeTencentMPSTemplates(saved, remote)
    if len(result) != 1 || result[0].DisplayName != "我的清晰化" || !result[0].Enabled || result[0].UpstreamName != "Remote Name" { t.Fatalf("result=%#v", result) }
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `go test ./service -run 'TestNormalizeTencentMPSTemplates|TestMergeTencentMPSTemplates' -count=1`

Expected: compile failure because the template type and helpers do not exist.

- [ ] **Step 3: Add the persisted type**

```go
type TencentMPSTemplateSetting struct {
    Definition int64 `json:"definition"`
    UpstreamName string `json:"upstreamName"`
    DisplayName string `json:"displayName"`
    SourceType string `json:"sourceType"`
    Enabled bool `json:"enabled"`
    Scene string `json:"scene"`
    Target string `json:"target"`
    Width int `json:"width"`
    Height int `json:"height"`
    Codec string `json:"codec"`
    FPS int64 `json:"fps"`
    RemoveAudio bool `json:"removeAudio"`
    Supported bool `json:"supported"`
}
```

Add a `Templates []TencentMPSTemplateSetting` field tagged as `json:"templates"` to `TencentMPSVideoSetting`.

- [ ] **Step 4: Implement built-in seeds and normalization**

Create six deterministic seed entries for IDs `327004`, `327006`, `327003`, `327005`, `327022`, and `327023`. Implement:

```go
func normalizeTencentMPSTemplates(items []model.TencentMPSTemplateSetting) []model.TencentMPSTemplateSetting {
    if len(items) == 0 { return defaultTencentMPSTemplates() }
    result := make([]model.TencentMPSTemplateSetting, 0, len(items))
    seen := map[int64]bool{}
    for _, item := range items {
        if item.Definition <= 0 || seen[item.Definition] { continue }
        seen[item.Definition] = true
        item.UpstreamName = strings.TrimSpace(item.UpstreamName)
        item.DisplayName = firstNonEmpty(strings.TrimSpace(item.DisplayName), item.UpstreamName, fmt.Sprintf("模板 %d", item.Definition))
        item.SourceType = normalizeTencentTemplateSourceType(item.SourceType)
        item.Scene = normalizeTencentTemplateScene(item.Scene)
        item.Target = normalizeTencentTemplateTarget(item.Target)
        item.Codec = strings.ToLower(strings.TrimSpace(item.Codec))
        item.Supported = item.Supported && !item.RemoveAudio && (item.Target == "1080p" || item.Target == "2k")
        item.Enabled = item.Enabled && item.Supported
        result = append(result, item)
    }
    return result
}
```

Call it from `normalizeTencentMPSVideoSetting` in `service/settings.go`.

- [ ] **Step 5: Implement merge semantics**

```go
func mergeTencentMPSTemplates(saved, remote []model.TencentMPSTemplateSetting) []model.TencentMPSTemplateSetting {
    local := map[int64]model.TencentMPSTemplateSetting{}
    for _, item := range normalizeTencentMPSTemplates(saved) { local[item.Definition] = item }
    merged := make([]model.TencentMPSTemplateSetting, 0, len(remote))
    for _, item := range remote {
        if previous, ok := local[item.Definition]; ok {
            item.Enabled, item.DisplayName, item.Scene = previous.Enabled, previous.DisplayName, previous.Scene
        }
        merged = append(merged, item)
    }
    return normalizeTencentMPSTemplates(merged)
}
```

- [ ] **Step 6: Verify GREEN and secret masking**

Run: `go test ./service -run 'TestNormalizeTencentMPSTemplates|TestMergeTencentMPSTemplates|TestTencentMPSVideoSecretsAreMaskedAndPreserved' -count=1`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add model/setting.go service/settings.go service/settings_test.go service/video_upscale_tencent_templates.go service/video_upscale_tencent_templates_test.go
git commit -m "feat: persist Tencent MPS template snapshots"
```

### Task 2: Add the read-only sync endpoint

**Files:**
- Modify: `service/video_upscale_tencent_templates.go`
- Modify: `service/video_upscale_tencent_templates_test.go`
- Modify: `service/video_upscale_admin.go`
- Modify: `service/video_upscale_admin_test.go`
- Modify: `handler/settings.go`
- Modify: `router/router.go`
- Modify: `router/router_test.go`

- [ ] **Step 1: Write a failing pagination test**

```go
type fakeTencentTemplateAPI struct { requests []*mps.DescribeTranscodeTemplatesRequest; pages []*mps.DescribeTranscodeTemplatesResponse }
func (f *fakeTencentTemplateAPI) DescribeTranscodeTemplatesWithContext(_ context.Context, request *mps.DescribeTranscodeTemplatesRequest) (*mps.DescribeTranscodeTemplatesResponse, error) {
    f.requests = append(f.requests, request)
    return f.pages[len(f.requests)-1], nil
}
func TestListTencentMPSEnhancementTemplatesUsesReadOnlyPagination(t *testing.T) {
    fake := &fakeTencentTemplateAPI{pages: []*mps.DescribeTranscodeTemplatesResponse{
        tencentTemplatePage(150, tencentTemplate("400001", "自定义清晰化", "Custom", 1920, 1080, false)),
        tencentTemplatePage(150, tencentTemplate("400002", "自定义 2K", "Custom", 2560, 1440, false)),
    }}
    items, err := listTencentMPSEnhancementTemplates(context.Background(), fake)
    if err != nil || len(items) != 2 || len(fake.requests) != 2 { t.Fatalf("items=%#v requests=%d err=%v", items, len(fake.requests), err) }
    if pointerString(fake.requests[0].TranscodeType) != "Enhance" || *fake.requests[0].Limit != 100 || *fake.requests[1].Offset != 100 { t.Fatalf("requests=%#v", fake.requests) }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./service -run 'TestListTencentMPSEnhancementTemplates' -count=1`

Expected: compile failure because the SDK reader and list function do not exist.

- [ ] **Step 3: Implement bounded SDK pagination and mapping**

```go
type tencentMPSTemplateAPI interface {
    DescribeTranscodeTemplatesWithContext(context.Context, *mps.DescribeTranscodeTemplatesRequest) (*mps.DescribeTranscodeTemplatesResponse, error)
}

func listTencentMPSEnhancementTemplates(ctx context.Context, api tencentMPSTemplateAPI) ([]model.TencentMPSTemplateSetting, error) {
    result := []model.TencentMPSTemplateSetting{}
    seen := map[int64]bool{}
    for offset := uint64(0); offset < 500; offset += 100 {
        request := mps.NewDescribeTranscodeTemplatesRequest()
        limit := uint64(100)
        request.TranscodeType, request.Offset, request.Limit = stringPointer("Enhance"), &offset, &limit
        response, err := api.DescribeTranscodeTemplatesWithContext(ctx, request)
        if err != nil { return nil, err }
        if response == nil || response.Response == nil { return nil, errors.New("Tencent MPS template response is empty") }
        for _, upstream := range response.Response.TranscodeTemplateSet {
            item, ok := tencentMPSTemplateSetting(upstream)
            if ok && !seen[item.Definition] { seen[item.Definition] = true; result = append(result, item) }
        }
        if response.Response.TotalCount == nil || offset+100 >= *response.Response.TotalCount { break }
    }
    return result, nil
}
```

`tencentMPSTemplateSetting` must parse a positive Definition, copy only sanitized fields, classify exact adaptive dimensions `1920×1080` and `2560×1440`, and mark entries unsupported when video configuration is absent, audio is removed, or dimensions are outside scope.

- [ ] **Step 4: Write a failing admin-service test**

```go
func TestAdminSyncTencentMPSTemplatesRestoresSecretsWithoutPaidSubmit(t *testing.T) {
    setupAITaskTestDB(t)
    seedTencentSettings(t, "saved-id", "saved-key")
    fetcher := &recordingTencentTemplateFetcher{items: []model.TencentMPSTemplateSetting{{Definition: 400001, Supported: true, Target: "1080p"}}}
    previous := activeTencentMPSTemplateFetcher
    activeTencentMPSTemplateFetcher = fetcher
    t.Cleanup(func() { activeTencentMPSTemplateFetcher = previous })
    result, err := AdminSyncTencentMPSTemplates(context.Background(), model.TencentMPSVideoSetting{Enabled: true, SecretID: maskedAPIKey, SecretKey: maskedAPIKey, COSRegion: "ap-guangzhou"})
    if err != nil || fetcher.setting.SecretID != "saved-id" || fetcher.setting.SecretKey != "saved-key" || len(result) != 1 { t.Fatalf("result=%#v fetcher=%#v err=%v", result, fetcher, err) }
}
```

- [ ] **Step 5: Run and verify RED**

Run: `go test ./service -run 'TestAdminSyncTencentMPSTemplates' -count=1`

Expected: compile failure because the admin sync service does not exist.

- [ ] **Step 6: Implement service, handler, and route**

Add a replaceable fetcher and service that restores masked secrets, requires enabled Tencent settings, returns a safe error on upstream failure, and calls `mergeTencentMPSTemplates` without saving. The handler decodes only `model.TencentMPSVideoSetting` and returns `OK`. Register:

```go
admin.POST("/settings/tencent-mps-templates/sync", gin.WrapF(handler.AdminSyncTencentMPSTemplates))
```

- [ ] **Step 7: Verify GREEN and route registration**

```bash
go test ./service -run 'TestListTencentMPSEnhancementTemplates|TestAdminSyncTencentMPSTemplates' -count=1
go test ./router -run 'TestAdminTencentMPSTemplateSyncRouteRequiresAdminAuth' -count=1
```

Expected: PASS; no test calls `ProcessMedia`.

- [ ] **Step 8: Commit**

```bash
git add service/video_upscale_tencent_templates.go service/video_upscale_tencent_templates_test.go service/video_upscale_admin.go service/video_upscale_admin_test.go handler/settings.go router/router.go router/router_test.go
git commit -m "feat: sync Tencent MPS enhancement templates"
```

### Task 3: Validate and freeze a selected template

**Files:**
- Modify: `model/video_upscale.go`
- Modify: `service/video_upscale.go`
- Modify: `service/video_upscale_test.go`
- Modify: `handler/video_upscale.go`
- Modify: `service/video_upscale_tencent_templates.go`

- [ ] **Step 1: Write failing allowlist and freeze tests**

```go
func TestCreateTencentMPSJobFreezesEnabledTemplate(t *testing.T) {
    setupVideoUpscaleTest(t)
    saveTencentTemplateSettings(t, []model.TencentMPSTemplateSetting{{Definition: 400001, DisplayName: "自定义清晰化", Scene: "custom", Target: "1080p", Width: 1920, Height: 1080, Enabled: true, Supported: true}})
    job, err := CreateVideoUpscaleJob(context.Background(), "user-a", strings.NewReader(testVideoBytes), VideoUpscaleCreateInput{Filename: "input.mp4", ContentType: "video/mp4", Provider: "tencent-mps", TencentTemplateID: 400001})
    if err != nil || job.TencentTemplateID != 400001 || job.TencentTemplateName != "自定义清晰化" || job.EnhancementScene != "custom" || job.Target != "1080p" { t.Fatalf("job=%#v err=%v", job, err) }
}

func TestCreateTencentMPSJobRejectsDisabledTemplateBeforeCloudWork(t *testing.T) {
    setupVideoUpscaleTest(t)
    saveTencentTemplateSettings(t, []model.TencentMPSTemplateSetting{{Definition: 400001, Enabled: false, Supported: true, Target: "1080p"}})
    _, err := CreateVideoUpscaleJob(context.Background(), "user-a", strings.NewReader(testVideoBytes), VideoUpscaleCreateInput{Filename: "input.mp4", ContentType: "video/mp4", Provider: "tencent-mps", TencentTemplateID: 400001})
    if err == nil { t.Fatal("expected disabled-template error") }
    if countTencentJobs(t) != 0 { t.Fatal("job stored before allowlist validation") }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./service -run 'TestCreateTencentMPSJob.*Template' -count=1`

Expected: compile failure because input/job template fields do not exist.

- [ ] **Step 3: Add trusted template resolution**

Add `TencentTemplateID int64` to `VideoUpscaleCreateInput` and:

```go
TencentTemplateName string `json:"tencentTemplateName"`
```

to `model.VideoUpscaleJob`. Implement:

```go
func enabledTencentMPSTemplate(setting model.TencentMPSVideoSetting, definition int64) (model.TencentMPSTemplateSetting, error) {
    for _, item := range normalizeTencentMPSTemplates(setting.Templates) {
        if item.Definition == definition && item.Enabled && item.Supported { return item, nil }
    }
    return model.TencentMPSTemplateSetting{}, safeMessageError{message: "所选腾讯增强模板不可用，请重新同步或选择其他方案"}
}
```

Resolve it before creating the local input file. Freeze Definition, display name, scene, and target from the saved snapshot; do not trust frontend scene/target. Remove the hard-coded creation lookup.

- [ ] **Step 4: Parse multipart ID**

```go
templateID, _ := strconv.ParseInt(strings.TrimSpace(r.FormValue("tencentTemplateId")), 10, 64)
input.TencentTemplateID = templateID
```

- [ ] **Step 5: Verify GREEN and recovery behavior**

Run: `go test ./service -run 'TestCreateTencentMPSJob.*Template|TestTencentMPSRecoveryPollsExistingTaskWithoutSubmit|TestTencentMPSStartUsesFrozenTemplateAndCOSStorage' -count=1`

Expected: PASS and recovery performs zero submit calls.

- [ ] **Step 6: Commit**

```bash
git add model/video_upscale.go service/video_upscale.go service/video_upscale_test.go service/video_upscale_tencent_templates.go handler/video_upscale.go
git commit -m "feat: freeze selected Tencent enhancement template"
```

### Task 4: Expose enabled template capabilities

**Files:**
- Modify: `service/video_upscale.go`
- Modify: `service/video_upscale_test.go`
- Modify: `web/src/services/api/video-upscale.ts`

- [ ] **Step 1: Write a failing capability test**

```go
func TestVideoUpscaleCapabilitiesExposeOnlyEnabledTencentTemplates(t *testing.T) {
    setupVideoUpscaleTest(t)
    saveTencentTemplateSettings(t, []model.TencentMPSTemplateSetting{
        {Definition: 400001, DisplayName: "可用方案", Scene: "custom", Target: "1080p", Width: 1920, Height: 1080, Enabled: true, Supported: true},
        {Definition: 400002, DisplayName: "关闭方案", Target: "2k", Enabled: false, Supported: true},
    })
    provider := findTencentCapability(t, VideoUpscaleCapabilities())
    if len(provider.Templates) != 1 || provider.Templates[0].Definition != 400001 { t.Fatalf("provider=%#v", provider) }
}
```

- [ ] **Step 2: Run and verify RED**

Run: `go test ./service -run 'TestVideoUpscaleCapabilitiesExposeOnlyEnabledTencentTemplates' -count=1`

Expected: compile failure because provider capabilities have no `Templates` field.

- [ ] **Step 3: Add a sanitized capability DTO**

```go
type TencentMPSTemplateCapability struct {
    Definition int64 `json:"definition"`
    DisplayName string `json:"displayName"`
    Scene string `json:"scene"`
    Target string `json:"target"`
    Width int `json:"width"`
    Height int `json:"height"`
    Codec string `json:"codec"`
    FPS int64 `json:"fps"`
}
```

Add a `Templates []TencentMPSTemplateCapability` field tagged as `json:"templates"` to the provider capability and populate it from enabled/supported saved templates only. Do not expose source type, disabled IDs, secrets, or COS paths.

- [ ] **Step 4: Update frontend types and submit form**

```ts
export type TencentMPSTemplateCapability = {
    definition: number;
    displayName: string;
    scene: "comic" | "live" | "restore" | "custom";
    target: VideoUpscaleTarget;
    width: number;
    height: number;
    codec: string;
    fps: number;
};

form.append("tencentTemplateId", input.tencentTemplateId ? String(input.tencentTemplateId) : "");
```

Add `templates` to provider capabilities and `tencentTemplateId?: number` to submit options.

- [ ] **Step 5: Verify GREEN**

Run: `go test ./service -run 'TestVideoUpscaleCapabilitiesExposeOnlyEnabledTencentTemplates' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add service/video_upscale.go service/video_upscale_test.go web/src/services/api/video-upscale.ts
git commit -m "feat: expose Tencent template capabilities"
```

### Task 5: Manage synchronized templates in admin settings

**Files:**
- Modify: `web/src/services/api/admin.ts`
- Create: `web/src/app/(admin)/admin/settings/tencent-mps-template-settings.ts`
- Create: `web/src/app/(admin)/admin/settings/tencent-mps-template-settings.test.mts`
- Create: `web/src/app/(admin)/admin/settings/components/tencent-mps-template-settings.tsx`
- Modify: `web/src/app/(admin)/admin/settings/components/video-upscale-settings-section.tsx`
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Modify: `web/src/app/(admin)/admin/settings/video-upscale-settings.test.mts`

- [ ] **Step 1: Write failing form-merge tests**

```ts
test("sync preserves administrator fields by Definition", () => {
    const current = [{ definition: 400001, displayName: "我的方案", scene: "custom", enabled: true } as AdminTencentMPSTemplate];
    const remote = [{ definition: 400001, upstreamName: "Remote", displayName: "Remote", scene: "custom", enabled: false, target: "1080p", supported: true } as AdminTencentMPSTemplate];
    const result = mergeTencentTemplateSettings(current, remote);
    assert.equal(result[0].displayName, "我的方案");
    assert.equal(result[0].enabled, true);
    assert.equal(result[0].upstreamName, "Remote");
});

test("new synchronized templates remain disabled", () => {
    const result = mergeTencentTemplateSettings([], [{ definition: 400001, enabled: true, supported: true } as AdminTencentMPSTemplate]);
    assert.equal(result[0].enabled, false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `bun test 'src/app/(admin)/admin/settings/tencent-mps-template-settings.test.mts'`

Expected: module-not-found failure.

- [ ] **Step 3: Add API types, sync call, and merge helper**

Mirror every backend snapshot field in `AdminTencentMPSTemplate`, add `templates` to `AdminPrivateTencentMPSVideoSettings`, and add:

```ts
export async function syncAdminTencentMPSTemplates(token: string, setting: AdminPrivateTencentMPSVideoSettings) {
    return apiPost<AdminTencentMPSTemplate[]>("/api/admin/settings/tencent-mps-templates/sync", setting, token);
}

export function mergeTencentTemplateSettings(current: AdminTencentMPSTemplate[], remote: AdminTencentMPSTemplate[]) {
    const saved = new Map(current.map((item) => [item.definition, item]));
    return remote.map((item) => {
        const previous = saved.get(item.definition);
        return {
            ...item,
            enabled: previous ? previous.enabled && item.supported : false,
            displayName: previous?.displayName || item.displayName || item.upstreamName || `模板 ${item.definition}`,
            scene: previous?.scene || item.scene || "custom",
        };
    });
}
```

- [ ] **Step 4: Verify merge tests GREEN**

Run: `bun test 'src/app/(admin)/admin/settings/tencent-mps-template-settings.test.mts'`

Expected: 2 pass, 0 fail.

- [ ] **Step 5: Write a failing UI contract test**

Require the source to contain `同步腾讯模板`, `只读取模板，不创建任务`, `暂不支持`, `syncAdminTencentMPSTemplates`, and no sync-handler call to `saveAdminSettings`.

- [ ] **Step 6: Run and verify UI test RED**

Run: `bun test 'src/app/(admin)/admin/settings/video-upscale-settings.test.mts'`

Expected: FAIL because the sync component does not exist.

- [ ] **Step 7: Implement the compact allowlist component**

Use the existing Ant Design and theme conventions. Each row renders:

```tsx
<Switch disabled={!template.supported} checked={template.enabled} onChange={(enabled) => update(index, { enabled })} />
<Input value={template.displayName} onChange={(event) => update(index, { displayName: event.target.value })} />
<Segmented value={template.scene} options={sceneOptions} onChange={(scene) => update(index, { scene })} />
<Tag>{template.sourceType === "Preset" ? "官方" : "自定义"}</Tag>
<Tag>{template.supported ? template.target === "2k" ? "2K" : "1080p" : "暂不支持"}</Tag>
<Typography.Text type="secondary">ID {template.definition}</Typography.Text>
```

The header contains:

```tsx
<Button loading={syncing} onClick={onSync}>同步腾讯模板</Button>
<Typography.Text type="secondary">只读取模板，不创建任务；同步后仍需保存设置。</Typography.Text>
```

Do not add global CSS, shadows, gradients, or a separate wizard.

- [ ] **Step 8: Wire sync into the existing form without auto-save**

```ts
async function syncTencentTemplates() {
    const setting = normalizePrivateTencentMPSVideoSetting(form.getFieldValue(["private", "tencentMpsVideo"]));
    setSyncingTencentTemplates(true);
    try {
        const remote = await syncAdminTencentMPSTemplates(token, setting);
        form.setFieldValue(["private", "tencentMpsVideo", "templates"], mergeTencentTemplateSettings(setting.templates, remote));
        message.success(`已读取 ${remote.length} 个腾讯增强模板，请确认后保存设置`);
    } catch (error) {
        message.error(errorMessage(error));
    } finally {
        setSyncingTencentTemplates(false);
    }
}
```

Pass only `syncingTencentTemplates` and `syncTencentTemplates` through the existing section. Do not save from this handler.

- [ ] **Step 9: Verify admin tests and types**

```bash
bun test 'src/app/(admin)/admin/settings/tencent-mps-template-settings.test.mts' 'src/app/(admin)/admin/settings/video-upscale-settings.test.mts'
bun run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 10: Commit**

```bash
git add web/src/services/api/admin.ts 'web/src/app/(admin)/admin/settings'
git commit -m "feat: manage Tencent enhancement templates"
```

### Task 6: Select an enabled template in the canvas

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-upscale.test.mts`
- Modify: `web/src/services/api/video-upscale.ts`

- [ ] **Step 1: Write failing modal and submit tests**

Require `腾讯增强方案`, `providerCapability?.templates`, `selectedTencentTemplate?.definition`, and `form.append("tencentTemplateId"`; remove the assertion for combining `enhancementSceneOptions` and target.

- [ ] **Step 2: Run and verify RED**

Run: `bun test 'src/app/(user)/canvas/components/canvas-video-upscale.test.mts'`

Expected: FAIL because the modal still combines scene and target.

- [ ] **Step 3: Implement direct template selection**

```ts
const [tencentTemplateId, setTencentTemplateId] = useState(0);
const availableTencentTemplates = useMemo(
    () => (providerCapability?.templates || []).filter((item) => targetAllowedForShortEdge(item.target, shortEdge)),
    [providerCapability?.templates, shortEdge],
);
const selectedTencentTemplate = availableTencentTemplates.find((item) => item.definition === tencentTemplateId) || availableTencentTemplates[0];
```

Reset the ID to the first available entry when node/provider/capabilities change. Render:

```tsx
{isTencent ? <OptionRow label="腾讯增强方案"><Select
    className="w-full"
    value={selectedTencentTemplate?.definition}
    options={availableTencentTemplates.map((item) => ({ value: item.definition, label: `${item.displayName} · ${item.target === "2k" ? "2K" : "1080p"}` }))}
    onChange={setTencentTemplateId}
/></OptionRow> : null}
```

Submit the selected ID, scene, and target. Disable Tencent submission when no template is available. Keep all LAS-only controls hidden exactly as before.

- [ ] **Step 4: Verify GREEN and TypeScript**

```bash
bun test 'src/app/(user)/canvas/components/canvas-video-upscale.test.mts'
bun run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx' 'web/src/app/(user)/canvas/components/canvas-video-upscale.test.mts' web/src/services/api/video-upscale.ts
git commit -m "feat: choose Tencent template per video task"
```

### Task 7: Documentation and final no-charge verification

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update documentation**

Document `video_upscale_jobs.tencent_template_name`, the sync route, default-disabled discoveries, the 1080p/2K boundary, frozen jobs, and that no second paid Tencent task was submitted.

- [ ] **Step 2: Run backend verification**

```bash
gofmt -w model/setting.go model/video_upscale.go service/video_upscale_tencent_templates.go service/video_upscale_tencent_templates_test.go service/video_upscale_admin.go service/video_upscale_admin_test.go service/video_upscale.go service/video_upscale_test.go handler/settings.go handler/video_upscale.go router/router.go router/router_test.go
go test ./service -run 'TestTencentMPS|TestAdmin.*Tencent|TestNormalizeTencentMPSTemplates|TestMergeTencentMPSTemplates|TestVideoUpscaleCapabilitiesExposeOnlyEnabledTencentTemplates|TestCreateTencentMPSJob.*Template' -count=1
go test ./handler ./router ./repository -count=1
```

Expected: all commands exit 0.

- [ ] **Step 3: Run frontend verification**

```bash
cd web
bun test 'src/app/(admin)/admin/settings/tencent-mps-template-settings.test.mts' 'src/app/(admin)/admin/settings/video-upscale-settings.test.mts' 'src/app/(user)/canvas/components/canvas-video-upscale.test.mts'
bun run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 4: Run one real no-charge sync**

Start the feature backend against the preview database on a temporary port and call only `POST /api/admin/settings/tencent-mps-templates/sync`. Assert template `327004` is returned, no response contains `secretId` or `secretKey`, and Tencent video-job count is identical before and after. Do not call `/api/v1/video-upscale/jobs`.

- [ ] **Step 5: Check repository hygiene**

```bash
git diff --check
git status --short
```

Expected: only intended documentation changes remain; no credentials, generated videos, temporary databases, or SDK diagnostics exist.

- [ ] **Step 6: Commit documentation**

```bash
git add CHANGELOG.md docs/backend-database.md docs/pending-test.md docs/todo.md
git commit -m "docs: record Tencent template sync acceptance"
```

- [ ] **Step 7: Finish the branch**

Use `superpowers:finishing-a-development-branch`: verify the worktree is clean, fast-forward `main`, fast-forward the active preview worktree, restart the preview backend, and verify `http://127.0.0.1:59692/api/health`. Do not push, tag, deploy, or submit another paid Tencent task.
