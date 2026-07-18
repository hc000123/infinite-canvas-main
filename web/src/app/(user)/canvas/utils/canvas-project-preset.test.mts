import assert from "node:assert/strict";
import test from "node:test";

import {
    applyCanvasProjectPresetToConfig,
    buildCanvasProjectPresetFromConfig,
    canvasProjectPresetConfig,
    canvasProjectPresetOptions,
    canvasProjectPresetSummary,
    canvasProjectPresetModelOptions,
    normalizeCanvasProjectPresetRatio,
} from "./canvas-project-preset.ts";

const config = {
    videoProtocol: "openai",
    model: "base",
    imageModel: "image-model",
    videoModel: "video-model",
    seedanceModel: "seedance-model",
    seedanceEndpointId: "ep-seedance",
    textModel: "text-model",
    imageModels: ["image-model", "gpt-image-2"],
    videoModels: ["video-model", "doubao-seedance-2-0-260128", "ep-seedance"],
    textModels: ["text-model", "gpt-5.5"],
    models: ["image-model", "gpt-image-2", "video-model", "doubao-seedance-2-0-260128", "text-model", "gpt-5.5"],
    modelCapabilities: [
        { model: "image-model", capabilities: ["image"] },
        { model: "gpt-image-2", capabilities: ["image"] },
        { model: "video-model", capabilities: ["video"] },
        { model: "doubao-seedance-2-0-260128", capabilities: ["video"] },
        { model: "text-model", capabilities: ["text"] },
        { model: "gpt-5.5", capabilities: ["text"] },
    ],
    modelProtocols: [
        { model: "video-model", protocol: "openai" },
        { model: "doubao-seedance-2-0-260128", protocol: "volcengine-ark" },
    ],
    size: "1:1",
    vquality: "720",
    videoSeconds: "6",
} as any;

test("builds project preset from current config and patch", () => {
    const preset = buildCanvasProjectPresetFromConfig(config, { ratio: "9:16", defaultVideoProvider: "volcengine-ark", defaultDuration: "8" });

    assert.equal(preset.ratio, "9:16");
    assert.equal(preset.defaultDuration, "8");
    assert.equal(preset.defaultImageModel, "image-model");
    assert.equal(preset.defaultVideoModel, "video-model");
    assert.equal(preset.defaultTextModel, "text-model");
    assert.equal(preset.defaultVideoProvider, undefined);
});

test("built-in presets use 6 seconds as the video duration default", () => {
    assert.ok(canvasProjectPresetOptions.length);
    assert.deepEqual(
        canvasProjectPresetOptions.map((item) => item.preset.defaultDuration),
        ["6", "6", "6", "6", "6"],
    );
});

test("applies project preset to effective AI config and migrates legacy 10s duration", () => {
    const next = applyCanvasProjectPresetToConfig(config, {
        resolution: "1080",
        ratio: "16:9",
        defaultDuration: "10",
        defaultImageModel: "image-model",
        defaultVideoModel: "doubao-seedance-2-0-260128",
        defaultTextModel: "text-model",
        defaultVideoProvider: "volcengine-ark",
    });

    assert.equal(next.size, "16:9");
    assert.equal(next.vquality, "1080");
    assert.equal(next.videoSeconds, "6");
    assert.equal(next.imageModel, "image-model");
    assert.equal(next.textModel, "text-model");
    assert.equal(next.videoProtocol, "volcengine-ark");
    assert.equal(next.videoModel, "doubao-seedance-2-0-260128");
    assert.equal(next.seedanceModel, "doubao-seedance-2-0-260128");
    assert.equal(next.seedanceEndpointId, "");
});

test("local project presets keep the same video provider as cloud presets", () => {
    const next = applyCanvasProjectPresetToConfig(
        { ...config, channelMode: "local", videoProtocol: "openai" },
        {
            defaultVideoModel: "doubao-seedance-2-0-260128",
            defaultVideoProvider: "volcengine-ark",
        },
    );

    assert.equal(next.videoProtocol, "volcengine-ark");
    assert.equal(next.videoModel, "doubao-seedance-2-0-260128");
    assert.equal(next.seedanceModel, "doubao-seedance-2-0-260128");
});

test("project preset model catalog mapping overrides a stale provider", () => {
    const next = applyCanvasProjectPresetToConfig(
        {
            ...config,
            videoModel: "sd2-720p-fast",
            videoModels: ["sd2-720p-fast"],
            models: ["image-model", "sd2-720p-fast", "text-model"],
            modelCapabilities: [
                { model: "image-model", capabilities: ["image"] },
                { model: "sd2-720p-fast", capabilities: ["video"] },
                { model: "text-model", capabilities: ["text"] },
            ],
            modelProtocols: [{ model: "sd2-720p-fast", protocol: "xinglian-cloud" }],
        },
        {
            defaultVideoModel: "sd2-720p-fast",
            defaultVideoProvider: "volcengine-ark",
        },
    );

    assert.equal(next.videoModel, "sd2-720p-fast");
    assert.equal(next.videoProtocol, "xinglian-cloud");
    assert.equal(next.seedanceEndpointId, "");
});

test("normalizes legacy pixel sizes into aspect ratios", () => {
    assert.equal(normalizeCanvasProjectPresetRatio("3840x2160"), "16:9");
    assert.equal(normalizeCanvasProjectPresetRatio("2160x3840"), "9:16");
    assert.equal(normalizeCanvasProjectPresetRatio("1024x1024"), "1:1");
});

test("builds model options without exposing Seedance endpoint ids", () => {
    assert.deepEqual(canvasProjectPresetModelOptions(config, "video", "volcengine-ark"), ["video-model", "doubao-seedance-2-0-260128"]);
    assert.deepEqual(canvasProjectPresetModelOptions(config, "image", "openai"), ["image-model", "gpt-image-2"]);
});

test("summarizes and serializes project preset", () => {
    const preset = { resolution: "720", ratio: "9:16", fps: "24", defaultDuration: "6" };

    assert.equal(canvasProjectPresetSummary(preset), "720p · 9:16 · 24fps · 6s");
    assert.equal(canvasProjectPresetSummary({ ...preset, resolution: "720p" }), "720p · 9:16 · 24fps · 6s");
    assert.deepEqual(canvasProjectPresetConfig(preset), preset);
});
