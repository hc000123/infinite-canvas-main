"use client";

import Link from "next/link";
import { Button, Empty, Select, Tag } from "antd";
import { Maximize2, Plus } from "lucide-react";

import { canvasEpisodeLabel } from "../../../canvas/utils/canvas-episode-context";
import { canvasProjectPresetSummary } from "../../../canvas/utils/canvas-project-preset";
import type { CanvasProject } from "../../../canvas/stores/use-canvas-store";

export type ProjectEpisodeBoardRow = {
    actionLabel: string;
    canvasCount: number;
    filterStatus: "done" | "draft" | "running";
    id: string;
    order: number;
    progress: number;
    shotText: string;
    stage: "分镜" | "剧本" | "成片" | "未开始";
    status: "已完成" | "草稿" | "进行中";
    title: string;
    updatedAt: string;
    videoCount: number;
    primaryCanvasId?: string;
};

type EpisodeFilter = "all" | "done" | "draft" | "running";

type ProjectEpisodeBoardProps = {
    activeTab: string;
    currentEpisode?: ProjectEpisodeBoardRow;
    counts: { all: number; done: number; draft: number; running: number };
    description: string;
    episodeFilter: EpisodeFilter;
    filteredRows: ProjectEpisodeBoardRow[];
    progress: number;
    canvases: CanvasProject[];
    unboundCanvases: CanvasProject[];
    bindingCanvasId: string;
    projectTitle: string;
    presetSummary: string;
    rows: ProjectEpisodeBoardRow[];
    onBindCanvas: () => void;
    onBindingCanvasChange: (canvasId: string) => void;
    onCreateCanvas: () => void;
    onEditCanvasPreset: (canvasId: string) => void;
    onEditProject: () => void;
    onFilterChange: (filter: EpisodeFilter) => void;
    onImportEpisode: () => void;
    onOpenCanvasById: (canvasId: string) => void;
    onOpenEpisode: (episodeId: string) => void;
    onTabChange: (tab: string) => void;
};

export function ProjectEpisodeBoard({
    activeTab,
    currentEpisode,
    counts,
    description,
    episodeFilter,
    filteredRows,
    progress,
    canvases,
    unboundCanvases,
    bindingCanvasId,
    projectTitle,
    presetSummary,
    rows,
    onBindCanvas,
    onBindingCanvasChange,
    onCreateCanvas,
    onEditCanvasPreset,
    onEditProject,
    onFilterChange,
    onImportEpisode,
    onOpenCanvasById,
    onOpenEpisode,
    onTabChange,
}: ProjectEpisodeBoardProps) {
    const currentText = currentEpisode ? `第 ${formatEpisodeOrder(currentEpisode.order)} 集 · ${currentEpisodeStatusText(currentEpisode)}` : "暂无分集";
    return (
        <div className="mx-auto min-h-full max-w-[1680px] rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)]">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--studio-border-subtle)] px-8 py-4">
                <nav className="flex flex-wrap items-center gap-4">
                    <ProjectDetailNavButton active={activeTab === "episodes"} label="分集" onClick={() => onTabChange("episodes")} />
                    <ProjectDetailNavButton active={activeTab === "canvas"} label="画布" onClick={() => onTabChange("canvas")} />
                </nav>

                <div className="flex min-w-0 flex-1 justify-center">
                    <div className="max-w-full rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-5 py-2 text-center text-base font-medium text-[var(--studio-text-secondary)]">
                        <span className="text-[var(--studio-text-muted)]">当前制作到</span>
                        <span className="ml-2 break-words text-[var(--studio-text-primary)]">{currentText}</span>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                    <Button className="h-11 px-5" onClick={onEditProject}>
                        编辑项目
                    </Button>
                    <Button type="primary" className="h-11 px-5" icon={<Plus className="size-4" />} onClick={onImportEpisode}>
                        新建分集
                    </Button>
                </div>
            </header>

            <section className="grid gap-5 px-8 py-6">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
                    <div className="min-w-0">
                        <Link href="/projects" className="text-base font-semibold leading-6 text-[var(--studio-accent)] hover:text-[var(--studio-accent-strong)]">
                            项目工作台 / {projectTitle}
                        </Link>
                        <h1 className="mt-2 break-words text-3xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">{projectTitle}</h1>
                        <p className="mt-2 max-w-4xl whitespace-pre-wrap break-words text-base leading-6 text-[var(--studio-text-secondary)]">{description || presetSummary}</p>
                    </div>
                    <ProjectProgressCard counts={counts} currentEpisode={currentEpisode} progress={progress} total={rows.length} />
                </div>

                {activeTab === "canvas" ? (
                    <ProjectCanvasList
                        canvases={canvases}
                        unboundCanvases={unboundCanvases}
                        bindingCanvasId={bindingCanvasId}
                        onBindCanvas={onBindCanvas}
                        onBindingCanvasChange={onBindingCanvasChange}
                        onCreateCanvas={onCreateCanvas}
                        onEditCanvasPreset={onEditCanvasPreset}
                        onOpenCanvas={onOpenCanvasById}
                    />
                ) : (
                    <>
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <h2 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)]">分集列表</h2>
                            <div className="flex flex-wrap gap-3">
                                <EpisodeFilterButton active={episodeFilter === "all"} label="全部" onClick={() => onFilterChange("all")} />
                                <EpisodeFilterButton active={episodeFilter === "running"} label="进行中" onClick={() => onFilterChange("running")} />
                                <EpisodeFilterButton active={episodeFilter === "done"} label="已完成" onClick={() => onFilterChange("done")} />
                                <EpisodeFilterButton active={episodeFilter === "draft"} label="草稿" onClick={() => onFilterChange("draft")} />
                            </div>
                        </div>

                        {rows.length ? <ProjectEpisodeTable rows={filteredRows} onOpenCanvas={onOpenCanvasById} onOpenEpisode={onOpenEpisode} /> : <ProjectEpisodeEmpty onCreate={onImportEpisode} onCreateCanvas={onCreateCanvas} />}
                    </>
                )}
            </section>
        </div>
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
    onOpenCanvas,
}: {
    canvases: CanvasProject[];
    unboundCanvases: CanvasProject[];
    bindingCanvasId: string;
    onBindCanvas: () => void;
    onBindingCanvasChange: (canvasId: string) => void;
    onCreateCanvas: () => void;
    onEditCanvasPreset: (canvasId: string) => void;
    onOpenCanvas: (canvasId: string) => void;
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
                        <ProjectCanvasCard key={canvas.id} canvas={canvas} onEditPreset={onEditCanvasPreset} onOpen={onOpenCanvas} />
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

function ProjectCanvasCard({ canvas, onEditPreset, onOpen }: { canvas: CanvasProject; onEditPreset: (canvasId: string) => void; onOpen: (canvasId: string) => void }) {
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
                <Button size="small" type="primary" icon={<Maximize2 className="size-3.5" />} onClick={() => onOpen(canvas.id)}>
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

function ProjectDetailNavButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-base font-semibold transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] text-[var(--studio-text-primary)] shadow-[0_0_0_1px_rgba(111,168,255,0.12)]" : "border-transparent text-[var(--studio-text-muted)] hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text-primary)]"}`}
            onClick={onClick}
        >
            <span className={`size-4 rounded-sm border ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-text-muted)]"}`} />
            {label}
        </button>
    );
}

function ProjectProgressCard({ counts, currentEpisode, progress, total }: { counts: { done: number; draft: number; running: number }; currentEpisode?: ProjectEpisodeBoardRow; progress: number; total: number }) {
    return (
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 shadow-[var(--studio-shadow)]">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-[var(--studio-text-primary)]">整剧制作进度</h2>
                <div className="text-base font-semibold text-[var(--studio-accent)]">
                    第 {formatEpisodeOrder(currentEpisode?.order || 0)} / {String(total).padStart(2, "0")} 集
                </div>
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

function ProjectEpisodeTable({ rows, onOpenCanvas, onOpenEpisode }: { rows: ProjectEpisodeBoardRow[]; onOpenCanvas: (canvasId: string) => void; onOpenEpisode: (episodeId: string) => void }) {
    if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的分集" className="rounded-md border border-[var(--studio-border-subtle)] py-16 text-[var(--studio-text-muted)]" />;
    return (
        <section className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
            <div className="grid grid-cols-[90px_minmax(180px,1.5fr)_100px_90px_80px_80px_80px_170px_112px] items-center gap-4 border-b border-[var(--studio-border-subtle)] px-5 py-3 text-sm font-semibold text-[var(--studio-text-muted)]">
                <span>集数</span>
                <span>标题</span>
                <span>状态</span>
                <span>阶段</span>
                <span>镜头</span>
                <span>画布</span>
                <span>视频</span>
                <span>完成度</span>
                <span>操作</span>
            </div>
            <div className="divide-y divide-[var(--studio-border-subtle)]">
                {rows.map((row) => {
                    const primaryCanvasId = row.primaryCanvasId;
                    return (
                        <div
                            key={row.id}
                            role="button"
                            tabIndex={0}
                            className={`grid w-full cursor-pointer grid-cols-[90px_minmax(180px,1.5fr)_100px_90px_80px_80px_80px_170px_112px] items-center gap-4 px-5 py-4 text-left transition hover:bg-[rgba(255,255,255,0.025)] ${row.filterStatus === "running" ? "border-l-4 border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] pl-4" : ""}`}
                            onClick={() => onOpenEpisode(row.id)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") onOpenEpisode(row.id);
                            }}
                        >
                            <span className="text-base font-semibold text-[var(--studio-text-muted)]">第 {formatEpisodeOrder(row.order)} 集</span>
                            <span className="min-w-0">
                                <span className="block break-words text-base font-semibold leading-6 text-[var(--studio-text-primary)]">{row.title}</span>
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
                            {primaryCanvasId ? (
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<Maximize2 className="size-3.5" />}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onOpenCanvas(primaryCanvasId);
                                    }}
                                >
                                    进入画布
                                </Button>
                            ) : (
                                <Button
                                    size="small"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onOpenEpisode(row.id);
                                    }}
                                >
                                    进入流程
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function EpisodeStatusBadge({ status }: { status: ProjectEpisodeBoardRow["status"] }) {
    const className =
        status === "已完成"
            ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-300"
            : status === "进行中"
              ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]"
              : "border-amber-400/40 bg-amber-400/12 text-amber-300";
    return <span className={`w-fit rounded-md border px-2.5 py-1 text-sm font-semibold ${className}`}>{status}</span>;
}

function ProjectEpisodeEmpty({ onCreate, onCreateCanvas }: { onCreate: () => void; onCreateCanvas: () => void }) {
    return (
        <section className="grid min-h-80 place-items-center rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-6 py-16 text-center">
            <div>
                <h2 className="text-2xl font-semibold text-[var(--studio-text-primary)]">还没有分集</h2>
                <p className="mt-3 max-w-xl text-base leading-7 text-[var(--studio-text-secondary)]">先新建或导入第一集剧本，后续导演分析、分镜审核、画布承接都会围绕分集推进。</p>
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

function currentEpisodeStatusText(row: ProjectEpisodeBoardRow) {
    if (row.stage === "分镜") return "分镜审核中";
    if (row.stage === "成片") return "成片完成";
    if (row.stage === "剧本") return "剧本整理中";
    return "尚未开始";
}

function formatEpisodeOrder(order: number) {
    return String(order || 0).padStart(2, "0");
}

function formatEpisodeDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatProjectDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
