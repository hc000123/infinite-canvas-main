import assert from "node:assert/strict";
import test from "node:test";

import { applyVideoUpscaleJobToNode, buildVideoUpscaleDraft, videoUpscaleJobActive } from "./canvas-video-upscale.ts";
import { buildCanvasVideoProgress } from "./canvas-video-progress.ts";
import type { CanvasNodeData } from "../types.ts";

const source: CanvasNodeData = { id: "video-source", type: "video" as CanvasNodeData["type"], title: "原视频", position: { x: 20, y: 30 }, width: 320, height: 180, metadata: { content: "blob:source", storageKey: "video:source", sourceAssetId: "asset-1", naturalWidth: 1280, naturalHeight: 720 } };
const queuedJob = { id: "job-1", provider: "volcengine", vid: "", runId: "", interpolationRunId: "interp-1", providerRequestId: "", target: "1080p" as const, scenario: "aigc" as const, enhanceLevel: "Standard" as const, status: "queued" as const, progress: 5, attempt: 1, processingStage: "interpolation_processing", projectId: "project", canvasId: "canvas", sourceNodeId: source.id, sourceAssetId: "asset-1", inputWidth: 1280, inputHeight: 720, inputDurationSeconds: 6, inputFrameRate: 24, inputMimeType: "video/mp4", inputBytes: 12, outputWidth: 1920, outputHeight: 1080, outputQualityMode: "balanced" as const, preserveAudio: true, frameInterpolationMode: "double" as const, interpolationMode: "fast" as const, interpolationTargetFrameRate: 48, estimatedBillableMinutes: 0.3, estimatedCostCny: 0.66, costEstimateAvailable: true, pricingRuleVersion: "las-2026-08", estimatedInterpolationBillableMinutes: 0.3, estimatedInterpolationCostCny: 0.15, interpolationCostEstimateAvailable: true, interpolationPricingRuleVersion: "las-interpolation-2026-08", estimatedTotalCostCny: 0.81, resultUrl: "", resultMimeType: "", resultBytes: 0, errorCode: "", errorMessage: "", cloudProcessing: true as const, createdAt: "start", startedAt: "", completedAt: "", updatedAt: "start" };

test("builds one connected right-side video draft without changing the source", () => {
    const before = structuredClone(source);
    const { node, connection } = buildVideoUpscaleDraft(source, "child", queuedJob, [source]);
    assert.deepEqual(source, before);
    assert.equal(node.type, "video");
    assert.equal(connection.fromNodeId, source.id);
    assert.equal(connection.toNodeId, node.id);
    assert.ok(node.position.x >= source.position.x + source.width);
    assert.equal(node.metadata?.videoUpscale?.jobId, queuedJob.id);
    assert.equal(node.metadata?.videoUpscale?.inputFrameRate, 24);
    assert.equal(node.metadata?.videoUpscale?.outputQualityMode, "balanced");
    assert.equal(node.metadata?.videoUpscale?.estimatedCostCny, 0.66);
    assert.equal(node.metadata?.videoUpscale?.interpolationRunId, "interp-1");
    assert.equal(node.metadata?.videoUpscale?.interpolationTargetFrameRate, 48);
    assert.equal(node.metadata?.videoUpscale?.estimatedTotalCostCny, 0.81);
    assert.equal("upscaleResultTosUrl" in (node.metadata?.videoUpscale || {}), false);
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

test("video node progress uses the video upscale lifecycle", () => {
    for (const [status, label, percent] of [
        ["uploading", "上传原视频", 15],
        ["processing", "云端增强中", 65],
        ["downloading", "保存结果中", 80],
    ] as const) {
        const progress = buildCanvasVideoProgress({ status: "loading", videoUpscale: { ...buildVideoUpscaleDraft(source, "child", queuedJob, [source]).node.metadata!.videoUpscale!, status, progress: percent } }, "loading");
        assert.equal(progress.label, label);
        assert.equal(progress.percent, percent);
    }
});

test("canvas metadata accepts common fixed interpolation targets", () => {
    for (const mode of ["to25", "to30"] as const) {
        const metadata = buildVideoUpscaleDraft(source, `child-${mode}`, { ...queuedJob, frameInterpolationMode: mode, interpolationTargetFrameRate: mode === "to25" ? 25 : 30 }, [source]).node.metadata?.videoUpscale;
        assert.equal(metadata?.frameInterpolationMode, mode);
    }
});
