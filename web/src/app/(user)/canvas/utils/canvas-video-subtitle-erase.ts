import { nanoid } from "nanoid";

import type { VideoSubtitleEraseJob, VideoSubtitleEraseJobStatus } from "../../../../services/api/video-subtitle-erase.ts";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata, CanvasVideoSubtitleEraseMetadata } from "../types.ts";
import { resolveRightwardNodePosition } from "./canvas-node-placement.ts";

export function videoSubtitleEraseJobActive(status: VideoSubtitleEraseJobStatus) {
    return status === "queued" || status === "uploading" || status === "processing" || status === "downloading";
}

export function buildVideoSubtitleEraseDraft(sourceNode: CanvasNodeData, childId: string, job: VideoSubtitleEraseJob, nodes: CanvasNodeData[]): { node: CanvasNodeData; connection: CanvasConnection } {
    const size = { width: sourceNode.width, height: sourceNode.height };
    const position = resolveRightwardNodePosition(nodes, { x: sourceNode.position.x + sourceNode.width + 96, y: sourceNode.position.y }, size);
    const node: CanvasNodeData = {
        id: childId,
        type: "video" as CanvasNodeData["type"],
        title: `已擦字幕 · ${sourceNode.title || "视频"}`,
        position,
        ...size,
        metadata: {
            content: "",
            prompt: sourceNode.metadata?.prompt,
            status: "loading",
            sourceType: "manual",
            sourceId: sourceNode.id,
            subtitleErase: videoSubtitleEraseMetadata(job),
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

export function applyVideoSubtitleEraseJobToNode(node: CanvasNodeData, job: VideoSubtitleEraseJob, mediaMetadata?: Partial<CanvasNodeMetadata>): CanvasNodeData {
    const failed = job.status === "failed";
    const completed = job.status === "succeeded" && Boolean(mediaMetadata?.content);
    return {
        ...node,
        metadata: {
            ...node.metadata,
            ...(mediaMetadata || {}),
            status: failed ? "error" : completed ? "success" : "loading",
            errorDetails: failed ? job.errorMessage || "字幕擦除失败" : undefined,
            subtitleErase: videoSubtitleEraseMetadata(job),
        },
    };
}

export function videoSubtitleEraseMetadata(job: VideoSubtitleEraseJob): CanvasVideoSubtitleEraseMetadata {
    const started = Date.parse(job.startedAt || "");
    const completed = Date.parse(job.completedAt || "");
    return {
        jobId: job.id,
        provider: job.provider,
        runId: job.runId || undefined,
        providerRequestId: job.providerRequestId || undefined,
        status: job.status,
        progress: job.progress,
        attempt: job.attempt,
        processingStage: job.processingStage || undefined,
        sourceNodeId: job.sourceNodeId,
        sourceAssetId: job.sourceAssetId || undefined,
        inputWidth: job.inputWidth,
        inputHeight: job.inputHeight,
        inputDurationSeconds: job.inputDurationSeconds,
        outputWidth: job.outputWidth || undefined,
        outputHeight: job.outputHeight || undefined,
        outputDurationSeconds: job.outputDurationSeconds || undefined,
        estimatedBillableMinutes: job.costEstimateAvailable ? job.estimatedBillableMinutes : undefined,
        estimatedCostCny: job.costEstimateAvailable ? job.estimatedCostCny : undefined,
        costEstimateAvailable: job.costEstimateAvailable,
        pricingRuleVersion: job.pricingRuleVersion || undefined,
        cloudProcessing: true,
        startedAt: job.startedAt || undefined,
        completedAt: job.completedAt || undefined,
        durationMs: Number.isFinite(started) && Number.isFinite(completed) ? Math.max(0, completed - started) : undefined,
        errorCode: job.errorCode || undefined,
    };
}
