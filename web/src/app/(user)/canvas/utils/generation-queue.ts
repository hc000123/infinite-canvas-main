import type { CanvasNodeData } from "../types.ts";
import type { StoryboardGroup, StoryboardShot } from "./storyboard-management.ts";

export type GenerationQueueKind = "video" | "image" | "chat";
export type GenerationQueueStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "paused";

export type GenerationQueueItem = {
    id: string;
    projectId: string;
    storyboardGroupId: string;
    storyboardShotId: string;
    nodeId: string;
    kind: GenerationQueueKind;
    status: GenerationQueueStatus;
    priority: number;
    estimatedCredits: number;
    estimatedDurationSeconds?: number;
    taskId?: string;
    resultAssetId?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
};

export type GenerationQueueMissingItem = {
    storyboardShotId: string;
    reason: string;
};

export type GenerationQueueSummary = {
    videoCount: number;
    totalDurationSeconds: number;
    totalEstimatedCredits: number;
    missingCount: number;
};

export function buildGenerationQueuePlan({ projectId, group, shots, nodes, idFactory }: { projectId: string; group: StoryboardGroup; shots: StoryboardShot[]; nodes: CanvasNodeData[]; idFactory: (index: number) => string }) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const items: GenerationQueueItem[] = [];
    const missing: GenerationQueueMissingItem[] = [];
    const now = new Date().toISOString();

    shots
        .filter((shot) => shot.groupId === group.id)
        .sort((a, b) => a.order - b.order)
        .forEach((shot, index) => {
            const configRef = shot.nodeRefs.find((ref) => ref.role === "video_config");
            if (!configRef) {
                missing.push({ storyboardShotId: shot.id, reason: "缺少视频生成配置节点" });
                return;
            }
            const node = nodesById.get(configRef.nodeId);
            if (!node) {
                missing.push({ storyboardShotId: shot.id, reason: "视频生成配置节点不存在" });
                return;
            }
            if (node.type !== "config" || node.metadata?.generationMode !== "video") {
                missing.push({ storyboardShotId: shot.id, reason: "节点不是视频生成配置" });
                return;
            }
            const duration = videoDurationSeconds(node);
            items.push({
                id: idFactory(items.length),
                projectId,
                storyboardGroupId: group.id,
                storyboardShotId: shot.id,
                nodeId: node.id,
                kind: "video",
                status: "queued",
                priority: index + 1,
                estimatedCredits: estimateVideoCredits(duration),
                estimatedDurationSeconds: duration,
                createdAt: now,
                updatedAt: now,
            });
        });

    return { items, missing, summary: summarizeGenerationQueue(items, missing) };
}

export function summarizeGenerationQueue(items: GenerationQueueItem[], missing: GenerationQueueMissingItem[] = []): GenerationQueueSummary {
    return {
        videoCount: items.filter((item) => item.kind === "video").length,
        totalDurationSeconds: items.reduce((sum, item) => sum + Math.max(0, Number(item.estimatedDurationSeconds ?? item.estimatedCredits) || 0), 0),
        totalEstimatedCredits: items.reduce((sum, item) => sum + Math.max(0, item.estimatedCredits), 0),
        missingCount: missing.length,
    };
}

export function startQueueItem(item: GenerationQueueItem, taskId?: string): GenerationQueueItem {
    return { ...item, status: "running", taskId: taskId || item.taskId, error: undefined, updatedAt: new Date().toISOString() };
}

export function succeedQueueItem(item: GenerationQueueItem, result: { taskId?: string; resultAssetId?: string }): GenerationQueueItem {
    return { ...item, status: "succeeded", taskId: result.taskId || item.taskId, resultAssetId: result.resultAssetId || item.resultAssetId, error: undefined, updatedAt: new Date().toISOString() };
}

export function failQueueItem(item: GenerationQueueItem, error: string): GenerationQueueItem {
    return { ...item, status: "failed", error: error || "生成失败", updatedAt: new Date().toISOString() };
}

export function retryQueueItem(item: GenerationQueueItem): GenerationQueueItem {
    return { ...item, status: "queued", error: undefined, taskId: undefined, updatedAt: new Date().toISOString() };
}

export function retryFailedQueueItems(items: GenerationQueueItem[]) {
    return items.map((item) => (item.status === "failed" ? retryQueueItem(item) : item));
}

export function pauseQueuedItems(items: GenerationQueueItem[]) {
    return items.map((item) => (item.status === "queued" ? { ...item, status: "paused" as const, updatedAt: new Date().toISOString() } : item));
}

export function resumePausedItems(items: GenerationQueueItem[]) {
    return items.map((item) => (item.status === "paused" ? { ...item, status: "queued" as const, updatedAt: new Date().toISOString() } : item));
}

export function cancelQueuedItems(items: GenerationQueueItem[]) {
    return items.map((item) => (item.status === "queued" || item.status === "paused" ? { ...item, status: "cancelled" as const, updatedAt: new Date().toISOString() } : item));
}

export function nextQueuedItem(items: GenerationQueueItem[], projectId: string, concurrency: number) {
    const runningCount = items.filter((item) => item.projectId === projectId && item.status === "running").length;
    if (runningCount >= Math.max(1, concurrency)) return null;
    return [...items].filter((item) => item.projectId === projectId && item.kind === "video" && item.status === "queued").sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))[0] || null;
}

function videoDurationSeconds(node: CanvasNodeData) {
    const raw = node.metadata?.seconds || node.metadata?.duration || "8";
    const value = Number.parseInt(String(raw), 10);
    return Number.isFinite(value) && value > 0 ? value : 8;
}

function estimateVideoCredits(durationSeconds: number) {
    return Math.max(1, Math.ceil(durationSeconds));
}
