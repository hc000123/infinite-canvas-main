# Volcengine Ark Seedance 2.5 Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留火山 Ark Seedance 2.0 的同时，新增可独立配置 Endpoint 的 Seedance 2.5，并让界面、前端 payload 与后端代理统一遵守 2.5 能力边界。

**Architecture:** 延用现有“本地模型名 -> Ark Endpoint”路由，不创建新协议。后台预设负责建立两条映射；现有视频能力解析器增加 Ark 分支；Seedance payload 构造器负责模型与任务类型感知；Go 代理在替换上游 Endpoint 前保留本地模型名用于最终兜底校验。

**Tech Stack:** Go、Gin、TypeScript、React、Next.js App Router、Ant Design、Node test runner。

**Project verification constraint:** 按项目 `AGENTS.md`，日常开发只补测试代码，不主动执行测试、类型检查或构建。下文列出精确命令供用户明确要求全面验收时使用；实施期间不得调用真实火山生成接口。

---

## File map

- `web/src/app/(admin)/admin/settings/model-channel-presets.ts`：声明火山本地模型名并生成 2.0 / 2.5 Endpoint 映射。
- `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts`：覆盖预设新增、保留和不发布空 2.5 映射。
- `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx`：增加 Seedance 2.5 Endpoint 输入。
- `web/src/lib/dreamina-video-capabilities.ts`：沿用现有视频能力入口，增加 Ark 2.0 / 2.5 能力解析，不修改画布大组件。
- `web/src/lib/dreamina-video-capabilities.test.mts`：覆盖 Ark 能力、时长、分辨率和素材规则。
- `web/src/services/api/video-normalizers.ts`：提供统一的 Seedance 2.5 模型识别及模型感知参数规范化。
- `web/src/services/api/video-normalizers.test.mts`：覆盖 2.5 时长、编辑任务、比例和分辨率。
- `web/src/services/api/video-reference.ts`：按模型构造 content、校验素材上限和纯音频，并生成任务参数。
- `web/src/services/api/video-reference.test.mts`：覆盖 2.5 payload 边界和 2.0 回归。
- `web/src/services/api/video.ts`：取消 Ark 固定 12 / 9 / 3 / 3 的预截断，让 payload 层看到完整素材并显式校验。
- `service/ark_video.go`：在 Endpoint 替换前按本地模型执行后端兜底规范化。
- `service/ark_video_test.go`：覆盖后端 2.5 纯音频、30 秒、480p、素材上限和 Endpoint 替换。
- `handler/ai.go`：把本地模型名和上游 Endpoint 同时传给 Ark 请求构造器。
- `handler/ai_test.go`：覆盖代理仍把本地 2.5 路由到独立 EP。
- `docs/pending-test.md`：记录用户可执行的页面验收项。
- `CHANGELOG.md`：在 `Unreleased` 归纳火山 Ark Seedance 2.5 新增适配。
- `docs/todo.md`：只检查；本次没有对应未完成事项时不修改。

### Task 1: Add the second Ark model and Endpoint mapping

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/model-channel-presets.ts`
- Modify: `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts`
- Modify: `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx`

- [ ] **Step 1: Write preset behavior tests**

Add tests that preserve the existing 2.0 mapping and append 2.5 only when configured:

```ts
test("adds an independent Ark Seedance 2.5 endpoint without replacing 2.0", () => {
    const settings = emptySettings();
    settings.private.channels = [channel({
        id: "volcengine-seedance",
        protocol: "volcengine-ark",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        models: ["doubao-seedance-2-0"],
        endpointId: "ep-20",
        endpointMappings: [{ model: "doubao-seedance-2-0", endpointId: "ep-20" }],
        capabilities: ["video"],
    })];

    const result = applyModelChannelPreset(settings, "volcengine", { seedance25EndpointId: "ep-25" });
    const saved = result.settings.private.channels.find((item) => item.id === "volcengine-seedance");

    assert.deepEqual(saved?.models, ["doubao-seedance-2-0", "doubao-seedance-2-5"]);
    assert.deepEqual(saved?.endpointMappings, [
        { model: "doubao-seedance-2-0", endpointId: "ep-20" },
        { model: "doubao-seedance-2-5", endpointId: "ep-25" },
    ]);
});

test("does not create an unroutable Ark Seedance 2.5 model", () => {
    const result = applyModelChannelPreset(emptySettings(), "volcengine", { apiKey: "key", endpointId: "ep-20" });
    const saved = result.settings.private.channels[0];

    assert.deepEqual(saved.models, ["doubao-seedance-2-0"]);
    assert.deepEqual(saved.endpointMappings, [{ model: "doubao-seedance-2-0", endpointId: "ep-20" }]);
});
```

- [ ] **Step 2: Implement stable model constants and mapping merge**

Add the input field and use exact local identifiers:

```ts
export const VOLCENGINE_ARK_MODELS = {
    seedance20: "doubao-seedance-2-0",
    seedance25: "doubao-seedance-2-5",
} as const;

export type ModelChannelPresetInput = {
    apiKey?: string;
    endpointId?: string;
    seedance25EndpointId?: string;
    name?: string;
    baseUrl?: string;
    capability?: "text" | "image" | "video";
    models?: string[];
};
```

In `applyVolcengine`, resolve existing mappings by model name, require the existing 2.0 EP, preserve an existing 2.5 EP when its field is left blank, and filter empty mappings:

```ts
const endpointFor = (model: string) => current?.endpointMappings.find((item) => item.model === model)?.endpointId || "";
const seedance20EndpointId = firstValue(input.endpointId, endpointFor(VOLCENGINE_ARK_MODELS.seedance20), current?.endpointId);
const seedance25EndpointId = firstValue(input.seedance25EndpointId, endpointFor(VOLCENGINE_ARK_MODELS.seedance25));
requireValue(seedance20EndpointId, "请填写 Seedance 2.0 Endpoint / EP");
const endpointMappings = [
    { model: VOLCENGINE_ARK_MODELS.seedance20, endpointId: seedance20EndpointId },
    ...(seedance25EndpointId ? [{ model: VOLCENGINE_ARK_MODELS.seedance25, endpointId: seedance25EndpointId }] : []),
];
```

Pass `endpointMappings`, `models: endpointMappings.map((item) => item.model)`, and `endpointId: seedance20EndpointId` into the existing channel template.

- [ ] **Step 3: Add the second preset input**

Replace the single generic Ark EP control with two clearly labelled controls while preserving the existing `endpointId` field:

```tsx
{presetId === "volcengine" ? (
    <>
        <Col span={12}>
            <Form.Item name="endpointId" label="Seedance 2.0 Endpoint / EP" extra="已有映射时留空保留；首次配置必须填写。">
                <Input placeholder="ep-xxxxxxxxxxxxxxxx" />
            </Form.Item>
        </Col>
        <Col span={12}>
            <Form.Item name="seedance25EndpointId" label="Seedance 2.5 Endpoint / EP" extra="新增 2.5 时填写；已有映射时留空保留。">
                <Input placeholder="ep-xxxxxxxxxxxxxxxx" />
            </Form.Item>
        </Col>
    </>
) : null}
```

- [ ] **Step 4: Record deferred verification**

When the user explicitly requests tests, run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts'
```

Expected: all preset tests pass; no network request is made.

- [ ] **Step 5: Commit only this task's files**

```bash
git add 'web/src/app/(admin)/admin/settings/model-channel-presets.ts' 'web/src/app/(admin)/admin/settings/model-channel-presets.test.mts' 'web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx'
git commit -m "feat: add Ark Seedance 2.5 endpoint mapping"
```

### Task 2: Expose Ark 2.5 capabilities through the existing UI resolver

**Files:**
- Modify: `web/src/lib/dreamina-video-capabilities.ts`
- Modify: `web/src/lib/dreamina-video-capabilities.test.mts`

- [ ] **Step 1: Write Ark capability tests**

```ts
test("describes Ark Seedance 2.5 capabilities", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "volcengine-ark", model: "doubao-seedance-2-5", mode: "multimodal2video" });

    assert.deepEqual(capability?.duration, { min: 4, max: 30 });
    assert.deepEqual(capability?.resolutions, ["480", "720"]);
    assert.deepEqual(capability?.references, { images: 30, videos: 10, audios: 10, total: 50, allowAudioOnly: true });
});

test("keeps Ark Seedance 2.0 limits", () => {
    const capability = resolveDreaminaVideoCapability({ protocol: "volcengine-ark", model: "doubao-seedance-2-0", mode: "multimodal2video" });

    assert.deepEqual(capability?.duration, { min: 4, max: 15 });
    assert.deepEqual(capability?.resolutions, ["720", "1080"]);
    assert.equal(capability?.references.allowAudioOnly, false);
});
```

- [ ] **Step 2: Add an Ark branch without changing callers**

Keep the exported API stable so `video-settings-panel.tsx` and both canvas panels gain the behavior automatically:

```ts
function isSeedance25Model(model: string) {
    return /seedance(?:2[._-]?5|[._-]2[._-]5)/i.test(model);
}

export function resolveDreaminaVideoCapability(input: DreaminaCapabilityInput): DreaminaVideoCapability | null {
    if (input.protocol !== "jimeng-cli" && input.protocol !== "volcengine-ark") return null;
    if (input.protocol === "jimeng-cli" && input.mode === "multiframe2video") {
        return fixedMultiframeCapability;
    }
    const seedance25 = isSeedance25Model(input.model);
    const ark = input.protocol === "volcengine-ark";
    const vip = input.model === "seedance2.0_vip";
    return {
        label: seedance25 ? "2.5 · 4–30s · 多模态" : "",
        notice: "",
        duration: { min: 4, max: seedance25 ? 30 : 15 },
        resolutions: seedance25 ? ["480", "720"] : ark ? ["720", "1080"] : vip ? ["720", "1080", "2160"] : ["720"],
        fallbackResolution: "720",
        references: seedance25
            ? { images: 30, videos: 10, audios: 10, total: 50, allowAudioOnly: true }
            : { images: 9, videos: 3, audios: 3, total: 12, allowAudioOnly: false },
        fixedModel: false,
    };
}
```

Extract the current multi-frame literal to `fixedMultiframeCapability` without changing its values.

- [ ] **Step 3: Record deferred verification**

```bash
cd web && node --experimental-strip-types --test src/lib/dreamina-video-capabilities.test.mts
```

Expected: Ark and existing Jimeng capability tests pass.

- [ ] **Step 4: Commit only this task's files**

```bash
git add web/src/lib/dreamina-video-capabilities.ts web/src/lib/dreamina-video-capabilities.test.mts
git commit -m "feat: expose Ark Seedance 2.5 capabilities"
```

### Task 3: Build model-aware Ark payloads in the frontend

**Files:**
- Modify: `web/src/services/api/video-normalizers.ts`
- Modify: `web/src/services/api/video-normalizers.test.mts`
- Modify: `web/src/services/api/video-reference.ts`
- Modify: `web/src/services/api/video-reference.test.mts`
- Modify: `web/src/services/api/video.ts`

- [ ] **Step 1: Write parameter normalization tests**

Add these assertions to `video-normalizers.test.mts`:

```ts
assert.equal(normalizeSeedanceDuration("30", "doubao-seedance-2-5"), 30);
assert.equal(normalizeSeedanceDuration("30", "doubao-seedance-2-0"), 15);
assert.equal(normalizeSeedanceDuration("12", "doubao-seedance-2-5", "edit"), -1);
assert.equal(normalizeSeedanceResolution("480", "doubao-seedance-2-5"), "480p");
assert.equal(normalizeSeedanceResolution("1080", "doubao-seedance-2-5"), "720p");
assert.equal(normalizeSeedanceRatio("16:9", "doubao-seedance-2-5", "generate", "first_frame"), "adaptive");
assert.equal(normalizeSeedanceRatio("16:9", "doubao-seedance-2-5", "extend", "reference"), "adaptive");
```

- [ ] **Step 2: Implement canonical 2.5 detection and optional model/task parameters**

```ts
export function isSeedance25Model(model?: string) {
    return /seedance(?:2[._-]?5|[._-]2[._-]5)/i.test(model || "");
}

export function normalizeSeedanceDuration(value: string, model?: string, taskMode?: string) {
    if (isSeedance25Model(model) && taskMode === "edit") return -1;
    const seconds = Math.floor(Number(value) || 6);
    return Math.max(4, Math.min(isSeedance25Model(model) ? 30 : 15, seconds));
}

export function normalizeSeedanceResolution(value: string, model?: string) {
    if (isSeedance25Model(model)) {
        const resolution = Number(String(value || "").replace(/p$/i, ""));
        return resolution > 0 && resolution <= 480 ? "480p" : "720p";
    }
    if (isSeedanceFastModel(model)) return "720p";
    const resolution = Number(normalizeVideoResolution(value).replace(/p$/i, "")) || 720;
    return resolution >= 1080 ? "1080p" : "720p";
}
```

Extend `normalizeSeedanceRatio` with optional `model`, `taskMode`, and `imageRoleMode`; compute the existing normalized ratio first, then return `adaptive` when 2.5 uses `edit`, `extend`, `first_frame`, or `first_last_frame`.

- [ ] **Step 3: Write payload behavior tests**

Add focused tests to `video-reference.test.mts`:

```ts
test("builds Ark Seedance 2.5 audio-only payload", () => {
    const payload = buildSeedanceVideoTaskPayload({
        model: "doubao-seedance-2-5",
        videoSeconds: "30",
        size: "16:9",
        vquality: "480",
        videoGenerateAudio: "true",
        videoWatermark: "false",
    }, "跟随音频节奏生成", [], [], ["audio-url"]);

    assert.equal(payload.duration, 30);
    assert.equal(payload.resolution, "480p");
    assert.equal(payload.content.filter((item) => item.type === "audio_url").length, 1);
});

test("normalizes Ark Seedance 2.5 edit controls", () => {
    const payload = buildSeedanceVideoTaskPayload({
        model: "doubao-seedance-2-5",
        videoSeconds: "12",
        size: "16:9",
        vquality: "720",
        videoTaskMode: "edit",
        videoGenerateAudio: "true",
        videoWatermark: "false",
    }, "编辑视频", [{ type: "video", url: "video-url" }]);

    assert.equal(payload.duration, -1);
    assert.equal(payload.ratio, "adaptive");
});

test("rejects Ark Seedance 2.5 per-kind overflow", () => {
    const images = Array.from({ length: 31 }, (_, index) => `image-${index}`);
    assert.throws(() => buildSeedanceVideoTaskPayload({ model: "doubao-seedance-2-5" }, "prompt", images), /最多支持 30 张图片/);
});

test("allows omitted text only when Seedance has reference content", () => {
    assert.doesNotThrow(() => buildSeedanceVideoTaskPayload({ model: "doubao-seedance-2-5" }, "", [], [], ["audio-url"]));
    assert.throws(() => buildSeedanceVideoTaskPayload({ model: "doubao-seedance-2-5" }, "", []), /缺少视频提示词或参考素材/);
});
```

- [ ] **Step 4: Make content limits and pure-audio validation model-aware**

Add one internal limit helper in `video-reference.ts`:

```ts
function seedanceReferenceLimits(model: string) {
    return isSeedance25Model(model)
        ? { image: 30, video: 10, audio: 10, total: 50, allowAudioOnly: true }
        : { image: 9, video: 3, audio: 3, total: 12, allowAudioOnly: false };
}
```

Pass the capability model through `buildSeedanceContent`, `buildSeedanceDerivedContent`, `normalizeOrderedSeedanceReferences`, and `validateSeedanceReferenceMix`. Before mapping content, count non-empty references and throw exact messages such as `Seedance 2.5 最多支持 30 张图片` instead of silently truncating. Keep the existing Seedance 2.0 pure-audio error unchanged. Only append the text content item when `prompt.trim()` is non-empty, and throw `缺少视频提示词或参考素材` when the final content list is empty.

In `buildSeedanceVideoTaskPayload`, resolve `capabilityModel` once and use it consistently:

```ts
const capabilityModel = resolveSeedanceCapabilityModel(config, model);
const content = taskMode === "generate"
    ? buildSeedanceContent(prompt, imageUrls, videoUrls, audioUrls, capabilityModel)
    : buildSeedanceDerivedContent(prompt, imageUrls, videoUrls, audioUrls, capabilityModel);
const payload: Record<string, unknown> = {
    model,
    content,
    duration: normalizeSeedanceDuration(config.videoSeconds || "", capabilityModel, taskMode),
    ratio: normalizeSeedanceRatio(config.size || "", capabilityModel, taskMode, config.videoReferenceImageMode),
    resolution: normalizeSeedanceResolution(config.vquality || "", capabilityModel),
    generate_audio: config.videoGenerateAudio === "true",
    watermark: config.videoWatermark === "true",
    return_last_frame: config.returnLastFrame === "true",
};
```

- [ ] **Step 5: Stop pre-truncating Ark references**

Replace the hard-coded slices in `buildSeedanceVideoPayload` with full ordered arrays so validation is explicit and 2.5 can reach its limits:

```ts
async function buildSeedanceVideoPayload(config: AiConfig, prompt: string, references: NormalizedVideoReferences) {
    if (references.inputs.length) {
        const orderedReferences = (await Promise.all(references.inputs.map(seedanceOrderedReferenceInput))).filter((item): item is SeedanceOrderedReferenceInput => Boolean(item));
        return buildSeedanceVideoTaskPayload(config, prompt, orderedReferences);
    }
    const imageUrls = (await Promise.all(references.images.map(seedanceImageReferenceInput))).filter((image): image is SeedanceImageReferenceInput => Boolean(image));
    const videoUrls = (await Promise.all(references.videos.map(videoToDataUrl))).filter((url): url is string => Boolean(url));
    const audioUrls = (await Promise.all(references.audios.map(audioToDataUrl))).filter((url): url is string => Boolean(url));
    return buildSeedanceVideoTaskPayload(config, prompt, imageUrls, videoUrls, audioUrls);
}
```

- [ ] **Step 6: Record deferred verification**

```bash
cd web && node --experimental-strip-types --test src/services/api/video-normalizers.test.mts src/services/api/video-reference.test.mts
```

Expected: all normalizer and payload tests pass; no network request is made.

- [ ] **Step 7: Commit only this task's files**

```bash
git add web/src/services/api/video-normalizers.ts web/src/services/api/video-normalizers.test.mts web/src/services/api/video-reference.ts web/src/services/api/video-reference.test.mts web/src/services/api/video.ts
git commit -m "feat: build Ark Seedance 2.5 requests"
```

### Task 4: Preserve the local model for Go-side Ark validation

**Files:**
- Modify: `service/ark_video.go`
- Modify: `service/ark_video_test.go`
- Modify: `handler/ai.go`
- Modify: `handler/ai_test.go`

- [ ] **Step 1: Write backend model-aware tests**

Add tests in `service/ark_video_test.go` that call the routed builder with separate local model and EP:

```go
func TestBuildArkSeedance25RequestUsesEndpointAndKeepsCapabilities(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequestForModel([]byte(`{
		"model":"doubao-seedance-2-5",
		"content":[{"type":"text","text":"按音频生成"},{"type":"audio_url","audio_url":{"url":"asset://audio"}}],
		"duration":30,
		"resolution":"480p"
	}`), "application/json", "doubao-seedance-2-5", "ep-25")
	if err != nil { t.Fatalf("Build request: %v", err) }
	payload := readJSONMap(t, body)
	if payload["model"] != "ep-25" || payload["duration"] != float64(30) || payload["resolution"] != "480p" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestBuildArkSeedance25EditDurationKeepsAutomaticValue(t *testing.T) {
	body, _, err := BuildArkVideoCreateRequestForModel([]byte(`{
		"model":"doubao-seedance-2-5",
		"content":[{"type":"text","text":"编辑视频"},{"type":"video_url","video_url":{"url":"asset://video"}}],
		"duration":-1,
		"ratio":"adaptive"
	}`), "application/json", "doubao-seedance-2-5", "ep-25")
	if err != nil { t.Fatalf("Build request: %v", err) }
	payload := readJSONMap(t, body)
	if payload["duration"] != float64(-1) || payload["ratio"] != "adaptive" { t.Fatalf("payload = %#v", payload) }
}
```

Add a 31-image rejection test with expected error `Seedance 2.5 最多支持 30 张图片`, and retain the existing 2.0 audio-only rejection test.

Also add a no-input test that submits an empty text item and expects `缺少视频提示词或参考素材`; an empty prompt with a valid 2.5 audio item must remain accepted.

- [ ] **Step 2: Pass both model names through the handler**

Change the routed builder signature and call:

```go
func BuildArkVideoCreateRequestForModel(body []byte, contentType string, capabilityModelName string, upstreamModelName string) ([]byte, string, error) {
	return buildArkVideoCreateRequest(body, contentType, capabilityModelName, upstreamModelName)
}
```

```go
upstreamBody, upstreamContentType, err = service.BuildArkVideoCreateRequestForModel(
	body,
	contentType,
	modelName,
	service.ModelChannelEndpointForModel(channel, modelName),
)
```

Keep `BuildArkVideoCreateRequest` and the local-config path source compatible by using the request model as the capability model when no explicit local model is supplied.

- [ ] **Step 3: Make backend validation model-aware before Endpoint replacement**

Build and validate with `capabilityModelName`, then overwrite only the final payload model:

```go
payload, err := buildArkVideoPayload(fields, true, capabilityModelName)
if err != nil {
	return nil, "", err
}
if strings.TrimSpace(upstreamModelName) != "" {
	payload["model"] = strings.TrimSpace(upstreamModelName)
}
```

Add canonical helpers and use them from duration, resolution and content validation:

```go
func isArkSeedance25Model(modelName string) bool {
	normalized := strings.NewReplacer("_", "-", ".", "-").Replace(strings.ToLower(strings.TrimSpace(modelName)))
	return strings.Contains(normalized, "seedance-2-5") || strings.Contains(normalized, "seedance2-5")
}

func normalizeArkVideoDuration(value string, modelName string) int {
	var seconds int
	_, _ = fmt.Sscan(value, &seconds)
	if seconds == -1 && isArkSeedance25Model(modelName) { return -1 }
	if seconds <= 0 { return 6 }
	maximum := 15
	if isArkSeedance25Model(modelName) { maximum = 30 }
	return max(4, min(maximum, seconds))
}
```

For 2.5, `normalizeArkVideoResolution` returns `480p` only for a positive resolution at or below 480 and otherwise returns `720p`. Count content by `image_url`, `video_url`, and `audio_url`; enforce 30 / 10 / 10 for 2.5 and 9 / 3 / 3 for 2.0. Allow audio-only only when `isArkSeedance25Model` is true. Treat whitespace-only text items as empty and reject the request when neither meaningful text nor media remains.

- [ ] **Step 4: Add handler routing coverage**

Extend the existing Ark proxy test fixture with a `doubao-seedance-2-5 -> ep-25` mapping and assert that the upstream JSON contains `"model":"ep-25"`, `"duration":30`, and `"resolution":"480p"`. The fake `httptest.Server` must return a task ID and must not contact Volcengine.

- [ ] **Step 5: Record deferred verification**

```bash
go test ./service ./handler -run 'Ark|Seedance25'
```

Expected: targeted Ark service and handler tests pass using only local test servers.

- [ ] **Step 6: Commit only this task's files**

```bash
git add service/ark_video.go service/ark_video_test.go handler/ai.go handler/ai_test.go
git commit -m "feat: validate Ark Seedance 2.5 server requests"
```

### Task 5: Record the user-visible change and handoff checks

**Files:**
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`
- Inspect only: `docs/todo.md`

- [ ] **Step 1: Inspect todo and current pending-test edits before writing**

Run read-only checks:

```bash
git diff -- docs/todo.md docs/pending-test.md CHANGELOG.md
sed -n '1,90p' docs/pending-test.md
sed -n '1,35p' CHANGELOG.md
```

Preserve all existing user edits. Do not remove a todo unless it explicitly describes this Ark 2.5 adaptation.

- [ ] **Step 2: Add a concise pending-test section**

Record these exact user checks near the current version's pending items:

```md
### 火山 Ark Seedance 2.5 新增模型适配

- 后台火山厂商预设保留 Seedance 2.0 EP，并可单独填写 Seedance 2.5 EP；保存后两种本地模型可独立映射。
- 画布选择 `doubao-seedance-2-5` 后显示 4–30 秒、480p / 720p 和多模态能力，允许纯音频，并按 30 图 / 10 视频 / 10 音频校验。
- 2.5 首帧、首尾帧、编辑与延长请求使用 `adaptive`；编辑任务使用 `duration: -1`。
- 本轮未调用真实火山视频生成接口；付费冒烟仍需用户另行明确授权。
```

- [ ] **Step 3: Add one Unreleased summary line**

```md
+ [新增] 火山 Ark 保留 Seedance 2.0 并新增 Seedance 2.5 独立 EP 映射，适配 30 秒、480p/720p、纯音频和更高多模态素材上限。
```

- [ ] **Step 4: Review only the files changed by this feature**

```bash
git diff --check -- web/src/app/\(admin\)/admin/settings/model-channel-presets.ts web/src/app/\(admin\)/admin/settings/model-channel-presets.test.mts web/src/app/\(admin\)/admin/settings/components/provider-preset-modal.tsx web/src/lib/dreamina-video-capabilities.ts web/src/lib/dreamina-video-capabilities.test.mts web/src/services/api/video-normalizers.ts web/src/services/api/video-normalizers.test.mts web/src/services/api/video-reference.ts web/src/services/api/video-reference.test.mts web/src/services/api/video.ts service/ark_video.go service/ark_video_test.go handler/ai.go handler/ai_test.go docs/pending-test.md CHANGELOG.md
```

Expected: no whitespace errors. This is not a build or test command.

- [ ] **Step 5: Commit documentation without staging unrelated user changes**

If `docs/pending-test.md` already contains unrelated unstaged edits, use an interactive patch or leave the documentation unstaged for the user rather than staging their work wholesale. Otherwise:

```bash
git add docs/pending-test.md CHANGELOG.md
git commit -m "docs: record Ark Seedance 2.5 adaptation"
```

## Deferred full acceptance

Only when the user explicitly asks for a complete check:

```bash
go test ./service ./handler
cd web && npm test
cd web && npm run typecheck
```

Expected: all Go tests, frontend unit tests and TypeScript checks pass. Do not run a real Seedance generation command as part of acceptance.
