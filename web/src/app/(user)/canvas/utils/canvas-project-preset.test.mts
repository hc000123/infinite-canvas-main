import assert from "node:assert/strict";
import test from "node:test";

import { applyCanvasProjectPresetToConfig, buildCanvasProjectPresetFromConfig, canvasProjectPresetConfig, canvasProjectPresetSummary } from "./canvas-project-preset.ts";

const config = {
    videoProtocol: "openai",
    model: "base",
    imageModel: "image-model",
    videoModel: "video-model",
    seedanceModel: "seedance-model",
    seedanceEndpointId: "ep-seedance",
    textModel: "text-model",
    size: "1:1",
    vquality: "720",
    videoSeconds: "6",
} as any;

test("builds project preset from current config and patch", () => {
    const preset = buildCanvasProjectPresetFromConfig(config, { ratio: "9:16", defaultVideoProvider: "volcengine-ark", defaultDuration: "8" });

    assert.equal(preset.ratio, "9:16");
    assert.equal(preset.defaultDuration, "8");
    assert.equal(preset.defaultImageModel, "image-model");
    assert.equal(preset.defaultVideoModel, "ep-seedance");
    assert.equal(preset.defaultTextModel, "text-model");
    assert.equal(preset.defaultVideoProvider, "volcengine-ark");
});

test("applies project preset to effective AI config", () => {
    const next = applyCanvasProjectPresetToConfig(config, {
        resolution: "1080",
        ratio: "16:9",
        defaultDuration: "10",
        defaultImageModel: "preset-image",
        defaultVideoModel: "ep-project",
        defaultTextModel: "preset-text",
        defaultVideoProvider: "volcengine-ark",
    });

    assert.equal(next.size, "16:9");
    assert.equal(next.vquality, "1080");
    assert.equal(next.videoSeconds, "10");
    assert.equal(next.imageModel, "preset-image");
    assert.equal(next.textModel, "preset-text");
    assert.equal(next.videoProtocol, "volcengine-ark");
    assert.equal(next.seedanceEndpointId, "ep-project");
});

test("summarizes and serializes project preset", () => {
    const preset = { resolution: "720", ratio: "9:16", fps: "24", defaultDuration: "8" };

    assert.equal(canvasProjectPresetSummary(preset), "720p · 9:16 · 24fps · 8s");
    assert.deepEqual(canvasProjectPresetConfig(preset), preset);
});
