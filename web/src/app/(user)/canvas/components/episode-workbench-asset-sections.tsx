"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Card, Empty, Select, Space, Tag } from "antd";
import { Bot, ImagePlus, Sparkles } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { agentRunStatusLabel, type AgentRunRecord } from "../../projects/agent-runner.ts";
import { normalizeAgentAssetDraftItems, type AgentAssetDraftItem } from "../utils/agent-asset-extractor";
import type { AssetBreakdownItem } from "../utils/asset-breakdown";
import { buildEpisodeImageNeedRows, episodeImageNeedKindLabel, type EpisodeImageNeedKind } from "../utils/episode-image-needs";
import { imageBriefKindLabel, type ImageBrief } from "../utils/image-brief";

export function AssetExtractionSection({
    canRun,
    disabledReason,
    runs,
    onRun,
    onApprove,
    onReject,
    onApply,
    onOpenAgentSettings,
}: {
    canRun: boolean;
    disabledReason: string;
    runs: AgentRunRecord[];
    onRun: () => void;
    onApprove: (runId: string) => void;
    onReject: (runId: string) => void;
    onApply: (run: AgentRunRecord) => void;
    onOpenAgentSettings?: () => void;
}) {
    return (
        <Card
            size="small"
            title="资产提取"
            extra={
                <Space size={6} wrap>
                    {onOpenAgentSettings ? (
                        <Button size="small" icon={<Bot className="size-3.5" />} onClick={onOpenAgentSettings}>
                            Agent 工作台
                        </Button>
                    ) : null}
                    <Button size="small" type="primary" icon={<Sparkles className="size-3.5" />} disabled={!canRun} onClick={onRun}>
                        运行资产提取
                    </Button>
                </Space>
            }
        >
            <Alert
                className="mb-3"
                type={canRun ? "info" : "warning"}
                showIcon
                title={canRun ? "从本集剧本生成资产草案" : disabledReason}
                description="第一版使用本地规则生成草案，并写入 Agent Runner 预览记录。必须批准后，才能手动写入本集生图需求；不会自动运行 Agent、生成图片或扣费。"
            />
            {runs.length ? (
                <div className="space-y-3">
                    {runs.map((run) => {
                        const draftItems = normalizeAgentAssetDraftItems(run.draftOutput.items);
                        return (
                            <Card key={run.id} size="small" className="bg-stone-50/70 dark:bg-white/5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Tag className="m-0">{agentRunStatusLabel(run.status)}</Tag>
                                            <Tag className="m-0">配置 v{run.agentConfigVersion}</Tag>
                                            <Tag className="m-0">{draftItems.length} 条草案</Tag>
                                        </div>
                                        <div className="mt-2 text-sm font-medium">{run.draftOutput.summary}</div>
                                        {run.draftOutput.warnings.length ? <div className="mt-1 text-xs text-amber-600">{run.draftOutput.warnings.join("；")}</div> : null}
                                    </div>
                                    <Space size={6} wrap>
                                        <Button size="small" disabled={run.status !== "ready_for_review"} onClick={() => onApprove(run.id)}>
                                            批准
                                        </Button>
                                        <Button size="small" disabled={run.status !== "ready_for_review"} onClick={() => onReject(run.id)}>
                                            驳回
                                        </Button>
                                        <Button size="small" type="primary" disabled={run.status !== "approved"} onClick={() => onApply(run)}>
                                            写入本集生图需求
                                        </Button>
                                    </Space>
                                </div>

                                <div className="mt-3 grid gap-2">
                                    {draftItems.length ? draftItems.map((item) => <AssetDraftPreviewCard key={item.id} item={item} />) : <div className="rounded-lg bg-white p-3 text-sm text-stone-500 dark:bg-black/20">当前草案没有识别到可写入资产。</div>}
                                </div>

                                <details className="mt-3" open>
                                    <summary className="cursor-pointer text-xs text-stone-500">处理过程</summary>
                                    <div className="mt-2 grid gap-2 rounded-lg bg-white p-3 text-xs leading-5 text-stone-500 dark:bg-black/20">
                                        <div>1. 读取当前画布绑定的本集剧本：{run.input.episodeTitle || "未命名本集"}。</div>
                                        <div>2. 使用本地规则扫描角色、场景、道具、服化道、情绪氛围和特效关键词。</div>
                                        <div>3. 合并同类型同名资产，并保留每条草案的剧本来源片段。</div>
                                        <div>4. 生成 {draftItems.length} 条待审核资产草案；批准后才可写入本集生图需求。</div>
                                    </div>
                                </details>
                                <details className="mt-3">
                                    <summary className="cursor-pointer text-xs text-stone-500">查看 rawJson / proposedActions</summary>
                                    <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-50">
                                        {JSON.stringify({ rawJson: run.draftOutput.rawJson, warnings: run.draftOutput.warnings, proposedActions: run.proposedActions }, null, 2)}
                                    </pre>
                                </details>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无资产提取草案。导入本集剧本后可运行资产提取。" className="py-8" />
            )}
        </Card>
    );
}

export function EpisodeImageNeedsSection({
    projectId,
    canvasId,
    episodeId,
    items,
    briefs,
    assets,
    onOpenBrief,
    onOpenAsset,
}: {
    projectId: string;
    canvasId?: string;
    episodeId?: string;
    items: AssetBreakdownItem[];
    briefs: ImageBrief[];
    assets: Asset[];
    onOpenBrief: (item: AssetBreakdownItem) => void;
    onOpenAsset?: (asset: Asset) => void;
}) {
    const [kindFilter, setKindFilter] = useState<EpisodeImageNeedKind | "all">("all");
    const rows = useMemo(() => buildEpisodeImageNeedRows({ projectId, canvasId, episodeId, items, briefs, assets }).filter((row) => kindFilter === "all" || row.kind === kindFilter), [assets, briefs, canvasId, episodeId, items, kindFilter, projectId]);
    return (
        <Card
            size="small"
            title="本集生图需求"
            extra={
                <Select
                    className="min-w-36"
                    size="small"
                    value={kindFilter}
                    options={[{ label: "全部类型", value: "all" }, ...(["character", "scene", "prop", "costume", "makeup", "mood", "effect"] as EpisodeImageNeedKind[]).map((kind) => ({ label: episodeImageNeedKindLabel(kind), value: kind }))]}
                    onChange={(value) => setKindFilter(value)}
                />
            }
        >
            {rows.length ? (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <div key={row.item.id} className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-white/5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{row.item.name}</span>
                                        <Tag className="m-0">{row.kindLabel}</Tag>
                                        {row.item.importance ? <Tag className="m-0">{importanceLabel(row.item.importance)}</Tag> : null}
                                        {row.suggestedBriefKind ? <Tag className="m-0">建议 {imageBriefKindLabel(row.suggestedBriefKind)}</Tag> : null}
                                        <Tag className="m-0">{row.sourceLabel}</Tag>
                                        <Tag color={row.hasBrief ? "blue" : undefined} className="m-0">
                                            {row.hasBrief ? "已有 Brief" : "未建 Brief"}
                                        </Tag>
                                        <Tag className="m-0">{row.statusLabel}</Tag>
                                    </div>
                                    {row.item.description ? <div className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">{row.item.description}</div> : null}
                                    {row.item.sourceText ? <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500 dark:text-stone-400">剧本依据：{row.item.sourceText}</div> : null}
                                    <Space className="mt-2" size={[6, 6]} wrap>
                                        <Tag className="m-0">结果素材 {row.resultAssetCount}</Tag>
                                        {row.item.agentRunId ? <Tag className="m-0">run: {row.item.agentRunId}</Tag> : null}
                                        {row.item.agentConfigId ? (
                                            <Tag className="m-0">
                                                Agent: {row.item.agentConfigId} v{row.item.agentConfigVersion || "-"}
                                            </Tag>
                                        ) : null}
                                    </Space>
                                </div>
                                <div className="flex items-center gap-2">
                                    {row.primaryAsset ? (
                                        <button
                                            type="button"
                                            className="h-14 w-20 overflow-hidden rounded-md border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900"
                                            title="打开主参考图"
                                            onClick={() => onOpenAsset?.(row.primaryAsset!)}
                                        >
                                            {row.primaryAsset.coverUrl ? <img src={row.primaryAsset.coverUrl} alt={row.primaryAsset.title} className="h-full w-full object-cover" /> : <span className="text-xs text-stone-400">主参考</span>}
                                        </button>
                                    ) : (
                                        <div className="flex h-14 w-20 items-center justify-center rounded-md border border-dashed border-stone-200 text-xs text-stone-400 dark:border-stone-700">无主参考</div>
                                    )}
                                    <Button size="small" type={row.hasBrief ? "default" : "primary"} icon={<ImagePlus className="size-3.5" />} onClick={() => onOpenBrief(row.item)}>
                                        {row.hasBrief ? "查看草案" : "生成草案"}
                                    </Button>
                                </div>
                            </div>
                            {row.item.warnings?.length ? <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{row.item.warnings.join("；")}</div> : null}
                        </div>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无本集生图需求。可先运行资产提取并手动写入，或在资产拆解中补充。" className="py-8" />
            )}
        </Card>
    );
}

function AssetDraftPreviewCard({ item }: { item: AgentAssetDraftItem }) {
    return (
        <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-800 dark:bg-black/20">
            <div className="flex flex-wrap items-center gap-2">
                <Tag className="m-0">{assetDraftKindLabel(item.kind)}</Tag>
                <span className="font-medium">{item.name}</span>
                <Tag className="m-0">{assetImportanceLabel(item.importance)}</Tag>
                <Tag className="m-0">Brief：{episodeImageNeedKindLabel(item.suggestedBriefKind)}</Tag>
            </div>
            {item.description ? <div className="mt-2 text-stone-600 dark:text-stone-300">{item.description}</div> : null}
            {item.scriptEvidence ? <div className="mt-2 rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-500 dark:bg-white/5">来源片段：{item.scriptEvidence}</div> : null}
            {item.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                        <Tag key={tag} className="m-0">
                            {tag}
                        </Tag>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function assetDraftKindLabel(kind: AgentAssetDraftItem["kind"]) {
    if (kind === "character") return "角色";
    if (kind === "scene") return "场景";
    if (kind === "prop") return "道具";
    if (kind === "costume") return "服装 / 服化道";
    if (kind === "makeup") return "妆发";
    if (kind === "mood") return "情绪氛围";
    return "特效需求";
}

function assetImportanceLabel(importance: AgentAssetDraftItem["importance"]) {
    if (importance === "high") return "高优先级";
    if (importance === "low") return "低优先级";
    return "中优先级";
}

function importanceLabel(importance: string) {
    if (importance === "high") return "高重要度";
    if (importance === "low") return "低重要度";
    return "中重要度";
}
