"use client";

import { Button, Card, InputNumber, Tag } from "antd";
import { Play, RotateCcw } from "lucide-react";

import type { GenerationQueueItem, GenerationQueueMissingItem, GenerationQueueSummary } from "../utils/generation-queue";
import type { StoryboardGroup } from "../utils/storyboard-management";

type StoryboardGenerationQueuePanelProps = {
    group: StoryboardGroup;
    items: GenerationQueueItem[];
    planItems: GenerationQueueItem[];
    missing: GenerationQueueMissingItem[];
    summary: GenerationQueueSummary;
    paused: boolean;
    concurrency: number;
    onConcurrencyChange: (value: number) => void;
    onCreateQueue: () => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onCancel: () => void;
    onRetryFailed: () => void;
    onRetryItem: (id: string) => void;
};

export function StoryboardGenerationQueuePanel({
    group,
    items,
    planItems,
    missing,
    summary,
    paused,
    concurrency,
    onConcurrencyChange,
    onCreateQueue,
    onStart,
    onPause,
    onResume,
    onCancel,
    onRetryFailed,
    onRetryItem,
}: StoryboardGenerationQueuePanelProps) {
    const visibleItems = items.length ? items : planItems;
    const hasFailed = items.some((item) => item.status === "failed");
    const hasRunnable = items.some((item) => item.status === "queued" || item.status === "paused" || item.status === "cancelled");
    return (
        <Card size="small" className="mb-4" title="生成队列">
            <div className="space-y-3">
                <div className="grid gap-2 text-xs text-stone-500 sm:grid-cols-4">
                    <QueueMetric label="视频数" value={`${summary.videoCount}`} />
                    <QueueMetric label="预计时长" value={`${summary.totalDurationSeconds}s`} />
                    <QueueMetric label="预计点数" value={`${summary.totalEstimatedCredits}`} />
                    <QueueMetric label="缺失项" value={`${summary.missingCount}`} />
                </div>
                {missing.length ? (
                    <div className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                        {missing.map((item) => (
                            <div key={`${item.storyboardShotId}:${item.reason}`}>
                                {item.storyboardShotId}：{item.reason}
                            </div>
                        ))}
                    </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="small" onClick={onCreateQueue} disabled={!planItems.length}>
                        创建队列
                    </Button>
                    <Button size="small" type="primary" icon={<Play className="size-3.5" />} onClick={onStart} disabled={!items.length || !hasRunnable}>
                        开始队列
                    </Button>
                    <Button size="small" onClick={onPause} disabled={!items.some((item) => item.status === "queued")}>
                        暂停
                    </Button>
                    <Button size="small" onClick={onResume} disabled={!paused && !items.some((item) => item.status === "paused")}>
                        继续
                    </Button>
                    <Button size="small" danger onClick={onCancel} disabled={!items.some((item) => item.status === "queued" || item.status === "paused")}>
                        取消
                    </Button>
                    <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRetryFailed} disabled={!hasFailed}>
                        重试失败项
                    </Button>
                    <span className="ml-auto inline-flex items-center gap-2 text-xs text-stone-500">
                        并发
                        <InputNumber size="small" min={1} max={10} value={concurrency} onChange={(value) => onConcurrencyChange(Number(value) || 1)} className="w-16" />
                    </span>
                </div>
                {visibleItems.length ? (
                    <div className="space-y-1.5">
                        {visibleItems.map((item) => (
                            <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-2 py-1.5 text-xs dark:bg-stone-900">
                                <Tag className="m-0">{queueStatusLabel(item.status)}</Tag>
                                <span className="min-w-0 flex-1 truncate">
                                    {group.title} / {item.storyboardShotId}
                                </span>
                                <span className="text-stone-400">{item.estimatedDurationSeconds || item.estimatedCredits}s</span>
                                <span className="text-stone-400">{item.estimatedCredits} 点</span>
                                {item.error ? <span className="text-red-500">{item.error}</span> : null}
                                {item.status === "failed" || item.status === "cancelled" ? (
                                    <Button size="small" type="text" onClick={() => onRetryItem(item.id)}>
                                        重试
                                    </Button>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </Card>
    );
}

function QueueMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-stone-50 p-2 dark:bg-stone-900">
            <div>{label}</div>
            <div className="mt-1 text-base font-semibold text-stone-800 dark:text-stone-100">{value}</div>
        </div>
    );
}

function queueStatusLabel(status: string) {
    if (status === "running") return "运行中";
    if (status === "succeeded") return "已完成";
    if (status === "failed") return "失败";
    if (status === "cancelled") return "已取消";
    if (status === "paused") return "已暂停";
    return "排队中";
}
