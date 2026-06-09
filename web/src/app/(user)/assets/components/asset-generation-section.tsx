import { Copy } from "lucide-react";
import { Button, Empty, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { useCopyText } from "@/hooks/use-copy-text";
import type { Asset } from "@/stores/use-asset-store";
import { aiTaskLedgerFromGeneration, buildGenerationTaskLedger, fetchUserAITaskDetail, generationTaskSummary } from "@/services/api/ai-task-trace";
import type { AdminAITaskDetailResponse } from "@/services/api/admin";
import {
    assetGenerationActionLabel,
    assetGenerationLineage,
    assetGenerationRecords,
    assetGenerationSourceLabel,
    assetGenerationVersionRecords,
    readRecord,
    readString,
    type AssetGenerationRecord,
    type AssetGenerationVersionRecord,
} from "../asset-generation";

export function AssetGenerationSection({ asset }: { asset: Asset }) {
    const copyText = useCopyText();
    if (asset.kind !== "image" && asset.kind !== "video") return null;
    const generations = assetGenerationRecords(asset);
    return (
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
            <div className="flex items-center justify-between gap-3">
                <Typography.Text strong className="!text-[var(--studio-text-primary)]">
                    生成信息
                </Typography.Text>
                {generations.length ? <Tag className="studio-tag">{generations.length} 条记录</Tag> : null}
            </div>
            {!generations.length ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无生成信息" className="!my-4" />
            ) : (
                <div className="mt-3 space-y-3">
                    <AssetVersionList versions={assetGenerationVersionRecords(asset)} />
                    {generations.map((generation, index) => (
                        <GenerationCard key={`${readString(generation.nodeId)}-${index}`} generation={generation} index={index} copyText={copyText} />
                    ))}
                </div>
            )}
        </section>
    );
}

function GenerationCard({ generation, index, copyText }: { generation: AssetGenerationRecord; index: number; copyText: (text: string, successText?: string) => void }) {
    const [taskDetail, setTaskDetail] = useState<AdminAITaskDetailResponse | null>(null);
    const prompt = readString(generation.prompt);
    const effectivePrompt = readString(generation.effectivePrompt);
    const config = readRecord(generation.config);
    const lineage = assetGenerationLineage(generation);
    const aiTaskId = readString(generation.aiTaskId);
    const taskLedger = buildGenerationTaskLedger(aiTaskLedgerFromGeneration(generation), taskDetail);
    const taskSummary = generationTaskSummary(generation, taskDetail?.creditLogs);

    useEffect(() => {
        let active = true;
        if (!aiTaskId) {
            setTaskDetail(null);
            return;
        }
        void fetchUserAITaskDetail(aiTaskId)
            .then((detail) => {
                if (active) setTaskDetail(detail);
            })
            .catch(() => {
                if (active) setTaskDetail(null);
            });
        return () => {
            active = false;
        };
    }, [aiTaskId]);

    return (
        <div className="rounded-md bg-[var(--studio-elevated-bg)] p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Space size={[4, 4]} wrap>
                    <Tag className="studio-tag">{assetGenerationSourceLabel(readString(generation.source))}</Tag>
                    <Tag className="studio-tag">{assetGenerationActionLabel(readString(generation.actionType))}</Tag>
                    {readString(generation.provider) ? <Tag className="studio-tag">{readString(generation.provider)}</Tag> : null}
                    {readString(generation.model) ? <Tag className="studio-tag">{readString(generation.model)}</Tag> : null}
                </Space>
                <Typography.Text className="text-sm !text-[var(--studio-text-muted)]">
                    #{index + 1}
                </Typography.Text>
            </div>

            <InfoGrid
                items={[
                    ["画布项目", readString(generation.projectTitle) || readString(generation.projectId)],
                    ["分镜组", readString(generation.storyboardGroupId)],
                    ["分镜", readString(generation.storyboardShotId)],
                    ["来源节点", readString(generation.nodeId)],
                    ["账本任务", taskLedger.aiTaskId || ""],
                    ["上游任务", taskLedger.upstreamTaskId || ""],
                    ["任务状态", taskLedger.aiTaskStatus || taskSummary.status],
                    [
                        "扣费 / 返还",
                        taskLedger.aiTaskCredits || taskSummary.credits || taskLedger.creditsRefunded || taskSummary.refunded ? `${taskLedger.aiTaskCredits || taskSummary.credits || 0} / ${taskLedger.creditsRefunded || taskSummary.refunded || 0}` : "",
                    ],
                    ["Credit Log", taskLedger.creditLogId || taskSummary.creditLogId],
                    ["完成 / 返还", [taskLedger.finishedAt, taskLedger.refundedAt].filter(Boolean).join(" / ")],
                    ["生成时间", readString(generation.createdAt)],
                ]}
            />

            <SourceLineage items={lineage} />
            <PromptBlock title="原提示词" text={prompt} onCopy={() => copyText(prompt, "原提示词已复制")} />
            <PromptBlock title="实际提交提示词" text={effectivePrompt} onCopy={() => copyText(effectivePrompt, "实际提交提示词已复制")} />
            <ReferenceList references={generation.references} />

            {config ? (
                <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <Typography.Text className="text-sm !text-[var(--studio-text-secondary)]">
                            生成参数
                        </Typography.Text>
                        <Button size="middle" type="text" icon={<Copy className="size-3.5" />} onClick={() => copyText(JSON.stringify(config, null, 2), "生成参数已复制")}>
                            复制 JSON
                        </Button>
                    </div>
                    <pre className="max-h-44 overflow-auto rounded-md bg-[var(--studio-panel-bg)] p-3 text-xs leading-5 text-[var(--studio-text-secondary)]">{JSON.stringify(config, null, 2)}</pre>
                </div>
            ) : null}
        </div>
    );
}

function AssetVersionList({ versions }: { versions: AssetGenerationVersionRecord[] }) {
    if (!versions.length) return null;
    return (
        <div className="rounded-md bg-[var(--studio-elevated-bg)] p-3">
            <div className="flex items-center justify-between gap-2">
                <Typography.Text className="text-sm !text-[var(--studio-text-secondary)]">
                    版本预留
                </Typography.Text>
                <Typography.Text className="text-sm !text-[var(--studio-text-muted)]">
                    基于现有生成记录推导
                </Typography.Text>
            </div>
            <div className="mt-2 space-y-1.5">
                {versions.map((version) => (
                    <div key={version.id} className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--studio-panel-bg)] px-3 py-2 text-sm">
                        <Tag className="studio-tag">
                            {version.isLatest ? "当前版本" : "历史版本"}
                        </Tag>
                        <Typography.Text className="text-sm !text-[var(--studio-text-primary)]">{version.label}</Typography.Text>
                        <Typography.Text className="text-sm !text-[var(--studio-text-secondary)]">
                            {version.actionLabel}
                        </Typography.Text>
                        {version.modelProvider ? (
                            <Typography.Text className="break-all text-sm !text-[var(--studio-text-muted)]">
                                {version.modelProvider}
                            </Typography.Text>
                        ) : null}
                        {version.taskId ? (
                            <Typography.Text className="break-all text-sm !text-[var(--studio-text-muted)]">
                                task: {version.taskId}
                            </Typography.Text>
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

function SourceLineage({ items }: { items: ReturnType<typeof assetGenerationLineage> }) {
    if (!items.length) return null;
    return (
        <div className="mt-3">
            <Typography.Text className="block text-sm font-medium !text-[var(--studio-text-secondary)]">
                来源链路
            </Typography.Text>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {items.map((item) => (
                    <Tag key={item.key} className="studio-tag max-w-full whitespace-normal break-all">
                        {item.label}: {item.value}
                    </Tag>
                ))}
            </div>
        </div>
    );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
    const visible = items.filter(([, value]) => value);
    if (!visible.length) return null;
    return (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {visible.map(([label, value]) => (
                <div key={label} className="min-w-0">
                    <Typography.Text className="block text-sm !text-[var(--studio-text-muted)]">
                        {label}
                    </Typography.Text>
                    <Typography.Text className="block break-words text-sm !text-[var(--studio-text-primary)]">{value}</Typography.Text>
                </div>
            ))}
        </div>
    );
}

function PromptBlock({ title, text, onCopy }: { title: string; text: string; onCopy: () => void }) {
    if (!text) return null;
    return (
        <div className="mt-3">
            <div className="mb-1 flex items-center justify-between gap-2">
                <Typography.Text className="text-sm font-medium !text-[var(--studio-text-secondary)]">
                    {title}
                </Typography.Text>
                <Button size="middle" type="text" icon={<Copy className="size-3.5" />} onClick={onCopy}>
                    复制
                </Button>
            </div>
            <Typography.Paragraph className="!mb-0 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--studio-panel-bg)] p-3 !text-sm !leading-6 !text-[var(--studio-text-primary)]">{text}</Typography.Paragraph>
        </div>
    );
}

function ReferenceList({ references }: { references: unknown }) {
    const items = flattenReferences(references);
    if (!items.length) return null;
    return (
        <div className="mt-3">
            <Typography.Text className="block text-sm font-medium !text-[var(--studio-text-secondary)]">
                引用素材
            </Typography.Text>
            <div className="mt-2 space-y-1.5">
                {items.map((item, index) => (
                    <div key={`${item.kind}-${index}`} className="rounded-md bg-[var(--studio-panel-bg)] px-3 py-2 text-sm text-[var(--studio-text-secondary)]">
                        <Tag className="studio-tag mr-2">{referenceKindLabel(item.kind)}</Tag>
                        <span className="break-words">{item.text}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function flattenReferences(references: unknown) {
    const record = readRecord(references);
    if (!record) return [];
    return [
        ...referenceValues("image", record.images),
        ...referenceValues("video", record.videos),
        ...referenceValues("audio", record.audios),
        ...referenceValues("text", record.texts),
        ...referenceValues("role", record.roles),
        ...referenceValues("order", record.order),
    ];
}

function referenceValues(kind: string, value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        if (typeof item === "string") return [{ kind, text: item }];
        const record = readRecord(item);
        if (!record) return [];
        const text = [record.label, record.title, record.assetId, record.nodeId, record.storageKey, record.url, record.id, record.role].map(readString).filter(Boolean).join(" · ");
        return text ? [{ kind, text }] : [];
    });
}

function referenceKindLabel(kind: string) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    if (kind === "text") return "文本";
    if (kind === "role") return "角色";
    if (kind === "order") return "顺序";
    return "引用";
}
