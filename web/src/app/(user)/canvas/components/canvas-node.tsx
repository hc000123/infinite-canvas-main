"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, AudioLines, ChevronRight, Download, FileText, Image as ImageIcon, RefreshCw, Settings2, Star, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type Position } from "../types";
import { buildCanvasVideoProgress, isVideoElapsedTerminal, videoElapsedEndAt, videoElapsedSeconds } from "../utils/canvas-video-progress";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const selectionBlue = "#2f80ff";

type CanvasNodeProps = {
    data: CanvasNodeData;
    scale: number;
    isSelected: boolean;
    isRelated: boolean;
    isFocusRelated: boolean;
    isConnectionTarget: boolean;
    isConnecting: boolean;
    editRequestNonce?: number;
    showPanel: boolean;
    showImageInfo: boolean;
    renderPanel?: (node: CanvasNodeData) => ReactNode;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    batchCount?: number;
    batchExpanded?: boolean;
    batchClosing?: boolean;
    batchOpening?: boolean;
    batchRecovering?: boolean;
    batchMotion?: { x: number; y: number; index: number };
    onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (event: React.MouseEvent, nodeId: string, handleType: "source" | "target") => void;
    onResize: (nodeId: string, width: number, height: number, position?: Position) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (node: CanvasNodeData) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onRefreshVideoTask?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onDownload?: (node: CanvasNodeData) => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    showPanel: boolean;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    onContentChange: (nodeId: string, content: string) => void;
    onStopEditing: () => void;
    onRetry?: (node: CanvasNodeData) => void;
    onRefreshVideoTask?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onDownload?: (node: CanvasNodeData) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
};

export const CanvasNode = React.memo(function CanvasNode({
    data,
    scale,
    isSelected,
    isRelated,
    isFocusRelated,
    isConnectionTarget,
    isConnecting,
    editRequestNonce = 0,
    showPanel,
    showImageInfo,
    renderPanel,
    renderNodeContent,
    batchCount = 0,
    batchExpanded = false,
    batchClosing = false,
    batchOpening = false,
    batchRecovering = false,
    batchMotion,
    onMouseDown,
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onResize,
    onContentChange,
    onToggleBatch,
    onSetBatchPrimary,
    onRetry,
    onRefreshVideoTask,
    onGenerateImage,
    onDownload,
    onContextMenu,
}: CanvasNodeProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [hovered, setHovered] = useState(false);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content);
    const hasAudioContent = data.type === CanvasNodeType.Audio && Boolean(data.metadata?.content);
    const isBatchRoot = data.type === CanvasNodeType.Image && Boolean(data.metadata?.isBatchRoot) && batchCount > 1;
    const isBatchChild = data.type === CanvasNodeType.Image && Boolean(data.metadata?.batchRootId);
    const isActive = isConnectionTarget || isSelected || isFocusRelated;
    const imageBorderColor = isActive ? selectionBlue : isRelated && !isBatchChild ? theme.node.muted : "transparent";
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const resizeRef = useRef({
        isResizing: false,
        corner: "bottom-right" as ResizeCorner,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
        keepRatio: false,
        ratio: 1,
    });

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        textarea.addEventListener("wheel", handleWheel, { passive: false });
        return () => textarea.removeEventListener("wheel", handleWheel);
    }, [data.type, isEditingContent]);

    useEffect(() => {
        if (!isEditingContent) return;
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    }, [isEditingContent]);

    useEffect(() => {
        if (!editRequestNonce || data.type !== CanvasNodeType.Text) return;
        setIsEditingContent(true);
    }, [data.type, editRequestNonce]);

    useEffect(() => {
        if (!isEditingContent) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (isEditingContent && textareaRef.current?.contains(target)) return;

            setIsEditingContent(false);
        };

        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isEditingContent]);

    const handleResizeMove = useCallback(
        (event: MouseEvent) => {
            if (!resizeRef.current.isResizing) return;

            const dx = (event.clientX - resizeRef.current.startX) / scale;
            const dy = (event.clientY - resizeRef.current.startY) / scale;
            const minWidth = 220;
            const minHeight = 160;
            const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
            const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;
            const fromLeft = resizeRef.current.corner.includes("left");
            const fromTop = resizeRef.current.corner.includes("top");
            const rawWidth = Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx));
            const rawHeight = Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy));
            let width = rawWidth;
            let height = rawHeight;
            if (resizeRef.current.keepRatio) {
                const ratio = resizeRef.current.ratio;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (height < minHeight) {
                    height = minHeight;
                    width = height * ratio;
                }
                if (width < minWidth) {
                    width = minWidth;
                    height = width / ratio;
                }
            }

            onResize(data.id, width, height, {
                x: fromLeft ? startRight - width : resizeRef.current.startLeft,
                y: fromTop ? startBottom - height : resizeRef.current.startTop,
            });
        },
        [data.id, onResize, scale],
    );

    const handleResizeUp = useCallback(() => {
        resizeRef.current.isResizing = false;
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeUp);
    }, [handleResizeMove]);

    const handleResizeMouseDown = (event: React.MouseEvent, corner: ResizeCorner) => {
        event.stopPropagation();
        event.preventDefault();
        resizeRef.current = {
            isResizing: true,
            corner,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: data.position.x,
            startTop: data.position.y,
            startWidth: data.width,
            startHeight: data.height,
            keepRatio: (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || data.type === CanvasNodeType.Video,
            ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
        };
        window.addEventListener("mousemove", handleResizeMove);
        window.addEventListener("mouseup", handleResizeUp);
    };

    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", handleResizeMove);
            window.removeEventListener("mouseup", handleResizeUp);
        };
    }, [handleResizeMove, handleResizeUp]);

    return (
        <div
            data-node-id={data.id}
            className={`node-element absolute flex select-none flex-col transition-shadow duration-200 ${isSelected ? "z-50" : "z-10"}`}
            style={{
                transform: `translate(${data.position.x}px, ${data.position.y}px)`,
                width: data.width,
                height: data.height,
                transition: "box-shadow 200ms ease",
                contain: "layout style",
            }}
            onMouseEnter={() => {
                setHovered(true);
                onHoverStart(data.id);
            }}
            onMouseLeave={() => {
                setHovered(false);
                onHoverEnd(data.id);
            }}
            onContextMenu={(event) => onContextMenu(event, data.id)}
        >
            <div
                className="relative h-full w-full overflow-visible rounded-3xl border-2"
                style={{
                    background: hasImageContent || hasVideoContent || hasAudioContent ? "transparent" : theme.node.fill,
                    borderColor: hasImageContent ? imageBorderColor : isActive ? selectionBlue : isRelated ? theme.node.muted : theme.node.stroke,
                    boxShadow: isActive ? `0 0 0 1px ${selectionBlue}55` : isRelated && !isBatchChild ? `0 0 0 1px ${theme.node.muted}55, 0 18px 48px rgba(0,0,0,.14)` : undefined,
                }}
                onMouseDown={(event) => onMouseDown(event, data.id)}
                onDoubleClick={(event) => {
                    if (isBatchRoot) {
                        event.stopPropagation();
                        onToggleBatch?.(data.id);
                        return;
                    }
                    if (data.type !== CanvasNodeType.Text) return;
                    event.stopPropagation();
                    setIsEditingContent(true);
                }}
            >
                <div
                    className={`relative flex h-full w-full items-center justify-center rounded-[inherit] ${isBatchRoot ? "overflow-visible" : "overflow-hidden"}`}
                    style={
                        {
                            background: hasImageContent || hasVideoContent || hasAudioContent ? "transparent" : theme.node.fill,
                            "--batch-from-x": `${batchMotion?.x || 0}px`,
                            "--batch-from-y": `${batchMotion?.y || 0}px`,
                            "--batch-from-rotate": `${6 + (batchMotion?.index || 0) * 4}deg`,
                            animation: data.metadata?.batchRootId ? (batchClosing ? "canvas-batch-child-out 260ms cubic-bezier(.4,0,.2,1) both" : "canvas-batch-child-in 340ms cubic-bezier(.2,.85,.18,1) both") : undefined,
                            animationDelay: data.metadata?.batchRootId ? `${batchClosing ? 0 : 45 + (batchMotion?.index || 0) * 24}ms` : undefined,
                        } as React.CSSProperties
                    }
                >
                    <NodeContent
                        node={data}
                        theme={theme}
                        isEditingContent={isEditingContent}
                        textareaRef={textareaRef}
                        isBatchRoot={isBatchRoot}
                        batchCount={batchCount}
                        batchExpanded={batchExpanded}
                        batchOpening={batchOpening}
                        batchRecovering={batchRecovering}
                        showPanel={showPanel}
                        renderNodeContent={renderNodeContent}
                        onContentChange={onContentChange}
                        onStopEditing={() => setIsEditingContent(false)}
                        onRetry={onRetry}
                        onRefreshVideoTask={onRefreshVideoTask}
                        onGenerateImage={onGenerateImage}
                        onDownload={onDownload}
                        onToggleBatch={() => onToggleBatch?.(data.id)}
                        onSetBatchPrimary={() => onSetBatchPrimary?.(data)}
                    />
                </div>

                {showImageInfo && hasImageContent ? <ImageInfoBar node={data} /> : null}

                {!hasImageContent && !hasVideoContent && !hasAudioContent ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${theme.canvas.background}66, transparent)` }} /> : null}

                <ResizeHandle corner="top-left" onMouseDown={handleResizeMouseDown} />
                <ResizeHandle corner="top-right" onMouseDown={handleResizeMouseDown} />
                <ResizeHandle corner="bottom-left" onMouseDown={handleResizeMouseDown} />
                <ResizeHandle corner="bottom-right" onMouseDown={handleResizeMouseDown} />
            </div>

            <ConnectionHandleDot side="left" visible={hovered || isSelected || isConnecting} onMouseDown={(event) => onConnectStart(event, data.id, "target")} />
            <ConnectionHandleDot side="right" visible={data.type !== CanvasNodeType.Config && (hovered || isSelected || isConnecting)} onMouseDown={(event) => onConnectStart(event, data.id, "source")} />

            {showPanel && renderPanel && data.type !== CanvasNodeType.Config && data.type !== CanvasNodeType.Audio ? <div className="absolute left-1/2 top-full z-[70] w-[500px] -translate-x-1/2 pt-4">{renderPanel(data)}</div> : null}
        </div>
    );
});

function NodeContent(props: NodeContentRendererProps) {
    if (props.node.type === CanvasNodeType.Config && props.renderNodeContent) return props.renderNodeContent(props.node);
    if (props.isBatchRoot) return <ImageNodeContent {...props} />;
    if (props.node.metadata?.status === "loading") return <LoadingContent node={props.node} theme={props.theme} onRefreshVideoTask={props.onRefreshVideoTask} showPanel={props.showPanel} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} onRefreshVideoTask={props.onRefreshVideoTask} showPanel={props.showPanel} />;

    const Renderer = nodeContentRenderers[props.node.type];
    return <Renderer {...props} />;
}

const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function LoadingContent({ node, theme, onRefreshVideoTask, showPanel }: Pick<NodeContentRendererProps, "node" | "theme" | "onRefreshVideoTask" | "showPanel">) {
    if (node.type === CanvasNodeType.Video) return <VideoTaskProgressPanel node={node} theme={theme} onRefreshVideoTask={onRefreshVideoTask} showPanel={showPanel} />;
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.activeStroke }}>
            <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />
            <span className="text-[10px] tracking-[0.2em]">生成中</span>
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

function ErrorContent({ node, theme, onRetry, onRefreshVideoTask, showPanel }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry" | "onRefreshVideoTask" | "showPanel">) {
    if (node.type === CanvasNodeType.Video) {
        return (
            <VideoTaskProgressPanel node={node} theme={theme} onRefreshVideoTask={onRefreshVideoTask} showPanel={showPanel}>
                <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onRetry?.(node);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <RefreshCw className="size-3.5" />
                    重试
                </button>
            </VideoTaskProgressPanel>
        );
    }
    return (
        <div className="flex max-w-[260px] flex-col items-center gap-3 px-5 text-center">
            <div className="text-xs leading-5 text-red-300">{node.metadata?.errorDetails || "生成失败"}</div>
            <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                重试
            </button>
        </div>
    );
}

function VideoTaskProgressPanel({ node, theme, onRefreshVideoTask, children, compact = false, showPanel = false }: Pick<NodeContentRendererProps, "node" | "theme" | "onRefreshVideoTask" | "showPanel"> & { children?: ReactNode; compact?: boolean }) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const elapsedSeconds = useVideoElapsedSeconds(node);
    const progress = buildCanvasVideoProgress(node.metadata, node.metadata?.status);
    const taskId = node.metadata?.taskId || "";
    const rows = videoTaskDetailRows(node, elapsedSeconds);
    const isFailed = progress.stage === "failed";
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
                    <div className="h-full rounded-full bg-[#2f80ff] transition-all duration-500" style={{ width: `${progress.percent}%` }} />
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
            {node.metadata?.errorDetails ? (
                <div
                    className={`${isFailed ? "thin-scrollbar max-h-28 overflow-auto whitespace-pre-wrap break-words text-[13px] leading-5" : "line-clamp-2 text-xs leading-5"} mt-3 rounded-lg border px-2.5 py-2 text-red-300`}
                    style={{ borderColor: theme.node.stroke, background: isFailed ? "rgba(127,29,29,.18)" : undefined }}
                    data-canvas-no-zoom
                    onWheel={(event) => event.stopPropagation()}
                >
                    {node.metadata.errorDetails}
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

function videoProgressStepColor({ index, progress, theme }: { index: number; progress: ReturnType<typeof buildCanvasVideoProgress>; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const step = index + 1;
    if (progress.stage === "failed") return step === progress.currentStep ? "#ef4444" : theme.node.stroke;
    return step <= progress.currentStep ? "#2f80ff" : theme.node.stroke;
}

function TextContent({ node, theme, isEditingContent, textareaRef, onContentChange, onStopEditing, onGenerateImage }: NodeContentRendererProps) {
    return (
        <div className="flex h-full w-full flex-col overflow-hidden pt-8">
            <button
                type="button"
                className="absolute right-3 top-3 z-20 inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium opacity-85 backdrop-blur-md transition hover:scale-[1.02] hover:opacity-100"
                style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.node.stroke, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onGenerateImage?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title="用文本生图"
                aria-label="用文本生图"
            >
                <ImageIcon className="size-3.5" />
                生图
            </button>
            {isEditingContent ? (
                <textarea
                    ref={textareaRef}
                    className="thin-scrollbar block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent pl-4 pr-14 pt-0 pb-4 m-0 font-mono leading-relaxed outline-none select-text appearance-none"
                    style={{ fontSize: `${node.metadata?.fontSize || 14}px`, color: theme.node.text }}
                    value={node.metadata?.content || ""}
                    onChange={(event) => onContentChange(node.id, event.target.value)}
                    onBlur={onStopEditing}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") onStopEditing();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
            ) : (
                <div
                    className="thin-scrollbar block h-full w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent pl-4 pr-14 pt-0 pb-4 font-mono leading-relaxed"
                    style={{ fontSize: `${node.metadata?.fontSize || 14}px`, color: theme.node.text }}
                    onWheel={(event) => event.stopPropagation()}
                >
                    {node.metadata?.content || <span style={{ color: theme.node.placeholder }}>双击编辑文字</span>}
                </div>
            )}
        </div>
    );
}

function ImageNodeContent(props: NodeContentRendererProps) {
    if (!props.node.metadata?.content && props.isBatchRoot) {
        const content =
            props.node.metadata?.status === "loading" ? (
                <LoadingContent node={props.node} theme={props.theme} onRefreshVideoTask={props.onRefreshVideoTask} showPanel={props.showPanel} />
            ) : props.node.metadata?.status === "error" ? (
                <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} onRefreshVideoTask={props.onRefreshVideoTask} showPanel={props.showPanel} />
            ) : (
                <EmptyImageContent {...props} isBatchRoot={false} />
            );
        return (
            <BatchFrame batchCount={props.batchCount} batchExpanded={props.batchExpanded} batchOpening={props.batchOpening} batchRecovering={props.batchRecovering} onToggleBatch={props.onToggleBatch}>
                {content}
            </BatchFrame>
        );
    }
    if (!props.node.metadata?.content) return <EmptyImageContent {...props} />;

    return (
        <ImageContent
            node={props.node}
            isBatchRoot={props.isBatchRoot}
            batchCount={props.batchCount}
            batchExpanded={props.batchExpanded}
            batchOpening={props.batchOpening}
            batchRecovering={props.batchRecovering}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
        />
    );
}

function EmptyImageContent({ theme, isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch }: NodeContentRendererProps) {
    const content = (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
            <div className="flex size-14 items-center justify-center rounded-2xl" style={{ background: theme.toolbar.activeBg }}>
                <ImageIcon className="size-6 opacity-30" />
            </div>
            <span className="text-[10px] tracking-[0.18em] opacity-50">空图片节点</span>
        </div>
    );
    if (isBatchRoot)
        return (
            <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
                {content}
            </BatchFrame>
        );
    return content;
}

function VideoNodeContent({ node, theme, onDownload, onRefreshVideoTask }: NodeContentRendererProps) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
                <Video className="size-7 opacity-35" />
                <span className="text-sm">空视频节点</span>
            </div>
        );
    return (
        <div className="relative h-full w-full rounded-[18px] bg-black">
            <video src={node.metadata.content} controls className="h-full w-full rounded-[18px] object-contain" data-canvas-no-zoom />
            <button
                type="button"
                className="absolute right-2.5 top-2.5 z-30 grid size-9 place-items-center rounded-lg border text-white shadow-[0_8px_24px_rgba(0,0,0,.24)] backdrop-blur-md transition hover:scale-[1.03]"
                style={{ background: "rgba(0,0,0,.5)", borderColor: "rgba(255,255,255,.22)" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onDownload?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title="下载视频"
                aria-label="下载视频"
            >
                <Download className="size-4" />
            </button>
            {node.metadata?.taskId || node.metadata?.prompt ? (
                <div className="absolute left-2.5 top-2.5 z-30 flex flex-wrap gap-1.5">
                    {node.metadata?.taskId ? (
                        <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg border text-white shadow-[0_8px_24px_rgba(0,0,0,.24)] backdrop-blur-md transition hover:scale-[1.03]"
                            style={{ background: "rgba(0,0,0,.5)", borderColor: "rgba(255,255,255,.22)" }}
                            onClick={(event) => {
                                event.stopPropagation();
                                setDetailsOpen((value) => !value);
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            title="任务详情"
                            aria-label="任务详情"
                        >
                            <Settings2 className="size-4" />
                        </button>
                    ) : null}
                    <GeneratedPromptToggle node={node} theme={theme} variant="dark" />
                </div>
            ) : null}
            <VideoNodeStatusPill node={node} offsetTop={node.metadata?.taskId || node.metadata?.prompt ? 46 : 10} />
            {detailsOpen ? (
                <div className="absolute left-2.5 top-12 z-40">
                    <VideoTaskProgressPanel node={node} theme={theme} onRefreshVideoTask={onRefreshVideoTask} showPanel={false} compact />
                </div>
            ) : null}
        </div>
    );
}

function AudioNodeContent({ node, theme }: NodeContentRendererProps) {
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <AudioLines className="size-6 opacity-35" />
                <span className="text-sm">空音频节点</span>
            </div>
        );
    return (
        <div className="flex h-full w-full flex-col justify-center gap-2 rounded-[18px] px-4" style={{ background: theme.node.fill }}>
            <div className="flex min-w-0 items-center gap-2 text-xs opacity-65">
                <AudioLines className="size-4 shrink-0" />
                <span className="truncate">{node.title}</span>
            </div>
            <audio src={node.metadata.content} controls className="w-full" data-canvas-no-zoom />
        </div>
    );
}

function VideoNodeStatusPill({ node, offsetTop }: { node: CanvasNodeData; offsetTop: number }) {
    const text = videoNodeCompactStatus(node);
    if (!text) return null;
    return (
        <div className="pointer-events-none absolute left-2.5 right-12 z-20 flex" style={{ top: offsetTop }}>
            <span className="max-w-full truncate rounded bg-black/50 px-2 py-1 text-[10px] font-medium leading-none text-white/90 backdrop-blur-sm">{text}</span>
        </div>
    );
}

function videoNodeCompactStatus(node: CanvasNodeData) {
    const parts = [node.metadata?.taskStatus ? videoStatusLabel(node.metadata.taskStatus) : "", node.metadata?.storageKey ? `本地 ${formatBytes(node.metadata.bytes || 0)}` : ""].filter(Boolean);
    return parts.join(" · ");
}

function videoTaskDetailRows(node: CanvasNodeData, elapsedSeconds: number) {
    const metadata = node.metadata;
    return [
        { label: "taskId", value: metadata?.taskId },
        { label: "阶段", value: buildCanvasVideoProgress(metadata, metadata?.status).label },
        { label: "状态", value: videoStatusLabel(metadata?.taskStatus || metadata?.rawTaskStatus) },
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

function shortTaskId(taskId: string) {
    if (taskId.length <= 18) return taskId;
    return `${taskId.slice(0, 10)}…${taskId.slice(-6)}`;
}

function ImageContent({
    node,
    isBatchRoot,
    batchCount,
    batchExpanded,
    batchOpening,
    batchRecovering,
    onToggleBatch,
    onSetBatchPrimary,
}: {
    node: CanvasNodeData;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchChild = Boolean(node.metadata?.batchRootId);

    return (
        <BatchFrame batchCount={isBatchRoot ? batchCount : 0} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
            <div className="h-full w-full overflow-hidden rounded-3xl">
                <img
                    src={node.metadata!.content!}
                    alt={node.title}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                />
            </div>
            <div className="absolute left-2.5 top-2.5 z-30">
                <GeneratedPromptToggle node={node} theme={theme} />
            </div>
            {isBatchRoot ? (
                <button
                    type="button"
                    className="absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold shadow-[0_6px_18px_rgba(15,23,42,.10)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: `${theme.toolbar.panel}d9`, borderColor: `${theme.toolbar.border}cc`, color: theme.node.text }}
                    aria-label={batchExpanded ? "图片组已展开" : "图片组已收起"}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none text-[#2f80ff]">{batchCount}</span>
                    <ChevronRight className={`size-3.5 opacity-55 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
            {isBatchChild ? (
                <button
                    type="button"
                    className="absolute right-3 top-3 z-30 flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium opacity-0 shadow-[0_8px_20px_rgba(68,64,60,.13)] backdrop-blur-md transition group-hover/batch:opacity-100 hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSetBatchPrimary?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Star className="size-3.5 text-[#2f80ff]" />
                    设为主图
                </button>
            ) : null}
        </BatchFrame>
    );
}

function GeneratedPromptToggle({ node, theme, variant = "panel" }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; variant?: "panel" | "dark" }) {
    const [open, setOpen] = useState(false);
    const prompt = node.metadata?.prompt?.trim();
    if (!prompt) return null;
    const dark = variant === "dark";
    return (
        <div className="relative">
            <button
                type="button"
                className={`${dark ? "grid size-8 place-items-center px-0 text-white" : "inline-flex h-8 items-center gap-1.5 px-2.5"} rounded-lg border text-[11px] font-medium shadow-[0_8px_24px_rgba(0,0,0,.18)] backdrop-blur-md transition hover:scale-[1.03]`}
                style={{ background: dark ? "rgba(0,0,0,.5)" : `${theme.toolbar.panel}d9`, borderColor: dark ? "rgba(255,255,255,.22)" : `${theme.toolbar.border}cc`, color: dark ? "#fff" : theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen((value) => !value);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title="查看生成提示词"
                aria-label="查看生成提示词"
            >
                <FileText className={dark ? "size-4" : "size-3.5"} />
                {dark ? null : "提示词"}
            </button>
            {open ? (
                <div
                    className="thin-scrollbar absolute left-0 top-10 z-50 max-h-44 w-[min(320px,calc(100vw-32px))] overflow-auto whitespace-pre-wrap break-words rounded-xl border p-3 text-xs leading-5 shadow-[0_18px_42px_rgba(0,0,0,.22)] backdrop-blur-md"
                    style={{ background: dark ? "rgba(0,0,0,.72)" : `${theme.node.fill}f2`, borderColor: dark ? "rgba(255,255,255,.22)" : theme.node.stroke, color: dark ? "#fff" : theme.node.text }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                    data-canvas-no-zoom
                >
                    {prompt}
                </div>
            ) : null}
        </div>
    );
}

function ImageInfoBar({ node }: { node: CanvasNodeData }) {
    const width = Math.round(node.metadata?.naturalWidth || node.width);
    const height = Math.round(node.metadata?.naturalHeight || node.height);
    const size = formatBytes(node.metadata?.bytes || 0);
    return (
        <div className="pointer-events-none absolute bottom-3 right-3 z-40 max-w-[calc(100%-24px)]">
            <span className="max-w-full truncate rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
                {width} x {height}
                {size ? ` · ${size}` : ""}
            </span>
        </div>
    );
}

function videoStatusLabel(status?: string) {
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

function BatchFrame({ batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, children }: { batchCount: number; batchExpanded: boolean; batchOpening: boolean; batchRecovering: boolean; onToggleBatch?: () => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchRoot = batchCount > 1;
    return (
        <div
            className="group/batch relative h-full w-full overflow-visible"
            onDoubleClick={
                isBatchRoot
                    ? (event) => {
                          event.stopPropagation();
                          onToggleBatch?.();
                      }
                    : undefined
            }
        >
            {isBatchRoot ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(batchCount - 1, 5) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.16)] transition-all duration-300 group-hover/batch:translate-x-2"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
                                borderColor: theme.node.stroke,
                                opacity: batchExpanded && !batchOpening ? 0.34 : 1,
                                transform:
                                    batchOpening || batchRecovering ? `translate(${54 + index * 22}px, ${20 + index * 12}px) rotate(${8 + index * 5}deg) scale(.98)` : `translate(${34 + index * 18}px, ${14 + index * 10}px) rotate(${6 + index * 4}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {children}
        </div>
    );
}
function ResizeHandle({ corner, onMouseDown }: { corner: ResizeCorner; onMouseDown: (event: React.MouseEvent, corner: ResizeCorner) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
    }[corner];

    return <div className={`absolute z-50 size-7 ${positionClass}`} onMouseDown={(event) => onMouseDown(event, corner)} />;
}

function ConnectionHandleDot({ side, visible, onMouseDown }: { side: "left" | "right"; visible: boolean; onMouseDown: (event: React.MouseEvent) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div
            className={`absolute top-1/2 z-30 flex size-12 -translate-y-1/2 cursor-crosshair items-center justify-center transition-opacity duration-150 ${
                side === "left" ? "-left-6" : "-right-6"
            } ${visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
            onMouseDown={onMouseDown}
        >
            <div className="size-3 rounded-full border-2 transition-all hover:scale-125" style={{ background: theme.node.panel, borderColor: theme.node.muted }} />
        </div>
    );
}
