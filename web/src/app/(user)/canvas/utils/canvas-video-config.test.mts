import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasVideoConfig, buildCanvasVideoDefaultsPatch, buildCanvasVideoModePatch, buildCanvasVideoProviderPatch } from "./canvas-video-config.ts";

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
        size: "1:1",
        seconds: "6",
        vquality: "720",
        generateAudio: "false",
        watermark: "false",
        seed: "",
        returnLastFrame: undefined,
        videoTaskMode: "generate",
        videoEditType: "replace",
        videoExtendDirection: "forward",
        videoReferenceImageMode: "reference",
    });
    assert.deepEqual(buildCanvasVideoModePatch({ ...baseConfig, videoProtocol: "openai" }), {
        generationMode: "video",
        provider: "openai",
        model: "openai-video-model",
        size: "1:1",
        seconds: "6",
        vquality: "720",
        generateAudio: "false",
        watermark: "false",
        seed: "",
        returnLastFrame: undefined,
        videoTaskMode: "generate",
        videoEditType: "replace",
        videoExtendDirection: "forward",
        videoReferenceImageMode: "reference",
    });
});

test("video mode patch clamps Seedance duration from global defaults", () => {
    assert.equal(buildCanvasVideoModePatch({ ...baseConfig, videoSeconds: "20" }).seconds, "15");
    assert.equal(buildCanvasVideoModePatch({ ...baseConfig, videoSeconds: "3" }).seconds, "4");
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

test("builds global video defaults from config node metadata changes", () => {
    assert.deepEqual(
        buildCanvasVideoDefaultsPatch(baseConfig, {
            provider: "volcengine-ark",
            model: "ep-next",
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
            seedanceEndpointId: "ep-next",
            size: "9:16",
            videoSeconds: "15",
            vquality: "1080",
            videoGenerateAudio: "true",
            videoWatermark: "true",
            videoSeed: "42",
            videoReferenceImageMode: "first_frame",
        },
    );
    assert.deepEqual(buildCanvasVideoDefaultsPatch({ ...baseConfig, videoProtocol: "openai" }, { provider: "openai", model: "openai-next", seconds: "20" }), {
        videoProtocol: "openai",
        videoModel: "openai-next",
        videoSeconds: "20",
    });
});
