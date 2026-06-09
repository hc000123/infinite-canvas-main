"use client";

import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input, Tooltip } from "antd";
import { Archive, ChevronDown, Clock3, Edit3, Folder, Grid2X2, LayoutList, PauseCircle, Plus, RotateCcw, Search, Trash2 } from "lucide-react";

import { useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasCreateProjectModal } from "../canvas/components/canvas-create-project-modal";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../canvas/utils/canvas-project-preset";
import { canvasIdsForCreativeProject, type CreativeProject } from "./creative-projects";
import { shouldOpenProjectCardFromTarget } from "./project-card-navigation";
import { useCreativeProjectStore } from "./use-creative-project-store";

type ProjectCardView = {
    canvasCount: number;
    meta: ProjectVisualMeta;
    project: CreativeProject;
};

type ProjectVisualMeta = {
    coverUrl: string;
    statusLabel: "进行中" | "暂停中" | "草稿";
};

type ProjectStatusFilter = "全部项目" | ProjectVisualMeta["statusLabel"];

const coverUrls = [
    "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80&sat=-30",
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1587953427769-4b6d2f840bf6?auto=format&fit=crop&w=900&q=80",
];

const createProjectButtonClass =
    "border-0 !bg-[var(--studio-accent)] !text-[var(--primary-foreground)] shadow-none hover:!bg-[var(--studio-accent-hover)] hover:!text-[var(--primary-foreground)] focus:!text-[var(--primary-foreground)] active:!text-[var(--primary-foreground)] disabled:!bg-[var(--studio-accent)] disabled:!text-[var(--primary-foreground)] disabled:!opacity-60";

export default function ProjectsPage() {
    const router = useRouter();
    const { modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState("");
    const [editingTitle, setEditingTitle] = useState("");
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("全部项目");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const hydrated = useCreativeProjectStore((state) => state.hydrated);
    const projects = useCreativeProjectStore((state) => state.projects);
    const createProject = useCreativeProjectStore((state) => state.createProject);
    const renameProject = useCreativeProjectStore((state) => state.renameProject);
    const archiveProject = useCreativeProjectStore((state) => state.archiveProject);
    const restoreProject = useCreativeProjectStore((state) => state.restoreProject);
    const deleteProject = useCreativeProjectStore((state) => state.deleteProject);
    const canvases = useCanvasStore((state) => state.projects);
    const updateCanvasProject = useCanvasStore((state) => state.updateProject);
    const sortedProjects = useMemo(() => [...projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [projects]);
    const projectCards = useMemo<ProjectCardView[]>(
        () =>
            sortedProjects.map((project, index) => {
                const canvasCount = canvasIdsForCreativeProject(project, canvases).length;
                return { project, canvasCount, meta: projectVisualMeta(project, index, canvasCount) };
            }),
        [canvases, sortedProjects],
    );
    const filteredCards = useMemo(() => {
        const keyword = searchText.trim().toLowerCase();
        return projectCards.filter(({ project, meta }) => {
            if (statusFilter !== "全部项目" && meta.statusLabel !== statusFilter) return false;
            if (!keyword) return true;
            return `${project.title} ${project.description} ${meta.statusLabel} ${canvasProjectPresetSummary(project.preset)}`.toLowerCase().includes(keyword);
        });
    }, [projectCards, searchText, statusFilter]);
    const stats = useMemo(() => {
        const countByStatus = (status: ProjectVisualMeta["statusLabel"]) => projectCards.filter((card) => card.meta.statusLabel === status).length;
        return {
            all: projectCards.length,
            running: countByStatus("进行中"),
            paused: countByStatus("暂停中"),
            draft: countByStatus("草稿"),
        };
    }, [projectCards]);
    const defaultTitle = `创作项目 ${projects.length + 1}`;

    const createAndOpen = (title: string, preset: CanvasProjectPreset) => {
        const id = createProject({ title, preset });
        setCreateOpen(false);
        router.push(`/projects/${id}`);
    };

    const removeProject = (project: CreativeProject) => {
        modal.confirm({
            title: "删除项目？",
            content: "只会删除项目入口和关联关系，不会删除已有画布、素材、剧本或分镜数据。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                canvases.filter((canvas) => canvas.projectId === project.id).forEach((canvas) => updateCanvasProject(canvas.id, { projectId: undefined }));
                deleteProject(project.id);
            },
        });
    };

    return (
        <>
            <section className="studio-shell h-full min-h-0 overflow-y-auto px-5 py-7 md:px-7 xl:px-8">
                <header className="flex flex-wrap items-start justify-between gap-5 2xl:flex-nowrap">
                    <div>
                        <h1 className="text-3xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">项目工作台</h1>
                        <p className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">管理你的影视创作项目与进度</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <Input
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                            placeholder="搜索项目名称、简介、标签…"
                            prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />}
                            className="h-11 w-[340px] max-w-full rounded-lg border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-[var(--studio-text-primary)] placeholder:text-[var(--studio-text-muted)]"
                            style={{ width: 340 }}
                        />
                        <div className="flex h-11 overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-1">
                            <button type="button" className={`grid size-9 place-items-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)] ${viewMode === "grid" ? "bg-[var(--studio-accent-soft)] text-[var(--studio-accent)] ring-1 ring-[var(--studio-border-strong)]" : "text-[var(--studio-text-muted)] hover:text-[var(--studio-text-primary)]"}`} onClick={() => setViewMode("grid")} aria-label="网格视图">
                                <Grid2X2 className="size-4" />
                            </button>
                            <button type="button" className={`grid size-9 place-items-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)] ${viewMode === "list" ? "bg-[var(--studio-accent-soft)] text-[var(--studio-accent)] ring-1 ring-[var(--studio-border-strong)]" : "text-[var(--studio-text-muted)] hover:text-[var(--studio-text-primary)]"}`} onClick={() => setViewMode("list")} aria-label="列表视图">
                                <LayoutList className="size-4" />
                            </button>
                        </div>
                        <Button className={`h-11 px-5 ${createProjectButtonClass}`} icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)} disabled={!hydrated}>
                            新建项目
                            <ChevronDown className="ml-1 size-4" />
                        </Button>
                    </div>
                </header>

                    <ProjectStatsBar activeFilter={statusFilter} onFilterChange={setStatusFilter} stats={stats} />

                    {!hydrated ? (
                        <section className="studio-panel mt-7 flex min-h-[420px] items-center justify-center text-sm text-[var(--studio-text-muted)]">正在加载项目...</section>
                    ) : filteredCards.length ? (
                        <>
                            <div className={`mt-7 ${viewMode === "grid" ? "grid gap-5 lg:grid-cols-2 2xl:grid-cols-4" : "grid gap-4"}`}>
                                {filteredCards.map((card) => (
                                    <ProjectCard
                                        key={card.project.id}
                                        card={card}
                                        editing={editingId === card.project.id}
                                        editingTitle={editingTitle}
                                        listMode={viewMode === "list"}
                                        onEditingTitleChange={setEditingTitle}
                                        onEdit={() => {
                                            setEditingId(card.project.id);
                                            setEditingTitle(card.project.title);
                                        }}
                                        onSave={() => {
                                            renameProject(card.project.id, editingTitle);
                                            setEditingId("");
                                        }}
                                        onCancel={() => setEditingId("")}
                                        onArchive={() => archiveProject(card.project.id)}
                                        onRestore={() => restoreProject(card.project.id)}
                                        onDelete={() => removeProject(card.project)}
                                        onOpen={() => router.push(`/projects/${card.project.id}`)}
                                    />
                                ))}
                            </div>
                            <ProjectPagination count={filteredCards.length} />
                        </>
                    ) : (
                        <section className="studio-panel mt-7 flex min-h-[420px] flex-col items-center justify-center text-center">
                            <Folder className="size-11 text-[var(--studio-text-muted)]" />
                            <h2 className="mt-4 text-xl font-medium text-[var(--studio-text-primary)]">没有匹配的项目</h2>
                            <p className="mt-3 text-sm text-[var(--studio-text-secondary)]">可以清空搜索条件，或新建一个项目开始制作。</p>
                            <Button className={`mt-6 ${createProjectButtonClass}`} icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                                新建项目
                            </Button>
                        </section>
                    )}
            </section>

            <CanvasCreateProjectModal
                open={createOpen}
                defaultTitle={defaultTitle}
                config={effectiveConfig}
                modalTitle="新建项目"
                nameLabel="项目名称"
                namePlaceholder="例如：毕业季短剧第一季"
                okText="创建项目"
                helperText="项目预设会传递给从项目内新建的画布，并作为后续生成配置的默认参考。"
                onCancel={() => setCreateOpen(false)}
                onCreate={createAndOpen}
            />
        </>
    );
}

function ProjectStatsBar({ activeFilter, onFilterChange, stats }: { activeFilter: ProjectStatusFilter; onFilterChange: (filter: ProjectStatusFilter) => void; stats: { all: number; draft: number; paused: number; running: number } }) {
    return (
        <section className="studio-panel mt-8 grid gap-3 p-3 md:grid-cols-4">
            <ProjectStat active={activeFilter === "全部项目"} icon={<Folder className="size-5" />} label="全部项目" onClick={() => onFilterChange("全部项目")} value={stats.all} tone="slate" />
            <ProjectStat active={activeFilter === "进行中"} icon={<Clock3 className="size-5" />} label="进行中" onClick={() => onFilterChange("进行中")} value={stats.running} tone="cyan" />
            <ProjectStat active={activeFilter === "暂停中"} icon={<PauseCircle className="size-5" />} label="暂停中" onClick={() => onFilterChange("暂停中")} value={stats.paused} tone="amber" />
            <ProjectStat active={activeFilter === "草稿"} icon={<Edit3 className="size-5" />} label="草稿" onClick={() => onFilterChange("草稿")} value={stats.draft} tone="blue" />
        </section>
    );
}

function ProjectStat({ active, icon, label, onClick, value, tone }: { active: boolean; icon: ReactNode; label: ProjectStatusFilter; onClick: () => void; value: number; tone: "amber" | "blue" | "cyan" | "slate" }) {
    const toneClass = {
        amber: "bg-amber-400/14 text-[var(--studio-warning)]",
        blue: "bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]",
        cyan: "bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]",
        slate: "bg-[var(--studio-panel-muted-bg)] text-[var(--studio-text-secondary)]",
    }[tone];
    return (
        <button
            type="button"
            className={`flex items-center gap-4 rounded-lg border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)] ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-transparent hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-panel-muted-bg)]"}`}
            aria-pressed={active}
            onClick={onClick}
        >
            <span className={`grid size-11 place-items-center rounded-lg ${toneClass}`}>{icon}</span>
            <div>
                <div className="text-sm text-[var(--studio-text-secondary)]">{label}</div>
                <div className="mt-1 text-2xl font-semibold leading-none text-[var(--studio-text-primary)]">{value}</div>
            </div>
        </button>
    );
}

function ProjectCard({
    card,
    editing,
    editingTitle,
    listMode,
    onEditingTitleChange,
    onEdit,
    onSave,
    onCancel,
    onArchive,
    onRestore,
    onDelete,
    onOpen,
}: {
    card: ProjectCardView;
    editing: boolean;
    editingTitle: string;
    listMode: boolean;
    onEditingTitleChange: (title: string) => void;
    onEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    onArchive: () => void;
    onRestore: () => void;
    onDelete: () => void;
    onOpen: () => void;
}) {
    const { project, canvasCount, meta } = card;
    const openable = !editing;
    const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
        if (openable && shouldOpenProjectCardFromTarget(event.target)) onOpen();
    };
    const handleCardKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
        if (!openable || !shouldOpenProjectCardFromTarget(event.target)) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
    };

    return (
        <article
            className={`group overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)] transition hover:-translate-y-0.5 hover:border-[var(--studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--studio-shell-bg)] ${openable ? "cursor-pointer" : ""} ${listMode ? "grid md:grid-cols-[320px_minmax(0,1fr)]" : ""}`}
            role={openable ? "link" : undefined}
            tabIndex={openable ? 0 : undefined}
            aria-label={openable ? `打开项目 ${project.title}` : undefined}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
        >
            <div className={`relative ${listMode ? "min-h-full" : "h-36"}`}>
                <div className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.03]" style={{ backgroundImage: `linear-gradient(180deg,rgba(8,13,20,0.05),rgba(8,13,20,0.36)), url(${meta.coverUrl})` }} />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.32))]" />
                <div className="absolute left-3 top-3">
                    <ProjectStatusBadge status={meta.statusLabel} />
                </div>
            </div>

            <div className="p-4">
                <div className="min-w-0">
                    {editing ? <Input value={editingTitle} autoFocus onChange={(event) => onEditingTitleChange(event.target.value)} onPressEnter={onSave} /> : <h2 className="break-words text-xl font-semibold leading-7 text-[var(--studio-text-primary)]">{project.title}</h2>}
                    {project.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--studio-text-secondary)]">{project.description}</p> : null}
                    <p className="mt-2 break-words text-xs leading-5 text-[var(--studio-text-muted)]">{canvasProjectPresetSummary(project.preset)}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-1.5 text-xs text-[var(--studio-text-secondary)]">
                        <Folder className="size-3.5" />
                        画布 {canvasCount}
                    </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--studio-border-subtle)] pt-3">
                    <span className="text-xs text-[var(--studio-text-muted)]">更新时间：{formatProjectDate(project.updatedAt)}</span>
                    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        {editing ? (
                            <>
                                <Button size="small" type="primary" onClick={onSave}>
                                    保存
                                </Button>
                                <Button size="small" onClick={onCancel}>
                                    取消
                                </Button>
                            </>
                        ) : project.status === "archived" ? (
                            <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRestore}>
                                恢复
                            </Button>
                        ) : (
                            <>
                                <ProjectActionIconButton title="重命名项目" icon={<Edit3 className="size-4" />} onClick={onEdit} />
                                <ProjectActionIconButton title="归档项目" icon={<Archive className="size-4" />} onClick={onArchive} />
                                <ProjectActionIconButton title="删除项目" icon={<Trash2 className="size-4" />} danger onClick={onDelete} />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

function ProjectActionIconButton({ title, icon, danger, onClick }: { title: string; icon: ReactNode; danger?: boolean; onClick: () => void }) {
    return (
        <Tooltip title={<span className="text-slate-50">{title}</span>} overlayClassName="project-card-action-tooltip" overlayInnerStyle={{ color: "#f8fafc" }}>
            <Button type="text" size="small" shape="circle" icon={icon} danger={danger} onClick={onClick} aria-label={title} />
        </Tooltip>
    );
}

function ProjectPagination({ count }: { count: number }) {
    return (
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm text-[var(--studio-text-secondary)]">
            <span>共 {count} 项</span>
            <div className="flex items-center gap-3">
                <Button size="small" className="border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-[var(--studio-text-muted)]" disabled>
                    ‹
                </Button>
                <Button size="small" className="border-[var(--studio-border-strong)] bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]">
                    1
                </Button>
                <Button size="small" className="border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-[var(--studio-text-secondary)]">
                    2
                </Button>
                <Button size="small" className="border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-[var(--studio-text-secondary)]">
                    3
                </Button>
                <Button size="small" className="border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-[var(--studio-text-secondary)]">
                    ›
                </Button>
                <Button size="small" className="border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-[var(--studio-text-secondary)]">
                    10 条/页
                    <ChevronDown className="ml-1 size-3.5" />
                </Button>
                <span>跳至</span>
                <Input value="1" readOnly className="h-8 w-16 rounded-md border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-center text-[var(--studio-text-primary)]" />
                <span>页</span>
            </div>
        </footer>
    );
}

function projectVisualMeta(project: CreativeProject, index: number, canvasCount: number): ProjectVisualMeta {
    if (project.status === "archived") {
        return {
            coverUrl: coverUrls[index % coverUrls.length],
            statusLabel: "暂停中",
        };
    }
    const hasCanvas = canvasCount > 0;
    return {
        coverUrl: coverUrls[index % coverUrls.length],
        statusLabel: hasCanvas ? "进行中" : "草稿",
    };
}

function ProjectStatusBadge({ status }: { status: ProjectVisualMeta["statusLabel"] }) {
    const tone = {
        暂停中: "border-amber-300/30 bg-[#2c2318]/90 text-amber-100 before:bg-amber-300",
        草稿: "border-sky-300/28 bg-[#172337]/90 text-sky-100 before:bg-sky-300",
        进行中: "border-emerald-300/28 bg-[#102820]/90 text-emerald-100 before:bg-emerald-300",
    }[status];
    return <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold shadow-[0_8px_22px_rgba(0,0,0,0.28)] backdrop-blur-md before:block before:size-1.5 before:rounded-full ${tone}`}>{status}</span>;
}

function formatProjectDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
