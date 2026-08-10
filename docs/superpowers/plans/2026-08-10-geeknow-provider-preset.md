# GeekNow Provider Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-key GeekNow preset that creates isolated text, image, and video channels and adapts the GeekNow asynchronous video lifecycle without using paid generation for verification.

**Architecture:** Keep the saved channels on the existing `openai` public protocol so same-name OpenAI-compatible fallback channels remain valid. Identify only the stable `geeknow-video` channel internally and route it through a focused Go adapter for create payloads, task responses, and result download. Reuse the current model-list-only verification mode for video-capable OpenAI channels.

**Tech Stack:** Next.js 16, React 19, TypeScript, Ant Design, Node test runner, Go 1.25, Gin, `net/http`, `mime/multipart`.

---

## File structure

- Modify `web/src/app/(admin)/admin/settings/model-channel-presets.ts`: preset metadata, model lists, and three-channel upsert.
- Modify `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts`: preset creation, idempotency, key preservation, and publication isolation.
- Modify `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx`: saved GeekNow key detection.
- Create `service/geeknow_video.go`: channel recognition, create payload conversion, task normalization, result URL extraction.
- Create `service/geeknow_video_test.go`: contract tests for every supported model family and response shape.
- Modify `handler/ai.go`: create/query/content routing with existing billing and task lifecycle hooks.
- Modify `handler/ai_test.go`: local fake-upstream lifecycle tests.
- Modify `web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts` and `service/settings_test.go`: connection-only verification regression coverage.
- Modify `docs/system-settings.md`, `docs/api-channel-workflow.md`, and `docs/pending-test.md`; inspect `docs/todo.md`.

### Task 1: Add the GeekNow preset

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/model-channel-presets.ts`
- Test: `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts`
- Modify: `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx`

- [ ] **Step 1: Write failing preset tests**

Add imports for `GEEKNOW_TEXT_MODELS`, `GEEKNOW_IMAGE_MODELS`, and `GEEKNOW_VIDEO_MODELS`, then add:

```ts
test("creates three isolated GeekNow channels without publishing models", () => {
    const result = applyModelChannelPreset(emptySettings(), "geeknow", { apiKey: "geek-key" });
    const channels = result.settings.private.channels.filter((item) => item.id.startsWith("geeknow-"));
    assert.deepEqual(channels.map((item) => item.id), ["geeknow-text", "geeknow-image", "geeknow-video"]);
    assert.deepEqual(channels.map((item) => item.baseUrl), Array(3).fill("https://www.geeknow.top/v1"));
    assert.deepEqual(channels.find((item) => item.id === "geeknow-text")?.models, GEEKNOW_TEXT_MODELS);
    assert.deepEqual(channels.find((item) => item.id === "geeknow-image")?.models, GEEKNOW_IMAGE_MODELS);
    assert.deepEqual(channels.find((item) => item.id === "geeknow-video")?.models, GEEKNOW_VIDEO_MODELS);
    assert.deepEqual(channels.find((item) => item.id === "geeknow-video")?.capabilities, ["video", "video_query"]);
    assert.deepEqual(result.settings.public.modelChannel.availableModels, []);
});

test("reapplies GeekNow idempotently and keeps saved data", () => {
    const initial = emptySettings();
    initial.private.channels = [channel({ id: "existing", apiKey: "existing-key", models: ["existing-model"] })];
    initial.public.modelChannel.availableModels = ["existing-model"];
    const first = applyModelChannelPreset(initial, "geeknow", { apiKey: "geek-key" });
    const second = applyModelChannelPreset(first.settings, "geeknow", { apiKey: "" });
    assert.equal(second.settings.private.channels.filter((item) => item.id.startsWith("geeknow-")).length, 3);
    assert.equal(second.settings.private.channels.find((item) => item.id === "geeknow-text")?.apiKey, "geek-key");
    assert.equal(second.settings.private.channels.find((item) => item.id === "existing")?.apiKey, "existing-key");
    assert.deepEqual(second.settings.public.modelChannel.availableModels, ["existing-model"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts'
```

Expected: FAIL because `geeknow` and the constants do not exist.

- [ ] **Step 3: Implement the minimal preset**

Extend `ModelChannelPresetId`, export the approved model arrays, add the card, dispatch `applyGeekNow`, and implement:

```ts
function applyGeekNow(settings: AdminSettings, input: ModelChannelPresetInput, summary: ModelChannelPresetResult["summary"]) {
    const baseUrl = "https://www.geeknow.top/v1";
    const saved = settings.private.channels.find((item) => item.id.startsWith("geeknow-") && item.apiKey);
    const apiKey = credential(input.apiKey, saved?.apiKey);
    requireValue(apiKey, "请填写 GeekNow API Key");
    const templates = [
        channelTemplate({ id: "geeknow-text", name: "GeekNow 文本", baseUrl, apiKey, models: [...GEEKNOW_TEXT_MODELS], capabilities: ["text"], remark: "厂商预设：GeekNow 文本" }),
        channelTemplate({ id: "geeknow-image", name: "GeekNow 图片", baseUrl, apiKey, models: [...GEEKNOW_IMAGE_MODELS], capabilities: ["image"], remark: "厂商预设：GeekNow 图片" }),
        channelTemplate({ id: "geeknow-video", name: "GeekNow 视频", baseUrl, apiKey, models: [...GEEKNOW_VIDEO_MODELS], capabilities: ["video", "video_query"], remark: "厂商预设：GeekNow 视频" }),
    ];
    templates.forEach((template) => upsertChannel(settings, settings.private.channels.findIndex((item) => item.id === template.id), template, summary));
}
```

Add saved-key recognition for IDs beginning with `geeknow-`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run Step 2 again. Expected: all preset tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/(admin)/admin/settings/model-channel-presets.ts' 'web/src/app/(admin)/admin/settings/model-channel-presets.test.mts' 'web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx'
git commit -m "feat: add GeekNow provider preset"
```

### Task 2: Build the GeekNow video adapter

**Files:**
- Create: `service/geeknow_video.go`
- Test: `service/geeknow_video_test.go`

- [ ] **Step 1: Write failing service tests**

Add exact tests for stable channel recognition, Grok JSON conversion, multipart image conversion, response normalization, and URL extraction:

```go
func TestIsGeekNowVideoChannelUsesStablePresetID(t *testing.T) {
    if !IsGeekNowVideoChannel(model.ModelChannel{ID: "geeknow-video", Protocol: "openai"}) { t.Fatal("want GeekNow adapter") }
    if IsGeekNowVideoChannel(model.ModelChannel{ID: "custom-video", Protocol: "openai"}) { t.Fatal("custom channel must stay generic") }
}

func TestBuildGeekNowVideoCreateRequestMapsGrokFields(t *testing.T) {
    body, contentType, err := BuildGeekNowVideoCreateRequest([]byte(`{"model":"grok-imagine-video","prompt":"hi","seconds":"6","ratio":"16:9","resolution":"720"}`), "application/json")
    if err != nil { t.Fatal(err) }
    var payload map[string]any
    if err := json.Unmarshal(body, &payload); err != nil { t.Fatal(err) }
    if contentType != "application/json" || payload["aspect_ratio"] != "16:9" || payload["resolution"] != "720P" || payload["seconds"] != "6" { t.Fatalf("payload = %#v", payload) }
}

func TestNormalizeGeekNowVideoTaskResponse(t *testing.T) {
    normalized, err := NormalizeGeekNowVideoTaskResponse([]byte(`{"task_id":"task-1","status":"completed","output":{"file_infos":[{"file_url":"https://cdn.example/video.mp4"}]}}`))
    if err != nil { t.Fatal(err) }
    var payload map[string]any
    if err := json.Unmarshal(normalized, &payload); err != nil { t.Fatal(err) }
    if payload["id"] != "task-1" || payload["status"] != "succeeded" || payload["video_url"] != "https://cdn.example/video.mp4" { t.Fatalf("payload = %#v", payload) }
}
```

Use table cases for `sora-2`, both Veo names, both Seedance 2.0 names, four MiniMax H3 names, `manxue-2.5`, `omni-fast`, and `omni-fast-v2v`.

- [ ] **Step 2: Verify RED**

```bash
go test ./service -run 'GeekNow' -count=1
```

Expected: build failure because the functions do not exist.

- [ ] **Step 3: Implement request conversion**

Create:

```go
func IsGeekNowVideoChannel(channel model.ModelChannel) bool
func BuildGeekNowVideoCreateRequest(body []byte, contentType string) ([]byte, string, error)
func NormalizeGeekNowVideoTaskResponse(body []byte) ([]byte, error)
func GeekNowTaskVideoURL(body []byte) string
```

Parse JSON or multipart with the standard library, require model and prompt, normalize duration/ratio/resolution once, convert image files to data URI, and use an exact family switch:

```go
switch {
case strings.HasPrefix(modelName, "grok-imagine-video"):
    payload["aspect_ratio"], payload["seconds"] = ratio, strconv.Itoa(duration)
case modelName == "sora-2", strings.HasPrefix(modelName, "veo_3_1"):
    payload["seconds"], payload["size"] = strconv.Itoa(duration), size
case strings.HasPrefix(modelName, "doubao-seedance-2-0"):
    payload["duration"], payload["aspect_ratio"] = duration, ratio
case strings.HasPrefix(modelName, "minimax-h3"), modelName == "manxue-2.5", strings.HasPrefix(modelName, "omni-fast"):
    payload["duration"], payload["ratio"] = duration, ratio
default:
    payload["duration"], payload["ratio"] = duration, ratio
}
```

Map images to `image/images` for Grok, `input_reference` for Sora/Veo, `reference_image_urls` for Seedance, `referenceImages` for MiniMax/manxue, and `images` for Omni. Reject unsupported local video/audio inputs before any upstream call.

- [ ] **Step 4: Implement response normalization**

Read top-level and nested `id`, `task_id`, `status`, `data`, `output`, `content`, `file_infos`, `video_url`, and `url`. Map completed/succeeded/success to `succeeded`, processing/running/in_progress to `running`, failure states to `failed`, cancellation states to `cancelled`, and everything else to `queued`. Return `id`, `status`, `raw_status`, optional `video_url`, `content.video_url`, and error details.

- [ ] **Step 5: Verify GREEN and commit**

```bash
go test ./service -run 'GeekNow' -count=1
git add service/geeknow_video.go service/geeknow_video_test.go
git commit -m "feat: adapt GeekNow video tasks"
```

### Task 3: Route create, query, and content

**Files:**
- Modify: `handler/ai.go`
- Test: `handler/ai_test.go`

- [ ] **Step 1: Write failing fake-upstream tests**

Add create, query, and content tests using `httptest.Server`. Assert `/v1/videos`, `/v1/videos/task-1`, the Bearer key, normalized bodies, queued/succeeded output, and that content downloads first query the task rather than requesting `/v1/videos/task-1/content`.

- [ ] **Step 2: Verify RED**

```bash
go test ./handler -run 'GeekNow' -count=1
```

Expected: generic routing forwards an unadapted body or the unsupported `/content` path.

- [ ] **Step 3: Add create routing**

After channel selection, set `isGeekNowVideoTask := service.IsGeekNowVideoChannel(channel) && path == "/videos"`, call `BuildGeekNowVideoCreateRequest`, and use a focused response copier that calls `NormalizeGeekNowVideoTaskResponse`, `MarkAITaskArkCreated`, and existing AI-task response headers without marking the asynchronous task synchronously succeeded.

- [ ] **Step 4: Add query/content routing**

Route the stable channel before generic GET. Query `BuildModelChannelURL(channel, "/videos/"+url.PathEscape(taskID))`, normalize and sync task status, and for content pass `GeekNowTaskVideoURL` to the existing restricted video download proxy.

- [ ] **Step 5: Verify GREEN, adjacent regressions, and commit**

```bash
go test ./handler -run 'GeekNow' -count=1
go test ./service ./handler -run 'GeekNow|Ark|Xinglian|Jimeng|Video' -count=1
git add handler/ai.go handler/ai_test.go
git commit -m "feat: route GeekNow video lifecycle"
```

### Task 4: Protect connection-only verification

**Files:**
- Test: `web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts`
- Test: `service/settings_test.go`

- [ ] **Step 1: Add regression tests**

```ts
test("GeekNow video verification only checks connectivity", () => {
    const geeknow = channel({ id: "geeknow-video", protocol: "openai", capabilities: ["video", "video_query"] });
    assert.equal(channelVerificationMode(geeknow), "connectivity");
    assert.match(channelVerificationCopy(geeknow).description, /不创建视频任务/);
});
```

Add a Go `AdminChannelModels` test whose fake upstream accepts only `GET /v1/models`, checks the Bearer key, returns a model list, and fails on every POST.

- [ ] **Step 2: Run tests and commit**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts'
cd .. && go test ./service -run 'AdminChannelModels.*GeekNow' -count=1
git add 'web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts' service/settings_test.go
git commit -m "test: protect GeekNow connection-only verification"
```

Expected: PASS with no video-generation POST.

### Task 5: Documentation and full verification

**Files:**
- Modify: `docs/system-settings.md`
- Modify: `docs/api-channel-workflow.md`
- Modify: `docs/pending-test.md`
- Inspect/possibly modify: `docs/todo.md`

- [ ] **Step 1: Update documentation**

Document the three stable channel IDs, one-key behavior, official base URL, explicit publication, core model lists, vendor-specific video routing, and model-list-only verification. Add manual acceptance for preset idempotency, preserved public models, discovery, and one text/image call. Real video generation remains optional paid user acceptance, not an automated gate.

- [ ] **Step 2: Check TODO movement**

```bash
rg -n "GeekNow|中转|渠道预设" docs/todo.md docs/pending-test.md
```

Move a matching existing todo to pending-test; otherwise leave `docs/todo.md` unchanged.

- [ ] **Step 3: Run full verification**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts' 'src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts'
cd .. && go test ./service ./handler -run 'GeekNow|Ark|Xinglian|Jimeng|Video' -count=1
cd web && npm test && npm run typecheck
cd .. && go test ./...
git diff --check
git status --short
```

Expected: all checks PASS and no real GeekNow video task is created.

- [ ] **Step 4: Commit docs and review scope**

```bash
git add docs/system-settings.md docs/api-channel-workflow.md docs/pending-test.md docs/todo.md
git commit -m "docs: document GeekNow channel preset"
git log --oneline -8
git status --short
```

Expected: only GeekNow preset, adapter, tests, and related docs changed; existing Ark, Xinglian, Jimeng CLI, and Comfly behavior remains intact.
