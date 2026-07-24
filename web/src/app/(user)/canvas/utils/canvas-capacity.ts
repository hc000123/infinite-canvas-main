import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "../types.ts";

export type CanvasCapacityLevel = "normal" | "warning" | "critical";

export type CanvasStorageEstimate = {
    usage?: number;
    quota?: number;
};

export type CanvasCapacitySnapshot = {
    nodeCount: number;
    connectionCount: number;
    configNodeCount: number;
    mediaNodeCount: number;
    mediaVersionCount: number;
    mediaBytes: number;
    storageUsage?: number;
    storageQuota?: number;
    storageRatio?: number;
    level: CanvasCapacityLevel;
    reasons: string[];
};

export function buildCanvasCapacitySnapshot(nodes: CanvasNodeData[], connections: CanvasConnection[], estimate: CanvasStorageEstimate = {}): CanvasCapacitySnapshot {
    const nodeCount = nodes.length;
    const connectionCount = connections.length;
    const configNodeCount = nodes.filter((node) => node.type === "config").length;
    const mediaNodeCount = nodes.filter((node) => node.type === "image" || node.type === "video" || node.type === "audio").length;
    const mediaVersionCount = nodes.reduce((total, node) => total + (node.metadata?.mediaVersions?.length || 0), 0);
    const mediaBytes = canvasMediaBytes(nodes);
    const storageUsage = finiteNumber(estimate.usage);
    const storageQuota = finiteNumber(estimate.quota);
    const storageRatio = storageUsage !== undefined && storageQuota && storageQuota > 0 ? storageUsage / storageQuota : undefined;
    const criticalReasons = capacityReasons(nodeCount, connectionCount, mediaVersionCount, storageRatio, "critical");
    const warningReasons = capacityReasons(nodeCount, connectionCount, mediaVersionCount, storageRatio, "warning");
    const level = criticalReasons.length ? "critical" : warningReasons.length ? "warning" : "normal";

    return {
        nodeCount,
        connectionCount,
        configNodeCount,
        mediaNodeCount,
        mediaVersionCount,
        mediaBytes,
        storageUsage,
        storageQuota,
        storageRatio,
        level,
        reasons: level === "critical" ? criticalReasons : warningReasons,
    };
}

export function formatCanvasCapacityBytes(bytes = 0) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** unitIndex;
    return `${Number(value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1))} ${units[unitIndex]}`;
}

function canvasMediaBytes(nodes: CanvasNodeData[]) {
    const bytesByKey = new Map<string, number>();
    nodes.forEach((node) => {
        recordMediaBytes(bytesByKey, node.metadata);
        node.metadata?.mediaVersions?.forEach((version) => recordMediaBytes(bytesByKey, version.metadata));
    });
    return Array.from(bytesByKey.values()).reduce((total, bytes) => total + bytes, 0);
}

function recordMediaBytes(bytesByKey: Map<string, number>, metadata?: Partial<CanvasNodeMetadata>) {
    const key = metadata?.storageKey;
    if (!key) return;
    const bytes = Math.max(0, Number(metadata?.bytes) || 0);
    bytesByKey.set(key, Math.max(bytesByKey.get(key) || 0, bytes));
}

function capacityReasons(nodeCount: number, connectionCount: number, mediaVersionCount: number, storageRatio: number | undefined, level: Exclude<CanvasCapacityLevel, "normal">) {
    const critical = level === "critical";
    const reasons: string[] = [];
    if (nodeCount >= (critical ? 300 : 200)) reasons.push(`节点达到 ${nodeCount} 个`);
    if (connectionCount >= (critical ? 800 : 400)) reasons.push(`连线达到 ${connectionCount} 条`);
    if (mediaVersionCount >= (critical ? 400 : 200)) reasons.push(`历史媒体版本达到 ${mediaVersionCount} 个`);
    if (storageRatio !== undefined && storageRatio >= (critical ? 0.9 : 0.7)) reasons.push(`浏览器本地缓存已使用 ${Math.round(storageRatio * 100)}%`);
    return reasons;
}

function finiteNumber(value?: number) {
    return Number.isFinite(value) && value! >= 0 ? value : undefined;
}
