import assert from "node:assert/strict";
import test from "node:test";

import { applyVideoSubtitleEraseJobToNode, buildVideoSubtitleEraseDraft, videoSubtitleEraseJobActive } from "./canvas-video-subtitle-erase.ts";
import type { CanvasNodeData } from "../types.ts";

const source: CanvasNodeData = { id: "video-source", type: "video" as CanvasNodeData["type"], title: "镜 01", position: { x: 20, y: 30 }, width: 320, height: 180, metadata: { content: "blob:source", storageKey: "video:source", sourceAssetId: "asset-1", naturalWidth: 1080, naturalHeight: 1920 } };
const queuedJob = { id: "erase-1", provider: "volcengine-las", runId: "", providerRequestId: "", status: "queued" as const, progress: 5, attempt: 1, processingStage: "queued", projectId: "project", canvasId: "canvas", sourceNodeId: source.id, sourceAssetId: "asset-1", inputWidth: 1080, inputHeight: 1920, inputDurationSeconds: 12.34, inputMimeType: "video/mp4", inputBytes: 12, outputWidth: 1080, outputHeight: 1920, outputDurationSeconds: 0, estimatedBillableMinutes: 12.34 / 60, estimatedCostCny: (12.34 / 60) * 0.4, costEstimateAvailable: true, pricingRuleVersion: "las-subtitle-erase-2026-08", resultUrl: "", resultMimeType: "", resultBytes: 0, errorCode: "", errorMessage: "", cloudProcessing: true as const, createdAt: "start", startedAt: "", completedAt: "", updatedAt: "start" };

test("builds an isolated connected subtitle erase derivative", () => {
    const before = structuredClone(source);
    const { node, connection } = buildVideoSubtitleEraseDraft(source, "child", queuedJob, [source]);
    assert.deepEqual(source, before);
    assert.equal(node.title, "已擦字幕 · 镜 01");
    assert.equal(node.type, "video");
    assert.equal(connection.fromNodeId, source.id);
    assert.equal(connection.toNodeId, node.id);
    assert.ok(node.position.x >= source.position.x + source.width);
    assert.equal(node.metadata?.subtitleErase?.jobId, "erase-1");
    assert.equal(node.metadata?.subtitleErase?.estimatedCostCny, queuedJob.estimatedCostCny);
    assert.equal(node.metadata?.videoUpscale, undefined);
});

test("updates subtitle erase progress failure and cached success", () => {
    const { node } = buildVideoSubtitleEraseDraft(source, "child", queuedJob, [source]);
    const running = applyVideoSubtitleEraseJobToNode(node, { ...queuedJob, status: "processing", progress: 70 });
    assert.equal(running.metadata?.subtitleErase?.progress, 70);
    const failed = applyVideoSubtitleEraseJobToNode(running, { ...queuedJob, status: "failed", errorMessage: "处理失败" });
    assert.equal(failed.metadata?.status, "error");
    const succeeded = applyVideoSubtitleEraseJobToNode(failed, { ...queuedJob, status: "succeeded", progress: 100, resultUrl: "/result.mp4", outputDurationSeconds: 12.34 }, { content: "blob:result", storageKey: "video:result" });
    assert.equal(succeeded.metadata?.status, "success");
    assert.equal(succeeded.metadata?.content, "blob:result");
    assert.equal(succeeded.metadata?.subtitleErase?.outputDurationSeconds, 12.34);
});

test("recognizes server-active subtitle erase states", () => {
    for (const status of ["queued", "uploading", "processing", "downloading"] as const) assert.equal(videoSubtitleEraseJobActive(status), true);
    for (const status of ["succeeded", "failed"] as const) assert.equal(videoSubtitleEraseJobActive(status), false);
});
