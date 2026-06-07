"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Drawer, Empty, Tag } from "antd";
import { FileText, ImageIcon, ReceiptText } from "lucide-react";

import { useLocalAiTaskLogStore, type LocalAiTaskRecord } from "@/stores/use-local-ai-task-log-store";

export function LocalAiTaskLogPanel({ projectId }: { projectId: string }) {
    const records = useLocalAiTaskLogStore((state) => state.records);
    const [detail, setDetail] = useState<LocalAiTaskRecord | null>(null);
    const projectRecords = useMemo(
        () =>
            records
                .filter((record) => record.projectId === projectId)
                .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                .slice(0, 12),
        [projectId, records],
    );

    return (
        <section className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-base font-medium">
                        <ReceiptText className="size-5" />
                        本地 AI 任务
                    </div>
                    <p className="mt-1 text-sm text-stone-500">追踪本地直连文本和生图调用；估算费用仅供参考，正式账单以外部模型平台为准。</p>
                </div>
                <Tag className="m-0">{projectRecords.length} 条</Tag>
            </div>
            <Alert className="mt-3" type="warning" showIcon message="本地 API Key 保存在浏览器本地，仅适合个人本机使用；这里不做真实扣点，也不回写后台算力点日志。" />
            {projectRecords.length ? (
                <div className="mt-4 grid gap-2">
                    {projectRecords.map((record) => (
                        <button key={record.id} type="button" className="rounded-lg bg-stone-50 px-3 py-3 text-left transition hover:bg-stone-100 dark:bg-white/5 dark:hover:bg-white/10" onClick={() => setDetail(record)}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag className="m-0" icon={record.requestType === "image" ? <ImageIcon className="size-3" /> : <FileText className="size-3" />}>
                                            {requestTypeLabel(record.requestType)}
                                        </Tag>
                                        <Tag className="m-0" color={statusColor(record.status)}>
                                            {statusLabel(record.status)}
                                        </Tag>
                                        <span className="truncate text-sm font-medium">{sourceLabel(record)}</span>
                                    </div>
                                    <div className="mt-2 line-clamp-1 text-xs text-stone-500">
                                        {formatTime(record.startedAt)} · {record.model} · {record.channelMode}
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-stone-500">
                                    {record.requestType === "image" ? <Tag className="m-0">请求 {record.requestedImageSize || record.imageSize || "未知"}</Tag> : null}
                                    {record.resultImageSize ? <Tag className="m-0">返回 {record.resultImageSize}</Tag> : null}
                                    <Tag className="m-0">{formatCost(record)}</Tag>
                                </div>
                            </div>
                            <div className="mt-2 line-clamp-1 text-xs text-stone-500">{record.billingNote}</div>
                        </button>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无本地直连 AI 任务日志" className="py-8" />
            )}
            <LocalAiTaskDetailDrawer record={detail} onClose={() => setDetail(null)} />
        </section>
    );
}

function LocalAiTaskDetailDrawer({ record, onClose }: { record: LocalAiTaskRecord | null; onClose: () => void }) {
    return (
        <Drawer title="本地 AI 任务详情" open={Boolean(record)} onClose={onClose} size="large">
            {record ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <Tag>{requestTypeLabel(record.requestType)}</Tag>
                        <Tag color={statusColor(record.status)}>{statusLabel(record.status)}</Tag>
                        <Tag>{record.model}</Tag>
                        <Tag>{record.provider}</Tag>
                        <Tag>{record.channelMode}</Tag>
                    </div>
                    <DetailBlock title="费用提示" value={`${formatCost(record)}。${record.billingNote}`} />
                    <div className="grid gap-3 md:grid-cols-2">
                        <DetailBlock title="来源" value={sourceLabel(record)} />
                        <DetailBlock title="时间" value={`${formatTime(record.startedAt)}${record.completedAt ? ` - ${formatTime(record.completedAt)}` : ""}`} />
                        <DetailBlock title="项目 / 集 / 画布" value={`project ${record.projectId}${record.episodeId ? `；episode ${record.episodeId}` : ""}${record.canvasId ? `；canvas ${record.canvasId}` : ""}`} />
                        <DetailBlock title="workflow / stage / source" value={[record.workflowId, record.stageId, record.sourceId].filter(Boolean).join("；") || "无"} />
                        {record.requestType === "image" ? (
                            <DetailBlock title="请求尺寸 / 返回尺寸 / 张数" value={`${record.requestedImageSize || record.imageSize || "未知"} / ${record.resultImageSize || "未记录"} / ${record.imageCount || "未知"}`} />
                        ) : null}
                        {record.errorMessage ? <DetailBlock title="错误信息" value={record.errorMessage} danger /> : null}
                    </div>
                    <DetailBlock title="输入摘要" value={record.inputSummary} pre />
                    <DetailBlock title="输出摘要" value={record.outputSummary || "暂无输出摘要"} pre />
                    <Button onClick={onClose}>关闭</Button>
                </div>
            ) : null}
        </Drawer>
    );
}

function DetailBlock({ title, value, pre, danger }: { title: string; value: string; pre?: boolean; danger?: boolean }) {
    return (
        <div className={`rounded-lg border p-3 text-sm ${danger ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-950 dark:bg-rose-950/20 dark:text-rose-300" : "border-stone-200 dark:border-stone-800"}`}>
            <div className="mb-1 text-xs text-stone-500">{title}</div>
            <div className={pre ? "whitespace-pre-wrap break-words leading-6" : "break-words"}>{value}</div>
        </div>
    );
}

function requestTypeLabel(type: LocalAiTaskRecord["requestType"]) {
    return type === "image" ? "生图" : "文本";
}

function statusLabel(status: LocalAiTaskRecord["status"]) {
    if (status === "success") return "成功";
    if (status === "error") return "失败";
    if (status === "cancelled") return "已取消";
    return "运行中";
}

function statusColor(status: LocalAiTaskRecord["status"]) {
    if (status === "success") return "green";
    if (status === "error") return "red";
    if (status === "cancelled") return "default";
    return "blue";
}

function sourceLabel(record: LocalAiTaskRecord) {
    if (record.sourceType === "workflow_text_stage") return `Workflow 阶段 ${record.stageId || record.sourceId}`;
    if (record.sourceType === "agent_text_run") return `Agent ${record.agentKind || record.sourceId}`;
    if (record.sourceType === "brief_image_generation") return `Brief 生图 ${record.sourceId}`;
    return `图片生成 ${record.sourceId}`;
}

function formatCost(record: LocalAiTaskRecord) {
    if (typeof record.estimatedCost !== "number") return "费用无法估算";
    return `估算 ${record.estimatedCostCurrency} ${record.estimatedCost.toFixed(6)}`;
}

function formatTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
