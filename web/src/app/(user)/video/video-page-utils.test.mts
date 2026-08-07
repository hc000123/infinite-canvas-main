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

function packageFixture(vquality: string, videoSeconds: string) {
    return {
        duration: videoSeconds,
        config: {
            duration: videoSeconds,
            frames: "",
            model: "doubao-seedance-2-5",
            motion: "",
            ratio: "16:9",
            resolution: vquality,
            videoSeconds,
            vquality,
        },
    } as Parameters<typeof buildPackageVideoConfig>[1];
}

test("buildPackageVideoConfig keeps Seedance 2.5 480p and extended duration", () => {
    const config = buildPackageVideoConfig(baseConfig, packageFixture("480p", "24"));
    const numericResolution = buildPackageVideoConfig(baseConfig, packageFixture("480", "30"));

    assert.equal(config.videoProtocol, "volcengine-ark");
    assert.equal(config.videoModel, "doubao-seedance-2-5");
    assert.equal(config.vquality, "480");
    assert.equal(config.videoSeconds, "24");
    assert.equal(numericResolution.vquality, "480");
    assert.equal(numericResolution.videoSeconds, "30");
});
