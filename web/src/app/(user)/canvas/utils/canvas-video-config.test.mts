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
    textModel: "gpt-5.5",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "false",
    videoWatermark: "false",
    videoSeed: "",
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
    assert.equal(arkConfig.model, "doubao-seedance-model");
    assert.equal(arkConfig.seedanceModel, "doubao-seedance-model");
});

test("video provider patch resets node model to the selected provider default", () => {
    assert.deepEqual(buildCanvasVideoProviderPatch(baseConfig, "openai"), {
        provider: "openai",
        model: "openai-video-model",
    });
    assert.deepEqual(buildCanvasVideoProviderPatch(baseConfig, "volcengine-ark"), {
        provider: "volcengine-ark",
        model: "doubao-seedance-model",
    });
});

test("video mode patch starts config nodes with the active video provider model", () => {
    assert.deepEqual(buildCanvasVideoModePatch(baseConfig), {
        generationMode: "video",
        provider: "volcengine-ark",
        model: "doubao-seedance-model",
    });
    assert.deepEqual(buildCanvasVideoModePatch({ ...baseConfig, videoProtocol: "openai" }), {
        generationMode: "video",
        provider: "openai",
        model: "openai-video-model",
    });
});
