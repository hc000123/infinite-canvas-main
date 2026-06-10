"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Alert, Button, Card, Collapse, Empty, Space, Tag } from "antd";
import { Bot, Film, Pencil, Play, RotateCcw, Sparkles } from "lucide-react";

import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import type { Asset } from "@/stores/use-asset-store";
import { agentRunStatusLabel, type AgentRunRecord } from "../../projects/agent-runner.ts";
import { buildShotGroupGenerationSummaries, groupedTableShotsByScene } from "../utils/episode-workbench";
import type { ShotGroupEpisodeReferenceCandidate } from "../utils/shot-group-episode-references";
import type { CanvasNodeData } from "../types";
import { ShotGroupRowCard, StoryboardTableShotCard } from "./storyboard-shot-group-components";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";

export function EpisodeTableSection({
    shots,
    selectedIds,
    onGenerateDrafts,
    canGenerateDrafts,
    disabledReason,
    runs,
    onApproveRun,
    onRejectRun,
    onApplyRun,
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
    canGenerateDrafts: boolean;
    disabledReason: string;
    runs: AgentRunRecord[];
    onApproveRun: (runId: string) => void;
    onRejectRun: (runId: string) => void;
    onApplyRun: (run: AgentRunRecord) => void;
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
                    <Button size="small" icon={<Bot className="size-3.5" />} disabled={!canGenerateDrafts} onClick={onGenerateDrafts}>
                        运行分镜导演
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
            <Alert
                className="mb-3"
                type={canGenerateDrafts ? "info" : "warning"}
                showIcon
                title={canGenerateDrafts ? "分镜草案由分镜导演 Agent 生成预览" : disabledReason}
                description="第一版使用本地规则生成草案，并写入 Agent Runner 预览记录。必须批准后，才能手动写入分镜头表；不会自动生成视频或扣费。"
            />
            {runs.length ? (
                <div className="mb-3 space-y-2">
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
                                    <Button size="small" disabled={run.status !== "ready_for_review"} onClick={() => onApproveRun(run.id)}>
                                        批准
                                    </Button>
                                    <Button size="small" disabled={run.status !== "ready_for_review"} onClick={() => onRejectRun(run.id)}>
                                        驳回
                                    </Button>
                                    <Button size="small" type="primary" disabled={run.status !== "approved"} onClick={() => onApplyRun(run)}>
                                        写入分镜头表
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
            ) : null}
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
    autoReferenceLabels,
    onEditGroup,
    onDeleteGroup,
    onAddToCanvas,
    onCreateBrief,
    onInsertPromptTemplate,
}: {
    shotGroups: ShotGroup[];
    tableShots: StoryboardTableShot[];
    assets: Asset[];
    autoReferenceLabels?: Record<string, string>;
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
                                {autoReferenceLabels?.[row.group.id] ? <Tag className="m-0">{autoReferenceLabels[row.group.id]}</Tag> : null}
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
                                {summary.referenceAssetCount ? <Tag className="m-0">参考资产 {summary.referenceAssetCount}</Tag> : null}
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

export function ShotGroupReferencePreview({
    candidates,
    assetsById,
    defaultSelectedIds,
    onSelectionChange,
}: {
    candidates: ShotGroupEpisodeReferenceCandidate[];
    assetsById: Map<string, Asset>;
    defaultSelectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
}) {
    if (!candidates.length) return <Alert type="info" showIcon title="暂无可自动带入的本集参考资产" description="仍会创建文本说明节点、参考素材节点和视频生成配置节点，不会自动生成视频。" />;
    return (
        <div className="space-y-3">
            <Alert type="info" showIcon title="确认本集参考资产" description="仅勾选的素材会写入视频配置节点。取消全部勾选也可以继续加入画布，不会自动生成视频或扣费。" />
            <CheckboxGroup defaultValue={defaultSelectedIds} onChange={(values) => onSelectionChange(values.map(String))}>
                <div className="space-y-2">
                    {candidates.map((candidate) => {
                        const asset = assetsById.get(candidate.assetId);
                        return (
                            <label key={candidate.assetId} className="flex cursor-pointer gap-3 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                                <input className="mt-5" type="checkbox" defaultChecked={defaultSelectedIds.includes(candidate.assetId)} value={candidate.assetId} onChange={noop} />
                                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-stone-100 dark:bg-stone-900">{asset?.coverUrl ? <img src={asset.coverUrl} alt={asset.title} className="h-full w-full object-cover" /> : null}</div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{candidate.assetTitle}</span>
                                        <Tag className="m-0">{candidate.needKind || candidate.kind}</Tag>
                                        <Tag className="m-0">{candidate.sourceLabel}</Tag>
                                        {candidate.isPrimary ? <Tag className="m-0">主参考图</Tag> : null}
                                        {candidate.assetVersion?.versionNumber ? <Tag className="m-0">v{candidate.assetVersion.versionNumber}</Tag> : null}
                                    </div>
                                    <div className="mt-1 text-xs leading-5 text-stone-500">{candidate.matchReasons.join("；")}</div>
                                </div>
                            </label>
                        );
                    })}
                </div>
            </CheckboxGroup>
        </div>
    );
}

function CheckboxGroup({ defaultValue, onChange, children }: { defaultValue: string[]; onChange: (values: string[]) => void; children: ReactNode }) {
    const [values, setValues] = useState(defaultValue);
    return (
        <div
            onChange={(event) => {
                const target = event.target as HTMLInputElement;
                if (target.type !== "checkbox") return;
                const next = target.checked ? [...values, target.value] : values.filter((value) => value !== target.value);
                setValues(next);
                onChange(next);
            }}
        >
            {children}
        </div>
    );
}

function noop() {}

function generationStatusLabel(status: string) {
    if (status === "not_in_canvas") return "未入画布";
    if (status === "in_canvas") return "已入画布";
    if (status === "generating") return "生成中";
    if (status === "succeeded") return "成功";
    if (status === "retry_needed") return "待重试";
    if (status === "failed") return "失败";
    return status;
}
