import type { CanvasNodeMetadata, CanvasNodeStatus } from "../types.ts";

export type CanvasVideoProgressStage = "creating" | "queued" | "running" | "caching" | "succeeded" | "failed" | "cancelled";

export type CanvasVideoProgress = {
    stage: CanvasVideoProgressStage;
    label: string;
    percent: number;
    currentStep: number;
    steps: string[];
};

const steps = ["创建任务", "排队", "生成", "回填", "完成"];

export function buildCanvasVideoProgress(metadata: CanvasNodeMetadata | undefined, nodeStatus?: CanvasNodeStatus): CanvasVideoProgress {
    const taskStatus = normalizeVideoTaskStatus(metadata?.taskStatus || metadata?.rawTaskStatus);
    const elapsedSeconds = videoElapsedSeconds(metadata, Date.now(), nodeStatus);
    if (metadata?.content) return progress("succeeded", "完成", 100, 5);
    if (nodeStatus === "error" || taskStatus === "failed") return failedProgress(metadata);
    if (taskStatus === "cancelled") return progress("cancelled", "已取消", 100, 4);
    if (nodeStatus === "success" || taskStatus === "succeeded") return progress(nodeStatus === "success" ? "succeeded" : "caching", nodeStatus === "success" ? "完成" : "回填视频", nodeStatus === "success" ? 100 : 92, nodeStatus === "success" ? 5 : 4);
    if (taskStatus === "running") return progress("running", "生成中", runningPercent(elapsedSeconds), 3);
    if (taskStatus === "queued") return progress("queued", "排队中", 24, 2);
    return progress("creating", "创建任务", 8, 1);
}

export function videoElapsedSeconds(metadata: CanvasNodeMetadata | undefined, now: number, nodeStatus?: CanvasNodeStatus) {
    const startedAt = normalizeTimestamp(metadata?.generationStartedAt) || normalizeTimestamp(metadata?.taskCreatedAt);
    if (!startedAt) return 0;
    const endedAt = videoElapsedEndAt(metadata, nodeStatus);
    return Math.max(0, Math.floor(((endedAt || now) - startedAt) / 1000));
}

export function isVideoElapsedTerminal(metadata: CanvasNodeMetadata | undefined, nodeStatus?: CanvasNodeStatus) {
    const taskStatus = normalizeVideoTaskStatus(metadata?.taskStatus || metadata?.rawTaskStatus);
    return Boolean(metadata?.content) || nodeStatus === "error" || nodeStatus === "success" || taskStatus === "failed" || taskStatus === "cancelled" || taskStatus === "succeeded";
}

export function videoElapsedEndAt(metadata: CanvasNodeMetadata | undefined, nodeStatus?: CanvasNodeStatus) {
    if (!isVideoElapsedTerminal(metadata, nodeStatus)) return undefined;
    return normalizeTimestamp(metadata?.taskUpdatedAt) || normalizeTimestamp(metadata?.videoUrlExpiresAt) || parseTimestamp(metadata?.localStoredAt);
}

function failedProgress(metadata: CanvasNodeMetadata | undefined) {
    return metadata?.taskId ? progress("failed", "生成失败", 72, 3) : progress("failed", "创建失败", 8, 1);
}

function progress(stage: CanvasVideoProgressStage, label: string, percent: number, currentStep: number): CanvasVideoProgress {
    return { stage, label, percent: Math.max(0, Math.min(100, Math.round(percent))), currentStep, steps };
}

function runningPercent(elapsedSeconds: number) {
    return Math.min(88, 36 + Math.floor(elapsedSeconds / 6) * 4);
}

function normalizeVideoTaskStatus(status?: string) {
    switch ((status || "").toLowerCase()) {
        case "queued":
        case "pending":
        case "created":
            return "queued";
        case "running":
        case "processing":
        case "in_progress":
            return "running";
        case "succeeded":
        case "completed":
        case "success":
            return "succeeded";
        case "failed":
        case "error":
        case "expired":
            return "failed";
        case "cancelled":
        case "canceled":
            return "cancelled";
        default:
            return "";
    }
}

function normalizeTimestamp(value?: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return value > 1_000_000_000_000 ? value : value * 1000;
}

function parseTimestamp(value?: string) {
    if (!value) return undefined;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : undefined;
}
