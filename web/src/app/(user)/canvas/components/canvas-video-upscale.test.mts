import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolbar = await readFile(new URL("./canvas-node-hover-toolbar.tsx", import.meta.url), "utf8");
const inspector = await readFile(new URL("./canvas-node-inspector.tsx", import.meta.url), "utf8");
const modal = await readFile(new URL("./canvas-video-upscale-modal.tsx", import.meta.url), "utf8");
const overlays = await readFile(new URL("./canvas-page-overlays.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../hooks/use-canvas-node-tool-actions.ts", import.meta.url), "utf8");
const hook = await readFile(new URL("../hooks/use-canvas-video-upscale-actions.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../[id]/canvas-client-page.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../../../../services/api/video-upscale.ts", import.meta.url), "utf8");

test("only populated video nodes expose the video upscale action", () => {
    assert.match(toolbar, /if \(hasVideo\).*video-upscale/s);
    assert.match(inspector, /CanvasNodeType\.Video && hasMedia.*视频超分/s);
});

test("modal displays source target duration and cloud billing warning", () => {
    for (const text of ["源规格", "目标规格", "时长", "云端付费", "原视频节点不会被替换"]) assert.match(modal, new RegExp(text));
});

test("modal exposes available interpolation choices and processing modes", () => {
    for (const text of ["兼容", "均衡", "母版", "保留原音频", "智能插帧至 25fps", "智能插帧至 30fps", "智能插帧 2×", "智能插帧至 60fps", "极速", "快速", "高质量"]) assert.match(modal, new RegExp(text));
    assert.match(modal, /useState<VideoFrameInterpolationMode>\("keep"\)/);
    assert.match(modal, /useState<VideoInterpolationProcessingMode>\("fast"\)/);
    assert.match(modal, /value="to25" disabled=\{!validInterpolationTarget\(25\)\}/);
    assert.match(modal, /value="to30" disabled=\{!validInterpolationTarget\(30\)\}/);
    assert.match(modal, /value="to60" disabled=\{!validInterpolationTarget\(60\)\}/);
});

test("modal selects an available enhancement provider for each task", () => {
    for (const text of ["火山 LAS", "腾讯 MPS", "漫剧增强", "真人增强", "老片修复"]) assert.match(modal, new RegExp(text));
    assert.match(modal, /capabilities\?\.providers\.length === 1/);
    assert.match(modal, /setProvider\(capabilities\.providers\[0\]\.id\)/);
    assert.match(modal, /providerCapability\?\.defaultScene/);
});

test("Tencent tasks hide LAS-only controls and display the billing notice", () => {
    assert.match(modal, /const isTencent = provider === "tencent-mps"/);
    assert.match(modal, /!isTencent \? <OptionRow label="输出质量"/);
    assert.match(modal, /!isTencent \? <OptionRow label="音频"/);
    assert.match(modal, /!isTencent \? <div>/);
    assert.match(modal, /!isTencent \? <CostCard/);
    assert.match(modal, /providerCapability\?\.costNotice/);
    assert.match(modal, /开始腾讯 MPS 增强/);
});

test("video upscale API exposes and submits Tencent enhancement templates", () => {
    assert.match(api, /VideoUpscaleProviderID = "volcengine-las" \| "tencent-mps"/);
    assert.match(api, /TencentMPSEnhancementScene = "comic" \| "live" \| "restore" \| "custom"/);
    assert.match(api, /type TencentMPSTemplateCapability/);
    assert.match(api, /templates: TencentMPSTemplateCapability\[\]/);
    assert.match(api, /form\.append\("provider", input\.provider\)/);
    assert.match(api, /form\.append\("enhancementScene", input\.enhancementScene \|\| ""\)/);
    assert.match(api, /form\.append\("tencentTemplateId", input\.tencentTemplateId \? String\(input\.tencentTemplateId\) : ""\)/);
});

test("modal explains the estimate and sends all selections", () => {
    for (const text of ["分辨率系数", "帧率系数", "折算计费时长", "LAS 超分费用", "暂无法预估", "预估金额，实际费用以火山引擎账单为准"]) assert.match(modal, new RegExp(text));
    assert.match(modal, /预计.*开始视频超分/);
    for (const field of ["outputQualityMode", "preserveAudio", "frameInterpolationMode", "interpolationMode"]) {
        assert.match(modal, new RegExp(field));
    }
    assert.match(hook, /VideoUpscaleSubmitOptions/);
    assert.match(hook, /createVideoUpscaleJob\(\{.*\.\.\.options.*projectId/s);
});

test("modal separates upscale interpolation and total costs", () => {
    for (const text of ["LAS 超分费用", "插帧目标", "插帧输入分辨率", "差值帧率", "插帧模式", "插帧基础系数", "插帧折算时长", "插帧预计费用", "预计总费用", "识别成功前不会提交付费任务"]) assert.match(modal, new RegExp(text));
});

test("modal never treats project preset fps as measured media metadata", () => {
    assert.doesNotMatch(modal, /metadata\?\.fps/);
    assert.doesNotMatch(modal, /metadata\?\.frameRate/);
    assert.match(modal, /videoUpscale\?\.inputFrameRate/);
});

test("cost card uses the canvas theme border and labels the audio switch", () => {
    assert.match(modal, /border-\[var\(--studio-border-subtle\)\]/);
    assert.match(modal, /aria-label="保留原音频"/);
    for (const label of ["输出质量", "帧率", "插帧模式"]) assert.match(modal, new RegExp(`aria-label="${label}"`));
});

test("canvas assembly keeps video upscale in its own hook and modal", () => {
    assert.match(hook, /createVideoUpscaleJob/);
    assert.match(hook, /retryVideoUpscaleJob/);
    assert.match(hook, /getMediaBlob/);
    assert.match(hook, /uploadMediaFile/);
    assert.match(hook, /cacheUploadedCanvasMedia/);
    assert.match(hook, /addCanvasNodeToAssets/);
    assert.match(actions, /node\.type.*Video.*openVideoUpscale/s);
    assert.match(actions, /videoUpscale.*retryVideoUpscale/s);
    assert.match(overlays, /CanvasVideoUpscaleModal/);
    assert.match(page, /useCanvasVideoUpscaleActions/);
});
