"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Card, Collapse, Empty, Input, Select, Space, Tag } from "antd";
import { Bot, Film, ImagePlus, Link2, Pencil, Play, RotateCcw, Sparkles } from "lucide-react";

import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import type { Asset } from "@/stores/use-asset-store";
import { buildShotGroupGenerationSummaries, groupedTableShotsByScene, productionStatusLabel, type EpisodeProductionStatus, type EpisodeWorkbenchStats } from "../utils/episode-workbench";
import { buildEpisodeImageNeedRows, episodeImageNeedKindLabel, type EpisodeImageNeedKind } from "../utils/episode-image-needs";
import { ShotGroupRowCard, StoryboardTableShotCard, type ShotGroupFormValues, type TableShotFormValues } from "./storyboard-shot-group-components";
import type { ShotGroup, StoryboardAssetRef, StoryboardProductionBibleRef, StoryboardTableShot } from "../utils/storyboard-management";
import type { CanvasNodeData } from "../types";
import { agentRunStatusLabel, type AgentRunRecord } from "../../projects/agent-runner.ts";
import type { AssetBreakdownItem } from "../utils/asset-breakdown";
import { imageBriefKindLabel, type ImageBrief } from "../utils/image-brief";

export function EpisodeOverviewSection({ stats, status }: { stats: EpisodeWorkbenchStats; status: EpisodeProductionStatus }) {
    return (
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
            <EpisodeStatCard label="当前状态" value={productionStatusLabel(status)} tone={status === "failed" ? "danger" : status === "generating" ? "warning" : "default"} />
            <EpisodeStatCard label="剧本" value={stats.hasScript ? "已有剧本" : "未绑定"} tone={stats.hasScript ? "default" : "warning"} />
            <EpisodeStatCard label="资产拆解" value={stats.assetBreakdownCount} />
            <EpisodeStatCard label="分镜头" value={stats.tableShotCount} />
            <EpisodeStatCard label="生成组" value={stats.shotGroupCount} />
            <EpisodeStatCard label="已生成视频" value={stats.generatedVideoCount} />
            <EpisodeStatCard label="失败" value={stats.failedCount} tone={stats.failedCount ? "danger" : "default"} />
        </div>
    );
}

export function WorkModeSection({ modes }: { modes: Array<{ key: string; title: string; active: boolean; description: string }> }) {
    return (
        <div className="grid gap-3 md:grid-cols-3">
            {modes.map((mode) => (
                <Card key={mode.key} size="small" className={mode.active ? "" : "opacity-60"}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{mode.title}</div>
                        <Tag className="m-0" color={mode.active ? "green" : "default"}>
                            {mode.active ? "可用" : "待准备"}
                        </Tag>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{mode.description}</p>
                </Card>
            ))}
        </div>
    );
}

export function EpisodeScriptSection({
    hasEpisode,
    episodeLabel,
    scriptDraft,
    onScriptDraftChange,
    onSaveScriptSnapshot,
    onOpenBind,
}: {
    hasEpisode: boolean;
    episodeLabel: string;
    scriptDraft: string;
    onScriptDraftChange: (value: string) => void;
    onSaveScriptSnapshot: () => void;
    onOpenBind: () => void;
}) {
    return (
        <Card
            size="small"
            title="剧本"
            extra={
                <Space>
                    <Button size="small" icon={<Link2 className="size-3.5" />} onClick={onOpenBind}>
                        {hasEpisode ? "重新绑定 / 导入" : "绑定或导入"}
                    </Button>
                    <Button size="small" type="primary" disabled={!hasEpisode} onClick={onSaveScriptSnapshot}>
                        保存剧本快照
                    </Button>
                </Space>
            }
        >
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <Tag color={hasEpisode ? "blue" : undefined} className="m-0">
                    {episodeLabel}
                </Tag>
                <span className="text-stone-500">{hasEpisode ? "剧本快照可编辑，保存前不会覆盖分镜头。" : "未绑定剧本时仍可自由画布制作。"}</span>
            </div>
            {hasEpisode ? <Input.TextArea value={scriptDraft} rows={8} onChange={(event) => onScriptDraftChange(event.target.value)} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前画布未绑定本集剧本" className="py-8" />}
        </Card>
    );
}

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
                            Agent 设置
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
                message={canRun ? "从本集剧本生成资产草案" : disabledReason}
                description="第一版使用本地规则生成草案，并写入 Agent Runner 预览记录。必须批准后，才能手动写入本集生图需求；不会自动运行 Agent、生成图片或扣费。"
            />
            {runs.length ? (
                <div className="space-y-3">
                    {runs.map((run) => (
                        <Card key={run.id} size="small" className="bg-stone-50/70 dark:bg-white/5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag className="m-0">{agentRunStatusLabel(run.status)}</Tag>
                                        <Tag className="m-0">配置 v{run.agentConfigVersion}</Tag>
                                        <Tag className="m-0">{run.draftOutput.items.length} 条草案</Tag>
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
                            <details className="mt-3">
                                <summary className="cursor-pointer text-xs text-stone-500">查看 items / rawJson / warnings / proposedActions</summary>
                                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-50">
                                    {JSON.stringify({ items: run.draftOutput.items, rawJson: run.draftOutput.rawJson, warnings: run.draftOutput.warnings, proposedActions: run.proposedActions }, null, 2)}
                                </pre>
                            </details>
                        </Card>
                    ))}
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
                                        {row.hasBrief ? "打开 Brief" : "创建 Brief"}
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

export function EpisodeTableSection({
    shots,
    selectedIds,
    onGenerateDrafts,
    onCreateShot,
    onToggleShot,
    onEditShot,
    onDeleteShot,
    onMoveShot,
    onCreateShotGroup,
}: {
    shots: StoryboardTableShot[];
    selectedIds: string[];
    onGenerateDrafts: () => void;
    onCreateShot: () => void;
    onToggleShot: (id: string, checked: boolean) => void;
    onEditShot: (shot: StoryboardTableShot) => void;
    onDeleteShot: (id: string) => void;
    onMoveShot: (id: string, direction: "up" | "down") => void;
    onCreateShotGroup: () => void;
}) {
    const sceneGroups = useMemo(() => groupedTableShotsByScene(shots), [shots]);
    return (
        <Card
            size="small"
            title="分镜头表"
            extra={
                <Space size={6} wrap>
                    <Button size="small" onClick={onGenerateDrafts}>
                        从剧本生成草案
                    </Button>
                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={onCreateShot}>
                        新增镜头
                    </Button>
                    <Button size="small" type="primary" disabled={!selectedIds.length} onClick={onCreateShotGroup}>
                        组合生成镜头组
                    </Button>
                </Space>
            }
        >
            <Alert className="mb-3" type="info" showIcon message="草案由本地规则生成，需要用户确认和编辑；重新导入剧本或重新生成草案前会要求确认。" />
            {sceneGroups.length ? (
                <Collapse
                    defaultActiveKey={sceneGroups.map((group) => group.sceneName)}
                    items={sceneGroups.map((group) => ({
                        key: group.sceneName,
                        label: `${group.sceneName} · ${group.shots.length} 镜 · ${group.totalDuration}s`,
                        children: (
                            <div className="space-y-2">
                                {group.shots.map((shot) => (
                                    <StoryboardTableShotCard
                                        key={shot.id}
                                        shot={shot}
                                        checked={selectedIds.includes(shot.id)}
                                        onCheckedChange={(checked) => onToggleShot(shot.id, checked)}
                                        onEdit={() => onEditShot(shot)}
                                        onDelete={() => onDeleteShot(shot.id)}
                                        onMoveUp={() => onMoveShot(shot.id, "up")}
                                        onMoveDown={() => onMoveShot(shot.id, "down")}
                                    />
                                ))}
                            </div>
                        ),
                    }))}
                />
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分镜头。可从本集剧本生成草案，或手动新增。" className="py-8" />
            )}
        </Card>
    );
}

export function ShotGroupSection({
    shotGroups,
    tableShots,
    assets,
    onEditGroup,
    onDeleteGroup,
    onAddToCanvas,
    onCreateBrief,
    onInsertPromptTemplate,
}: {
    shotGroups: ShotGroup[];
    tableShots: StoryboardTableShot[];
    assets: Asset[];
    onEditGroup: (group: ShotGroup) => void;
    onDeleteGroup: (id: string) => void;
    onAddToCanvas: (id: string) => void;
    onCreateBrief: (group: ShotGroup) => void;
    onInsertPromptTemplate: (group: ShotGroup, prompt: string) => void;
}) {
    const [promptGroup, setPromptGroup] = useState<ShotGroup | null>(null);
    const rows = useMemo(() => buildShotGroupGenerationSummaries({ shotGroups, tableShots, nodes: [] }), [shotGroups, tableShots]);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    return (
        <Card size="small" title="生成镜头组">
            {rows.length ? (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <div key={row.group.id} className="space-y-2">
                            <ShotGroupRowCard
                                row={{
                                    group: row.group,
                                    shots: row.shots,
                                    shotRangeLabel: row.shotRangeLabel,
                                    promptReady: Boolean((row.group.effectivePrompt || row.group.prompt).trim()),
                                    assetReady: Boolean(row.group.assetRefs.length || row.group.audioRefs.length || row.group.productionBibleRefs?.length),
                                    status: row.group.status,
                                }}
                                assetsById={assetsById}
                                onEdit={() => onEditGroup(row.group)}
                                onDelete={() => onDeleteGroup(row.group.id)}
                                onAddToCanvas={() => onAddToCanvas(row.group.id)}
                                onCreateBrief={() => onCreateBrief(row.group)}
                            />
                            <Space size={[6, 6]} wrap>
                                <Button size="small" icon={<Sparkles className="size-3.5" />} onClick={() => setPromptGroup(row.group)}>
                                    插入提示词模板
                                </Button>
                                <Tag className="m-0">图片资产 {row.group.assetRefs.filter((ref) => ref.kind === "image").length}</Tag>
                                <Tag className="m-0">音频资产 {row.group.audioRefs.length}</Tag>
                                <Tag className="m-0">参考视频 {row.group.assetRefs.filter((ref) => ref.kind === "video").length}</Tag>
                                <Tag className="m-0">设定引用 {row.group.productionBibleRefs?.length || 0}</Tag>
                                {row.group.assetRefs.some((ref) => ref.source === "independent") ? <Tag className="m-0">含独立素材</Tag> : null}
                            </Space>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无生成镜头组。请选择连续分镜头组合。" className="py-8" />
            )}
            <PromptSelectDialog
                open={Boolean(promptGroup)}
                nodeGroup="video"
                allowedTypes={["video", "positive", "workflow"]}
                onOpenChange={(open) => {
                    if (!open) setPromptGroup(null);
                }}
                onSelect={(prompt) => {
                    if (promptGroup) onInsertPromptTemplate(promptGroup, prompt);
                    setPromptGroup(null);
                }}
            />
        </Card>
    );
}

export function GenerationManagementSection({
    shotGroups,
    tableShots,
    nodes,
    assets,
    onOpenAsset,
    onLocateNode,
    onAddToCanvas,
    onRetryNode,
}: {
    shotGroups: ShotGroup[];
    tableShots: StoryboardTableShot[];
    nodes: CanvasNodeData[];
    assets: Asset[];
    onOpenAsset?: (asset: Asset) => void;
    onLocateNode?: (nodeId: string) => void;
    onAddToCanvas: (id: string) => void;
    onRetryNode?: (nodeId: string) => void;
}) {
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const summaries = useMemo(() => buildShotGroupGenerationSummaries({ shotGroups, tableShots, nodes }), [nodes, shotGroups, tableShots]);
    return (
        <Card size="small" title="生成管理">
            {summaries.length ? (
                <div className="space-y-3">
                    {summaries.map((summary) => (
                        <Card key={summary.group.id} size="small" className="bg-stone-50/70 dark:bg-white/5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-medium">
                                        镜 {summary.shotRangeLabel} · {summary.group.sceneName}
                                    </div>
                                    <div className="mt-1 text-xs text-stone-500">{summary.isFreeCanvas ? "自由画布镜头：补充 / 修改 / 实验 / 未归档" : `剧本驱动镜头 · ${summary.group.totalDuration}s`}</div>
                                </div>
                                <Tag className="m-0">{generationStatusLabel(summary.status)}</Tag>
                            </div>
                            <Space className="mt-3" size={[6, 6]} wrap>
                                {summary.taskId ? <Tag className="m-0">taskId: {summary.taskId}</Tag> : null}
                                {summary.aiTaskId ? <Tag className="m-0">aiTaskId: {summary.aiTaskId}</Tag> : null}
                                {summary.aiTaskStatus ? <Tag className="m-0">账本：{summary.aiTaskStatus}</Tag> : null}
                                {summary.credits ? <Tag className="m-0">扣费 {summary.credits}</Tag> : null}
                                {summary.primaryAssetId ? <Tag className="m-0">主版本：{assetsById.get(summary.primaryAssetId)?.title || summary.primaryAssetId}</Tag> : null}
                            </Space>
                            {summary.errorMessage ? <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs leading-5 text-red-600 dark:bg-red-950/30 dark:text-red-300">{summary.errorMessage}</div> : null}
                            <Space className="mt-3" size={6} wrap>
                                {summary.resultAssetIds.map((assetId) => {
                                    const asset = assetsById.get(assetId);
                                    return (
                                        <Button key={assetId} size="small" disabled={!asset || !onOpenAsset} onClick={() => asset && onOpenAsset?.(asset)}>
                                            打开结果素材
                                        </Button>
                                    );
                                })}
                                {summary.nodeId ? (
                                    <Button size="small" icon={<Film className="size-3.5" />} onClick={() => onLocateNode?.(summary.nodeId!)}>
                                        定位画布节点
                                    </Button>
                                ) : null}
                                {summary.status === "not_in_canvas" || summary.status === "failed" ? (
                                    <Button size="small" icon={<Play className="size-3.5" />} onClick={() => onAddToCanvas(summary.group.id)}>
                                        重新加入画布
                                    </Button>
                                ) : null}
                                {summary.status === "retry_needed" && summary.nodeId ? (
                                    <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => onRetryNode?.(summary.nodeId!)}>
                                        重试配置节点
                                    </Button>
                                ) : null}
                            </Space>
                        </Card>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无生成镜头组状态" className="py-8" />
            )}
        </Card>
    );
}

function EpisodeStatCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "warning" | "danger" }) {
    const toneClass =
        tone === "danger"
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
            : tone === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300"
              : "border-stone-200 bg-white text-stone-900 dark:border-stone-800 dark:bg-white/5 dark:text-stone-100";
    return (
        <div className={`rounded-xl border p-3 ${toneClass}`}>
            <div className="text-xs opacity-60">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
        </div>
    );
}

function generationStatusLabel(status: string) {
    if (status === "not_in_canvas") return "未入画布";
    if (status === "in_canvas") return "已入画布";
    if (status === "generating") return "生成中";
    if (status === "succeeded") return "成功";
    if (status === "retry_needed") return "待重试";
    if (status === "failed") return "失败";
    return status;
}

function importanceLabel(importance: string) {
    if (importance === "high") return "高重要度";
    if (importance === "low") return "低重要度";
    return "中重要度";
}

export { TableShotFormModal, ShotGroupFormModal } from "./storyboard-shot-group-components";
export type { TableShotFormValues, ShotGroupFormValues, StoryboardAssetRef, StoryboardProductionBibleRef };
