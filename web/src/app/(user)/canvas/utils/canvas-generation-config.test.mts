import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationConfig, buildRetryGenerationConfig } from "./canvas-generation-config.ts";

const baseConfig = {
    channelMode: "local",
    videoProtocol: "volcengine-ark",
    baseUrl: "https://api.example.com",
    apiKey: "openai-key",
    volcengineBaseUrl: "https://ark.example.com/api/v3",
    volcengineApiKey: "ark-key",
    model: "base-model",
    imageModel: "image-model",
    videoModel: "video-model",
    seedanceModel: "seedance-model",
    seedanceEndpointId: "ep-seedance-endpoint",
    textModel: "text-model",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "false",
    videoWatermark: "false",
    videoSeed: "",
    returnLastFrame: "false",
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

test("builds image generation config from node metadata before global defaults", () => {
    const config = buildGenerationConfig(
        baseConfig,
        {
            id: "image-config",
            type: "config",
            title: "配置",
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            metadata: { model: "node-image-model", quality: "high", size: "16:9", count: 4 },
        },
        "image",
        baseConfig,
    );

    assert.equal(config.model, "node-image-model");
    assert.equal(config.quality, "high");
    assert.equal(config.size, "16:9");
    assert.equal(config.count, "4");
});

test("builds video generation config through provider-aware video config", () => {
    const config = buildGenerationConfig(
        { ...baseConfig, channelMode: "remote" },
        {
            id: "video-config",
            type: "config",
            title: "配置",
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            metadata: { provider: "volcengine-ark", model: "node-endpoint", seconds: "20", generateAudio: "true", count: 2 },
        },
        "video",
        baseConfig,
    );

    assert.equal(config.videoProtocol, "volcengine-ark");
    assert.equal(config.model, "node-endpoint");
    assert.equal(config.seedanceModel, "node-endpoint");
    assert.equal(config.videoSeconds, "15");
    assert.equal(config.videoGenerateAudio, "true");
    assert.equal(config.count, "2");

    const localConfig = buildGenerationConfig(
        baseConfig,
        {
            id: "video-config",
            type: "config",
            title: "配置",
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            metadata: { provider: "volcengine-ark", model: "node-endpoint", seconds: "20", count: 2 },
        },
        "video",
        baseConfig,
    );
    assert.equal(localConfig.videoProtocol, "volcengine-ark");
    assert.equal(localConfig.model, "node-endpoint");
    assert.equal(localConfig.videoSeconds, "15");
});

test("builds video generation config from duration metadata when seconds is missing", () => {
    const config = buildGenerationConfig(
        { ...baseConfig, channelMode: "remote" },
        {
            id: "video-config",
            type: "config",
            title: "配置",
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            metadata: { provider: "volcengine-ark", model: "node-endpoint", duration: "9" },
        },
        "video",
        baseConfig,
    );

    assert.equal(config.videoSeconds, "9");
});

test("ignores non-video node duration metadata when building video config", () => {
    const config = buildGenerationConfig(
        { ...baseConfig, channelMode: "remote", videoSeconds: "6" },
        {
            id: "source-image",
            type: "image",
            title: "参考图",
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            metadata: { provider: "volcengine-ark", model: "image-model", duration: "10" },
        },
        "video",
        baseConfig,
    );

    assert.equal(config.videoSeconds, "6");

    const explicitSeconds = buildGenerationConfig(
        { ...baseConfig, channelMode: "remote", videoSeconds: "6" },
        {
            id: "source-image",
            type: "image",
            title: "参考图",
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            metadata: { provider: "volcengine-ark", model: "image-model", seconds: "8", duration: "10" },
        },
        "video",
        baseConfig,
    );

    assert.equal(explicitSeconds.videoSeconds, "8");
});

test("builds retry config from saved image generation metadata", () => {
    const config = buildRetryGenerationConfig({
        config: baseConfig,
        sourceNode: {
            id: "source",
            type: "config",
            title: "配置",
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            metadata: { model: "source-model" },
        },
        targetNode: {
            id: "image",
            type: "image",
            title: "图",
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            metadata: {},
        },
        savedImageMetadata: { generationType: "edit", model: "saved-model", quality: "medium", size: "9:16" },
        defaults: baseConfig,
    });

    assert.equal(config.model, "saved-model");
    assert.equal(config.quality, "medium");
    assert.equal(config.size, "9:16");
    assert.equal(config.count, "1");
});
