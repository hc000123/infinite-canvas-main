"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "../types";
import { buildCanvasVideoProgress, isVideoElapsedTerminal, videoElapsedEndAt, videoElapsedSeconds } from "../utils/canvas-video-progress";

export function VideoTaskProgressPanel({
    node,
    theme,
    onRefreshVideoTask,
    children,
    compact = false,
    showPanel = false,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onRefreshVideoTask?: (node: CanvasNodeData) => void;
    children?: ReactNode;
    compact?: boolean;
    showPanel?: boolean;
}) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const elapsedSeconds = useVideoElapsedSeconds(node);
    const progress = buildCanvasVideoProgress(node.metadata, node.metadata?.status);
    const taskId = node.metadata?.taskId || "";
    const rows = videoTaskDetailRows(node, elapsedSeconds);
    const isFailed = progress.stage === "failed";
    const showErrorDetails = Boolean(node.metadata?.errorDetails && !node.metadata?.content);
    const prompt = node.metadata?.prompt?.trim();
    return (
        <div
            className={`${compact ? "w-[min(420px,calc(100%-16px))]" : "w-[min(420px,calc(100%-20px))]"} flex max-h-[calc(100%-16px)] flex-col rounded-2xl border p-3 text-left shadow-[0_18px_42px_rgba(0,0,0,.18)] backdrop-blur-md`}
            style={{ background: `${theme.node.fill}ee`, borderColor: theme.node.stroke, color: theme.node.text }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {isFailed ? <AlertTriangle className="size-4 text-red-300" /> : null}
                        <span>{progress.label}</span>
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-[11px] opacity-65">
                        <span className="tabular-nums">已用 {formatElapsedTime(elapsedSeconds)}</span>
                        {taskId ? <span className="max-w-[180px] truncate tabular-nums">task {shortTaskId(taskId)}</span> : <span>{isFailed ? "未创建任务" : "等待 taskId"}</span>}
                    </div>
                </div>
                <div className="shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium tabular-nums" style={{ borderColor: isFailed ? "#ef4444aa" : theme.node.stroke, color: isFailed ? "#fca5a5" : theme.node.text }}>
                    {isFailed ? "失败" : `${progress.percent}%`}
                </div>
            </div>
            {!isFailed ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: theme.toolbar.activeBg }}>
                    <div className="h-full rounded-full bg-[#2f80ff] transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
                </div>
            ) : null}
            <div className="mt-3 grid grid-cols-5 gap-1.5">
                {progress.steps.map((step, index) => (
                    <div key={step} className="min-w-0">
                        <div className="mb-1 h-1 rounded-full" style={{ background: videoProgressStepColor({ index, progress, theme }) }} />
                        <div className="truncate text-center text-[10px] opacity-65">{step}</div>
                    </div>
                ))}
            </div>
            {showErrorDetails ? (
                <div
                    className={`${isFailed ? "thin-scrollbar max-h-28 overflow-auto whitespace-pre-wrap break-words text-[13px] leading-5" : "line-clamp-2 text-xs leading-5"} mt-3 rounded-lg border px-2.5 py-2 text-red-300`}
                    style={{ borderColor: theme.node.stroke, background: isFailed ? "rgba(127,29,29,.18)" : undefined }}
                    data-canvas-no-zoom
                    onWheel={(event) => event.stopPropagation()}
                >
                    {node.metadata?.errorDetails}
                </div>
            ) : null}
            {isFailed && prompt && !showPanel ? (
                <div
                    className="thin-scrollbar mt-3 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-lg border px-2.5 py-2 text-xs leading-5"
                    style={{ borderColor: theme.node.stroke, background: theme.node.panel }}
                    data-canvas-no-zoom
                    onWheel={(event) => event.stopPropagation()}
                >
                    <div className="mb-1 text-[11px] opacity-45">提示词</div>
                    {prompt}
                </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
                {taskId ? (
                    <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onRefreshVideoTask?.(node);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <RefreshCw className="size-3.5" />
                        刷新
                    </button>
                ) : null}
                <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        setDetailsOpen((value) => !value);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    详情
                </button>
                {children}
            </div>
            {detailsOpen ? (
                <div
                    className={`${isFailed ? "max-h-56 text-xs leading-5" : "max-h-40 text-[11px] leading-4"} thin-scrollbar mt-3 space-y-2 overflow-auto rounded-lg border p-2.5`}
                    style={{ borderColor: theme.node.stroke, background: theme.node.panel }}
                    data-canvas-no-zoom
                    onWheel={(event) => event.stopPropagation()}
                >
                    {rows.map((row) => (
                        <div key={row.label} className={`${isFailed ? "grid-cols-[68px_minmax(0,1fr)]" : "grid-cols-[58px_minmax(0,1fr)]"} grid gap-2`}>
                            <span className="opacity-45">{row.label}</span>
                            <span className="min-w-0 break-all tabular-nums">{row.value}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function useVideoElapsedSeconds(node: CanvasNodeData) {
    const [now, setNow] = useState(() => Date.now());
    const [fallbackEndedAt, setFallbackEndedAt] = useState<number>();
    const startedAt = videoGenerationStartedAt(node);
    const terminal = isVideoElapsedTerminal(node.metadata, node.metadata?.status);
    const endedAt = videoElapsedEndAt(node.metadata, node.metadata?.status);

    useEffect(() => {
        if (terminal) {
            setFallbackEndedAt((current) => endedAt || current || Date.now());
            return;
        }
        setFallbackEndedAt(undefined);
    }, [endedAt, node.id, terminal]);

    useEffect(() => {
        if (!startedAt) return;
        if (terminal) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [node.id, startedAt, terminal]);

    return videoElapsedSeconds(node.metadata, endedAt || fallbackEndedAt || now, node.metadata?.status);
}

function videoGenerationStartedAt(node: CanvasNodeData) {
    const startedAt = normalizeTimestamp(node.metadata?.generationStartedAt);
    if (startedAt) return startedAt;
    return normalizeTimestamp(node.metadata?.taskCreatedAt);
}

function normalizeTimestamp(value?: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return value > 1_000_000_000_000 ? value : value * 1000;
}

function formatElapsedTime(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours > 0) return `${hours}:${padTime(minutes)}:${padTime(rest)}`;
    return `${padTime(minutes)}:${padTime(rest)}`;
}

function padTime(value: number) {
    return String(value).padStart(2, "0");
}

function videoProgressStepColor({ index, progress, theme }: { index: number; progress: ReturnType<typeof buildCanvasVideoProgress>; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const step = index + 1;
    if (progress.stage === "failed") return step === progress.currentStep ? "#ef4444" : theme.node.stroke;
    return step <= progress.currentStep ? "#2f80ff" : theme.node.stroke;
}

function videoTaskDetailRows(node: CanvasNodeData, elapsedSeconds: number) {
    const metadata = node.metadata;
    return [
        { label: "taskId", value: metadata?.taskId },
        { label: "aiTaskId", value: metadata?.aiTaskId },
        { label: "上游任务", value: metadata?.upstreamTaskId },
        { label: "阶段", value: buildCanvasVideoProgress(metadata, metadata?.status).label },
        { label: "状态", value: videoStatusLabel(metadata?.taskStatus || metadata?.rawTaskStatus) },
        { label: "账本状态", value: metadata?.aiTaskStatus },
        { label: "扣费 / 返还", value: metadata?.aiTaskCredits || metadata?.creditsRefunded ? `${metadata?.aiTaskCredits || 0} / ${metadata?.creditsRefunded || 0}` : "" },
        { label: "Credit Log", value: metadata?.creditLogId },
        { label: "原始", value: metadata?.rawTaskStatus },
        { label: "耗时", value: formatElapsedTime(elapsedSeconds) },
        { label: "模型", value: metadata?.model },
        { label: "模式", value: metadata?.videoTaskMode },
        { label: "关系", value: metadata?.relationType || metadata?.videoActionType },
        { label: "源视频", value: metadata?.sourceVideoNodeId },
        { label: "参数", value: [metadata?.resolution || metadata?.vquality, metadata?.ratio || metadata?.size, metadata?.duration || metadata?.seconds ? `${metadata.duration || metadata.seconds}s` : ""].filter(Boolean).join(" · ") },
        { label: "seed", value: metadata?.seed },
        { label: "URL", value: metadata?.videoUrlExpiresAt ? videoUrlExpiryLabel(node) : "" },
        { label: "提示词", value: metadata?.prompt },
        { label: "错误", value: metadata?.errorDetails },
    ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

export function shortTaskId(taskId: string) {
    if (taskId.length <= 18) return taskId;
    return `${taskId.slice(0, 10)}…${taskId.slice(-6)}`;
}

export function videoStatusLabel(status?: string) {
    switch ((status || "").toLowerCase()) {
        case "queued":
            return "排队中";
        case "running":
        case "processing":
            return "生成中";
        case "succeeded":
        case "completed":
        case "success":
            return "已完成";
        case "failed":
        case "error":
            return "失败";
        case "cancelled":
        case "canceled":
            return "已取消";
        default:
            return status || "";
    }
}

function videoUrlExpiryLabel(node: CanvasNodeData) {
    if (node.metadata?.videoUrlExpiresAt) return `URL 至 ${formatUnixSeconds(node.metadata.videoUrlExpiresAt)}`;
    if (node.metadata?.executionExpiresAfter) return `URL 有效 ${formatSecondSpan(node.metadata.executionExpiresAfter)}`;
    return "";
}

function formatUnixSeconds(value: number) {
    return new Date(value * 1000).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatSecondSpan(value: number) {
    const hours = Math.floor(value / 3600);
    if (hours >= 24) return `${Math.round(hours / 24)}天`;
    if (hours > 0) return `${hours}小时`;
    return `${Math.max(1, Math.floor(value / 60))}分钟`;
}
