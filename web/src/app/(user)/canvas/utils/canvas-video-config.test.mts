import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasVideoConfig, buildCanvasVideoModePatch, buildCanvasVideoProviderPatch } from "./canvas-video-config.ts";

const baseConfig = {
    channelMode: "local",
    videoProtocol: "volcengine-ark",
    baseUrl: "https://api.example.com",
    apiKey: "openai-key",
    volcengineBaseUrl: "https://ark.example.com/api/v3",
    volcengineApiKey: "ark-key",
    model: "gpt-image-2",
    imageModel: "gpt-image-2",
    videoModel: "openai-video-model",
    seedanceModel: "doubao-seedance-model",
    seedanceEndpointId: "ep-seedance-endpoint",
    textModel: "gpt-5.5",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "false",
    videoWatermark: "false",
    videoSeed: "",
    videoTaskMode: "generate",
    videoEditType: "replace",
    videoExtendDirection: "forward",
    videoReferenceImageMode: "reference",
    systemPrompt: "",
    models: [],
    quality: "auto",
    size: "1:1",
    count: "1",
} as const;

test("video node provider overrides global provider and uses matching default model", () => {
    const openaiConfig = buildCanvasVideoConfig(baseConfig, { provider: "openai" });
    assert.equal(openaiConfig.videoProtocol, "openai");
    assert.equal(openaiConfig.model, "openai-video-model");
    assert.equal(openaiConfig.videoModel, "openai-video-model");
    assert.equal(openaiConfig.seedanceModel, "doubao-seedance-model");

    const arkConfig = buildCanvasVideoConfig({ ...baseConfig, videoProtocol: "openai" }, { provider: "volcengine-ark" });
    assert.equal(arkConfig.videoProtocol, "volcengine-ark");
    assert.equal(arkConfig.model, "ep-seedance-endpoint");
    assert.equal(arkConfig.seedanceModel, "ep-seedance-endpoint");
});

test("video provider patch resets node model to the selected provider default", () => {
    assert.deepEqual(buildCanvasVideoProviderPatch(baseConfig, "openai"), {
        provider: "openai",
        model: "openai-video-model",
    });
    assert.deepEqual(buildCanvasVideoProviderPatch(baseConfig, "volcengine-ark"), {
        provider: "volcengine-ark",
        model: "ep-seedance-endpoint",
    });
});

test("video mode patch starts config nodes with the active video provider model", () => {
    assert.deepEqual(buildCanvasVideoModePatch(baseConfig), {
        generationMode: "video",
        provider: "volcengine-ark",
        model: "ep-seedance-endpoint",
    });
    assert.deepEqual(buildCanvasVideoModePatch({ ...baseConfig, videoProtocol: "openai" }), {
        generationMode: "video",
        provider: "openai",
        model: "openai-video-model",
    });
});

test("video config normalizes duration by provider capability", () => {
    assert.equal(buildCanvasVideoConfig(baseConfig, { provider: "volcengine-ark", seconds: "20" }).videoSeconds, "15");
    assert.equal(buildCanvasVideoConfig(baseConfig, { provider: "volcengine-ark", seconds: "3" }).videoSeconds, "4");
    assert.equal(buildCanvasVideoConfig(baseConfig, { provider: "volcengine-ark", seconds: "11" }).videoSeconds, "11");
    assert.equal(buildCanvasVideoConfig({ ...baseConfig, videoProtocol: "openai" }, { provider: "openai", seconds: "20" }).videoSeconds, "20");
});

test("video config restores Seedance task mode fields from node metadata", () => {
    const config = buildCanvasVideoConfig(baseConfig, {
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
