import assert from "node:assert/strict";
import test from "node:test";

import { applyVideoUpscaleJobToNode, buildVideoUpscaleDraft, videoUpscaleJobActive } from "./canvas-video-upscale.ts";
import type { CanvasNodeData } from "../types.ts";

const source: CanvasNodeData = { id: "video-source", type: "video" as CanvasNodeData["type"], title: "原视频", position: { x: 20, y: 30 }, width: 320, height: 180, metadata: { content: "blob:source", storageKey: "video:source", sourceAssetId: "asset-1", naturalWidth: 1280, naturalHeight: 720 } };
const queuedJob = { id: "job-1", provider: "volcengine", vid: "", runId: "", providerRequestId: "", target: "1080p" as const, scenario: "aigc" as const, enhanceLevel: "Standard" as const, status: "queued" as const, progress: 5, attempt: 1, projectId: "project", canvasId: "canvas", sourceNodeId: source.id, sourceAssetId: "asset-1", inputWidth: 1280, inputHeight: 720, inputDurationSeconds: 6, inputMimeType: "video/mp4", inputBytes: 12, outputWidth: 1920, outputHeight: 1080, resultUrl: "", resultMimeType: "", resultBytes: 0, errorCode: "", errorMessage: "", cloudProcessing: true as const, createdAt: "start", startedAt: "", completedAt: "", updatedAt: "start" };

test("builds one connected right-side video draft without changing the source", () => {
    const before = structuredClone(source);
    const { node, connection } = buildVideoUpscaleDraft(source, "child", queuedJob, [source]);
    assert.deepEqual(source, before);
    assert.equal(node.type, "video");
    assert.equal(connection.fromNodeId, source.id);
    assert.equal(connection.toNodeId, node.id);
    assert.ok(node.position.x >= source.position.x + source.width);
    assert.equal(node.metadata?.videoUpscale?.jobId, queuedJob.id);
});

test("updates progress failure and success in place", () => {
    const { node } = buildVideoUpscaleDraft(source, "child", queuedJob, [source]);
    const running = applyVideoUpscaleJobToNode(node, { ...queuedJob, status: "processing", progress: 65 });
    assert.equal(running.id, node.id);
    assert.equal(running.metadata?.videoUpscale?.progress, 65);
    const failed = applyVideoUpscaleJobToNode(running, { ...queuedJob, status: "failed", errorMessage: "处理失败" });
    assert.equal(failed.metadata?.status, "error");
    const succeeded = applyVideoUpscaleJobToNode(failed, { ...queuedJob, status: "succeeded", progress: 100, resultUrl: "/result.mp4" }, { content: "blob:result", storageKey: "video:result" });
    assert.equal(succeeded.metadata?.status, "success");
    assert.equal(succeeded.metadata?.content, "blob:result");
});

test("recognizes uploading processing and downloading as active", () => {
    for (const status of ["queued", "uploading", "processing", "downloading"] as const) assert.equal(videoUpscaleJobActive(status), true);
    for (const status of ["succeeded", "failed"] as const) assert.equal(videoUpscaleJobActive(status), false);
});
