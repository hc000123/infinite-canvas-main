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
    const upscale = node?.metadata?.imageUpscale;
    const videoUpscale = node?.metadata?.videoUpscale;
    const subtitleErase = node?.metadata?.subtitleErase;

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
        <Modal rootClassName="studio-modal" className="canvas-node-info-modal" title={title} open={open && Boolean(node)} centered footer={null} onCancel={onClose}>
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
                            {upscale ? <InfoRow label="超分任务" value={upscale.jobId} /> : null}
                            {upscale ? <InfoRow label="超分状态" value={`${upscaleStatusLabel(upscale.status)} · ${upscale.progress}% · 第 ${upscale.attempt} 次`} /> : null}
                            {upscale ? <InfoRow label="倍率 / 服务商" value={`${upscale.scale}× · ${upscale.provider}`} /> : null}
                            {upscale ? <InfoRow label="云端处理" value="是，图片会进入云端服务基础设施" /> : null}
                            {upscale ? <InfoRow label="输入尺寸" value={`${upscale.inputWidth} × ${upscale.inputHeight}`} /> : null}
                            {upscale?.outputWidth && upscale.outputHeight ? <InfoRow label="输出尺寸" value={`${upscale.outputWidth} × ${upscale.outputHeight}`} /> : null}
                            {upscale?.providerRequestId ? <InfoRow label="服务商请求" value={upscale.providerRequestId} /> : null}
                            {upscale?.durationMs !== undefined ? <InfoRow label="处理耗时" value={formatSecondSpan(Math.round(upscale.durationMs / 1000))} /> : null}
                            {upscale?.errorCode ? <InfoRow label="超分错误码" value={upscale.errorCode} /> : null}
                            {videoUpscale ? <InfoRow label="视频超分任务" value={videoUpscale.jobId} /> : null}
                            {videoUpscale ? <InfoRow label="视频超分状态" value={`${upscaleStatusLabel(videoUpscale.status)} · ${videoUpscale.progress}% · 第 ${videoUpscale.attempt} 次`} /> : null}
                            {videoUpscale ? <InfoRow label="目标 / 服务商" value={`${videoUpscale.target === "2k" ? "2K" : "1080p"} · ${videoUpscale.provider}`} /> : null}
                            {videoUpscale ? <InfoRow label="云端处理" value="是，视频会进入火山引擎基础设施" /> : null}
                            {videoUpscale ? <InfoRow label="输入规格" value={`${videoUpscale.inputWidth} × ${videoUpscale.inputHeight} · ${videoUpscale.inputDurationSeconds}s`} /> : null}
                            {videoUpscale?.outputWidth && videoUpscale.outputHeight ? <InfoRow label="输出规格" value={`${videoUpscale.outputWidth} × ${videoUpscale.outputHeight}`} /> : null}
                            {videoUpscale?.runId ? <InfoRow label="LAS Task ID" value={videoUpscale.runId} /> : null}
                            {videoUpscale?.providerRequestId ? <InfoRow label="服务商请求" value={videoUpscale.providerRequestId} /> : null}
                            {videoUpscale?.durationMs !== undefined ? <InfoRow label="处理耗时" value={formatSecondSpan(Math.round(videoUpscale.durationMs / 1000))} /> : null}
                            {videoUpscale?.errorCode ? <InfoRow label="超分错误码" value={videoUpscale.errorCode} /> : null}
                            {subtitleErase ? <InfoRow label="字幕擦除任务" value={subtitleErase.jobId} /> : null}
                            {subtitleErase ? <InfoRow label="字幕擦除状态" value={`${upscaleStatusLabel(subtitleErase.status)} · ${subtitleErase.progress}% · 第 ${subtitleErase.attempt} 次`} /> : null}
                            {subtitleErase ? <InfoRow label="字幕擦除服务商" value={subtitleErase.provider} /> : null}
                            {subtitleErase ? <InfoRow label="字幕擦除输入" value={`${subtitleErase.inputWidth} × ${subtitleErase.inputHeight} · ${subtitleErase.inputDurationSeconds}s`} /> : null}
                            {subtitleErase?.outputWidth && subtitleErase.outputHeight ? <InfoRow label="字幕擦除输出" value={`${subtitleErase.outputWidth} × ${subtitleErase.outputHeight}`} /> : null}
                            {subtitleErase?.estimatedCostCny !== undefined ? <InfoRow label="字幕擦除预估费用" value={`¥${subtitleErase.estimatedCostCny.toFixed(2)}`} /> : null}
                            {subtitleErase?.runId ? <InfoRow label="字幕擦除 LAS Task ID" value={subtitleErase.runId} /> : null}
                            {subtitleErase?.durationMs !== undefined ? <InfoRow label="字幕擦除耗时" value={formatSecondSpan(Math.round(subtitleErase.durationMs / 1000))} /> : null}
                            {subtitleErase?.errorCode ? <InfoRow label="字幕擦除错误码" value={subtitleErase.errorCode} /> : null}
                            {isVideoNode && node.metadata?.model ? <InfoRow label="模型" value={node.metadata.model} /> : null}
                            {isVideoNode && videoParams ? <InfoRow label="视频参数" value={videoParams} /> : null}
                            {isVideoNode && arkParams ? <InfoRow label="Ark 参数" value={arkParams} /> : null}
                            {isVideoNode && node.metadata?.videoUrl ? (
                                <InfoRow
                                    label="video_url"
                                    value={
                                        <a className="text-[var(--studio-accent)] underline underline-offset-2 transition hover:text-[var(--studio-accent-hover)]" href={node.metadata.videoUrl} target="_blank" rel="noreferrer">
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
                                        <a className="text-[var(--studio-accent)] underline underline-offset-2 transition hover:text-[var(--studio-accent-hover)]" href={node.metadata.cacheUrl} target="_blank" rel="noreferrer">
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
                                <div className="rounded-lg border p-3 text-[var(--studio-danger)]" style={{ borderColor: theme.node.stroke }}>
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

function upscaleStatusLabel(status: string) {
    if (status === "queued") return "排队中";
    if (status === "uploading") return "上传中";
    if (status === "processing") return "云端处理中";
    if (status === "downloading") return "保存结果中";
    if (status === "succeeded") return "已完成";
    return "失败";
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
