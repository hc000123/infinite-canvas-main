import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./video-upscale.ts", import.meta.url), "utf8");

test("uses authenticated video upscale routes and multipart source fields", () => {
    assert.match(source, /useUserStore\.getState\(\)\.token/);
    assert.match(source, /\/api\/v1\/video-upscale\/capabilities/);
    assert.match(source, /\/api\/v1\/video-upscale\/jobs/);
    for (const field of ["file", "target", "projectId", "canvasId", "sourceNodeId", "sourceAssetId"]) assert.match(source, new RegExp(`form\\.append\\("${field}"`));
});

test("frontend job contract excludes private server fields", () => {
    for (const field of ["vid", "runId", "providerRequestId", "resultUrl", "errorCode"]) assert.match(source, new RegExp(`${field}\\??:`));
    for (const field of ["inputPath", "resultSourceUrl", "vodSpaceName", "userId"]) assert.doesNotMatch(source, new RegExp(`\\b${field}\\??:`));
});
