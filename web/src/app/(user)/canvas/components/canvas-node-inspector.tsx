"use client";

import type { ReactNode } from "react";
import { Camera, Download, FileText, Image as ImageIcon, Info, Maximize2, MessageSquare, RefreshCw, Scissors, Sparkles, Upload, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import type { CanvasConnection, CanvasNodeData } from "../types";
import { CanvasNodeType } from "../types";
import type { NodeGenerationInput } from "./canvas-node-generation";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

export function NodeInspector({
    node,
    selectedCount,
    connections,
    inputs,
    theme,
    onInfo,
    onEditText,
    onToggleDialog,
    onGenerateImage,
    onUpload,
    onDownload,
    onSaveAsset,
    onRetry,
    onContinueVideo,
    onCrop,
    onAngle,
    onViewImage,
}: {
    node: CanvasNodeData;
    selectedCount: number;
    connections: CanvasConnection[];
    inputs: NodeGenerationInput[];
    theme: CanvasTheme;
    onInfo: (node: CanvasNodeData) => void;
    onEditText: (node: CanvasNodeData) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onContinueVideo: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
}) {
    const upstreamCount = connections.filter((connection) => connection.toNodeId === node.id).length;
    const downstreamCount = connections.filter((connection) => connection.fromNodeId === node.id).length;
    const prompt = readablePrompt(node);
    const hasMedia = Boolean(node.metadata?.content);
    const showErrorDetails = Boolean(node.metadata?.errorDetails && !hasMedia);
    const canOpenGenerateSettings = node.type === CanvasNodeType.Config || ((node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && !hasMedia);
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                        {nodeTypeLabel(node)}
                    </div>
                    <div className="mt-1 break-words text-base font-semibold">{node.title}</div>
                </div>
                {selectedCount > 1 ? (
                    <span className="shrink-0 rounded-md px-2 py-1 text-xs" style={{ background: theme.node.fill, color: theme.node.muted }}>
                        已选 {selectedCount}
                    </span>
                ) : null}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="上游" value={upstreamCount} theme={theme} />
                <Stat label="下游" value={downstreamCount} theme={theme} />
                <Stat label="状态" value={nodeStatusLabel(node)} theme={theme} />
            </div>

            {node.type === CanvasNodeType.Image && node.metadata?.content ? <img className="mt-3 max-h-60 w-full rounded-xl object-contain" src={node.metadata.content} alt={node.title || "图片节点"} /> : null}
            {node.type === CanvasNodeType.Video && node.metadata?.content ? <video className="mt-3 max-h-60 w-full rounded-xl bg-black" src={node.metadata.content} controls controlsList="nodownload" playsInline /> : null}
            {node.type === CanvasNodeType.Audio && node.metadata?.content ? <audio className="mt-3 w-full" src={node.metadata.content} controls /> : null}

            {node.type === CanvasNodeType.Config ? <ConfigInputsSection inputs={inputs} theme={theme} /> : null}
            {prompt ? <TextSection title={node.type === CanvasNodeType.Text ? "完整文本" : "完整提示词"} text={prompt} theme={theme} /> : null}
            {showErrorDetails ? <TextSection title="失败原因" text={node.metadata?.errorDetails || ""} theme={theme} danger /> : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
                <InspectorAction icon={<Info className="size-4" />} label="节点信息" onClick={() => onInfo(node)} theme={theme} />
                {node.type === CanvasNodeType.Text ? <InspectorAction icon={<FileText className="size-4" />} label="编辑文字" onClick={() => onEditText(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Text ? <InspectorAction icon={<ImageIcon className="size-4" />} label="用文本生图" onClick={() => onGenerateImage(node)} theme={theme} /> : null}
                {canOpenGenerateSettings ? <InspectorAction icon={<MessageSquare className="size-4" />} label="生成设置" onClick={() => onToggleDialog(node)} theme={theme} /> : null}
                {(node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && hasMedia ? (
                    <InspectorAction icon={<Download className="size-4" />} label="下载" onClick={() => onDownload(node)} theme={theme} />
                ) : null}
                {(node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && hasMedia ? (
                    <InspectorAction icon={<Sparkles className="size-4" />} label="存素材" onClick={() => onSaveAsset(node)} theme={theme} />
                ) : null}
                {node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio ? (
                    <InspectorAction icon={<Upload className="size-4" />} label={hasMedia ? "替换素材" : "上传素材"} onClick={() => onUpload(node)} theme={theme} />
                ) : null}
                {node.type === CanvasNodeType.Image && hasMedia ? <InspectorAction icon={<Scissors className="size-4" />} label="裁剪" onClick={() => onCrop(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Image && hasMedia ? <InspectorAction icon={<Camera className="size-4" />} label="多角度" onClick={() => onAngle(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Image && hasMedia ? <InspectorAction icon={<Maximize2 className="size-4" />} label="查看大图" onClick={() => onViewImage(node)} theme={theme} /> : null}
                {node.type === CanvasNodeType.Video && node.metadata?.lastFrameUrl ? <InspectorAction icon={<Video className="size-4" />} label="续写下一段" onClick={() => onContinueVideo(node)} theme={theme} /> : null}
                {node.metadata?.status === "error" ? <InspectorAction icon={<RefreshCw className="size-4" />} label="重试" onClick={() => onRetry(node)} theme={theme} /> : null}
            </div>

            <MetadataSummary node={node} theme={theme} />
        </div>
    );
}

function ConfigInputsSection({ inputs, theme }: { inputs: NodeGenerationInput[]; theme: CanvasTheme }) {
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">完整输入预览</div>
                <div className="text-xs" style={{ color: theme.node.muted }}>
                    {inputs.length} 项
                </div>
            </div>
            {inputs.length ? (
                <div className="space-y-2">
                    {inputs.map((input, index) => (
                        <div key={input.nodeId} className="rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                            <div className="mb-1 text-[11px]" style={{ color: theme.node.muted }}>
                                {index + 1}. {inputTypeLabel(input)} · {input.title}
                            </div>
                            {input.text ? <div className="whitespace-pre-wrap break-words text-xs leading-5">{input.text}</div> : null}
                            {input.image?.dataUrl ? <img className="max-h-36 w-full rounded-md object-contain" src={input.image.dataUrl} alt={input.title} /> : null}
                            {input.video?.url ? <video className="max-h-36 w-full rounded-md bg-black" src={input.video.url} controls playsInline /> : null}
                            {input.audio?.url ? <audio className="w-full" src={input.audio.url} controls /> : null}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    暂无上游输入
                </div>
            )}
        </section>
    );
}

export function MetadataSummary({ node, theme, expanded = false }: { node: CanvasNodeData; theme: CanvasTheme; expanded?: boolean }) {
    const rows = [
        ["ID", node.id],
        ["模型", node.metadata?.model],
        ["任务", node.metadata?.taskId],
        ["AI 任务", node.metadata?.aiTaskId],
        ["文件", node.metadata?.bytes ? formatBytes(node.metadata.bytes) : ""],
        ["素材", node.metadata?.sourceAssetId],
        ["集数", node.metadata?.episodeTitle || node.metadata?.episodeId],
        ["分镜", node.metadata?.storyboardShotId || node.metadata?.shotGroupId],
    ].filter((row): row is [string, string] => Boolean(row[1]));
    if (!rows.length && !expanded) return null;
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 text-sm font-semibold">记录摘要</div>
            {rows.length ? (
                <div className="space-y-1.5">
                    {rows.map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-xs leading-5">
                            <span style={{ color: theme.node.muted }}>{label}</span>
                            <span className="break-all">{value}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-xs" style={{ color: theme.node.muted }}>
                    暂无任务记录
                </div>
            )}
        </section>
    );
}

function TextSection({ title, text, theme, danger = false }: { title: string; text: string; theme: CanvasTheme; danger?: boolean }) {
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: danger ? "rgba(127,29,29,.14)" : theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 text-sm font-semibold">{title}</div>
            <div className="thin-scrollbar max-h-[42vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6" data-canvas-no-zoom>
                {text}
            </div>
        </section>
    );
}

function Stat({ label, value, theme }: { label: string; value: string | number; theme: CanvasTheme }) {
    return (
        <div className="rounded-lg border px-2 py-2" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
            <div className="text-[11px]" style={{ color: theme.node.muted }}>
                {label}
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
        </div>
    );
}

function InspectorAction({ icon, label, onClick, theme, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; theme: CanvasTheme; disabled?: boolean }) {
    return (
        <button
            type="button"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-2 text-xs font-medium transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onClick={onClick}
            disabled={disabled}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

function readablePrompt(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || node.metadata?.finalPrompt || "";
}

function nodeTypeLabel(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return "文本节点";
    if (node.type === CanvasNodeType.Image) return "图片节点";
    if (node.type === CanvasNodeType.Video) return "视频节点";
    if (node.type === CanvasNodeType.Audio) return "音频节点";
    return "生成配置节点";
}

function nodeStatusLabel(node: CanvasNodeData) {
    if (node.metadata?.content && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio)) return "成功";
    const status = node.metadata?.status || "idle";
    if (status === "loading") return "生成中";
    if (status === "success") return "成功";
    if (status === "error") return "失败";
    return "待处理";
}

function inputTypeLabel(input: NodeGenerationInput) {
    if (input.type === "text") return "文本";
    if (input.type === "image") return "图片";
    if (input.type === "video") return "视频";
    return "音频";
}
