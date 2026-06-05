import { Copy } from "lucide-react";
import { Button, Empty, Space, Tag, Typography } from "antd";

import { useCopyText } from "@/hooks/use-copy-text";
import type { Asset } from "@/stores/use-asset-store";
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
        <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
            <div className="flex items-center justify-between gap-3">
                <Typography.Text strong>生成信息</Typography.Text>
                {generations.length ? <Tag className="m-0">{generations.length} 条记录</Tag> : null}
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
    const prompt = readString(generation.prompt);
    const effectivePrompt = readString(generation.effectivePrompt);
    const config = readRecord(generation.config);
    const lineage = assetGenerationLineage(generation);
    return (
        <div className="rounded-md bg-stone-50 p-3 text-sm dark:bg-stone-900/70">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Space size={[4, 4]} wrap>
                    <Tag className="m-0">{assetGenerationSourceLabel(readString(generation.source))}</Tag>
                    <Tag className="m-0">{assetGenerationActionLabel(readString(generation.actionType))}</Tag>
                    {readString(generation.provider) ? <Tag className="m-0">{readString(generation.provider)}</Tag> : null}
                    {readString(generation.model) ? <Tag className="m-0">{readString(generation.model)}</Tag> : null}
                </Space>
                <Typography.Text type="secondary" className="text-xs">
                    #{index + 1}
                </Typography.Text>
            </div>

            <InfoGrid
                items={[
                    ["画布项目", readString(generation.projectTitle) || readString(generation.projectId)],
                    ["分镜组", readString(generation.storyboardGroupId)],
                    ["分镜", readString(generation.storyboardShotId)],
                    ["来源节点", readString(generation.nodeId)],
                    ["Task ID", readString(generation.taskId)],
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
                        <Typography.Text type="secondary" className="text-xs">
                            生成参数
                        </Typography.Text>
                        <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => copyText(JSON.stringify(config, null, 2), "生成参数已复制")}>
                            复制 JSON
                        </Button>
                    </div>
                    <pre className="max-h-44 overflow-auto rounded-md bg-background p-3 text-xs leading-5 text-stone-700 dark:text-stone-200">{JSON.stringify(config, null, 2)}</pre>
                </div>
            ) : null}
        </div>
    );
}

function AssetVersionList({ versions }: { versions: AssetGenerationVersionRecord[] }) {
    if (!versions.length) return null;
    return (
        <div className="rounded-md bg-stone-50 p-3 dark:bg-stone-900/70">
            <div className="flex items-center justify-between gap-2">
                <Typography.Text type="secondary" className="text-xs">
                    版本预留
                </Typography.Text>
                <Typography.Text type="secondary" className="text-xs">
                    基于现有生成记录推导
                </Typography.Text>
            </div>
            <div className="mt-2 space-y-1.5">
                {versions.map((version) => (
                    <div key={version.id} className="flex flex-wrap items-center gap-2 rounded-md bg-background px-3 py-2 text-xs">
                        <Tag className="m-0" color={version.isLatest ? "blue" : undefined}>
                            {version.isLatest ? "当前版本" : "历史版本"}
                        </Tag>
                        <Typography.Text className="text-xs">{version.label}</Typography.Text>
                        <Typography.Text type="secondary" className="text-xs">
                            {version.actionLabel}
                        </Typography.Text>
                        {version.modelProvider ? (
                            <Typography.Text type="secondary" className="break-all text-xs">
                                {version.modelProvider}
                            </Typography.Text>
                        ) : null}
                        {version.taskId ? (
                            <Typography.Text type="secondary" className="break-all text-xs">
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
            <Typography.Text type="secondary" className="block text-xs">
                来源链路
            </Typography.Text>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {items.map((item) => (
                    <Tag key={item.key} className="m-0 max-w-full whitespace-normal break-all">
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
                    <Typography.Text type="secondary" className="block text-xs">
                        {label}
                    </Typography.Text>
                    <Typography.Text className="block break-words text-xs">{value}</Typography.Text>
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
                <Typography.Text type="secondary" className="text-xs">
                    {title}
                </Typography.Text>
                <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={onCopy}>
                    复制
                </Button>
            </div>
            <Typography.Paragraph className="!mb-0 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 !text-xs !leading-5">{text}</Typography.Paragraph>
        </div>
    );
}

function ReferenceList({ references }: { references: unknown }) {
    const items = flattenReferences(references);
    if (!items.length) return null;
    return (
        <div className="mt-3">
            <Typography.Text type="secondary" className="block text-xs">
                引用素材
            </Typography.Text>
            <div className="mt-2 space-y-1.5">
                {items.map((item, index) => (
                    <div key={`${item.kind}-${index}`} className="rounded-md bg-background px-3 py-2 text-xs">
                        <Tag className="m-0 mr-2">{referenceKindLabel(item.kind)}</Tag>
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
