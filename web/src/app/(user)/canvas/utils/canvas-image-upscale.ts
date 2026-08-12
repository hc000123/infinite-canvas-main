import { nanoid } from "nanoid";

import type { ImageUpscaleJob, ImageUpscaleJobStatus } from "../../../../services/api/image-upscale.ts";
import type { CanvasConnection, CanvasImageUpscaleMetadata, CanvasNodeData, CanvasNodeMetadata } from "../types.ts";
import { resolveRightwardNodePosition } from "./canvas-node-placement.ts";

export function imageUpscaleJobActive(status: ImageUpscaleJobStatus) {
    return status === "queued" || status === "processing" || status === "downloading";
}

export function buildImageUpscaleDraft(sourceNode: CanvasNodeData, childId: string, job: ImageUpscaleJob, nodes: CanvasNodeData[]): { node: CanvasNodeData; connection: CanvasConnection } {
    const size = { width: sourceNode.width, height: sourceNode.height };
    const position = resolveRightwardNodePosition(nodes, { x: sourceNode.position.x + sourceNode.width + 96, y: sourceNode.position.y }, size);
    const node: CanvasNodeData = {
        id: childId,
        type: "image" as CanvasNodeData["type"],
        title: `超分 ${job.scale}× · ${sourceNode.title || "图片"}`,
        position,
        ...size,
        metadata: {
            content: "",
            prompt: sourceNode.metadata?.prompt,
            status: "loading",
            sourceType: "manual",
            sourceId: sourceNode.id,
            imageUpscale: imageUpscaleMetadata(job),
            canvasSource: {
                ...(sourceNode.metadata?.canvasSource || { canvasId: job.canvasId }),
                canvasId: job.canvasId,
                nodeId: childId,
                sourceNodeId: sourceNode.id,
                sourceAssetId: sourceNode.metadata?.sourceAssetId,
                originalImage: { nodeId: sourceNode.id, storageKey: sourceNode.metadata?.storageKey, url: sourceNode.metadata?.content },
            },
        },
    };
    return { node, connection: { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: childId } };
}

export function applyImageUpscaleJobToNode(node: CanvasNodeData, job: ImageUpscaleJob, imageMetadata?: Partial<CanvasNodeMetadata>): CanvasNodeData {
    const failed = job.status === "failed";
    const completed = job.status === "succeeded" && Boolean(imageMetadata?.content);
    return {
        ...node,
        metadata: {
            ...node.metadata,
            ...(imageMetadata || {}),
            status: failed ? "error" : completed ? "success" : "loading",
            errorDetails: failed ? job.errorMessage || "图片超分失败" : undefined,
            imageUpscale: imageUpscaleMetadata(job),
        },
    };
}

export function imageUpscaleMetadata(job: ImageUpscaleJob): CanvasImageUpscaleMetadata {
    const started = Date.parse(job.startedAt || "");
    const completed = Date.parse(job.completedAt || "");
    return {
        jobId: job.id,
        provider: job.provider,
        providerRequestId: job.providerRequestId || undefined,
        scale: job.scale,
        status: job.status,
        progress: job.progress,
        attempt: job.attempt,
        sourceNodeId: job.sourceNodeId,
        sourceAssetId: job.sourceAssetId || undefined,
        inputWidth: job.inputWidth,
        inputHeight: job.inputHeight,
        outputWidth: job.outputWidth || undefined,
        outputHeight: job.outputHeight || undefined,
        model: job.model || undefined,
        strategy: job.strategy || undefined,
        cloudProcessing: true,
        startedAt: job.startedAt || undefined,
        completedAt: job.completedAt || undefined,
        durationMs: Number.isFinite(started) && Number.isFinite(completed) ? Math.max(0, completed - started) : undefined,
        errorCode: job.errorCode || undefined,
    };
}
