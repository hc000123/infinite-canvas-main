import assert from "node:assert/strict";
import test from "node:test";

import { applyImageUpscaleJobToNode, buildImageUpscaleDraft, imageUpscaleJobActive } from "./canvas-image-upscale.ts";
import type { CanvasNodeData } from "../types.ts";

const source: CanvasNodeData = {
    id: "source-1",
    type: "image" as CanvasNodeData["type"],
    title: "原图",
    position: { x: 20, y: 30 },
    width: 320,
    height: 180,
    metadata: { content: "blob:source", storageKey: "image:source", sourceAssetId: "asset-1", naturalWidth: 1280, naturalHeight: 720 },
};

const queuedJob = {
    id: "job-1", provider: "aliyun", providerRequestId: "", model: "", strategy: "", scale: 2 as const, status: "queued" as const, progress: 5, attempt: 1,
    projectId: "project-1", canvasId: "canvas-1", sourceNodeId: "source-1", sourceAssetId: "asset-1", inputWidth: 1280, inputHeight: 720,
    inputMimeType: "image/png", inputBytes: 12, resultUrl: "", resultMimeType: "", resultBytes: 0, outputWidth: 0, outputHeight: 0,
    errorCode: "", errorMessage: "", cloudProcessing: true, createdAt: "start", startedAt: "", completedAt: "", updatedAt: "start",
};

test("builds a connected right-side draft without changing the source", () => {
    const before = structuredClone(source);
    const { node, connection } = buildImageUpscaleDraft(source, "child-1", queuedJob, [source]);
    assert.deepEqual(source, before);
    assert.equal(connection.fromNodeId, source.id);
    assert.equal(connection.toNodeId, node.id);
    assert.ok(node.position.x >= source.position.x + source.width);
    assert.equal(node.width / node.height, source.width / source.height);
    assert.equal(node.metadata?.status, "loading");
    assert.equal(node.metadata?.imageUpscale?.jobId, queuedJob.id);
    assert.equal(node.metadata?.imageUpscale?.cloudProcessing, true);
});

test("projects progress, failure and completion into the derived node", () => {
    const { node } = buildImageUpscaleDraft(source, "child-1", queuedJob, [source]);
    const running = applyImageUpscaleJobToNode(node, { ...queuedJob, status: "processing", progress: 25 });
    assert.equal(running.metadata?.status, "loading");
    assert.equal(running.metadata?.imageUpscale?.progress, 25);
    const failed = applyImageUpscaleJobToNode(running, { ...queuedJob, status: "failed", progress: 25, errorCode: "provider_failed", errorMessage: "处理失败" });
    assert.equal(failed.metadata?.status, "error");
    assert.equal(failed.metadata?.errorDetails, "处理失败");
    const succeeded = applyImageUpscaleJobToNode(failed, { ...queuedJob, status: "succeeded", progress: 100, outputWidth: 2560, outputHeight: 1440, resultUrl: "/result.png", completedAt: "done" }, { content: "blob:result", storageKey: "image:result", naturalWidth: 2560, naturalHeight: 1440 });
    assert.equal(succeeded.metadata?.status, "success");
    assert.equal(succeeded.metadata?.content, "blob:result");
    assert.equal(succeeded.metadata?.imageUpscale?.outputWidth, 2560);
});

test("polls only active job states", () => {
    for (const status of ["queued", "processing", "downloading"] as const) assert.equal(imageUpscaleJobActive(status), true);
    for (const status of ["succeeded", "failed"] as const) assert.equal(imageUpscaleJobActive(status), false);
});
