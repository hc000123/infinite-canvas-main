"use client";

import type { ReactNode, RefObject } from "react";
import { AlertTriangle, AudioLines, ChevronRight, Image as ImageIcon, Maximize2, RefreshCw, Sparkles, Star, Upload } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { deriveCanvasNodePresentation } from "../utils/canvas-node-presentation";
import { CanvasLogoPlaceholder } from "./canvas-logo-placeholder";
import { GeneratedPromptToggle, MediaReviewStatusBadge } from "./canvas-media-node-controls";
import { VideoNodeContent } from "./canvas-video-node-content";
import { CanvasMediaVersionControl } from "./canvas-media-version-control";

export type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isEditingContent: boolean;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
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
    onImageQuickAction?: (node: CanvasNodeData, action: "image-to-image" | "upscale") => void;
    onExpandText?: (node: CanvasNodeData) => void;
    onDownload?: (node: CanvasNodeData) => void;
    onReviewAsset?: (node: CanvasNodeData) => void;
    reviewSubmitting?: boolean;
    frameReferenceNodes?: { first?: CanvasNodeData; last?: CanvasNodeData };
    onNormalizeFrameReferences?: (videoNode: CanvasNodeData, firstNode: CanvasNodeData, lastNode: CanvasNodeData) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
    onSwitchMediaVersion?: (node: CanvasNodeData, versionId: string) => void;
};

export function NodeContent(props: NodeContentRendererProps) {
    const presentation = deriveCanvasNodePresentation(props.node);
    const Renderer = nodeContentRenderers[props.node.type];
    const hasVideoFramePreview = props.node.type === CanvasNodeType.Video && Boolean(props.frameReferenceNodes?.first || props.frameReferenceNodes?.last);
    const contentBody = props.node.type === CanvasNodeType.Config && props.renderNodeContent ? props.renderNodeContent(props.node) : <Renderer {...props} />;
    const body = presentation.body === "media" || hasVideoFramePreview ? <Renderer {...props} /> : presentation.body === "logo" ? <LogoBody {...props} /> : contentBody;
    return (
        <>
            {body}
            {presentation.overlay === "loading" ? <NodeStatusOverlay node={props.node} theme={props.theme} status="loading" onRefreshVideoTask={props.onRefreshVideoTask} /> : null}
            {presentation.overlay === "error" ? <NodeStatusOverlay node={props.node} theme={props.theme} status="error" onRetry={props.onRetry} onRefreshVideoTask={props.onRefreshVideoTask} /> : null}
        </>
    );
}

function LogoBody(props: NodeContentRendererProps) {
    const placeholder = props.node.type === CanvasNodeType.Image ? <EmptyImageContent {...props} isBatchRoot={false} /> : <CanvasLogoPlaceholder label={`${props.node.title || "媒体节点"}等待媒体内容`} />;
    return props.isBatchRoot ? (
        <BatchFrame batchCount={props.batchCount} batchExpanded={props.batchExpanded} batchOpening={props.batchOpening} batchRecovering={props.batchRecovering} onToggleBatch={props.onToggleBatch}>
            {placeholder}
        </BatchFrame>
    ) : (
        placeholder
    );
}

export function ImageInfoBar({ node }: { node: CanvasNodeData }) {
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

const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: ConfigContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function NodeStatusOverlay({ node, theme, status, onRetry, onRefreshVideoTask }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry" | "onRefreshVideoTask"> & { status: "loading" | "error" }) {
    const loadingLabel = node.metadata?.imageUpscale ? `云端超分 ${node.metadata.imageUpscale.progress}%` : node.metadata?.pendingMediaVersion ? "新版本生成中" : "生成中";
    return (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center p-3">
            <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-[4px] border px-2.5 py-2 text-xs backdrop-blur-md" style={{ background: theme.surfaceOverlay, borderColor: status === "error" ? "var(--studio-danger)" : theme.focusRing, color: status === "error" ? "var(--studio-danger)" : theme.node.text }}>
                {status === "loading" ? <span className="size-3.5 shrink-0 animate-spin rounded-full border" style={{ borderColor: theme.node.stroke, borderTopColor: theme.accent }} /> : <AlertTriangle className="size-3.5 shrink-0" />}
                <span className="truncate">{status === "loading" ? loadingLabel : node.metadata?.errorDetails || "生成失败"}</span>
                {node.type === CanvasNodeType.Video && (node.metadata?.taskId || node.metadata?.aiTaskId) ? (
                    <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-1 font-medium"
                        style={{ color: theme.accent }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onRefreshVideoTask?.(node);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <RefreshCw className="size-3" />
                        刷新状态
                    </button>
                ) : null}
                {status === "error" ? (
                    <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-1 font-medium"
                        style={{ color: theme.accent }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onRetry?.(node);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <RefreshCw className="size-3" />
                        重试
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function ConfigContent({ theme }: NodeContentRendererProps) {
    return (
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm" style={{ color: theme.node.placeholder }}>
            配置生成参数
        </div>
    );
}

function TextContent({ node, theme, isEditingContent, textareaRef, onContentChange, onStopEditing, onGenerateImage, onExpandText }: NodeContentRendererProps) {
    return (
        <div className="flex h-full w-full flex-col overflow-hidden pt-8">
            <div className="absolute right-3 top-3 z-20 flex items-center gap-1">
                <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded-full border opacity-85 backdrop-blur-md transition hover:scale-[1.02] hover:opacity-100"
                    style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.node.stroke, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onExpandText?.(node);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    title="放大编辑文本"
                    aria-label="放大编辑文本"
                >
                    <Maximize2 className="size-3.5" />
                </button>
                <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium opacity-85 backdrop-blur-md transition hover:scale-[1.02] hover:opacity-100"
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
            </div>
            {isEditingContent ? (
                <textarea
                    ref={textareaRef}
                    className="thin-scrollbar block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent pl-4 pr-14 pt-0 pb-4 m-0 font-mono leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-focus-ring)] select-text appearance-none"
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
            onReviewAsset={props.onReviewAsset}
            reviewSubmitting={props.reviewSubmitting}
            onSwitchMediaVersion={props.onSwitchMediaVersion}
        />
    );
}

function EmptyImageContent({ node, theme, isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, onImageQuickAction }: NodeContentRendererProps) {
    const content = (
        <div className="relative h-full w-full">
            <CanvasLogoPlaceholder label={`${node.title || "图片节点"}等待图片内容`} />
            <div className="absolute inset-x-3 bottom-3 z-10 flex justify-center gap-2">
                <EmptyImageAction icon={<Upload className="size-3.5" />} label="图生图" theme={theme} onClick={() => onImageQuickAction?.(node, "image-to-image")} />
                <EmptyImageAction icon={<Sparkles className="size-3.5" />} label="图片高清" theme={theme} onClick={() => onImageQuickAction?.(node, "upscale")} />
            </div>
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

function EmptyImageAction({ icon, label, theme, onClick }: { icon: ReactNode; label: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onClick: () => void }) {
    return (
        <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-2 text-xs font-medium backdrop-blur-md transition hover:opacity-80 focus-visible:outline-none"
            style={{ background: theme.surfaceOverlay, borderColor: theme.node.stroke, color: theme.node.text }}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {icon}
            {label}
        </button>
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
        <div className="flex h-full w-full flex-col justify-center gap-2 rounded-lg px-4" style={{ background: theme.node.fill }}>
            <div className="flex min-w-0 items-center gap-2 text-xs opacity-65">
                <AudioLines className="size-4 shrink-0" />
                <span className="truncate">{node.title}</span>
            </div>
            <audio src={node.metadata.content} controls className="w-full" data-canvas-no-zoom />
        </div>
    );
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
    reviewSubmitting,
    onSwitchMediaVersion,
}: {
    node: CanvasNodeData;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
    onReviewAsset?: (node: CanvasNodeData) => void;
    reviewSubmitting?: boolean;
    onSwitchMediaVersion?: (node: CanvasNodeData, versionId: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchChild = Boolean(node.metadata?.batchRootId);

    return (
        <BatchFrame batchCount={isBatchRoot ? batchCount : 0} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
            <div className="h-full w-full overflow-hidden rounded-lg">
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
            <CanvasMediaVersionControl node={node} disabled={node.metadata?.status === "loading"} className="absolute left-1/2 top-2.5 z-30 -translate-x-1/2" onSwitch={onSwitchMediaVersion} />
            <MediaReviewStatusBadge node={node} theme={theme} submitting={reviewSubmitting} className="absolute bottom-2.5 left-2.5 z-30" />
            {isBatchRoot ? (
                <button
                    type="button"
                    className="absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold shadow-[var(--studio-shadow)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: `${theme.toolbar.panel}d9`, borderColor: `${theme.toolbar.border}cc`, color: theme.node.text }}
                    aria-label={batchExpanded ? "图片组已展开" : "图片组已收起"}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none" style={{ color: theme.node.activeStroke }}>
                        {batchCount}
                    </span>
                    <ChevronRight className={`size-3.5 opacity-55 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
            {isBatchChild ? (
                <button
                    type="button"
                    className="absolute right-3 top-3 z-30 flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium opacity-0 shadow-[var(--studio-shadow)] backdrop-blur-md transition group-hover/batch:opacity-100 hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSetBatchPrimary?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Star className="size-3.5" style={{ color: theme.node.activeStroke }} />
                    设为主图
                </button>
            ) : null}
        </BatchFrame>
    );
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
                            className="absolute rounded-[inherit] border shadow-[var(--studio-shadow)] transition-transform duration-300 group-hover/batch:translate-x-2"
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
