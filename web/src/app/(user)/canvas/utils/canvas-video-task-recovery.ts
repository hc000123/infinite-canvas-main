import type { CanvasNodeData, CanvasNodeMetadata } from "../types.ts";
import { completePendingCanvasMediaVersion, currentCanvasMediaVersion, hasUncommittedCanvasMediaVersion } from "./canvas-media-versions.ts";

export function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) => {
        if (isCompletedUncommittedVideoVersion(node)) {
            return completePendingCanvasMediaVersion(node, node, node.metadata?.finishedAt || new Date().toISOString());
        }
        if (!hasUncommittedCanvasMediaVersion(node) && isCompletedMediaNodeWithStaleStatus(node)) {
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    status: "success" as const,
                    errorDetails: undefined,
                },
            };
        }
        if (node.metadata?.status !== "loading") return node;
        if (node.type === "video" && node.metadata.taskId) return node;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: "error" as const,
                errorDetails: node.type === "video" ? "任务创建未完成，请重新生成。" : "页面刷新后生成已中断，请重新生成。",
            },
        };
    });
}

function isCompletedUncommittedVideoVersion(node: CanvasNodeData) {
    if (node.type !== "video" || !node.metadata?.content || !hasUncommittedCanvasMediaVersion(node)) return false;
    const taskStatus = normalizedTaskStatus(node.metadata);
    if (taskStatus !== "succeeded" && taskStatus !== "completed" && taskStatus !== "success") return false;
    const current = currentCanvasMediaVersion(node);
    if (!current) return false;
    if (node.metadata.storageKey && current.metadata.storageKey) return node.metadata.storageKey !== current.metadata.storageKey;
    return Boolean(current.metadata.content && node.metadata.content !== current.metadata.content);
}

function isCompletedMediaNodeWithStaleStatus(node: CanvasNodeData) {
    return (node.type === "image" || node.type === "video" || node.type === "audio") && Boolean(node.metadata?.content) && (node.metadata?.status !== "success" || Boolean(node.metadata?.errorDetails));
}

export function recoverableVideoTaskNodes(nodes: CanvasNodeData[]) {
    return nodes.filter(isRecoverableVideoTaskNode);
}

export function isRecoverableVideoTaskNode(node: CanvasNodeData) {
    const metadata = node.metadata;
    if (node.type !== "video" || !metadata?.taskId || (metadata.content && !hasUncommittedCanvasMediaVersion(node))) return false;
    const taskStatus = normalizedTaskStatus(metadata);
    if (taskStatus === "failed" || taskStatus === "cancelled") return false;
    return metadata.status === "loading" || metadata.status === "error";
}

export function recoveredVideoTaskNodeStatus(taskStatus?: string) {
    const status = (taskStatus || "").toLowerCase();
    if (status === "failed" || status === "cancelled" || status === "canceled") return "error";
    if (status === "succeeded" || status === "completed" || status === "success") return "success";
    return "loading";
}

function normalizedTaskStatus(metadata: CanvasNodeMetadata) {
    return (metadata.taskStatus || metadata.rawTaskStatus || "").toLowerCase();
}
