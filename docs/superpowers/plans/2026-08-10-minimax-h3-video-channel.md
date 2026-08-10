# MiniMax H3 Video Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent `minimax` model-channel protocol that configures MiniMax H3 from the provider preset UI and supports text, first-frame, first/last-frame, and multimodal video generation through the existing `/api/ai/videos` lifecycle.

**Architecture:** The frontend resolves canvas references into MiniMax-compatible URLs or data URIs and emits a canonical H3 JSON body. The Go backend owns the API Key, validates and forwards creation to MiniMax V2, normalizes create/query responses into the existing video task shape, and proxies the completed video through the existing safe download boundary.

**Tech Stack:** Go, Gin, existing model-channel settings and AI task ledger, Next.js App Router, React, TypeScript, Ant Design, Node test runner.

---

## File map

- `model/setting.go`: persisted protocol constant.
- `service/settings.go`: protocol normalization and public model metadata.
- `service/minimax_video.go`: MiniMax URL, request, response, and result adapters.
- `handler/ai.go`: create/query/content routing with existing billing and ledger behavior.
- `web/src/app/(admin)/admin/settings/model-channel-presets.ts`: official stable preset.
- `web/src/services/api/minimax-video-payload.ts`: H3 payload validation and construction.
- `web/src/services/api/video.ts`: local reference resolution and builder selection.
- `web/src/lib/dreamina-video-capabilities.ts`: centralized H3 limits.
- `web/src/components/video-settings-panel.tsx`: H3 resolution labels and supported controls.
- Protocol union consumers under `web/src/`: carry `minimax` from settings to canvas metadata.
- `docs/system-settings.md`, `docs/api-channel-workflow.md`, `docs/pending-test.md`, `docs/todo.md`: documentation and pending verification.

### Task 1: Define and publish the MiniMax protocol

**Files:**
- Modify: `model/setting.go`
- Modify: `service/settings.go`
- Create: `service/minimax_settings_test.go`
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/lib/ai-model-catalog.ts`
- Modify: `web/src/services/api/ai-channel-boundary.ts`
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/services/ai-config-package.ts`
- Modify: `web/src/app/(admin)/admin/settings/model-channel-wizard-model.ts`
- Modify: `web/src/app/(admin)/admin/settings/components/model-channel-wizard.tsx`
- Modify: `web/src/app/(admin)/admin/settings/model-channel-publication.ts`
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Modify: `web/src/components/model-picker-options.ts`
- Modify: `web/src/components/model-picker.tsx`
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-video-chain.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-video-config.ts`
- Modify: `web/src/app/(user)/canvas/utils/storyboard-management.ts`
- Modify: `web/src/app/(user)/video/video-package-builders.ts`
- Test: `web/src/services/api/ai-channel-boundary.test.mts`
- Test: `web/src/lib/ai-model-catalog.test.mts`

- [ ] **Step 1: Write failing protocol round-trip tests**

Create `service/minimax_settings_test.go`:

```go
package service

import (
    "testing"
    "github.com/basketikun/infinite-canvas/model"
)

func TestNormalizeModelProtocolKeepsMiniMax(t *testing.T) {
    if got := normalizeModelProtocol(string(model.ModelProtocolMiniMax)); got != "minimax" {
        t.Fatalf("protocol = %q, want minimax", got)
    }
    capabilities := normalizeModelChannelCapabilities(nil, string(model.ModelProtocolMiniMax))
    if !containsNormalizedString(capabilities, "video") {
        t.Fatalf("capabilities = %#v, want video", capabilities)
    }
}
```

Add to `ai-channel-boundary.test.mts`:

```ts
test("preserves configured MiniMax video protocol", () => {
    assert.equal(inferRemoteVideoProtocol("MiniMax-H3", "openai", [{ model: "MiniMax-H3", protocol: "minimax" }]), "minimax");
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
go test ./service -run MiniMax
cd web && node --experimental-strip-types --test src/services/api/ai-channel-boundary.test.mts src/lib/ai-model-catalog.test.mts
```

Expected: missing `ModelProtocolMiniMax` and invalid frontend protocol union.

- [ ] **Step 3: Implement the protocol**

Add:

```go
ModelProtocolMiniMax ModelProtocol = "minimax"
```

In `service/settings.go`, add `modelProtocolMiniMax`, preserve it in `normalizeModelProtocol`, expose:

```go
func IsMiniMaxProtocol(protocol string) bool {
    return normalizeModelProtocol(protocol) == modelProtocolMiniMax
}
```

An empty-capability MiniMax channel defaults to `video`; explicit `video` and `video_query` remain intact. Add `"minimax"` to every listed frontend protocol union and validation branch, add the display label `MiniMax H3`, and keep standard Base URL/API Key fields in the wizard.

- [ ] **Step 4: Run Step 2 and verify GREEN**

- [ ] **Step 5: Commit isolated files after checking the index**

```bash
git add model/setting.go service/settings.go service/minimax_settings_test.go web/src
git diff --cached --name-only
git commit -m "feat: add MiniMax model channel protocol"
```

Do not commit any pre-existing Seedance file.

### Task 2: Add the MiniMax provider preset

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/model-channel-presets.ts`
- Test: `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts`
- Modify: `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx`

- [ ] **Step 1: Write the failing preset test**

```ts
test("applies the official MiniMax H3 channel idempotently without publishing it", () => {
    const first = applyModelChannelPreset(emptySettings(), "minimax", { apiKey: "minimax-key" });
    const second = applyModelChannelPreset(first.settings, "minimax", { apiKey: "" });
    const channels = second.settings.private.channels.filter((item) => item.id === "minimax-video");
    assert.equal(channels.length, 1);
    assert.equal(channels[0].protocol, "minimax");
    assert.equal(channels[0].baseUrl, "https://api.minimaxi.com");
    assert.equal(channels[0].apiKey, "minimax-key");
    assert.deepEqual(channels[0].models, ["MiniMax-H3"]);
    assert.deepEqual(channels[0].capabilities, ["video", "video_query"]);
    assert.equal(second.settings.public.modelChannel.availableModels.includes("MiniMax-H3"), false);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts'
```

- [ ] **Step 3: Implement the preset and key reuse**

Extend `ModelChannelPresetId`, add a MiniMax card, call `applyMiniMax`, and implement:

```ts
function applyMiniMax(settings: AdminSettings, input: ModelChannelPresetInput, summary: ModelChannelPresetResult["summary"]) {
    const baseUrl = "https://api.minimaxi.com";
    const index = findChannelIndex(settings.private.channels, "minimax-video", (item) => item.protocol === "minimax" && trimURL(item.baseUrl) === baseUrl);
    const apiKey = credential(input.apiKey, settings.private.channels[index]?.apiKey);
    requireValue(apiKey, "请填写 MiniMax API Key");
    upsertChannel(settings, index, channelTemplate({ id: "minimax-video", protocol: "minimax", name: "MiniMax H3", baseUrl, apiKey, models: ["MiniMax-H3"], capabilities: ["video", "video_query"], remark: "厂商预设：MiniMax H3" }), summary);
}
```

Teach `presetHasSavedKey` to match `protocol === "minimax"`; use only the existing API Key field.

- [ ] **Step 4: Run Step 2 and verify GREEN**

- [ ] **Step 5: Commit the preset files**

```bash
git add 'web/src/app/(admin)/admin/settings/model-channel-presets.ts' 'web/src/app/(admin)/admin/settings/model-channel-presets.test.mts' 'web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx'
git commit -m "feat: add MiniMax H3 provider preset"
```

### Task 3: Build and validate frontend H3 payloads

**Files:**
- Create: `web/src/services/api/minimax-video-payload.ts`
- Create: `web/src/services/api/minimax-video-payload.test.mts`
- Modify: `web/src/services/api/video.ts`

- [ ] **Step 1: Write failing pure payload tests**

```ts
test("builds text-to-video with a concrete ratio", () => {
    assert.deepEqual(buildMiniMaxVideoPayload({ model: "MiniMax-H3", prompt: "海边运镜", duration: "6", ratio: "adaptive", resolution: "2160", watermark: false, references: [] }), {
        model: "MiniMax-H3",
        content: [{ type: "text", text: "海边运镜" }],
        resolution: "2K",
        duration: 6,
        ratio: "16:9",
        aigc_watermark: false,
    });
});

test("forces adaptive for first and last frames", () => {
    const payload = buildMiniMaxVideoPayload({ model: "MiniMax-H3", prompt: "自然过渡", duration: "5", ratio: "9:16", resolution: "768", watermark: true, references: [
        { type: "image", url: "data:image/png;base64,AA==", role: "first_frame" },
        { type: "image", url: "https://example.com/end.png", role: "last_frame" },
    ] });
    assert.equal(payload.ratio, "adaptive");
    assert.equal(payload.resolution, "768P");
});
```

Also assert audio-only multimodal succeeds; frame/reference mixing and duplicate frame roles fail; prompt is required; duration clamps to 4–15; limits are image 9/video 3/audio 3/total 12; serialized payloads over 64 MB fail locally.

- [ ] **Step 2: Run and verify RED**

```bash
cd web && node --experimental-strip-types --test src/services/api/minimax-video-payload.test.mts
```

- [ ] **Step 3: Implement the pure builder**

```ts
export type MiniMaxVideoReference =
    | { type: "image"; url: string; role: "first_frame" | "last_frame" | "reference_image" }
    | { type: "video"; url: string; role: "reference_video" }
    | { type: "audio"; url: string; role: "reference_audio" };

export function buildMiniMaxVideoPayload(input: MiniMaxVideoPayloadInput) {
    const prompt = input.prompt.trim();
    if (!input.model.trim()) throw new Error("缺少模型名称");
    if (!prompt) throw new Error("缺少视频提示词");
    const images = input.references.filter((item) => item.type === "image");
    const videos = input.references.filter((item) => item.type === "video");
    const audios = input.references.filter((item) => item.type === "audio");
    if (images.length > 9 || videos.length > 3 || audios.length > 3 || input.references.length > 12) throw new Error("MiniMax H3 参考素材数量超限");
    const frameImages = images.filter((item) => item.role === "first_frame" || item.role === "last_frame");
    const referenceItems = input.references.filter((item) => item.type !== "image" || item.role === "reference_image");
    if (frameImages.length && referenceItems.length) throw new Error("首尾帧与全能参考不能混用");
    if (frameImages.filter((item) => item.role === "first_frame").length > 1 || frameImages.filter((item) => item.role === "last_frame").length > 1) throw new Error("首帧或尾帧不能重复");
    const content = [
        { type: "text" as const, text: prompt },
        ...input.references.map((item) => item.type === "image"
            ? { type: "image_url" as const, image_url: { url: item.url }, role: item.role }
            : item.type === "video"
                ? { type: "video_url" as const, video_url: { url: item.url }, role: item.role }
                : { type: "audio_url" as const, audio_url: { url: item.url }, role: item.role }),
    ];
    const payload = {
        model: input.model.trim(),
        content,
        resolution: normalizeMiniMaxResolution(input.resolution),
        duration: Math.max(4, Math.min(15, Math.floor(Number(input.duration) || 6))),
        ratio: frameImages.length ? "adaptive" : normalizeMiniMaxRatio(input.ratio, input.references.length === 0),
        aigc_watermark: input.watermark,
    };
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 64 * 1024 * 1024) throw new Error("MiniMax H3 请求体超过 64 MB");
    return payload;
}

function normalizeMiniMaxResolution(value: string) {
    const normalized = value.trim().toLowerCase();
    return normalized === "2k" || normalized === "2160" || normalized === "2160p" ? "2K" : "768P";
}

function normalizeMiniMaxRatio(value: string, textOnly: boolean) {
    const normalized = value === "auto" ? "adaptive" : value;
    const allowed = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
    if (!allowed.includes(normalized)) return "16:9";
    return textOnly && normalized === "adaptive" ? "16:9" : normalized;
}
```

- [ ] **Step 4: Wire reference resolution in `video.ts`**

For `config.videoProtocol === "minimax"`, preserve `references.inputs` order. Pass HTTP(S), `mm_file://`, and `data:` URLs. Resolve local storage/blob data to data URIs. Never submit `asset://`; resolve its browser source or throw a Chinese read error. Map images with `defaultSeedanceImageRole`, videos to `reference_video`, and audios to `reference_audio`.

- [ ] **Step 5: Run payload and existing reference tests**

```bash
cd web && node --experimental-strip-types --test src/services/api/minimax-video-payload.test.mts src/services/api/video-reference.test.mts
```

- [ ] **Step 6: Commit payload files**

```bash
git add web/src/services/api/minimax-video-payload.ts web/src/services/api/minimax-video-payload.test.mts web/src/services/api/video.ts
git commit -m "feat: build MiniMax H3 video payloads"
```

### Task 4: Implement MiniMax Go adapters

**Files:**
- Create: `service/minimax_video.go`
- Create: `service/minimax_video_test.go`

- [ ] **Step 1: Write failing service tests**

```go
func TestBuildMiniMaxVideoCreateRequestKeepsOnlySupportedFields(t *testing.T) {
    body, contentType, err := BuildMiniMaxVideoCreateRequest([]byte(`{"model":"MiniMax-H3","content":[{"type":"text","text":"生成视频"}],"resolution":"2K","duration":6,"ratio":"16:9","aigc_watermark":true,"seed":123}`), "application/json")
    if err != nil { t.Fatal(err) }
    if contentType != "application/json" { t.Fatalf("content type = %q", contentType) }
    var payload map[string]any
    if err := json.Unmarshal(body, &payload); err != nil { t.Fatal(err) }
    if _, exists := payload["seed"]; exists { t.Fatalf("unsupported seed remained: %#v", payload) }
    if payload["model"] != "MiniMax-H3" || payload["resolution"] != "2K" || payload["duration"] != float64(6) { t.Fatalf("payload = %#v", payload) }
}
```

Add tests for invalid content type, missing prompt, invalid/duplicate roles, role-family mixing, 768P/2K, duration and ratios, count limits, 64 MB rejection, escaped query paths, create `{task_id}` normalization, all five nested task statuses, error code/message, and `content.url` extraction.

- [ ] **Step 2: Run and verify RED**

```bash
go test ./service -run MiniMax
```

- [ ] **Step 3: Implement the adapter API**

```go
type MiniMaxVideoEndpoints struct { BaseURL, Create string }
func ResolveMiniMaxVideoEndpoints(baseURL string) (MiniMaxVideoEndpoints, error)
func (e MiniMaxVideoEndpoints) Query(taskID string) string
func BuildMiniMaxVideoCreateRequest(body []byte, contentType string) ([]byte, string, error)
func NormalizeMiniMaxVideoCreateResponse(body []byte) ([]byte, error)
func NormalizeMiniMaxVideoTaskResponse(body []byte) ([]byte, error)
func MiniMaxTaskVideoURL(body []byte) string
```

Normalize query output to `id`, `status`, `raw_status`, `video_url`, timestamps, resolution, ratio, duration, and error. Use `url.PathEscape` for task IDs.

- [ ] **Step 4: Run Step 2 and verify GREEN**

- [ ] **Step 5: Commit adapter files**

```bash
git add service/minimax_video.go service/minimax_video_test.go
git commit -m "feat: add MiniMax H3 backend adapter"
```

### Task 5: Route create, query, and content

**Files:**
- Modify: `handler/ai.go`
- Create: `handler/minimax_ai_test.go`

- [ ] **Step 1: Write failing fake-upstream tests**

Use `httptest.Server` and existing settings helpers to implement `TestMiniMaxVideoLifecycleUsesV2Paths`. Its fake upstream records `r.Method`, `r.URL.Path`, and `Authorization`; return `{"task_id":"task-1"}` for `POST /v2/video_generation`, a succeeded nested task with `content.url` for `GET /v2/query/video_generation/task-1`, and `video/mp4` bytes from the result URL. Assert the recorded sequence is exactly create, query, query, download; the Bearer header uses the saved server key; create normalizes to `{id:"task-1",status:"queued"}`; task headers contain `task-1`; and content bytes match. Add a second test whose create endpoint returns HTTP 400 and assert the existing refund record is written.

- [ ] **Step 2: Run and verify RED**

```bash
go test ./handler -run MiniMax
```

- [ ] **Step 3: Implement lifecycle routing**

In `proxyAIRequest`, detect MiniMax `/videos`, call `BuildMiniMaxVideoCreateRequest`, use `endpoints.Create`, and normalize before writing ledger headers. In `proxyAIGetRequest`, branch:

```go
if service.IsMiniMaxProtocol(channel.Protocol) && strings.HasPrefix(path, "/videos/") {
    proxyMiniMaxVideoGetRequest(w, r.Context(), channel, path)
    return
}
```

The query/content helper uses the server Bearer key, normalized task synchronization, and the existing safe video download proxy.

- [ ] **Step 4: Run lifecycle tests and verify GREEN**

```bash
go test ./handler ./service -run MiniMax
```

- [ ] **Step 5: Commit routing files**

```bash
git add handler/ai.go handler/minimax_ai_test.go
git commit -m "feat: route MiniMax H3 video lifecycle"
```

### Task 6: Adapt H3 settings and canvas validation

**Files:**
- Modify: `web/src/lib/dreamina-video-capabilities.ts`
- Test: `web/src/lib/dreamina-video-capabilities.test.mts`
- Modify: `web/src/components/video-settings-panel.tsx`
- Test: `web/src/components/video-settings-panel.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-metadata.ts`

- [ ] **Step 1: Write failing H3 capability tests**

```ts
test("exposes MiniMax H3 limits", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "minimax", model: "MiniMax-H3", mode: "multimodal2video" });
    assert.deepEqual(capability?.duration, { min: 4, max: 15 });
    assert.deepEqual(capability?.resolutions, ["768", "2160"]);
    assert.deepEqual(capability?.references, { images: 9, videos: 3, audios: 3, total: 12, allowAudioOnly: true });
});
```

Add source assertions that MiniMax 2160 is labeled `2K`, and unsupported audio-generation and seed controls are absent for `videoProtocol === "minimax"`.

- [ ] **Step 2: Run and verify RED**

```bash
cd web && node --experimental-strip-types --test src/lib/dreamina-video-capabilities.test.mts src/components/video-settings-panel.test.mts
```

- [ ] **Step 3: Implement capability, labels, and controls**

Return H3 limits for `minimax`. Make count errors provider-neutral. Label 2160 as `2K` only for MiniMax; hide generation audio and seed; retain watermark and prompt review. Keep edit/extend Seedance-only. Existing node panels use the central validator for all four modes.

- [ ] **Step 4: Run capability and payload tests**

```bash
cd web && node --experimental-strip-types --test src/lib/dreamina-video-capabilities.test.mts src/components/video-settings-panel.test.mts src/services/api/minimax-video-payload.test.mts
```

- [ ] **Step 5: Commit UI files**

```bash
git add web/src/lib/dreamina-video-capabilities.ts web/src/lib/dreamina-video-capabilities.test.mts web/src/components/video-settings-panel.tsx web/src/components/video-settings-panel.test.mts 'web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx' 'web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx' 'web/src/app/(user)/canvas/utils/canvas-generation-metadata.ts'
git commit -m "feat: adapt canvas settings for MiniMax H3"
```

### Task 7: Document and verify

**Files:**
- Modify: `docs/system-settings.md`
- Modify: `docs/api-channel-workflow.md`
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Update technical documentation**

Document the preset, official Base URL, server-only API Key, fixed model, explicit publication, four modes, 768P/2K, 4–15 seconds, V2 create/query paths, and safe content proxy.

- [ ] **Step 2: Record manual acceptance**

In `docs/pending-test.md`, request idempotent preset application, model publication, labels/limits, and four real generation modes only when the user intentionally accepts charges. State that automated tests use a fake upstream. Inspect `docs/todo.md` and change it only if a matching MiniMax item exists.

- [ ] **Step 3: Run focused verification**

```bash
go test ./service ./handler -run MiniMax
cd web && node --experimental-strip-types --test \
  'src/app/(admin)/admin/settings/model-channel-presets.test.mts' \
  src/services/api/ai-channel-boundary.test.mts \
  src/lib/ai-model-catalog.test.mts \
  src/services/api/minimax-video-payload.test.mts \
  src/lib/dreamina-video-capabilities.test.mts \
  src/components/video-settings-panel.test.mts
```

Expected: all PASS without a real MiniMax request.

- [ ] **Step 4: Audit scope and docs**

```bash
git diff --check
git status --short
```

Confirm original Seedance modifications remain, no unrelated file changed, `docs/todo.md` was inspected, and pending tests describe the feature.

- [ ] **Step 5: Commit only documentation**

```bash
git add docs/system-settings.md docs/api-channel-workflow.md docs/pending-test.md
git commit -m "docs: record MiniMax H3 channel validation"
```
