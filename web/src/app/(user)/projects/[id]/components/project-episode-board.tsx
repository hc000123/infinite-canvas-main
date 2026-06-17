"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Empty, Select, Tag } from "antd";
import { Archive, ArrowRight, BarChart3, Bot, Clapperboard, Edit3, FileText, Image, Library, ListChecks, Maximize2, Plus, Sparkles, Trash2, TriangleAlert, Video, Wand2, type LucideIcon } from "lucide-react";

import type { AssetKind } from "@/stores/use-asset-store";
import { canvasEpisodeLabel } from "../../../canvas/utils/canvas-episode-context";
import { canvasProjectPresetSummary } from "../../../canvas/utils/canvas-project-preset";
import type { CanvasProject } from "../../../canvas/stores/use-canvas-store";
import { agentKindLabel } from "../../agent-workbench";
import type { ProjectAssetReferenceFilters, ProjectAssetReferenceItem, ProjectAssetReferenceSummary, ProjectAssetReferenceType } from "../../project-asset-references";
import type { ProjectOverviewActionTarget, ProjectOverviewDashboard, ProjectOverviewSuggestion } from "../../project-overview-dashboard";

export type ProjectEpisodeBoardRow = {
    canvasCount: number;
    filterStatus: "done" | "draft" | "running";
    id: string;
    optimizedScriptPreview: string;
    order: number;
    progress: number;
    shotText: string;
    scriptPreview: string;
    stage: "分镜" | "剧本" | "成片" | "未开始";
    status: "已完成" | "草稿" | "进行中";
    title: string;
    updatedAt: string;
    videoCount: number;
    primaryCanvasId?: string;
};

type EpisodeFilter = "all" | "done" | "draft" | "running";
export type ProjectDetailTab = "episodes" | "canvas" | "asset-references";

type ProjectEpisodeBoardProps = {
    activeTab: ProjectDetailTab;
    assetReferenceFilters: ProjectAssetReferenceFilters;
    assetReferenceRows: ProjectAssetReferenceSummary[];
    currentEpisode?: ProjectEpisodeBoardRow;
    counts: { all: number; done: number; draft: number; running: number };
    description: string;
    episodeFilter: EpisodeFilter;
    filteredAssetReferenceRows: ProjectAssetReferenceSummary[];
    filteredRows: ProjectEpisodeBoardRow[];
    progress: number;
    canvases: CanvasProject[];
    unboundCanvases: CanvasProject[];
    bindingCanvasId: string;
    optimizingEpisodeId: string;
    projectTitle: string;
    projectId: string;
    presetSummary: string;
    rows: ProjectEpisodeBoardRow[];
    scriptOptimizeErrors: Record<string, string>;
    scriptSkillOptions: Array<{ label: string; value: string }>;
    selectedScriptSkillId: string;
    onBindCanvas: () => void;
    onBindingCanvasChange: (canvasId: string) => void;
    onAssetReferenceFiltersChange: (filters: ProjectAssetReferenceFilters) => void;
    onClearOptimizedScript: (episodeId: string) => void;
    onCreateCanvas: () => void;
    onEditCanvasPreset: (canvasId: string) => void;
    onEditEpisodeTitle: (row: ProjectEpisodeBoardRow) => void;
    onOpenAgentSettings: () => void;
    onEditProject: () => void;
    onFilterChange: (filter: EpisodeFilter) => void;
    onImportEpisode: () => void;
    onOptimizeEpisodeScript: (episodeId: string) => void;
    onOpenEpisode: (episodeId: string) => void;
    onScriptSkillChange: (workflowId: string) => void;
    onTabChange: (tab: ProjectDetailTab) => void;
};

export function ProjectEpisodeBoard({
    activeTab,
    assetReferenceFilters,
    assetReferenceRows,
    currentEpisode,
    counts,
    description,
    episodeFilter,
    filteredAssetReferenceRows,
    filteredRows,
    progress,
    canvases,
    unboundCanvases,
    bindingCanvasId,
    optimizingEpisodeId,
    projectTitle,
    projectId,
    presetSummary,
    rows,
    scriptOptimizeErrors,
    scriptSkillOptions,
    selectedScriptSkillId,
    onBindCanvas,
    onBindingCanvasChange,
    onAssetReferenceFiltersChange,
    onClearOptimizedScript,
    onCreateCanvas,
    onEditCanvasPreset,
    onEditEpisodeTitle,
    onOpenAgentSettings,
    onEditProject,
    onFilterChange,
    onImportEpisode,
    onOptimizeEpisodeScript,
    onOpenEpisode,
    onScriptSkillChange,
    onTabChange,
}: ProjectEpisodeBoardProps) {
    const currentText = currentEpisode ? `${episodeDisplayTitle(currentEpisode)} · ${currentEpisodeStatusText(currentEpisode)}` : "暂无分集";
    return (
        <div className="mx-auto min-h-full max-w-[1680px] rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)]">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--studio-border-subtle)] px-4 py-4 sm:px-8">
                <nav aria-label="项目详情视图" className="order-1 flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-4">
                    <ProjectDetailNavButton active={activeTab === "episodes"} icon={ListChecks} label="分集" onClick={() => onTabChange("episodes")} />
                    <ProjectDetailNavButton active={activeTab === "canvas"} icon={Maximize2} label="画布" onClick={() => onTabChange("canvas")} />
                    <ProjectDetailNavButton active={activeTab === "asset-references"} icon={Library} label="素材引用" onClick={() => onTabChange("asset-references")} />
                    <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-transparent px-3 text-base font-semibold text-[var(--studio-text-muted)] transition hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text-primary)]"
                        onClick={onOpenAgentSettings}
                    >
                        <Bot className="size-4" />
                        Agent 中心
                    </button>
                </nav>

                <div className="order-2 flex w-full min-w-0 justify-start lg:order-none lg:w-auto lg:flex-1 lg:justify-center">
                    <div className="w-full rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-4 py-2 text-left text-sm font-medium leading-6 text-[var(--studio-text-secondary)] sm:text-base lg:w-auto lg:max-w-full lg:text-center">
                        <span className="text-[var(--studio-text-muted)]">当前制作到</span>
                        <span className="ml-2 text-[var(--studio-text-primary)]">{currentText}</span>
                    </div>
                </div>

                <div className="order-3 flex w-full shrink-0 items-center gap-3 sm:w-auto lg:order-none">
                    <Button className="h-11 flex-1 px-5 sm:flex-none" onClick={onEditProject}>
                        编辑项目
                    </Button>
                </div>
            </header>

            <section className="grid gap-5 px-8 py-6">
                {activeTab === "canvas" ? (
                    <ProjectCanvasList
                        canvases={canvases}
                        unboundCanvases={unboundCanvases}
                        bindingCanvasId={bindingCanvasId}
                        onBindCanvas={onBindCanvas}
                        onBindingCanvasChange={onBindingCanvasChange}
                        onCreateCanvas={onCreateCanvas}
                        onEditCanvasPreset={onEditCanvasPreset}
                    />
                ) : activeTab === "asset-references" ? (
                    <ProjectAssetReferencePanel allRows={assetReferenceRows} filters={assetReferenceFilters} projectId={projectId} rows={filteredAssetReferenceRows} onFiltersChange={onAssetReferenceFiltersChange} />
                ) : (
                    <ProjectEpisodeProductionPanel
                        counts={counts}
                        currentEpisode={currentEpisode}
                        description={description}
                        episodeFilter={episodeFilter}
                        filteredRows={filteredRows}
                        onCreate={onImportEpisode}
                        onClearOptimizedScript={onClearOptimizedScript}
                        onEditTitle={onEditEpisodeTitle}
                        onFilterChange={onFilterChange}
                        onOptimizeEpisodeScript={onOptimizeEpisodeScript}
                        onOpenEpisode={onOpenEpisode}
                        onScriptSkillChange={onScriptSkillChange}
                        optimizingEpisodeId={optimizingEpisodeId}
                        progress={progress}
                        projectTitle={projectTitle}
                        rows={rows}
                        scriptOptimizeErrors={scriptOptimizeErrors}
                        scriptSkillOptions={scriptSkillOptions}
                        selectedScriptSkillId={selectedScriptSkillId}
                        total={rows.length}
                    />
                )}
            </section>
        </div>
    );
}

function ProjectEpisodeProductionPanel({
    counts,
    currentEpisode,
    description,
    episodeFilter,
    filteredRows,
    onCreate,
    onClearOptimizedScript,
    onEditTitle,
    onFilterChange,
    onOptimizeEpisodeScript,
    onOpenEpisode,
    onScriptSkillChange,
    optimizingEpisodeId,
    progress,
    projectTitle,
    rows,
    scriptOptimizeErrors,
    scriptSkillOptions,
    selectedScriptSkillId,
    total,
}: {
    counts: { all: number; done: number; draft: number; running: number };
    currentEpisode?: ProjectEpisodeBoardRow;
    description: string;
    episodeFilter: EpisodeFilter;
    filteredRows: ProjectEpisodeBoardRow[];
    onCreate: () => void;
    onClearOptimizedScript: (episodeId: string) => void;
    onEditTitle: (row: ProjectEpisodeBoardRow) => void;
    onFilterChange: (filter: EpisodeFilter) => void;
    onOptimizeEpisodeScript: (episodeId: string) => void;
    onOpenEpisode: (episodeId: string) => void;
    onScriptSkillChange: (workflowId: string) => void;
    optimizingEpisodeId: string;
    progress: number;
    projectTitle: string;
    rows: ProjectEpisodeBoardRow[];
    scriptOptimizeErrors: Record<string, string>;
    scriptSkillOptions: Array<{ label: string; value: string }>;
    selectedScriptSkillId: string;
    total: number;
}) {
    const defaultSelectedId = currentEpisode?.id || rows[0]?.id || "";
    const [selectedId, setSelectedId] = useState(defaultSelectedId);

    useEffect(() => {
        if (selectedId !== defaultSelectedId && !rows.some((row) => row.id === selectedId)) setSelectedId(defaultSelectedId);
    }, [defaultSelectedId, rows, selectedId]);

    const selectedEpisode = useMemo(() => rows.find((row) => row.id === selectedId) || currentEpisode || rows[0], [currentEpisode, rows, selectedId]);
    const selectedScript = selectedEpisode?.scriptPreview.trim() || "";
    const selectedOptimizedScript = selectedEpisode?.optimizedScriptPreview.trim() || "";
    const selectedOptimizeError = selectedEpisode ? scriptOptimizeErrors[selectedEpisode.id] || "" : "";
    const selectedOptimizing = Boolean(selectedEpisode && optimizingEpisodeId === selectedEpisode.id);

    return (
        <section className="grid gap-3">
            <div className="flex flex-col gap-3 border-b border-[var(--studio-border-subtle)] pb-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <div className="text-xs font-semibold leading-5 text-[var(--studio-accent)]">项目中心 / {projectTitle}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h1 className="break-words text-2xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">分集生产入口</h1>
                        <span className="text-xs text-[var(--studio-text-muted)]">{description || "确认剧本后进入视频工作流。"}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex min-w-[220px] items-center gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-3 py-2">
                        <span className="shrink-0 text-xs font-semibold text-[var(--studio-text-secondary)]">进度 {progress}%</span>
                        <div className="h-1.5 min-w-20 flex-1 rounded-full bg-[var(--studio-elevated-bg)]">
                            <div className="h-full rounded-full bg-[var(--studio-accent)]" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="flex shrink-0 gap-2 text-xs text-[var(--studio-text-muted)]">
                            <span>完成 {counts.done}</span>
                            <span>进行 {counts.running}</span>
                            <span>草稿 {counts.draft}</span>
                        </div>
                    </div>
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={onCreate}>
                        新建分集
                    </Button>
                </div>
            </div>

            <div className="grid min-h-[560px] gap-3 xl:grid-cols-[190px_minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[210px_minmax(0,1fr)_minmax(0,1fr)]">
                <aside className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--studio-text-primary)]">集数</h2>
                            <p className="mt-1 text-xs text-[var(--studio-text-muted)]">共 {total} 集</p>
                        </div>
                        <Tag className="m-0">{counts.all}</Tag>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-1.5">
                        <EpisodeFilterButton active={episodeFilter === "all"} label="全部" onClick={() => onFilterChange("all")} />
                        <EpisodeFilterButton active={episodeFilter === "draft"} label="草稿" onClick={() => onFilterChange("draft")} />
                        <EpisodeFilterButton active={episodeFilter === "running"} label="进行中" onClick={() => onFilterChange("running")} />
                        <EpisodeFilterButton active={episodeFilter === "done"} label="已完成" onClick={() => onFilterChange("done")} />
                    </div>
                    <div className="mt-3 grid max-h-[500px] gap-2 overflow-y-auto pr-1">
                        {filteredRows.length ? (
                            filteredRows.map((row) => {
                                const selected = row.id === selectedEpisode?.id;
                                return (
                                    <div
                                        key={row.id}
                                        className={`rounded-md border p-2.5 transition ${selected ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]"}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(row.id)}>
                                                <span className="block line-clamp-2 text-sm font-semibold leading-5 text-[var(--studio-text-primary)]">{episodeDisplayTitle(row)}</span>
                                            </button>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <span className="truncate text-xs text-[var(--studio-text-muted)]">{row.scriptPreview.trim() ? `${row.scriptPreview.trim().length} 字` : "暂无剧本"}</span>
                                            <EpisodeStatusBadge status={row.status} />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={rows.length ? "没有匹配分集" : "暂无分集"} className="py-12 text-[var(--studio-text-muted)]" />
                        )}
                    </div>
                </aside>

                <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-3">
                    <div className="flex h-full flex-col">
                        <div className="flex min-h-10 flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--studio-accent)]">
                                    <FileText className="size-3.5" />
                                    原剧本
                                    {selectedScript ? <span className="font-normal text-[var(--studio-text-muted)]">{selectedScript.length} 字</span> : null}
                                </div>
                                <h2 className="mt-1 break-words text-lg font-semibold leading-tight text-[var(--studio-text-primary)]">
                                    {selectedEpisode ? episodeDisplayTitle(selectedEpisode) : "还没有分集剧本"}
                                </h2>
                            </div>
                            {selectedEpisode ? (
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                    <Select
                                        size="small"
                                        className="min-w-[220px]"
                                        popupMatchSelectWidth={false}
                                        value={selectedScriptSkillId || scriptSkillOptions[0]?.value}
                                        options={scriptSkillOptions}
                                        disabled={!scriptSkillOptions.length || selectedOptimizing}
                                        onChange={onScriptSkillChange}
                                    />
                                    <Button size="small" icon={<Wand2 className="size-3.5" />} loading={selectedOptimizing} disabled={!selectedScript} onClick={() => onOptimizeEpisodeScript(selectedEpisode.id)}>
                                        剧本优化
                                    </Button>
                                    <button
                                        type="button"
                                        className="grid size-9 place-items-center rounded-md text-[var(--studio-text-muted)] transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-accent)]"
                                        title="修改标题"
                                        aria-label={`修改 ${episodeDisplayTitle(selectedEpisode)} 标题`}
                                        onClick={() => onEditTitle(selectedEpisode)}
                                    >
                                        <Edit3 className="size-4" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        <div className="mt-3 min-h-0 flex-1 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-4">
                            {selectedEpisode ? (
                                <pre className="max-h-[520px] whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--studio-text-secondary)]">{selectedScript || "暂无剧本正文。点击“新建分集”导入本集剧本后，这里会显示缩略预览。"}</pre>
                            ) : (
                                <div className="grid h-[520px] place-items-center text-center">
                                    <div>
                                        <FileText className="mx-auto size-10 text-[var(--studio-text-muted)]" />
                                        <h3 className="mt-4 text-xl font-semibold text-[var(--studio-text-primary)]">先创建第一集</h3>
                                        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--studio-text-secondary)]">导入剧本时可以先运行 AI 适配剧本，再进入视频工作流。</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <aside className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-3">
                    <div className="flex h-full flex-col">
                        <div className="min-h-10">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--studio-accent)]">
                                    <Wand2 className="size-3.5" />
                                    优化后的剧本
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    {selectedOptimizedScript ? <Tag className="m-0">{selectedOptimizedScript.length} 字</Tag> : null}
                                    {selectedEpisode ? (
                                        <Button size="small" icon={<ArrowRight className="size-3.5" />} disabled={selectedOptimizing} onClick={() => onOpenEpisode(selectedEpisode.id)}>
                                            进入工作流
                                        </Button>
                                    ) : null}
                                    {selectedEpisode && (selectedOptimizedScript || selectedOptimizeError) ? (
                                        <Button size="small" icon={<Trash2 className="size-3.5" />} disabled={selectedOptimizing} onClick={() => onClearOptimizedScript(selectedEpisode.id)}>
                                            清除
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                            <h2 className="mt-1 break-words text-lg font-semibold leading-tight text-[var(--studio-text-primary)]">{selectedEpisode ? episodeDisplayTitle(selectedEpisode) : "等待分集"}</h2>
                        </div>
                        <div className="mt-3 min-h-0 flex-1 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-4">
                            {selectedEpisode ? (
                                selectedOptimizing ? (
                                    <div className="grid h-[520px] place-items-center text-center">
                                        <div>
                                            <Wand2 className="mx-auto size-10 animate-pulse text-[var(--studio-accent)]" />
                                            <h3 className="mt-4 text-lg font-semibold text-[var(--studio-text-primary)]">正在优化剧本</h3>
                                            <p className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">当前 Skill 会在本页生成适配稿，不会自动跳转工作流。</p>
                                        </div>
                                    </div>
                                ) : selectedOptimizeError ? (
                                    <div className="grid h-[520px] place-items-center text-center">
                                        <div>
                                            <TriangleAlert className="mx-auto size-10 text-[var(--studio-warning)]" />
                                            <h3 className="mt-4 text-lg font-semibold text-[var(--studio-text-primary)]">优化未完成</h3>
                                            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--studio-text-secondary)]">{selectedOptimizeError}</p>
                                        </div>
                                    </div>
                                ) : selectedOptimizedScript ? (
                                    <pre className="max-h-[520px] whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--studio-text-secondary)]">{selectedOptimizedScript}</pre>
                                ) : (
                                    <div className="grid h-[520px] place-items-center text-center">
                                        <div>
                                            <Wand2 className="mx-auto size-10 text-[var(--studio-text-muted)]" />
                                            <h3 className="mt-4 text-lg font-semibold text-[var(--studio-text-primary)]">还没有优化稿</h3>
                                            <p className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">选择剧本优化 Skill 后点击左侧“剧本优化”，这里会显示适配稿。</p>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="grid h-[520px] place-items-center text-center text-sm text-[var(--studio-text-muted)]">先选择或新建分集</div>
                            )}
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    );
}

function ProjectOverviewPanel({ overview, onAction }: { overview: ProjectOverviewDashboard; onAction: (target: ProjectOverviewActionTarget) => void }) {
    const stats = overview.stats;
    const metricCards: ProjectOverviewMetric[] = [
        { label: "画布", value: stats.canvasCount, helper: "项目承接画布", icon: Maximize2, target: { type: "tab", tab: "canvas" } },
        { label: "剧本 / 分集", value: `${stats.scriptProjectCount} / ${stats.episodeCount}`, helper: `${stats.sceneCount} 个场次`, icon: FileText, target: { type: "tab", tab: "episodes" } },
        { label: "分镜", value: stats.storyboardShotCount, helper: `${stats.storyboardGroupCount} 个分镜组`, icon: Clapperboard, target: { type: "storyboard" } },
        {
            label: "生成队列",
            value: stats.generationQueueCount,
            helper: stats.failedGenerationCount ? `${stats.failedGenerationCount} 个失败项` : "待生成任务",
            icon: Video,
            tone: stats.failedGenerationCount ? "danger" : "default",
            target: { type: "storyboard" },
        },
        { label: "已生成视频", value: stats.generatedVideoCount, helper: "待验收成片", icon: Sparkles, target: { type: "storyboard" } },
        { label: "素材缺口", value: stats.missingMaterialCount, helper: "缺引用或本地文件", icon: TriangleAlert, tone: stats.missingMaterialCount ? "danger" : "default", target: { type: "asset-references", missingOnly: true } },
        { label: "旧版本引用", value: stats.outdatedReferenceCount, helper: "需要手动确认更新", icon: Archive, tone: stats.outdatedReferenceCount ? "warning" : "default", target: { type: "asset-references", versionStatus: "outdated" } },
        { label: "项目素材", value: stats.projectLibraryAssetCount, helper: "项目库资产", icon: Library, target: { type: "assets-page" } },
    ];

    return (
        <section className="studio-panel-muted grid gap-5 p-4">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
                <div>
                    <div className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">制作总览</div>
                    <h2 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)]">制作总览</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--studio-text-secondary)]">从剧本、分镜、素材、生成队列到待验收视频，先看阻塞项，再进入对应工作区处理。</p>
                </div>
                <Button icon={<Bot className="size-4" />} onClick={() => onAction({ type: "agent" })}>
                    Agent 工作台
                </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metricCards.map((metric) => (
                    <ProjectOverviewMetricCard key={metric.label} metric={metric} onAction={onAction} />
                ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                <section className="grid gap-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-[var(--studio-text-primary)]">下一步建议</h3>
                        <Tag className="m-0">{overview.suggestions.length || "无"} 条</Tag>
                    </div>
                    {overview.suggestions.length ? (
                        <div className="grid gap-3">
                            {overview.suggestions.map((suggestion) => (
                                <ProjectOverviewSuggestionCard key={suggestion.id} suggestion={suggestion} onAction={onAction} />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-4 py-5">
                            <div className="flex items-center gap-2 text-base font-semibold text-[var(--studio-text-primary)]">
                                <BarChart3 className="size-4 text-[var(--studio-success)]" />
                                当前没有明显阻塞
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">可以继续从分集、分镜或项目素材库进入具体制作环节。</p>
                        </div>
                    )}
                </section>

                <section className="grid gap-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-[var(--studio-text-primary)]">最近动态</h3>
                        <Button size="small" type="link" className="h-auto px-0" onClick={() => onAction({ type: "agent" })}>
                            查看全部
                        </Button>
                    </div>
                    <div className="grid gap-3">
                        {overview.recentAgentTasks.length ? (
                            overview.recentAgentTasks.map((task) => (
                                <article key={task.id} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag className="m-0">{agentKindLabel(task.kind)}</Tag>
                                        <Tag className="m-0" color={agentTaskStatusColor(task.status)}>
                                            {agentTaskStatusLabel(task.status)}
                                        </Tag>
                                    </div>
                                    <h4 className="mt-3 break-words text-base font-semibold leading-6 text-[var(--studio-text-primary)]">{task.title}</h4>
                                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--studio-text-secondary)]">{task.summary}</p>
                                </article>
                            ))
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Agent 任务" className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] py-10 text-[var(--studio-text-muted)]" />
                        )}
                    </div>

                    {overview.exportableStoryboardGroups.length ? (
                        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text-primary)]">
                                <Image className="size-4 text-[var(--studio-accent)]" />
                                可导出剪辑包
                            </div>
                            <div className="mt-3 grid gap-2">
                                {overview.exportableStoryboardGroups.slice(0, 3).map((group) => (
                                    <button
                                        key={group.id}
                                        type="button"
                                        className="flex items-center justify-between gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-3 py-2 text-left transition hover:border-[var(--studio-border-strong)]"
                                        onClick={() => onAction({ type: "storyboard", groupId: group.id })}
                                    >
                                        <span className="min-w-0 truncate text-sm font-medium text-[var(--studio-text-secondary)]">{group.title || "未命名分镜组"}</span>
                                        <ArrowRight className="size-4 shrink-0 text-[var(--studio-text-muted)]" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </section>
            </div>
        </section>
    );
}

type ProjectOverviewMetric = {
    label: string;
    value: number | string;
    helper: string;
    icon: LucideIcon;
    tone?: "default" | "warning" | "danger";
    target: ProjectOverviewActionTarget;
};

function ProjectOverviewMetricCard({ metric, onAction }: { metric: ProjectOverviewMetric; onAction: (target: ProjectOverviewActionTarget) => void }) {
    const Icon = metric.icon;
    const valueClass = metric.tone === "danger" ? "text-[var(--studio-danger)]" : metric.tone === "warning" ? "text-[var(--studio-warning)]" : "text-[var(--studio-text-primary)]";
    return (
        <button
            type="button"
            className="group rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 text-left transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-panel-bg)]"
            onClick={() => onAction(metric.target)}
        >
            <div className="flex items-center justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-md border border-[var(--studio-border-subtle)] text-[var(--studio-accent)]">
                    <Icon className="size-4" />
                </span>
                <ArrowRight className="size-4 text-[var(--studio-text-muted)] opacity-0 transition group-hover:opacity-100" />
            </div>
            <div className={`mt-4 text-3xl font-semibold leading-none ${valueClass}`}>{metric.value}</div>
            <div className="mt-2 text-sm font-semibold text-[var(--studio-text-primary)]">{metric.label}</div>
            <div className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">{metric.helper}</div>
        </button>
    );
}

function ProjectOverviewSuggestionCard({ suggestion, onAction }: { suggestion: ProjectOverviewSuggestion; onAction: (target: ProjectOverviewActionTarget) => void }) {
    return (
        <article className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-md bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]">
                            <BarChart3 className="size-4" />
                        </span>
                        <h4 className="break-words text-base font-semibold text-[var(--studio-text-primary)]">{suggestion.title}</h4>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">{suggestion.description}</p>
                </div>
                <Button className="shrink-0" type={suggestion.priority <= 30 ? "primary" : "default"} icon={<ArrowRight className="size-4" />} onClick={() => onAction(suggestion.target)}>
                    {suggestion.actionLabel}
                </Button>
            </div>
        </article>
    );
}

function ProjectAssetReferencePanel({
    allRows,
    filters,
    projectId,
    rows,
    onFiltersChange,
}: {
    allRows: ProjectAssetReferenceSummary[];
    filters: ProjectAssetReferenceFilters;
    projectId: string;
    rows: ProjectAssetReferenceSummary[];
    onFiltersChange: (filters: ProjectAssetReferenceFilters) => void;
}) {
    const stats = {
        assets: allRows.length,
        references: allRows.reduce((sum, row) => sum + row.referenceCount, 0),
        outdated: allRows.reduce((sum, row) => sum + row.references.filter((reference) => reference.hasOutdatedVersion).length, 0),
        missing: allRows.filter((row) => row.hasMissingLocalFile).length,
        shared: allRows.filter((row) => row.inProjectLibrary).length,
    };
    const updateFilters = (patch: ProjectAssetReferenceFilters) => onFiltersChange({ ...filters, ...patch });
    const resetFilters = () => onFiltersChange({ assetKind: "all", fileStatus: "all", projectLibraryStatus: "all", referenceType: "all", versionStatus: "all" });
    return (
        <section className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)]">素材引用</h2>
                    <p className="mt-1 text-sm text-[var(--studio-text-secondary)]">查看素材被哪些画布、分镜、设定库和生成结果使用，替换或删除前先看影响范围。</p>
                </div>
                <Button href={`/assets?projectId=${encodeURIComponent(projectId)}&returnTo=${encodeURIComponent(`/projects/${projectId}`)}&returnLabel=${encodeURIComponent("返回项目")}`}>打开项目素材库</Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <AssetReferenceStat label="引用素材" value={stats.assets} />
                <AssetReferenceStat label="引用次数" value={stats.references} />
                <AssetReferenceStat label="过期引用" value={stats.outdated} tone={stats.outdated ? "warning" : "default"} />
                <AssetReferenceStat label="缺本地文件" value={stats.missing} tone={stats.missing ? "danger" : "default"} />
                <AssetReferenceStat label="项目库素材" value={stats.shared} />
            </div>

            <div className="grid gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
                <AssetReferenceSelect label="素材类型" value={filters.assetKind || "all"} options={assetKindOptions} onChange={(value) => updateFilters({ assetKind: value as AssetKind | "all" })} />
                <AssetReferenceSelect label="引用位置" value={filters.referenceType || "all"} options={referenceTypeOptions} onChange={(value) => updateFilters({ referenceType: value as ProjectAssetReferenceType | "all" })} />
                <AssetReferenceSelect label="版本状态" value={filters.versionStatus || "all"} options={versionStatusOptions} onChange={(value) => updateFilters({ versionStatus: value as ProjectAssetReferenceFilters["versionStatus"] })} />
                <AssetReferenceSelect label="文件状态" value={filters.fileStatus || "all"} options={fileStatusOptions} onChange={(value) => updateFilters({ fileStatus: value as ProjectAssetReferenceFilters["fileStatus"] })} />
                <AssetReferenceSelect
                    label="项目库"
                    value={filters.projectLibraryStatus || "all"}
                    options={projectLibraryOptions}
                    onChange={(value) => updateFilters({ projectLibraryStatus: value as ProjectAssetReferenceFilters["projectLibraryStatus"] })}
                />
                <div className="flex items-end">
                    <Button className="w-full md:w-auto" onClick={resetFilters}>
                        重置
                    </Button>
                </div>
            </div>

            {rows.length ? (
                <div className="grid gap-3">
                    {rows.map((row) => (
                        <ProjectAssetReferenceCard key={row.asset.id} projectId={projectId} row={row} />
                    ))}
                </div>
            ) : (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={allRows.length ? "没有匹配的素材引用" : "当前项目还没有可追踪的素材引用"}
                    className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] py-16 text-[var(--studio-text-muted)]"
                />
            )}
        </section>
    );
}

function AssetReferenceStat({ label, tone = "default", value }: { label: string; tone?: "default" | "warning" | "danger"; value: number }) {
    const valueClass = tone === "danger" ? "text-[var(--studio-danger)]" : tone === "warning" ? "text-[var(--studio-warning)]" : "text-[var(--studio-text-primary)]";
    return (
        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-4 py-3">
            <div className="text-sm text-[var(--studio-text-muted)]">{label}</div>
            <div className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</div>
        </div>
    );
}

function AssetReferenceSelect({ label, onChange, options, value }: { label: string; value: string; options: Array<{ label: string; value: string }>; onChange: (value: string) => void }) {
    return (
        <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[var(--studio-text-muted)]">{label}</span>
            <Select value={value} options={options} onChange={onChange} />
        </label>
    );
}

function ProjectAssetReferenceCard({ projectId, row }: { projectId: string; row: ProjectAssetReferenceSummary }) {
    const assetHref = projectAssetDetailHref(projectId, row.asset.id);
    return (
        <article className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Tag className="studio-tag">{assetKindLabel(row.asset.kind)}</Tag>
                        {row.inProjectLibrary ? <Tag color="success">项目库</Tag> : <Tag>未入项目库</Tag>}
                        {row.hasOutdatedVersion ? <Tag color="warning">有过期引用</Tag> : <Tag color="success">最新</Tag>}
                        {row.hasMissingLocalFile ? <Tag color="error">本地文件缺失</Tag> : null}
                    </div>
                    <h3 className="mt-3 break-words text-lg font-semibold leading-6 text-[var(--studio-text-primary)]">{row.asset.title}</h3>
                    <p className="mt-1 text-sm text-[var(--studio-text-muted)]">
                        {row.referenceCount} 处引用 · 更新于 {formatProjectDate(row.updatedAt)}
                    </p>
                </div>
                <Button size="small" href={assetHref}>
                    查看素材详情
                </Button>
            </div>
            {row.asset.tags.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {row.asset.tags.slice(0, 6).map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                    ))}
                </div>
            ) : null}
            <div className="mt-4 grid gap-2">
                {row.references.map((reference) => {
                    const action = projectReferenceAction(projectId, reference);
                    return (
                        <div key={reference.id} className="flex flex-col gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Tag className="m-0">{referenceTypeLabel(reference.type)}</Tag>
                                <span className="min-w-0 break-words font-medium text-[var(--studio-text-primary)]">{[reference.contextLabel, reference.label].filter(Boolean).join(" / ")}</span>
                                {reference.role ? <span className="text-[var(--studio-text-muted)]">用途：{reference.role}</span> : null}
                                {reference.hasOutdatedVersion ? (
                                    <Tag className="m-0" color="warning">
                                        旧版本
                                    </Tag>
                                ) : null}
                            </div>
                            {action ? (
                                <Button size="small" type="link" className="h-auto self-start px-0 sm:self-center" href={action.href}>
                                    {action.label}
                                </Button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </article>
    );
}

function ProjectCanvasList({
    canvases,
    unboundCanvases,
    bindingCanvasId,
    onBindCanvas,
    onBindingCanvasChange,
    onCreateCanvas,
    onEditCanvasPreset,
}: {
    canvases: CanvasProject[];
    unboundCanvases: CanvasProject[];
    bindingCanvasId: string;
    onBindCanvas: () => void;
    onBindingCanvasChange: (canvasId: string) => void;
    onCreateCanvas: () => void;
    onEditCanvasPreset: (canvasId: string) => void;
}) {
    return (
        <section className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)]">画布列表</h2>
                    <p className="mt-1 text-sm text-[var(--studio-text-secondary)]">查看当前项目下已经创建和生成过的画布。</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    {unboundCanvases.length ? (
                        <div className="flex min-w-[320px] gap-2">
                            <Select className="min-w-0 flex-1" value={bindingCanvasId || undefined} placeholder="绑定旧画布" options={unboundCanvases.map((canvas) => ({ value: canvas.id, label: canvas.title }))} onChange={onBindingCanvasChange} />
                            <Button disabled={!bindingCanvasId} onClick={onBindCanvas}>
                                绑定
                            </Button>
                        </div>
                    ) : null}
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={onCreateCanvas}>
                        新建画布
                    </Button>
                </div>
            </div>

            {canvases.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {canvases.map((canvas) => (
                        <ProjectCanvasCard key={canvas.id} canvas={canvas} onEditPreset={onEditCanvasPreset} />
                    ))}
                </div>
            ) : (
                <section className="grid min-h-80 place-items-center rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-6 py-16 text-center">
                    <div>
                        <h3 className="text-2xl font-semibold text-[var(--studio-text-primary)]">这个项目还没有画布</h3>
                        <p className="mt-3 max-w-xl text-base leading-7 text-[var(--studio-text-secondary)]">新建画布后，它会显示在这里；从本集生产流程创建的承接画布也会自动归到当前项目。</p>
                        <Button className="mt-6" type="primary" icon={<Plus className="size-4" />} onClick={onCreateCanvas}>
                            新建画布
                        </Button>
                    </div>
                </section>
            )}
        </section>
    );
}

function ProjectCanvasCard({ canvas, onEditPreset }: { canvas: CanvasProject; onEditPreset: (canvasId: string) => void }) {
    const videoCount = canvas.nodes.filter((node) => node.type === "video").length;
    const imageCount = canvas.nodes.filter((node) => node.type === "image").length;
    return (
        <article className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="break-words text-lg font-semibold leading-6 text-[var(--studio-text-primary)]">{canvas.title}</h3>
                    <p className="mt-1 text-sm text-[var(--studio-text-muted)]">{canvasEpisodeLabel(canvas)}</p>
                </div>
                <Tag className="studio-tag">{canvas.nodes.length} 节点</Tag>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <CanvasCardStat label="图片" value={imageCount} />
                <CanvasCardStat label="视频" value={videoCount} />
                <CanvasCardStat label="连线" value={canvas.connections.length} />
            </div>
            <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--studio-text-secondary)]">{canvasProjectPresetSummary(canvas.preset)}</p>
            <div className="mt-3 text-xs text-[var(--studio-text-muted)]">更新时间：{formatProjectDate(canvas.updatedAt)}</div>
            <div className="mt-4 flex justify-end gap-2">
                <Button size="small" onClick={() => onEditPreset(canvas.id)}>
                    修改预设
                </Button>
                <Button size="small" type="primary" icon={<Maximize2 className="size-3.5" />} href={`/canvas/${canvas.id}`}>
                    进入画布
                </Button>
            </div>
        </article>
    );
}

function CanvasCardStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-3 py-2">
            <div className="text-xs text-[var(--studio-text-muted)]">{label}</div>
            <div className="mt-1 text-base font-semibold text-[var(--studio-text-primary)]">{value}</div>
        </div>
    );
}

function ProjectDetailNavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-pressed={active}
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-base font-semibold transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] text-[var(--studio-text-primary)] shadow-[0_0_0_1px_var(--studio-focus-ring)]" : "border-transparent text-[var(--studio-text-muted)] hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text-primary)]"}`}
            onClick={onClick}
        >
            <Icon className="size-4" />
            {label}
        </button>
    );
}

function ProjectProgressCard({ counts, currentEpisode, progress, total }: { counts: { done: number; draft: number; running: number }; currentEpisode?: ProjectEpisodeBoardRow; progress: number; total: number }) {
    return (
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 shadow-[var(--studio-shadow)]">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-[var(--studio-text-primary)]">整剧制作进度</h2>
                <div className="text-base font-semibold text-[var(--studio-accent)]">{currentEpisode ? episodeDisplayTitle(currentEpisode) : `共 ${total} 集`}</div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[var(--studio-elevated-bg)]">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--studio-accent),var(--studio-success))]" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm font-medium text-[var(--studio-text-muted)]">
                <span>已完成 {counts.done} 集</span>
                <span className="text-center">进行中 {counts.running} 集</span>
                <span className="text-right">草稿 {counts.draft} 集</span>
            </div>
        </section>
    );
}

function EpisodeFilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`h-9 rounded-md border px-4 text-sm font-medium transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-panel-bg)] text-[var(--studio-accent)] shadow-[inset_0_-2px_0_var(--studio-accent)]" : "border-[var(--studio-border-subtle)] bg-transparent text-[var(--studio-text-secondary)] hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text-primary)]"}`}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function ProjectEpisodeTable({
    rows,
    onEditTitle,
    onOpenCanvas,
    onOpenEpisode,
}: {
    rows: ProjectEpisodeBoardRow[];
    onEditTitle: (row: ProjectEpisodeBoardRow) => void;
    onOpenCanvas: (canvasId: string) => void;
    onOpenEpisode: (episodeId: string) => void;
}) {
    if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的分集" className="rounded-md border border-[var(--studio-border-subtle)] py-16 text-[var(--studio-text-muted)]" />;
    return (
        <>
            <div className="grid gap-3 md:hidden">
                {rows.map((row) => (
                    <ProjectEpisodeMobileCard key={row.id} row={row} onEditTitle={onEditTitle} onOpenCanvas={onOpenCanvas} onOpenEpisode={onOpenEpisode} />
                ))}
            </div>
            <section className="hidden overflow-x-auto rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] md:block">
                <div className="min-w-[1320px]">
                    <div className="grid grid-cols-[90px_minmax(180px,1.5fr)_100px_90px_80px_80px_80px_170px_190px] items-center gap-4 border-b border-[var(--studio-border-subtle)] px-5 py-3 text-sm font-semibold text-[var(--studio-text-muted)]">
                        <span>集数</span>
                        <span>标题</span>
                        <span>状态</span>
                        <span>阶段</span>
                        <span>镜头</span>
                        <span>画布</span>
                        <span>视频</span>
                        <span>完成度</span>
                        <span className="sticky right-0 z-20 bg-[var(--studio-panel-muted-bg)] text-right">操作</span>
                    </div>
                    <div className="divide-y divide-[var(--studio-border-subtle)]">
                        {rows.map((row) => {
                            const primaryCanvasId = row.primaryCanvasId;
                            const isRunning = row.filterStatus === "running";
                            return (
                                <div
                                    key={row.id}
                                    className={`grid grid-cols-[90px_minmax(180px,1.5fr)_100px_90px_80px_80px_80px_170px_190px] items-center gap-4 px-5 py-4 text-left transition hover:bg-[var(--studio-hover-bg)] ${isRunning ? "border-l-4 border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] pl-4" : ""}`}
                                >
                                    <span className="text-base font-semibold text-[var(--studio-text-muted)]">分集</span>
                                    <span className="min-w-0">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="min-w-0 break-words text-base font-semibold leading-6 text-[var(--studio-text-primary)]">{episodeDisplayTitle(row)}</span>
                                            <button
                                                type="button"
                                                className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--studio-text-muted)] transition hover:bg-[var(--studio-panel-bg)] hover:text-[var(--studio-accent)]"
                                                title="修改标题"
                                                aria-label={`修改 ${episodeDisplayTitle(row)} 标题`}
                                                onClick={() => onEditTitle(row)}
                                            >
                                                <Edit3 className="size-3.5" />
                                            </button>
                                        </span>
                                        <span className="mt-1 block text-sm text-[var(--studio-text-muted)]">{row.progress ? `最近更新 ${formatEpisodeDate(row.updatedAt)}` : "尚未开始"}</span>
                                    </span>
                                    <EpisodeStatusBadge status={row.status} />
                                    <span className="text-base font-semibold text-[var(--studio-text-secondary)]">{row.stage}</span>
                                    <span className="text-base font-semibold text-[var(--studio-text-secondary)]">{row.shotText}</span>
                                    <span className="text-base font-semibold text-[var(--studio-text-secondary)]">{row.canvasCount || "-"}</span>
                                    <span className="text-base font-semibold text-[var(--studio-text-secondary)]">{row.videoCount || "-"}</span>
                                    <span className="flex items-center gap-4">
                                        <span className="h-2 w-24 rounded-full bg-[var(--studio-elevated-bg)]">
                                            <span className="block h-full rounded-full bg-[linear-gradient(90deg,var(--studio-accent),var(--studio-success))]" style={{ width: `${row.progress}%` }} />
                                        </span>
                                        <span className="w-12 text-sm font-semibold text-[var(--studio-text-muted)]">{row.progress}%</span>
                                    </span>
                                    <span className={`sticky right-0 z-10 flex flex-wrap justify-end gap-2 border-l border-[var(--studio-border-subtle)] py-1 pl-4 ${isRunning ? "bg-[var(--studio-accent-soft)]" : "bg-[var(--studio-panel-muted-bg)]"}`}>
                                        <Button size="small" onClick={() => onOpenEpisode(row.id)}>
                                            视频工作流
                                        </Button>
                                        {primaryCanvasId ? (
                                            <Button size="small" icon={<Maximize2 className="size-3.5" />} onClick={() => onOpenCanvas(primaryCanvasId)}>
                                                画布
                                            </Button>
                                        ) : null}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>
        </>
    );
}

function ProjectEpisodeMobileCard({
    row,
    onEditTitle,
    onOpenCanvas,
    onOpenEpisode,
}: {
    row: ProjectEpisodeBoardRow;
    onEditTitle: (row: ProjectEpisodeBoardRow) => void;
    onOpenCanvas: (canvasId: string) => void;
    onOpenEpisode: (episodeId: string) => void;
}) {
    return (
        <article className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="mt-2 flex min-w-0 items-start gap-2">
                        <h3 className="min-w-0 break-words text-lg font-semibold leading-6 text-[var(--studio-text-primary)]">{episodeDisplayTitle(row)}</h3>
                        <button
                            type="button"
                            className="grid size-8 shrink-0 place-items-center rounded-md text-[var(--studio-text-muted)] transition hover:bg-[var(--studio-panel-bg)] hover:text-[var(--studio-accent)]"
                            title="修改标题"
                            aria-label={`修改 ${episodeDisplayTitle(row)} 标题`}
                            onClick={() => onEditTitle(row)}
                        >
                            <Edit3 className="size-4" />
                        </button>
                    </div>
                    <div className="mt-1 text-sm text-[var(--studio-text-muted)]">{row.progress ? `最近更新 ${formatEpisodeDate(row.updatedAt)}` : "尚未开始"}</div>
                </div>
                <EpisodeStatusBadge status={row.status} />
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
                <EpisodeMobileStat label="阶段" value={row.stage} />
                <EpisodeMobileStat label="镜头" value={row.shotText} />
                <EpisodeMobileStat label="画布" value={String(row.canvasCount || "-")} />
                <EpisodeMobileStat label="视频" value={String(row.videoCount || "-")} />
            </div>
            <div className="mt-4 flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-[var(--studio-elevated-bg)]">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--studio-accent),var(--studio-success))]" style={{ width: `${row.progress}%` }} />
                </div>
                <span className="w-10 text-right text-sm font-semibold text-[var(--studio-text-muted)]">{row.progress}%</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
                <Button onClick={() => onOpenEpisode(row.id)}>视频工作流</Button>
                <Button disabled={!row.primaryCanvasId} icon={<Maximize2 className="size-3.5" />} onClick={() => row.primaryCanvasId && onOpenCanvas(row.primaryCanvasId)}>
                    画布
                </Button>
            </div>
        </article>
    );
}

function EpisodeMobileStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-2 py-2">
            <div className="text-xs text-[var(--studio-text-muted)]">{label}</div>
            <div className="mt-1 truncate text-sm font-semibold text-[var(--studio-text-secondary)]">{value}</div>
        </div>
    );
}

const assetKindOptions: Array<{ label: string; value: AssetKind | "all" }> = [
    { label: "全部类型", value: "all" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
    { label: "文本", value: "text" },
];

const referenceTypeOptions: Array<{ label: string; value: ProjectAssetReferenceType | "all" }> = [
    { label: "全部引用", value: "all" },
    { label: "画布节点", value: "canvas" },
    { label: "分镜", value: "storyboard" },
    { label: "设定库", value: "production-bible" },
    { label: "生成结果", value: "generation-result" },
];

const versionStatusOptions: Array<{ label: string; value: NonNullable<ProjectAssetReferenceFilters["versionStatus"]> }> = [
    { label: "全部版本", value: "all" },
    { label: "有过期引用", value: "outdated" },
    { label: "最新引用", value: "latest" },
];

const fileStatusOptions: Array<{ label: string; value: NonNullable<ProjectAssetReferenceFilters["fileStatus"]> }> = [
    { label: "全部文件", value: "all" },
    { label: "本地文件缺失", value: "missing" },
    { label: "本地文件可用", value: "available" },
];

const projectLibraryOptions: Array<{ label: string; value: NonNullable<ProjectAssetReferenceFilters["projectLibraryStatus"]> }> = [
    { label: "全部素材", value: "all" },
    { label: "已在项目库", value: "shared" },
    { label: "未加入项目库", value: "not_shared" },
];

function assetKindLabel(kind: AssetKind) {
    return assetKindOptions.find((option) => option.value === kind)?.label || "素材";
}

function referenceTypeLabel(type: ProjectAssetReferenceType) {
    return referenceTypeOptions.find((option) => option.value === type)?.label || "引用";
}

function projectAssetDetailHref(projectId: string, assetId: string) {
    const returnTo = `/projects/${projectId}`;
    return `/assets?projectId=${encodeURIComponent(projectId)}&assetId=${encodeURIComponent(assetId)}&returnTo=${encodeURIComponent(returnTo)}&returnLabel=${encodeURIComponent("返回项目")}`;
}

function projectReferenceAction(projectId: string, reference: ProjectAssetReferenceItem) {
    if ((reference.type === "storyboard" || reference.type === "production-bible") && reference.episodeId) return { href: `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(reference.episodeId)}/workflow`, label: "打开工作流" };
    if (reference.canvasId) return { href: `/canvas/${encodeURIComponent(reference.canvasId)}`, label: "打开画布" };
    return undefined;
}

function agentTaskStatusLabel(status: "pending" | "applied" | "cancelled") {
    if (status === "applied") return "已应用";
    if (status === "cancelled") return "已取消";
    return "待确认";
}

function agentTaskStatusColor(status: "pending" | "applied" | "cancelled") {
    if (status === "applied") return "success";
    if (status === "cancelled") return "default";
    return "processing";
}

function EpisodeStatusBadge({ status }: { status: ProjectEpisodeBoardRow["status"] }) {
    const className = status === "已完成" ? "studio-semantic-success studio-semantic-tag" : status === "进行中" ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]" : "studio-semantic-warning studio-semantic-tag";
    return <span className={`w-fit rounded-md border px-2.5 py-1 text-sm font-semibold ${className}`}>{status}</span>;
}

function ProjectEpisodeEmpty({ onCreate, onCreateCanvas }: { onCreate: () => void; onCreateCanvas: () => void }) {
    return (
        <section className="grid min-h-80 place-items-center rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-6 py-16 text-center">
            <div>
                <h2 className="text-2xl font-semibold text-[var(--studio-text-primary)]">还没有分集</h2>
                <p className="mt-3 max-w-xl text-base leading-7 text-[var(--studio-text-secondary)]">先新建或导入第一集剧本，后续导演分析、分镜审核、视频生成都会围绕分集推进。</p>
                <div className="mt-6 flex justify-center gap-3">
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={onCreate}>
                        新建分集
                    </Button>
                    <Button onClick={onCreateCanvas}>创建画布</Button>
                </div>
            </div>
        </section>
    );
}

function episodeDisplayTitle(row: Pick<ProjectEpisodeBoardRow, "title">) {
    return row.title.trim() || "未命名集数";
}

function currentEpisodeStatusText(row: ProjectEpisodeBoardRow) {
    if (row.stage === "分镜") return "分镜审核中";
    if (row.stage === "成片") return "成片完成";
    if (row.stage === "剧本") return "剧本整理中";
    return "尚未开始";
}

function formatEpisodeDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatProjectDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
