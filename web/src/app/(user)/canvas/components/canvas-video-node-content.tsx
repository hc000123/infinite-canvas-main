"use client";

import { useState } from "react";
import { Scissors, Settings2, Video } from "lucide-react";

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
    if (!node.metadata?.content)
        return (
            <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 rounded-[18px]" style={{ color: theme.node.placeholder }}>
                <Video className="size-7 opacity-35" />
                <span className="text-sm">空视频节点</span>
                {frameStrip}
            </div>
        );
    return (
        <div className="relative h-full w-full rounded-[18px] bg-black">
            <video src={node.metadata.content} controls controlsList="nodownload" className="h-full w-full rounded-[18px] object-contain" data-canvas-no-zoom />
            {frameStrip}
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
                    className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium text-amber-100 shadow-[0_8px_24px_rgba(0,0,0,.18)] backdrop-blur-md transition hover:scale-[1.03]"
                    style={{ background: "rgba(120,53,15,.78)", borderColor: "rgba(251,191,36,.38)" }}
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
        <div className="relative h-16 w-24 overflow-hidden rounded-lg border shadow-[0_8px_24px_rgba(0,0,0,.18)] backdrop-blur-md" style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.toolbar.border, color: theme.node.text }}>
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
