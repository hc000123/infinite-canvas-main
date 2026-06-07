"use client";

import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input, Tag } from "antd";
import { Archive, Bell, CheckCircle2, ChevronDown, CircleDot, Clock3, Edit3, FileText, Filter, Folder, Grid2X2, HelpCircle, Home, ImagePlus, LayoutList, MoreHorizontal, PauseCircle, Plus, RotateCcw, Search, Settings, Trash2, Video } from "lucide-react";

import { useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasCreateProjectModal } from "../canvas/components/canvas-create-project-modal";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../canvas/utils/canvas-project-preset";
import { UNFILED_CREATIVE_PROJECT_TITLE, canvasIdsForCreativeProject, unfiledCanvasProjects, type CreativeProject } from "./creative-projects";
import { shouldOpenProjectCardFromTarget } from "./project-card-navigation";
import { useCreativeProjectStore } from "./use-creative-project-store";

type ProjectCardView = {
    canvasCount: number;
    meta: ProjectVisualMeta;
    project: CreativeProject;
};

type ProjectVisualMeta = {
    coverUrl: string;
    episodeCount: number;
    genre: string;
    progress: number;
    progressClass: string;
    shotText: string;
    statusClass: string;
    statusIcon: ReactNode;
    statusLabel: "进行中" | "已完成" | "暂停中" | "草稿";
};

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

const genres = ["科幻", "剧情", "古装", "奇幻", "悬疑", "文艺", "战争", "青春"];

export default function ProjectsPage() {
    const router = useRouter();
    const { modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState("");
    const [editingTitle, setEditingTitle] = useState("");
    const [searchText, setSearchText] = useState("");
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
    const unfiledCanvases = useMemo(() => unfiledCanvasProjects(canvases, projects), [canvases, projects]);
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
        if (!keyword) return projectCards;
        return projectCards.filter(({ project, meta }) => `${project.title} ${project.description} ${meta.genre} ${canvasProjectPresetSummary(project.preset)}`.toLowerCase().includes(keyword));
    }, [projectCards, searchText]);
    const stats = useMemo(() => {
        const countByStatus = (status: ProjectVisualMeta["statusLabel"]) => projectCards.filter((card) => card.meta.statusLabel === status).length;
        return {
            all: projectCards.length,
            running: countByStatus("进行中"),
            done: countByStatus("已完成"),
            paused: countByStatus("暂停中"),
            draft: countByStatus("草稿") + unfiledCanvases.length,
        };
    }, [projectCards, unfiledCanvases.length]);
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
        <main className="h-full overflow-hidden bg-[#080d14] text-slate-100">
            <div className="grid h-full min-h-0 grid-cols-[248px_minmax(0,1fr)]">
                <ProjectSidebar />

                <section className="min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_20%_0%,rgba(20,184,166,0.12),transparent_28%),linear-gradient(180deg,#0b111b_0%,#080d14_100%)] px-8 py-7">
                    <header className="flex flex-wrap items-start justify-between gap-5 2xl:flex-nowrap">
                        <div>
                            <h1 className="text-3xl font-semibold leading-tight tracking-normal text-white">项目工作台</h1>
                            <p className="mt-2 text-sm leading-6 text-slate-400">管理你的影视创作项目与进度</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                            <Input
                                value={searchText}
                                onChange={(event) => setSearchText(event.target.value)}
                                placeholder="搜索项目名称、简介、标签..."
                                prefix={<Search className="size-4 text-slate-500" />}
                                className="h-11 w-[340px] max-w-full rounded-lg border-slate-700/80 bg-[#0b111b]/80 text-slate-100 placeholder:text-slate-500"
                                style={{ width: 340 }}
                            />
                            <Button className="h-11 border-slate-700/80 bg-[#0b111b]/80 text-slate-100" icon={<Filter className="size-4" />}>
                                筛选
                            </Button>
                            <div className="flex h-11 overflow-hidden rounded-lg border border-slate-700/80 bg-[#0b111b]/80 p-1">
                                <button type="button" className={`grid size-9 place-items-center rounded-md transition ${viewMode === "grid" ? "bg-cyan-500/18 text-cyan-300 ring-1 ring-cyan-400/35" : "text-slate-400 hover:text-white"}`} onClick={() => setViewMode("grid")} aria-label="网格视图">
                                    <Grid2X2 className="size-4" />
                                </button>
                                <button type="button" className={`grid size-9 place-items-center rounded-md transition ${viewMode === "list" ? "bg-cyan-500/18 text-cyan-300 ring-1 ring-cyan-400/35" : "text-slate-400 hover:text-white"}`} onClick={() => setViewMode("list")} aria-label="列表视图">
                                    <LayoutList className="size-4" />
                                </button>
                            </div>
                            <Button className="h-11 border-0 bg-cyan-500 px-5 text-slate-950 shadow-[0_14px_34px_rgba(6,182,212,0.28)] hover:!bg-cyan-400" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)} disabled={!hydrated}>
                                新建项目
                                <ChevronDown className="ml-1 size-4" />
                            </Button>
                        </div>
                    </header>

                    <ProjectStatsBar stats={stats} />

                    {!hydrated ? (
                        <section className="mt-7 flex min-h-[420px] items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/45 text-sm text-slate-400">正在加载项目...</section>
                    ) : filteredCards.length || unfiledCanvases.length ? (
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
                                {!searchText.trim() && unfiledCanvases.length ? <UnfiledProjectCard count={unfiledCanvases.length} listMode={viewMode === "list"} /> : null}
                            </div>
                            <ProjectPagination count={filteredCards.length + (!searchText.trim() && unfiledCanvases.length ? 1 : 0)} />
                        </>
                    ) : (
                        <section className="mt-7 flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/45 text-center">
                            <Folder className="size-11 text-slate-500" />
                            <h2 className="mt-4 text-xl font-medium text-white">没有匹配的项目</h2>
                            <p className="mt-3 text-sm text-slate-400">可以清空搜索条件，或新建一个项目开始制作。</p>
                            <Button className="mt-6 border-0 bg-cyan-500 text-slate-950 hover:!bg-cyan-400" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                                新建项目
                            </Button>
                        </section>
                    )}
                </section>
            </div>

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
        </main>
    );
}

function ProjectSidebar() {
    return (
        <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-[#08111a]/95 px-5 py-6 shadow-[18px_0_44px_rgba(0,0,0,0.28)]">
            <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-cyan-500/90 text-[#071018]">
                    <CircleDot className="size-5 fill-current" />
                </span>
                <div>
                    <div className="flex items-center gap-2">
                        <div className="text-xl font-semibold tracking-normal text-white">AI · 画布</div>
                        <span className="rounded-full border border-cyan-400/60 px-2 py-0.5 text-[11px] font-medium text-cyan-300">专业版</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">让想法成为影像</p>
                </div>
            </div>

            <nav className="mt-8 border-t border-slate-800 pt-5">
                <SidebarLink active icon={<Home className="size-5" />} label="项目工作台" href="/projects" />
                <SidebarLink icon={<ImagePlus className="size-5" />} label="生图工作台" href="/image" />
                <SidebarLink icon={<Video className="size-5" />} label="视频创作台" href="/video" />
                <SidebarLink icon={<FileText className="size-5" />} label="提示词库" href="/prompts" />
                <SidebarLink icon={<Folder className="size-5" />} label="我的素材" href="/assets" />
            </nav>

            <div className="mt-auto grid gap-5">
                <section>
                    <div className="flex items-center gap-2 text-sm text-slate-200">
                        <span className="grid size-7 place-items-center rounded-full bg-cyan-400/90 text-[#071018]">专</span>
                        <div>
                            <div>专业版</div>
                            <div className="text-xs text-slate-500">有效期至 2026-08-31</div>
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-slate-400">存储空间 <span className="ml-3 text-slate-200">128.4GB / 512GB</span></div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800">
                        <div className="h-full w-1/4 rounded-full bg-cyan-400" />
                    </div>
                </section>

                <div className="flex items-center justify-between border-y border-slate-800 py-4 text-slate-400">
                    <button type="button" aria-label="设置" className="transition hover:text-white">
                        <Settings className="size-5" />
                    </button>
                    <button type="button" aria-label="帮助" className="transition hover:text-white">
                        <HelpCircle className="size-5" />
                    </button>
                    <button type="button" aria-label="通知" className="transition hover:text-white">
                        <Bell className="size-5" />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-full bg-[linear-gradient(135deg,#f9a8d4,#38bdf8)] text-sm font-semibold text-white">导</div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm text-white">导演你好</div>
                    </div>
                    <ChevronDown className="size-4 text-slate-500" />
                </div>
            </div>
        </aside>
    );
}

function SidebarLink({ active, icon, label, href }: { active?: boolean; icon: ReactNode; label: string; href: string }) {
    return (
        <Button href={href} className={`mb-3 h-12 w-full justify-start rounded-lg border-0 px-4 text-base ${active ? "bg-slate-800/90 text-cyan-300 hover:!bg-slate-800 hover:!text-cyan-200" : "bg-transparent text-slate-300 hover:!bg-slate-800/60 hover:!text-white"}`} icon={icon}>
            {label}
        </Button>
    );
}

function ProjectStatsBar({ stats }: { stats: { all: number; draft: number; done: number; paused: number; running: number } }) {
    return (
        <section className="mt-8 grid gap-4 rounded-lg border border-slate-700/70 bg-[linear-gradient(135deg,rgba(30,41,59,0.74),rgba(15,23,42,0.64))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] md:grid-cols-5">
            <ProjectStat icon={<Folder className="size-5" />} label="全部项目" value={stats.all} tone="slate" />
            <ProjectStat icon={<Clock3 className="size-5" />} label="进行中" value={stats.running} tone="cyan" />
            <ProjectStat icon={<CheckCircle2 className="size-5" />} label="已完成" value={stats.done} tone="green" />
            <ProjectStat icon={<PauseCircle className="size-5" />} label="暂停中" value={stats.paused} tone="amber" />
            <ProjectStat icon={<Edit3 className="size-5" />} label="草稿" value={stats.draft} tone="blue" />
        </section>
    );
}

function ProjectStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: "amber" | "blue" | "cyan" | "green" | "slate" }) {
    const toneClass = {
        amber: "bg-amber-400/14 text-amber-300",
        blue: "bg-sky-400/14 text-sky-300",
        cyan: "bg-cyan-400/14 text-cyan-300",
        green: "bg-emerald-400/14 text-emerald-300",
        slate: "bg-slate-400/14 text-slate-300",
    }[tone];
    return (
        <div className="flex items-center gap-4 border-slate-700/70 md:border-r md:last:border-r-0">
            <span className={`grid size-11 place-items-center rounded-lg ${toneClass}`}>{icon}</span>
            <div>
                <div className="text-sm text-slate-400">{label}</div>
                <div className="mt-1 text-2xl font-semibold leading-none text-white">{value}</div>
            </div>
        </div>
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
            className={`group overflow-hidden rounded-lg border border-slate-700/80 bg-[linear-gradient(180deg,rgba(30,41,59,0.82),rgba(15,23,42,0.82))] shadow-[0_18px_50px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:border-cyan-400/45 ${openable ? "cursor-pointer" : ""} ${listMode ? "grid md:grid-cols-[320px_minmax(0,1fr)]" : ""}`}
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
                    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium backdrop-blur ${meta.statusClass}`}>
                        {meta.statusIcon}
                        {meta.statusLabel}
                    </span>
                </div>
                <button type="button" className="absolute right-3 top-3 grid size-8 place-items-center rounded-md bg-black/45 text-slate-100 backdrop-blur transition hover:bg-black/70" aria-label="更多操作">
                    <MoreHorizontal className="size-5" />
                </button>
            </div>

            <div className="p-4">
                <div className="min-w-0">
                    {editing ? <Input value={editingTitle} autoFocus onChange={(event) => onEditingTitleChange(event.target.value)} onPressEnter={onSave} /> : <h2 className="break-words text-xl font-semibold leading-7 text-white">{project.title}</h2>}
                    <p className="mt-1 break-words text-sm leading-6 text-slate-400">
                        {meta.genre} · 短片 · {meta.episodeCount}集
                    </p>
                    <p className="mt-2 break-words text-xs leading-5 text-slate-500">{canvasProjectPresetSummary(project.preset)}</p>
                    {project.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{project.description}</p> : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/25 px-3 py-1.5 text-xs text-slate-300">
                        <Folder className="size-3.5" />
                        画布 {canvasCount}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/25 px-3 py-1.5 text-xs text-slate-300">
                        <Edit3 className="size-3.5" />
                        分镜 {meta.shotText}
                    </span>
                </div>

                <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-slate-400">总体进度</span>
                        <span className={meta.progress >= 100 ? "text-emerald-300" : "text-slate-200"}>{meta.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800">
                        <div className={`h-full rounded-full ${meta.progressClass}`} style={{ width: `${meta.progress}%` }} />
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/70 pt-3">
                    <span className="text-xs text-slate-500">更新时间：{formatProjectDate(project.updatedAt)}</span>
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
                                <Button type="text" size="small" shape="circle" icon={<Edit3 className="size-4" />} onClick={onEdit} aria-label="重命名" />
                                <Button type="text" size="small" shape="circle" icon={<Archive className="size-4" />} onClick={onArchive} aria-label="归档" />
                                <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} danger onClick={onDelete} aria-label="删除" />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

function UnfiledProjectCard({ count, listMode }: { count: number; listMode: boolean }) {
    return (
        <article className={`overflow-hidden rounded-lg border border-amber-400/30 bg-[linear-gradient(180deg,rgba(120,53,15,0.28),rgba(15,23,42,0.82))] shadow-[0_18px_50px_rgba(0,0,0,0.22)] ${listMode ? "grid md:grid-cols-[320px_minmax(0,1fr)]" : ""}`}>
            <div className={`${listMode ? "min-h-full" : "h-36"} bg-[linear-gradient(135deg,rgba(245,158,11,0.75),rgba(20,184,166,0.18)),linear-gradient(45deg,rgba(255,255,255,0.1)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.1)_75%,transparent_75%,transparent)] bg-[length:auto,22px_22px]`} />
            <div className="p-4">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/45 bg-amber-400/15 px-2.5 py-1 text-xs font-medium text-amber-200">
                    <Edit3 className="size-3.5" />
                    草稿
                </span>
                <h2 className="mt-3 break-words text-xl font-semibold leading-7 text-white">{UNFILED_CREATIVE_PROJECT_TITLE}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">发现 {count} 个旧画布没有项目归属，可继续从画布库打开，也可以在项目详情里轻量绑定。</p>
                <Button className="mt-4 border-slate-700 bg-slate-950/30 text-slate-100" href="/canvas">
                    打开画布库
                </Button>
            </div>
        </article>
    );
}

function ProjectPagination({ count }: { count: number }) {
    return (
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-400">
            <span>共 {count} 项</span>
            <div className="flex items-center gap-3">
                <Button size="small" className="border-slate-700 bg-slate-900/80 text-slate-400" disabled>
                    ‹
                </Button>
                <Button size="small" className="border-cyan-400/35 bg-cyan-500/18 text-cyan-300">
                    1
                </Button>
                <Button size="small" className="border-slate-700 bg-slate-900/80 text-slate-300">
                    2
                </Button>
                <Button size="small" className="border-slate-700 bg-slate-900/80 text-slate-300">
                    3
                </Button>
                <Button size="small" className="border-slate-700 bg-slate-900/80 text-slate-300">
                    ›
                </Button>
                <Button size="small" className="border-slate-700 bg-slate-900/80 text-slate-300">
                    10 条/页
                    <ChevronDown className="ml-1 size-3.5" />
                </Button>
                <span>跳至</span>
                <Input value="1" readOnly className="h-8 w-16 rounded-md border-slate-700 bg-slate-900/80 text-center text-slate-200" />
                <span>页</span>
            </div>
        </footer>
    );
}

function projectVisualMeta(project: CreativeProject, index: number, canvasCount: number): ProjectVisualMeta {
    if (project.status === "archived") {
        return {
            coverUrl: coverUrls[index % coverUrls.length],
            episodeCount: Math.max(4, canvasCount * 4 + index + 3),
            genre: genres[index % genres.length],
            progress: 10 + ((index * 5) % 18),
            progressClass: "bg-sky-400",
            shotText: `${Math.max(8, canvasCount * 8)}/--`,
            statusClass: "border-sky-400/45 bg-sky-400/15 text-sky-200",
            statusIcon: <Edit3 className="size-3.5" />,
            statusLabel: "草稿",
        };
    }
    const running = [
        { label: "进行中" as const, progress: 68, progressClass: "bg-cyan-400", statusClass: "border-cyan-400/45 bg-cyan-400/15 text-cyan-200", icon: <Clock3 className="size-3.5" /> },
        { label: "进行中" as const, progress: 72, progressClass: "bg-cyan-400", statusClass: "border-cyan-400/45 bg-cyan-400/15 text-cyan-200", icon: <Clock3 className="size-3.5" /> },
        { label: "草稿" as const, progress: 80, progressClass: "bg-amber-400", statusClass: "border-amber-400/45 bg-amber-400/15 text-amber-200", icon: <Edit3 className="size-3.5" /> },
        { label: "已完成" as const, progress: 100, progressClass: "bg-emerald-400", statusClass: "border-emerald-400/45 bg-emerald-400/15 text-emerald-200", icon: <CheckCircle2 className="size-3.5" /> },
        { label: "暂停中" as const, progress: 40, progressClass: "bg-sky-400", statusClass: "border-slate-400/45 bg-slate-400/15 text-slate-200", icon: <PauseCircle className="size-3.5" /> },
    ];
    const status = running[index % running.length];
    const totalShots = Math.max(40, (canvasCount || 1) * 60 + index * 22);
    const doneShots = Math.round((totalShots * status.progress) / 100);
    return {
        coverUrl: coverUrls[index % coverUrls.length],
        episodeCount: Math.max(4, canvasCount * 6 + index + 5),
        genre: genres[index % genres.length],
        progress: status.progress,
        progressClass: status.progressClass,
        shotText: `${doneShots}/${totalShots}`,
        statusClass: status.statusClass,
        statusIcon: status.icon,
        statusLabel: status.label,
    };
}

function formatProjectDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
