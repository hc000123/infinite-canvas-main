import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./video-upscale.ts", import.meta.url), "utf8");

test("uses authenticated video upscale routes and multipart source fields", () => {
    assert.match(source, /useUserStore\.getState\(\)\.token/);
    assert.match(source, /\/api\/v1\/video-upscale\/capabilities/);
    assert.match(source, /\/api\/v1\/video-upscale\/jobs/);
    for (const field of ["file", "target", "projectId", "canvasId", "sourceNodeId", "sourceAssetId", "outputQualityMode", "preserveAudio", "frameInterpolationMode", "interpolationMode"]) assert.match(source, new RegExp(`form\\.append\\("${field}"`));
});

test("publishes pricing and output option contracts", () => {
    for (const field of ["pricing", "unitPriceCny", "resolutionTiers", "frameRateTiers", "outputQualityModes", "defaultOutputQualityMode", "preserveAudioSupported", "frameInterpolation", "processingModes", "pixelTiers", "maxTargetFrameRate"]) assert.match(source, new RegExp(`${field}`));
    for (const field of ["inputFrameRate", "outputQualityMode", "preserveAudio", "frameInterpolationMode", "interpolationMode", "interpolationTargetFrameRate", "interpolationRunId", "estimatedInterpolationCostCny", "estimatedTotalCostCny", "estimatedBillableMinutes", "estimatedCostCny", "costEstimateAvailable", "pricingRuleVersion"]) assert.match(source, new RegExp(`${field}\\??:`));
});

test("publishes common 25fps and 30fps interpolation targets", () => {
    assert.match(source, /"to25"/);
    assert.match(source, /"to30"/);
});

test("frontend job contract excludes private server fields", () => {
    for (const field of ["runId", "providerRequestId", "resultUrl", "errorCode"]) assert.match(source, new RegExp(`${field}\\??:`));
    for (const field of ["inputPath", "inputTosUrl", "outputTosPath", "resultSourceUrl", "userId"]) assert.doesNotMatch(source, new RegExp(`\\b${field}\\??:`));
});
