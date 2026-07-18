"use client";

import { useState } from "react";
import { ArrowRight, Image as ImageIcon, Scissors, Settings2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import type { CanvasNodeData } from "../types";
import { GeneratedPromptToggle, MediaReviewStatusBadge } from "./canvas-media-node-controls";
import { shortTaskId, VideoTaskProgressPanel, videoStatusLabel } from "./canvas-video-task-progress-panel";

export function VideoNodeContent({
    node,
    theme,
    onRefreshVideoTask,
    reviewSubmitting,
    frameReferenceNodes,
    onNormalizeFrameReferences,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onRefreshVideoTask?: (node: CanvasNodeData) => void;
    reviewSubmitting?: boolean;
    frameReferenceNodes?: { first?: CanvasNodeData; last?: CanvasNodeData };
    onNormalizeFrameReferences?: (videoNode: CanvasNodeData, firstNode: CanvasNodeData, lastNode: CanvasNodeData) => void;
}) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const frameStrip = <FrameReferenceStrip videoNode={node} theme={theme} frameReferenceNodes={frameReferenceNodes} onNormalizeFrameReferences={onNormalizeFrameReferences} />;
    if (!node.metadata?.content && (frameReferenceNodes?.first || frameReferenceNodes?.last)) {
        return <EmptyVideoFramePreview videoNode={node} theme={theme} frameReferenceNodes={frameReferenceNodes} onNormalizeFrameReferences={onNormalizeFrameReferences} />;
    }
    if (!node.metadata?.content) {
        return (
            <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg" style={{ color: theme.node.placeholder }}>
                <Video className="size-7 opacity-35" />
                <span className="text-sm">空视频节点</span>
                {frameStrip}
            </div>
        );
    }
    return (
        <div className="relative h-full w-full rounded-lg bg-black">
            <video src={node.metadata.content} controls controlsList="nodownload" className="h-full w-full rounded-lg object-contain" data-canvas-no-zoom />
            {frameStrip}
            {node.metadata?.taskId || node.metadata?.prompt ? (
                <div className="absolute left-2.5 top-2.5 z-30 flex flex-wrap gap-1.5">
                    {node.metadata?.taskId ? (
                        <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg border shadow-[var(--studio-shadow)] backdrop-blur-md transition hover:scale-[1.03]"
                            style={{ background: "var(--studio-media-overlay)", borderColor: "var(--studio-border-subtle)", color: "var(--studio-on-media)" }}
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
            <MediaReviewStatusBadge node={node} theme={theme} submitting={reviewSubmitting} className="absolute right-2.5 top-2.5 z-30" dark />
            <VideoNodeStatusPill node={node} offsetTop={node.metadata?.taskId || node.metadata?.prompt ? 46 : 10} />
            {detailsOpen ? (
                <div className="absolute left-2.5 top-12 z-40">
                    <VideoTaskProgressPanel node={node} theme={theme} onRefreshVideoTask={onRefreshVideoTask} showPanel={false} compact />
                </div>
            ) : null}
        </div>
    );
}

function EmptyVideoFramePreview({
    videoNode,
    theme,
    frameReferenceNodes,
    onNormalizeFrameReferences,
}: {
    videoNode: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    frameReferenceNodes?: { first?: CanvasNodeData; last?: CanvasNodeData };
    onNormalizeFrameReferences?: (videoNode: CanvasNodeData, firstNode: CanvasNodeData, lastNode: CanvasNodeData) => void;
}) {
    const first = frameReferenceNodes?.first;
    const last = frameReferenceNodes?.last;
    const mismatch = Boolean(first && last && frameResolutionLabel(first) && frameResolutionLabel(last) && frameResolutionLabel(first) !== frameResolutionLabel(last));
    return (
        <div className="flex h-full w-full flex-col gap-2 rounded-lg p-3" style={{ color: theme.node.text }}>
            <div className="flex shrink-0 items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-medium opacity-70">
                    <Video className="size-3.5 shrink-0" />
                    <span className="truncate">首尾帧生成视频</span>
                </span>
                {mismatch && first && last ? (
                    <button
                        type="button"
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-medium transition hover:opacity-85"
                        style={{ background: "color-mix(in srgb, var(--studio-warning) 24%, var(--studio-elevated-bg))", borderColor: "color-mix(in srgb, var(--studio-warning) 46%, var(--studio-border-subtle))", color: theme.node.text }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onNormalizeFrameReferences?.(videoNode, first, last);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        title="首尾帧分辨率不一致，自动居中裁切到统一分辨率"
                    >
                        <Scissors className="size-3" />
                        统一裁切
                    </button>
                ) : null}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-stretch gap-2">
                <LargeFrameSlot label="首帧" node={first} theme={theme} />
                <div className="grid place-items-center" style={{ color: theme.node.muted }}>
                    <ArrowRight className="size-4" />
                </div>
                <LargeFrameSlot label="尾帧" node={last} theme={theme} />
            </div>
        </div>
    );
}

function LargeFrameSlot({ label, node, theme }: { label: string; node?: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="relative min-w-0 overflow-hidden rounded-lg border" style={{ background: `${theme.node.fill}cc`, borderColor: node?.metadata?.content ? "transparent" : theme.node.stroke }}>
            {node?.metadata?.content ? <img src={node.metadata.content} alt={label} className="h-full w-full object-cover" draggable={false} /> : <div className="grid h-full w-full place-items-center opacity-40"><ImageIcon className="size-6" /></div>}
            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] font-medium leading-none text-white">{label}</span>
            <span className="absolute inset-x-2 bottom-2 truncate rounded bg-black/55 px-2 py-1 text-[10px] leading-none text-white/90">{node ? frameResolutionLabel(node) || node.title : "未连接"}</span>
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

function FrameReferenceStrip({
    videoNode,
    theme,
    frameReferenceNodes,
    onNormalizeFrameReferences,
}: {
    videoNode: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    frameReferenceNodes?: { first?: CanvasNodeData; last?: CanvasNodeData };
    onNormalizeFrameReferences?: (videoNode: CanvasNodeData, firstNode: CanvasNodeData, lastNode: CanvasNodeData) => void;
}) {
    const first = frameReferenceNodes?.first;
    const last = frameReferenceNodes?.last;
    if (!first && !last) return null;
    const mismatch = Boolean(first && last && frameResolutionLabel(first) && frameResolutionLabel(last) && frameResolutionLabel(first) !== frameResolutionLabel(last));
    return (
        <div className="absolute inset-x-2.5 bottom-2.5 z-30 flex min-w-0 items-end gap-2">
            <FrameReferenceThumb label="首帧" node={first} theme={theme} />
            <FrameReferenceThumb label="尾帧" node={last} theme={theme} />
            {mismatch && first && last ? (
                <button
                    type="button"
                    className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium shadow-[var(--studio-shadow)] backdrop-blur-md transition hover:scale-[1.03]"
                    style={{ background: "color-mix(in srgb, var(--studio-warning) 28%, var(--studio-media-overlay))", borderColor: "color-mix(in srgb, var(--studio-warning) 44%, var(--studio-border-subtle))", color: "var(--studio-on-media)" }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onNormalizeFrameReferences?.(videoNode, first, last);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    title="首尾帧分辨率不一致，自动居中裁切到统一分辨率"
                >
                    <Scissors className="size-3.5" />
                    统一裁切
                </button>
            ) : null}
        </div>
    );
}

function FrameReferenceThumb({ label, node, theme }: { label: string; node?: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="relative h-16 w-24 overflow-hidden rounded-lg border shadow-[var(--studio-shadow)] backdrop-blur-md" style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.toolbar.border, color: theme.node.text }}>
            {node?.metadata?.content ? <img src={node.metadata.content} alt={label} className="h-full w-full object-cover" draggable={false} /> : <div className="grid h-full w-full place-items-center text-[11px] opacity-45">未连接</div>}
            <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium leading-none text-white">{label}</span>
            {node ? <span className="absolute bottom-1 left-1 max-w-[88px] truncate rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-none text-white/90">{frameResolutionLabel(node) || "未知尺寸"}</span> : null}
        </div>
    );
}

function frameResolutionLabel(node: CanvasNodeData) {
    const width = Math.round(node.metadata?.naturalWidth || 0);
    const height = Math.round(node.metadata?.naturalHeight || 0);
    return width > 0 && height > 0 ? `${width}x${height}` : "";
}

function videoNodeCompactStatus(node: CanvasNodeData) {
    const parts = [
        node.metadata?.taskStatus ? videoStatusLabel(node.metadata.taskStatus) : "",
        node.metadata?.aiTaskId ? `账本 ${shortTaskId(node.metadata.aiTaskId)}` : "",
        node.metadata?.storageKey ? `本地 ${formatBytes(node.metadata.bytes || 0)}` : "",
    ].filter(Boolean);
    return parts.join(" · ");
}
