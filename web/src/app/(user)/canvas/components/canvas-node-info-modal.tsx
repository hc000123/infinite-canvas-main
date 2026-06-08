"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Segmented } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes, getDataUrlByteSize } from "@/lib/image-utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

export function CanvasNodeInfoModal({ node, open, onClose }: { node: CanvasNodeData | null; open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [view, setView] = useState<"info" | "json">("info");
    const imageBytes = node?.type === CanvasNodeType.Image && node.metadata?.content ? getDataUrlByteSize(node.metadata.content) : 0;
    const batchCount = node?.type === CanvasNodeType.Image ? node.metadata?.batchChildIds?.length || 0 : 0;
    const json = useMemo(() => {
        if (!node) return "";
        return JSON.stringify(
            node,
            (key, value) => {
                if (key === "title") return undefined;
                if (key === "content" && typeof value === "string" && value.startsWith("data:image/")) {
                    return "[base64 image]";
                }
                return value;
            },
            2,
        );
    }, [node]);

    useEffect(() => {
        if (open) setView("info");
    }, [node?.id, open]);
    const isVideoNode = node?.type === CanvasNodeType.Video;
    const videoParams = isVideoNode ? videoParamLabel(node) : "";
    const arkParams = isVideoNode ? arkParamLabel(node) : "";

    const title = (
        <div className="flex items-center justify-between gap-4 pr-12">
            <span>节点信息</span>
            <Segmented
                size="small"
                value={view}
                onChange={(value) => setView(value as "info" | "json")}
                options={[
                    { label: "信息", value: "info" },
                    { label: "JSON", value: "json" },
                ]}
            />
        </div>
    );

    return (
        <Modal className="canvas-node-info-modal" title={title} open={open && Boolean(node)} centered footer={null} onCancel={onClose}>
            {node ? (
                <div className="h-[56vh] min-h-[360px] text-sm">
                    {view === "info" ? (
                        <div className="thin-scrollbar h-full space-y-3 overflow-auto pr-1">
                            <InfoRow label="ID" value={node.id} />
                            <InfoRow label="类型" value={node.type === CanvasNodeType.Text ? "文本" : node.type === CanvasNodeType.Image ? "图片" : node.type === CanvasNodeType.Video ? "视频" : node.type === CanvasNodeType.Audio ? "音频" : "生成配置"} />
                            <InfoRow label="尺寸" value={`${Math.round(node.width)} x ${Math.round(node.height)}`} />
                            <InfoRow label="位置" value={`${Math.round(node.position.x)}, ${Math.round(node.position.y)}`} />
                            <InfoRow label="状态" value={node.metadata?.status || "idle"} />
                            {isVideoNode && node.metadata?.taskId ? <InfoRow label="任务 ID" value={node.metadata.taskId} /> : null}
                            {node.metadata?.aiTaskId ? <InfoRow label="账本任务" value={node.metadata.aiTaskId} /> : null}
                            {node.metadata?.upstreamTaskId ? <InfoRow label="上游任务" value={node.metadata.upstreamTaskId} /> : null}
                            {isVideoNode && (node.metadata?.taskStatus || node.metadata?.rawTaskStatus) ? <InfoRow label="任务状态" value={taskStatusLabel(node.metadata.taskStatus, node.metadata.rawTaskStatus)} /> : null}
                            {node.metadata?.aiTaskStatus ? <InfoRow label="账本状态" value={node.metadata.aiTaskStatus} /> : null}
                            {node.metadata?.aiTaskCredits || node.metadata?.creditsRefunded ? <InfoRow label="扣费 / 返还" value={`${node.metadata.aiTaskCredits || 0} / ${node.metadata.creditsRefunded || 0}`} /> : null}
                            {node.metadata?.creditLogId ? <InfoRow label="Credit Log" value={node.metadata.creditLogId} /> : null}
                            {isVideoNode && node.metadata?.model ? <InfoRow label="模型" value={node.metadata.model} /> : null}
                            {isVideoNode && videoParams ? <InfoRow label="视频参数" value={videoParams} /> : null}
                            {isVideoNode && arkParams ? <InfoRow label="Ark 参数" value={arkParams} /> : null}
                            {isVideoNode && node.metadata?.videoUrl ? (
                                <InfoRow
                                    label="video_url"
                                    value={
                                        <a className="text-blue-500 underline underline-offset-2" href={node.metadata.videoUrl} target="_blank" rel="noreferrer">
                                            打开临时地址
                                        </a>
                                    }
                                />
                            ) : null}
                            {isVideoNode && videoUrlExpiryLabel(node) ? <InfoRow label="URL有效期" value={videoUrlExpiryLabel(node)} /> : null}
                            {isVideoNode && node.metadata?.storageKey ? (
                                <InfoRow label="本地转存" value={`${node.metadata.storageKey}${node.metadata.bytes ? ` · ${formatBytes(node.metadata.bytes)}` : ""}${node.metadata.mimeType ? ` · ${node.metadata.mimeType}` : ""}`} />
                            ) : null}
                            {isVideoNode && node.metadata?.cachePath ? <InfoRow label="缓存文件" value={node.metadata.cachePath} /> : null}
                            {isVideoNode && node.metadata?.cacheUrl ? (
                                <InfoRow
                                    label="缓存地址"
                                    value={
                                        <a className="text-blue-500 underline underline-offset-2" href={node.metadata.cacheUrl} target="_blank" rel="noreferrer">
                                            打开缓存文件
                                        </a>
                                    }
                                />
                            ) : null}
                            {isVideoNode && node.metadata?.localStoredAt ? <InfoRow label="转存时间" value={formatLocalTime(node.metadata.localStoredAt)} /> : null}
                            {batchCount > 1 ? <InfoRow label="图片组" value={`${batchCount} 张`} /> : null}
                            {node.type === CanvasNodeType.Image && node.metadata?.capturedFrameSourceVideoNodeId ? <InfoRow label="来源视频" value={node.metadata.capturedFrameSourceVideoNodeId} /> : null}
                            {node.type === CanvasNodeType.Image && node.metadata?.capturedFrameTime !== undefined ? <InfoRow label="截取时间" value={`${node.metadata.capturedFrameTime}s`} /> : null}
                            {node.metadata?.prompt ? <InfoRow label="提示词" value={node.metadata.prompt} /> : null}
                            {imageBytes ? <InfoRow label="图片大小" value={formatBytes(imageBytes)} /> : null}
                            {(node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && node.metadata?.volcengineAsset ? (
                                <>
                                    <InfoRow label="火山状态" value={volcengineStatusLabel(node.metadata.volcengineAsset.status)} />
                                    <InfoRow label="Asset ID" value={node.metadata.volcengineAsset.assetId} />
                                    <InfoRow label="素材组" value={node.metadata.volcengineAsset.groupId} />
                                    {node.metadata.volcengineAsset.error ? <InfoRow label="失败原因" value={node.metadata.volcengineAsset.error} /> : null}
                                </>
                            ) : null}
                            {node.metadata?.errorDetails ? (
                                <div className="rounded-lg border p-3 text-red-400" style={{ borderColor: theme.node.stroke }}>
                                    {node.metadata.errorDetails}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <pre className="thin-scrollbar h-full overflow-auto rounded-lg border p-3 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
                            {json}
                        </pre>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}

function volcengineStatusLabel(status?: string) {
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    if (status === "Processing") return "审核中";
    return status || "未知";
}

function taskStatusLabel(status?: string, rawStatus?: string) {
    const labels: Record<string, string> = {
        queued: "排队中",
        running: "生成中",
        processing: "生成中",
        succeeded: "已完成",
        completed: "已完成",
        failed: "失败",
        error: "失败",
        cancelled: "已取消",
        canceled: "已取消",
    };
    const label = labels[(status || "").toLowerCase()] || status;
    return rawStatus && rawStatus !== status ? `${label || status}（${rawStatus}）` : label || rawStatus || "";
}

function videoParamLabel(node: CanvasNodeData) {
    const resolution = resolutionLabel(node.metadata?.resolution || node.metadata?.vquality);
    const ratio = node.metadata?.ratio || node.metadata?.size;
    const duration = node.metadata?.duration || node.metadata?.seconds;
    return [resolution, ratio, duration ? `${duration}s` : ""].filter(Boolean).join(" · ");
}

function arkParamLabel(node: CanvasNodeData) {
    const audio = boolLabel(node.metadata?.generateAudio);
    const watermark = boolLabel(node.metadata?.watermark);
    return [audio ? `音频 ${audio}` : "", watermark ? `水印 ${watermark}` : "", node.metadata?.seed ? `seed ${node.metadata.seed}` : ""].filter(Boolean).join(" · ");
}

function boolLabel(value?: string) {
    if (value === "true") return "开";
    if (value === "false") return "关";
    return "";
}

function resolutionLabel(value?: string) {
    if (!value) return "";
    return /^\d+$/.test(value) ? `${value}p` : value;
}

function videoUrlExpiryLabel(node: CanvasNodeData) {
    if (node.metadata?.videoUrlExpiresAt) return `至 ${formatUnixSeconds(node.metadata.videoUrlExpiresAt)}`;
    if (node.metadata?.executionExpiresAfter) return `约 ${formatSecondSpan(node.metadata.executionExpiresAfter)}`;
    return "";
}

function formatUnixSeconds(value: number) {
    return new Date(value * 1000).toLocaleString("zh-CN", { hour12: false });
}

function formatLocalTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatSecondSpan(value: number) {
    const hours = Math.floor(value / 3600);
    if (hours >= 24) return `${Math.round(hours / 24)}天`;
    if (hours > 0) return `${hours}小时`;
    return `${Math.max(1, Math.floor(value / 60))}分钟`;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="opacity-50">{label}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
        </div>
    );
}
