import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./video-subtitle-erase.ts", import.meta.url), "utf8");

test("uses authenticated subtitle erase routes and source coordinates", () => {
    assert.match(source, /useUserStore\.getState\(\)\.token/);
    assert.match(source, /\/api\/v1\/video-subtitle-erase\/capabilities/);
    assert.match(source, /\/api\/v1\/video-subtitle-erase\/jobs/);
    for (const field of ["file", "projectId", "canvasId", "sourceNodeId", "sourceAssetId"]) assert.match(source, new RegExp(`form\\.append\\("${field}"`));
});

test("publishes pricing and public job fields without private server values", () => {
    for (const field of ["unitPriceCny", "ruleVersion", "inputDurationSeconds", "outputDurationSeconds", "estimatedBillableMinutes", "estimatedCostCny", "costEstimateAvailable", "runId", "providerRequestId", "resultUrl", "errorCode"]) assert.match(source, new RegExp(`${field}\\??:`));
    for (const field of ["inputPath", "inputTosUrl", "resultSourceUrl", "clientToken", "userId"]) assert.doesNotMatch(source, new RegExp(`\\b${field}\\??:`));
});
