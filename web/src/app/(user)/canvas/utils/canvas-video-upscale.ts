import { nanoid } from "nanoid";

import type { VideoUpscaleJob, VideoUpscaleJobStatus } from "../../../../services/api/video-upscale.ts";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata, CanvasVideoUpscaleMetadata } from "../types.ts";
import { resolveRightwardNodePosition } from "./canvas-node-placement.ts";

export function videoUpscaleJobActive(status: VideoUpscaleJobStatus) {
    return status === "queued" || status === "uploading" || status === "processing" || status === "downloading";
}

export function buildVideoUpscaleDraft(sourceNode: CanvasNodeData, childId: string, job: VideoUpscaleJob, nodes: CanvasNodeData[]): { node: CanvasNodeData; connection: CanvasConnection } {
    const size = { width: sourceNode.width, height: sourceNode.height };
    const position = resolveRightwardNodePosition(nodes, { x: sourceNode.position.x + sourceNode.width + 96, y: sourceNode.position.y }, size);
    const node: CanvasNodeData = {
        id: childId,
        type: "video" as CanvasNodeData["type"],
        title: `超分 ${job.target === "2k" ? "2K" : "1080p"} · ${sourceNode.title || "视频"}`,
        position,
        ...size,
        metadata: {
            content: "",
            prompt: sourceNode.metadata?.prompt,
            status: "loading",
            sourceType: "manual",
            sourceId: sourceNode.id,
            videoUpscale: videoUpscaleMetadata(job),
            canvasSource: {
                ...(sourceNode.metadata?.canvasSource || { canvasId: job.canvasId }),
                canvasId: job.canvasId,
                nodeId: childId,
                sourceNodeId: sourceNode.id,
                sourceAssetId: sourceNode.metadata?.sourceAssetId,
            },
        },
    };
    return { node, connection: { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: childId } };
}

export function applyVideoUpscaleJobToNode(node: CanvasNodeData, job: VideoUpscaleJob, mediaMetadata?: Partial<CanvasNodeMetadata>): CanvasNodeData {
    const failed = job.status === "failed";
    const completed = job.status === "succeeded" && Boolean(mediaMetadata?.content);
    return {
        ...node,
        metadata: {
            ...node.metadata,
            ...(mediaMetadata || {}),
            status: failed ? "error" : completed ? "success" : "loading",
            errorDetails: failed ? job.errorMessage || "视频超分失败" : undefined,
            videoUpscale: videoUpscaleMetadata(job),
        },
    };
}

export function videoUpscaleMetadata(job: VideoUpscaleJob): CanvasVideoUpscaleMetadata {
    const started = Date.parse(job.startedAt || "");
    const completed = Date.parse(job.completedAt || "");
    return {
        jobId: job.id,
        provider: job.provider,
        runId: job.runId || undefined,
        providerRequestId: job.providerRequestId || undefined,
        target: job.target,
        status: job.status,
        progress: job.progress,
        attempt: job.attempt,
        processingStage: job.processingStage || undefined,
        sourceNodeId: job.sourceNodeId,
        sourceAssetId: job.sourceAssetId || undefined,
        inputWidth: job.inputWidth,
        inputHeight: job.inputHeight,
        inputDurationSeconds: job.inputDurationSeconds,
        inputFrameRate: job.inputFrameRate || undefined,
        outputWidth: job.outputWidth || undefined,
        outputHeight: job.outputHeight || undefined,
        outputDurationSeconds: job.status === "succeeded" ? job.inputDurationSeconds : undefined,
        outputQualityMode: job.outputQualityMode,
        preserveAudio: job.preserveAudio,
        frameInterpolationMode: job.frameInterpolationMode,
        interpolationMode: job.interpolationMode || undefined,
        interpolationTargetFrameRate: job.interpolationTargetFrameRate || undefined,
        interpolationRunId: job.interpolationRunId || undefined,
        estimatedBillableMinutes: job.costEstimateAvailable ? job.estimatedBillableMinutes : undefined,
        estimatedCostCny: job.costEstimateAvailable ? job.estimatedCostCny : undefined,
        costEstimateAvailable: job.costEstimateAvailable,
        pricingRuleVersion: job.pricingRuleVersion || undefined,
        estimatedInterpolationBillableMinutes: job.interpolationCostEstimateAvailable ? job.estimatedInterpolationBillableMinutes : undefined,
        estimatedInterpolationCostCny: job.interpolationCostEstimateAvailable ? job.estimatedInterpolationCostCny : undefined,
        interpolationCostEstimateAvailable: job.interpolationCostEstimateAvailable,
        interpolationPricingRuleVersion: job.interpolationPricingRuleVersion || undefined,
        estimatedTotalCostCny: job.costEstimateAvailable && (job.frameInterpolationMode === "keep" || job.interpolationCostEstimateAvailable) ? job.estimatedTotalCostCny : undefined,
        cloudProcessing: true,
        startedAt: job.startedAt || undefined,
        completedAt: job.completedAt || undefined,
        durationMs: Number.isFinite(started) && Number.isFinite(completed) ? Math.max(0, completed - started) : undefined,
        errorCode: job.errorCode || undefined,
    };
}
