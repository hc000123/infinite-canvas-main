import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./image-upscale.ts", import.meta.url), "utf8");

test("uses authenticated image upscale routes and multipart source fields", () => {
    assert.match(source, /useUserStore\.getState\(\)\.token/);
    assert.match(source, /apiGet<ImageUpscaleCapabilities>\("\/api\/v1\/image-upscale\/capabilities"/);
    assert.match(source, /apiPostForm<ImageUpscaleJob>\("\/api\/v1\/image-upscale\/jobs"/);
    assert.match(source, /`\/api\/v1\/image-upscale\/jobs\/\$\{encodeURIComponent\(jobId\)\}`/);
    assert.match(source, /`\/api\/v1\/image-upscale\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/retry`/);
    for (const field of ["file", "scale", "projectId", "canvasId", "sourceNodeId", "sourceAssetId"]) assert.match(source, new RegExp(`form\\.append\\("${field}"`));
});

test("frontend job contract exposes cloud trace but not private server fields", () => {
    for (const field of ["providerRequestId", "cloudProcessing", "inputWidth", "outputWidth", "resultUrl", "errorCode"]) assert.match(source, new RegExp(`${field}\\??:`));
    assert.doesNotMatch(source, /\binputPath\??:/);
    assert.doesNotMatch(source, /\buserId\??:/);
});
