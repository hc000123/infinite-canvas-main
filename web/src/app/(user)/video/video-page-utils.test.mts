import assert from "node:assert/strict";
import test from "node:test";

import { buildPackageVideoConfig } from "./video-page-utils.ts";

const baseConfig = {
    channelMode: "remote",
    videoProtocol: "volcengine-ark",
    model: "gpt-image-2",
    imageModel: "gpt-image-2",
    videoModel: "doubao-seedance-2-5",
    seedanceModel: "doubao-seedance-2-5",
    seedanceEndpointId: "",
    textModel: "gpt-5.5",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoSeed: "",
    videoPromptReviewEnabled: "true",
    videoTaskMode: "generate",
    videoEditType: "replace",
    videoExtendDirection: "forward",
    videoReferenceImageMode: "reference",
    videoReferenceMode: "auto",
    size: "16:9",
    models: ["gpt-image-2", "doubao-seedance-2-5", "gpt-5.5"],
    imageModels: ["gpt-image-2"],
    videoModels: ["doubao-seedance-2-5"],
    textModels: ["gpt-5.5"],
    modelCapabilities: [
        { model: "gpt-image-2", capabilities: ["image"] },
        { model: "doubao-seedance-2-5", capabilities: ["video"] },
        { model: "gpt-5.5", capabilities: ["text"] },
    ],
    modelProtocols: [{ model: "doubao-seedance-2-5", protocol: "volcengine-ark" }],
} as Parameters<typeof buildPackageVideoConfig>[0];

function configFixture(model: string, videoProtocol: "openai" | "volcengine-ark", modelProtocol: "openai" | "volcengine-ark" = videoProtocol) {
    return {
        ...baseConfig,
        videoProtocol,
        videoModel: model,
        seedanceModel: model,
        models: ["gpt-image-2", model, "gpt-5.5"],
        videoModels: [model],
        modelCapabilities: [
            { model: "gpt-image-2", capabilities: ["image"] },
            { model, capabilities: ["video"] },
            { model: "gpt-5.5", capabilities: ["text"] },
        ],
        modelProtocols: [{ model, protocol: modelProtocol }],
    } as Parameters<typeof buildPackageVideoConfig>[0];
}

function packageFixture(model: string, vquality: string, videoSeconds: string) {
    return {
        duration: videoSeconds,
        config: {
            duration: videoSeconds,
            frames: "",
            model,
            motion: "",
            ratio: "16:9",
            resolution: vquality,
            videoSeconds,
            vquality,
        },
    } as Parameters<typeof buildPackageVideoConfig>[1];
}

test("buildPackageVideoConfig keeps Seedance 2.5 480p and extended duration", () => {
    const config = buildPackageVideoConfig(baseConfig, packageFixture("doubao-seedance-2-5", "480p", "24"));
    const numericResolution = buildPackageVideoConfig(baseConfig, packageFixture("doubao-seedance-2-5", "480", "30"));

    assert.equal(config.videoProtocol, "volcengine-ark");
    assert.equal(config.videoModel, "doubao-seedance-2-5");
    assert.equal(config.vquality, "480");
    assert.equal(config.videoSeconds, "24");
    assert.equal(numericResolution.vquality, "480");
    assert.equal(numericResolution.videoSeconds, "30");
});

test("buildPackageVideoConfig rejects 480p outside Ark Seedance 2.5", () => {
    const ark20 = buildPackageVideoConfig(configFixture("doubao-seedance-2-0", "volcengine-ark"), packageFixture("doubao-seedance-2-0", "480p", "6"));
    const openai = buildPackageVideoConfig(configFixture("openai-video", "openai"), packageFixture("openai-video", "480", "6"));

    assert.equal(ark20.vquality, "720");
    assert.equal(openai.vquality, "720");
});

test("buildPackageVideoConfig resolves stale providers from the selected model", () => {
    const mappedArk = buildPackageVideoConfig(configFixture("doubao-seedance-2-5", "openai", "volcengine-ark"), packageFixture("doubao-seedance-2-5", "480p", "24"));
    const mappedOpenAI = buildPackageVideoConfig(configFixture("openai-video", "volcengine-ark", "openai"), packageFixture("openai-video", "480", "6"));

    assert.equal(mappedArk.videoProtocol, "volcengine-ark");
    assert.equal(mappedArk.videoModel, "doubao-seedance-2-5");
    assert.equal(mappedArk.vquality, "480");
    assert.equal(mappedOpenAI.videoProtocol, "openai");
    assert.equal(mappedOpenAI.videoModel, "openai-video");
    assert.equal(mappedOpenAI.vquality, "720");
});

test("buildPackageVideoConfig normalizes resolution after stale package model fallback", () => {
    const arkFallback = buildPackageVideoConfig(configFixture("doubao-seedance-2-5", "openai", "volcengine-ark"), packageFixture("retired-openai-video", "480p", "24"));
    const openaiFallback = buildPackageVideoConfig(configFixture("openai-video", "openai"), packageFixture("doubao-seedance-2-5", "480", "6"));

    assert.equal(arkFallback.videoProtocol, "volcengine-ark");
    assert.equal(arkFallback.videoModel, "doubao-seedance-2-5");
    assert.equal(arkFallback.vquality, "480");
    assert.equal(openaiFallback.videoProtocol, "openai");
    assert.equal(openaiFallback.videoModel, "openai-video");
    assert.equal(openaiFallback.vquality, "720");
});
