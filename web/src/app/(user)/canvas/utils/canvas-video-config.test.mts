import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasVideoConfig, buildCanvasVideoDefaultsPatch, buildCanvasVideoModelPatch, buildCanvasVideoModePatch, resolveCanvasVideoChannelConfig } from "./canvas-video-config.ts";

const baseConfig = {
    channelMode: "local",
    videoProtocol: "volcengine-ark",
    baseUrl: "https://api.example.com",
    apiKey: "openai-key",
    volcengineBaseUrl: "https://ark.example.com/api/v3",
    volcengineApiKey: "ark-key",
    model: "gpt-image-2",
    imageModel: "gpt-image-2",
    videoModel: "doubao-seedance-model",
    seedanceModel: "doubao-seedance-model",
    seedanceEndpointId: "",
    textModel: "gpt-5.5",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "false",
    videoWatermark: "false",
    videoSeed: "",
    videoPromptReviewEnabled: "true",
    videoTaskMode: "generate",
    videoEditType: "replace",
    videoExtendDirection: "forward",
    videoReferenceImageMode: "reference",
    videoReferenceMode: "auto",
    systemPrompt: "",
    models: ["gpt-image-2", "doubao-seedance-model", "gpt-5.5"],
    imageModels: ["gpt-image-2"],
    videoModels: ["doubao-seedance-model"],
    textModels: ["gpt-5.5"],
    modelCapabilities: [
        { model: "gpt-image-2", capabilities: ["image"] },
        { model: "doubao-seedance-model", capabilities: ["video"] },
        { model: "gpt-5.5", capabilities: ["text"] },
    ],
    modelProtocols: [{ model: "doubao-seedance-model", protocol: "volcengine-ark" }],
    quality: "auto",
    size: "1:1",
    count: "1",
} as const;

const cloudConfig = { ...baseConfig, channelMode: "remote" } as const;

test("node panels keep the current canvas preset defaults", () => {
    const canvasPresetConfig = {
        ...cloudConfig,
        size: "9:16",
        vquality: "1080",
        videoSeconds: "8",
    } as const;

    const resolved = resolveCanvasVideoChannelConfig(baseConfig, canvasPresetConfig, undefined);

    assert.equal(resolved.size, "9:16");
    assert.equal(resolved.vquality, "1080");
    assert.equal(resolved.videoSeconds, "8");
});

const catalogConfig = {
    ...cloudConfig,
    videoProtocol: "openai",
    model: "text-model",
    imageModel: "image-model",
    videoModel: "sd2-720p-fast",
    textModel: "text-model",
    models: ["image-model", "sd2-720p-fast", "text-model"],
    imageModels: ["image-model"],
    videoModels: ["sd2-720p-fast"],
    textModels: ["text-model"],
    modelCapabilities: [
        { model: "image-model", capabilities: ["image"] },
        { model: "sd2-720p-fast", capabilities: ["video"] },
        { model: "text-model", capabilities: ["text"] },
    ],
    modelProtocols: [{ model: "sd2-720p-fast", protocol: "xinglian-cloud" }],
} as const;

function routedVideoConfig(model: string, protocol: "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud") {
    return {
        ...cloudConfig,
        videoModel: model,
        models: ["gpt-image-2", model, "gpt-5.5"],
        videoModels: [model],
        modelCapabilities: [
            { model: "gpt-image-2", capabilities: ["image"] },
            { model, capabilities: ["video"] },
            { model: "gpt-5.5", capabilities: ["text"] },
        ],
        modelProtocols: [{ model, protocol }],
    } as const;
}

test("video node ignores provider metadata and uses the catalog route", () => {
    const openaiConfig = buildCanvasVideoConfig(baseConfig, { provider: "openai" });
    assert.equal(openaiConfig.videoProtocol, "volcengine-ark");
    assert.equal(openaiConfig.model, "doubao-seedance-model");
    assert.equal(openaiConfig.videoModel, "doubao-seedance-model");
    assert.equal(openaiConfig.seedanceModel, "doubao-seedance-model");

    const arkConfig = buildCanvasVideoConfig({ ...cloudConfig, videoProtocol: "openai" }, { provider: "volcengine-ark" });
    assert.equal(arkConfig.videoProtocol, "volcengine-ark");
    assert.equal(arkConfig.model, "doubao-seedance-model");
    assert.equal(arkConfig.seedanceModel, "doubao-seedance-model");
});

test("video mode patch starts config nodes with the active video provider model", () => {
    assert.deepEqual(buildCanvasVideoModePatch(baseConfig), {
        generationMode: "video",
        channelMode: "remote",
        model: "doubao-seedance-model",
        size: "1:1",
        seconds: "6",
        duration: "6",
        vquality: "720",
        generateAudio: "false",
        watermark: "false",
        seed: "",
        videoPromptReviewEnabled: "true",
        returnLastFrame: undefined,
        videoTaskMode: "generate",
        videoEditType: "replace",
        videoExtendDirection: "forward",
        videoReferenceImageMode: "reference",
        videoReferenceMode: "auto",
    });
    assert.deepEqual(buildCanvasVideoModePatch(cloudConfig), {
        generationMode: "video",
        channelMode: "remote",
        model: "doubao-seedance-model",
        size: "1:1",
        seconds: "6",
        duration: "6",
        vquality: "720",
        generateAudio: "false",
        watermark: "false",
        seed: "",
        videoPromptReviewEnabled: "true",
        returnLastFrame: undefined,
        videoTaskMode: "generate",
        videoEditType: "replace",
        videoExtendDirection: "forward",
        videoReferenceImageMode: "reference",
        videoReferenceMode: "auto",
    });
});

test("video node always uses the backend channel even when metadata is stale", () => {
    const remoteNodeConfig = buildCanvasVideoConfig(baseConfig, {
        channelMode: "remote",
        provider: "volcengine-ark",
        model: "ep-node",
    });
    assert.equal(remoteNodeConfig.channelMode, "remote");
    assert.equal(remoteNodeConfig.videoProtocol, "volcengine-ark");
    assert.equal(remoteNodeConfig.model, "doubao-seedance-model");

    const localNodeConfig = buildCanvasVideoConfig(cloudConfig, {
        channelMode: "local",
        provider: "volcengine-ark",
        model: "local-video-node",
    });
    assert.equal(localNodeConfig.channelMode, "remote");
    assert.equal(localNodeConfig.videoProtocol, "volcengine-ark");
    assert.equal(localNodeConfig.model, "doubao-seedance-model");
});

test("video node follows backend model protocol mapping before stale node provider", () => {
    const config = buildCanvasVideoConfig(
        routedVideoConfig("doubao-seedance-2-0", "volcengine-ark"),
        {
            provider: "openai",
            model: "doubao-seedance-2-0",
        },
    );

    assert.equal(config.videoProtocol, "volcengine-ark");
    assert.equal(config.model, "doubao-seedance-2-0");
    assert.equal(config.seedanceModel, "doubao-seedance-2-0");
});

test("video node supports Jimeng CLI provider mapping", () => {
    const config = buildCanvasVideoConfig(
        routedVideoConfig("seedance2.0fast", "jimeng-cli"),
        {
            provider: "openai",
            model: "seedance2.0fast",
        },
    );

    assert.equal(config.videoProtocol, "jimeng-cli");
    assert.equal(config.model, "seedance2.0fast");
    assert.equal(config.videoModel, "seedance2.0fast");
    assert.equal(config.seedanceModel, "doubao-seedance-model");
});

test("video node ignores stale provider and routes through the selected model catalog entry", () => {
    const config = buildCanvasVideoConfig(catalogConfig, {
        provider: "volcengine-ark",
        model: "sd2-720p-fast",
    });

    assert.equal(config.model, "sd2-720p-fast");
    assert.equal(config.videoModel, "sd2-720p-fast");
    assert.equal(config.videoProtocol, "xinglian-cloud");
    assert.equal(config.seedanceEndpointId, "");
});

test("video node rejects a model without video capability", () => {
    const config = buildCanvasVideoConfig(catalogConfig, {
        provider: "openai",
        model: "image-model",
    });

    assert.equal(config.model, "sd2-720p-fast");
    assert.equal(config.videoProtocol, "xinglian-cloud");
});

test("video mode patch clamps Seedance duration from global defaults", () => {
    assert.equal(buildCanvasVideoModePatch({ ...cloudConfig, videoSeconds: "20" }).seconds, "15");
    assert.equal(buildCanvasVideoModePatch({ ...cloudConfig, videoSeconds: "3" }).seconds, "4");
});

test("video config normalizes duration by provider capability", () => {
    assert.equal(buildCanvasVideoConfig(cloudConfig, { provider: "volcengine-ark", seconds: "20" }).videoSeconds, "15");
    assert.equal(buildCanvasVideoConfig(cloudConfig, { provider: "volcengine-ark", seconds: "3" }).videoSeconds, "4");
    assert.equal(buildCanvasVideoConfig(cloudConfig, { provider: "volcengine-ark", seconds: "11" }).videoSeconds, "11");
    assert.equal(buildCanvasVideoConfig(cloudConfig, { provider: "volcengine-ark", duration: "9" }).videoSeconds, "9");
    assert.equal(buildCanvasVideoConfig(routedVideoConfig("seedance2.0fast", "jimeng-cli"), { provider: "openai", seconds: "20" }).videoSeconds, "15");
    assert.equal(buildCanvasVideoConfig(routedVideoConfig("seedance2.0fast", "jimeng-cli"), { provider: "openai", seconds: "3" }).videoSeconds, "4");
    assert.equal(buildCanvasVideoConfig(routedVideoConfig("openai-video", "openai"), { provider: "volcengine-ark", seconds: "20" }).videoSeconds, "20");
    assert.equal(buildCanvasVideoConfig(catalogConfig, { seconds: "20" }).videoSeconds, "15");
});

test("Seedance 2.5 keeps Dreamina durations up to 30 seconds", () => {
    const config = routedVideoConfig("seedance2.5", "jimeng-cli");

    assert.equal(buildCanvasVideoConfig(config, { seconds: "30" }).videoSeconds, "30");
    assert.equal(buildCanvasVideoConfig(config, { seconds: "40" }).videoSeconds, "30");
    assert.equal(buildCanvasVideoModePatch({ ...config, videoSeconds: "24" }).seconds, "24");
});

test("Ark Seedance 2.5 keeps durations up to 30 seconds", () => {
    const config = routedVideoConfig("doubao-seedance-2-5", "volcengine-ark");

    assert.equal(buildCanvasVideoConfig(config, { seconds: "30" }).videoSeconds, "30");
    assert.equal(buildCanvasVideoConfig(config, { seconds: "40" }).videoSeconds, "30");
    assert.equal(buildCanvasVideoModePatch({ ...config, videoSeconds: "24" }).seconds, "24");
    assert.equal(buildCanvasVideoConfig(routedVideoConfig("doubao-seedance-2-0", "volcengine-ark"), { seconds: "30" }).videoSeconds, "15");
    assert.equal(buildCanvasVideoConfig(routedVideoConfig("doubao-seedance-model", "volcengine-ark"), { seconds: "30" }).videoSeconds, "15");
});

test("normalizes duration and resolution when changing Dreamina models", () => {
    const config = {
        ...routedVideoConfig("seedance2.0fast", "jimeng-cli"),
        videoSeconds: "30",
        vquality: "480",
        videoReferenceMode: "multimodal2video",
    } as const;

    assert.deepEqual(buildCanvasVideoModelPatch(config, "seedance2.0fast"), {
        model: "seedance2.0fast",
        provider: "jimeng-cli",
        seconds: "15",
        duration: "15",
        vquality: "720",
    });
});

test("keeps Seedance 2.5 settings inside its range", () => {
    const config = {
        ...routedVideoConfig("seedance2.5", "jimeng-cli"),
        videoSeconds: "24",
        vquality: "480",
        videoReferenceMode: "multimodal2video",
    } as const;
    const patch = buildCanvasVideoModelPatch(config, "seedance2.5");

    assert.equal(patch.seconds, "24");
    assert.equal(patch.vquality, "480");
});

test("maps a previous 15 second model maximum to the 30 second maximum when selecting Xinglian SD2.5", () => {
    const config = {
        ...routedVideoConfig("sd2-720p-fast", "xinglian-cloud"),
        videoSeconds: "15",
        vquality: "720",
        modelProtocols: [
            { model: "sd2-720p-fast", protocol: "xinglian-cloud" as const },
            { model: "sd2.5-720p-ax2", protocol: "xinglian-cloud" as const },
        ],
        modelCapabilities: [
            { model: "sd2-720p-fast", capabilities: ["video" as const] },
            { model: "sd2.5-720p-ax2", capabilities: ["video" as const] },
        ],
        videoModels: ["sd2-720p-fast", "sd2.5-720p-ax2"],
    } as const;

    assert.deepEqual(buildCanvasVideoModelPatch(config, "sd2.5-720p-ax2"), {
        model: "sd2.5-720p-ax2",
        provider: "xinglian-cloud",
        seconds: "30",
        duration: "30",
        vquality: "720",
    });
});

test("video config ignores completed task duration when editable seconds exist", () => {
    assert.equal(buildCanvasVideoConfig(cloudConfig, { provider: "volcengine-ark", taskId: "task-1", seconds: "6", duration: "10" }).videoSeconds, "6");
    assert.equal(buildCanvasVideoConfig({ ...cloudConfig, videoSeconds: "6" }, { provider: "volcengine-ark", taskId: "task-1", duration: "10" }).videoSeconds, "6");
});

test("video config keeps audio off by default but preserves explicit node choice", () => {
    assert.equal(buildCanvasVideoConfig({ ...cloudConfig, videoGenerateAudio: "true" }, { provider: "volcengine-ark" }).videoGenerateAudio, "true");
    assert.equal(buildCanvasVideoConfig(cloudConfig, { provider: "volcengine-ark", generateAudio: "true" }).videoGenerateAudio, "true");
    assert.equal(buildCanvasVideoModePatch({ ...cloudConfig, videoGenerateAudio: "true" }).generateAudio, "true");
});

test("video config restores Seedance task mode fields from node metadata", () => {
    const config = buildCanvasVideoConfig(cloudConfig, {
        provider: "volcengine-ark",
        videoTaskMode: "edit",
        videoEditType: "replace",
        videoExtendDirection: "backward",
        videoReferenceImageMode: "first_last_frame",
    });

    assert.equal(config.videoTaskMode, "edit");
    assert.equal(config.videoEditType, "replace");
    assert.equal(config.videoExtendDirection, "backward");
    assert.equal(config.videoReferenceImageMode, "first_last_frame");
});

test("video config preserves an explicit Dreamina reference mode", () => {
    const config = buildCanvasVideoConfig(routedVideoConfig("seedance2.0fast", "jimeng-cli"), {
        videoReferenceMode: "multiframe2video",
        videoReferenceImageMode: "reference",
    });

    assert.equal(config.videoReferenceMode, "multiframe2video");
});

test("video config infers Dreamina modes for legacy nodes", () => {
    const jimengConfig = routedVideoConfig("seedance2.0fast", "jimeng-cli");

    assert.equal(buildCanvasVideoConfig(jimengConfig, { videoReferenceMode: undefined, references: [] }).videoReferenceMode, "text2video");
    assert.equal(buildCanvasVideoConfig(jimengConfig, { videoReferenceMode: undefined, references: ["image.png"], videoReferenceImageMode: "first_frame" }).videoReferenceMode, "image2video");
    assert.equal(buildCanvasVideoConfig(jimengConfig, { videoReferenceMode: undefined, references: ["first.png", "last.png"], videoReferenceImageMode: "first_last_frame" }).videoReferenceMode, "frames2video");
    assert.equal(buildCanvasVideoConfig(jimengConfig, { videoReferenceMode: undefined, references: ["1.png", "2.png", "3.png"] }).videoReferenceMode, "multiframe2video");
    assert.equal(buildCanvasVideoConfig(jimengConfig, { videoReferenceMode: undefined, references: ["image.png"], videoReferences: ["video.mp4"] }).videoReferenceMode, "multimodal2video");
    assert.equal(buildCanvasVideoConfig(jimengConfig, { videoReferenceMode: undefined, references: ["tail-frame.png"], videoReferenceImageMode: "continue" }).videoReferenceMode, "multimodal2video");
});

test("builds global video defaults from config node metadata changes", () => {
    assert.deepEqual(
        buildCanvasVideoDefaultsPatch(routedVideoConfig("seedance-next", "volcengine-ark"), {
            provider: "openai",
            model: "seedance-next",
            size: "9:16",
            seconds: "20",
            vquality: "1080",
            generateAudio: "true",
            watermark: "true",
            seed: "42",
            videoReferenceImageMode: "first_frame",
        }),
        {
            videoProtocol: "volcengine-ark",
            videoModel: "seedance-next",
            seedanceModel: "seedance-next",
            seedanceEndpointId: "",
            size: "9:16",
            videoSeconds: "15",
            vquality: "1080",
            videoGenerateAudio: "true",
            videoWatermark: "true",
            videoSeed: "42",
            videoReferenceImageMode: "first_frame",
        },
    );
    assert.deepEqual(buildCanvasVideoDefaultsPatch(routedVideoConfig("openai-next", "openai"), { provider: "volcengine-ark", model: "openai-next", seconds: "20" }), {
        videoProtocol: "openai",
        videoModel: "openai-next",
        seedanceEndpointId: "",
        videoSeconds: "20",
    });
});
