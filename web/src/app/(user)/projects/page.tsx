"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input } from "antd";
import { Folder, Plus, Search } from "lucide-react";

import { useEffectiveConfig } from "@/stores/use-config-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { updateProjectCacheStatus } from "@/services/api/project-cache";
import { useUserStore } from "@/stores/use-user-store";
import { CanvasCreateProjectModal } from "../canvas/components/canvas-create-project-modal";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../canvas/utils/canvas-project-preset";
import { canvasIdsForCreativeProject, type CreativeProject } from "./creative-projects";
import { ProjectWorkstreamList } from "./components/project-workstream-list";
import { buildProjectWorkstream } from "./project-workstream";
import { useCreativeProjectStore } from "./use-creative-project-store";

type ProjectStatusFilter = "全部项目" | "进行中" | "暂停中" | "草稿";

const createProjectButtonClass =
    "border-0 !bg-[var(--studio-accent)] !text-[var(--primary-foreground)] shadow-none hover:!bg-[var(--studio-accent-hover)] hover:!text-[var(--primary-foreground)] focus:!text-[var(--primary-foreground)] active:!text-[var(--primary-foreground)] disabled:!bg-[var(--studio-accent)] disabled:!text-[var(--primary-foreground)] disabled:!opacity-60";

const PROJECT_STATUS_FILTERS: ProjectStatusFilter[] = ["全部项目", "进行中", "暂停中", "草稿"];

export default function ProjectsPage() {
    const router = useRouter();
    const { modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const token = useUserStore((state) => state.token);
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState("");
    const [editingTitle, setEditingTitle] = useState("");
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("全部项目");
    const hydrated = useCreativeProjectStore((state) => state.hydrated);
    const projects = useCreativeProjectStore((state) => state.projects);
    const createProject = useCreativeProjectStore((state) => state.createProject);
    const renameProject = useCreativeProjectStore((state) => state.renameProject);
    const archiveProject = useCreativeProjectStore((state) => state.archiveProject);
    const restoreProject = useCreativeProjectStore((state) => state.restoreProject);
    const deleteProject = useCreativeProjectStore((state) => state.deleteProject);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
    const canvases = useCanvasStore((state) => state.projects);
    const workstreamItems = useMemo(
        () =>
            buildProjectWorkstream(
                projects.map((project) => ({
                    ...project,
                    canvasCount: canvasIdsForCreativeProject(project, canvases).length,
                    presetSummary: canvasProjectPresetSummary(project.preset),
                })),
            ),
        [canvases, projects],
    );
    const filteredItems = useMemo(() => {
        const keyword = searchText.trim().toLowerCase();
        return workstreamItems.filter((item) => {
            if (statusFilter !== "全部项目" && item.statusLabel !== statusFilter) return false;
            if (!keyword) return true;
            return `${item.title} ${item.summary} ${item.statusLabel} ${item.presetSummary}`.toLowerCase().includes(keyword);
        });
    }, [searchText, statusFilter, workstreamItems]);
    const activeItems = workstreamItems.filter((item) => item.status === "active");
    const defaultTitle = `创作项目 ${projects.length + 1}`;

    const createAndOpen = (title: string, preset: CanvasProjectPreset) => {
        const id = createProject({ title, preset });
        ensureProjectFolder(id, title);
        setCreateOpen(false);
        router.push(`/projects/${id}`);
    };

    const removeProject = (project: CreativeProject) => {
        modal.confirm({
            title: "删除项目？",
            content: "只会删除项目入口，不会删除已有画布、素材、剧本、分镜或磁盘缓存。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                deleteProject(project.id);
                if (token) void updateProjectCacheStatus(project.id, "deleted", token).catch(() => undefined);
            },
        });
    };

    const archiveProjectWithConfirm = (project: CreativeProject) => {
        modal.confirm({
            title: "归档项目？",
            content: "项目会移到暂停中，可随时恢复；不会删除画布、素材、剧本或分镜数据。",
            okText: "归档",
            cancelText: "取消",
            onOk: () => archiveProject(project.id),
        });
    };
    return (
        <>
            <section className="studio-workstream h-full min-h-0 overflow-y-auto bg-[var(--studio-work-surface)]">
                <div className="mx-auto max-w-[1480px] px-5 py-5 md:px-8 xl:px-12 xl:py-6">
                    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--studio-border-subtle)] pb-4">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--studio-text-primary)] sm:text-3xl">项目中心</h1>
                            <p className="text-xs text-[var(--studio-text-secondary)]">{activeItems.length} 个正在推进 · {projects.length - activeItems.length} 个已暂停</p>
                        </div>
                        <Button className={`h-9 ${createProjectButtonClass}`} icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)} disabled={!hydrated}>
                            新建项目
                        </Button>
                    </header>

                    <div className="flex flex-col gap-3 border-b border-[var(--studio-border-subtle)] py-3 sm:flex-row sm:items-center">
                        <ProjectFilterBar activeFilter={statusFilter} onFilterChange={setStatusFilter} />
                        <div className="sm:ml-auto">
                            <Input
                                value={searchText}
                                onChange={(event) => setSearchText(event.target.value)}
                                placeholder="搜索项目或说明"
                                prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />}
                                className="h-9 w-full sm:w-[280px]"
                            />
                        </div>
                    </div>

                    {!hydrated ? (
                        <section className="flex min-h-[420px] items-center justify-center text-sm text-[var(--studio-text-muted)]">正在加载项目...</section>
                    ) : filteredItems.length ? (
                        <div className="min-w-0">
                            <ProjectWorkstreamList
                                items={filteredItems}
                                editingId={editingId}
                                editingTitle={editingTitle}
                                onEditingTitleChange={setEditingTitle}
                                onStartEdit={(item) => { setEditingId(item.id); setEditingTitle(item.title); }}
                                onSaveEdit={(id) => {
                                    renameProject(id, editingTitle);
                                    ensureProjectFolder(id, editingTitle);
                                    setEditingId("");
                                }}
                                onCancelEdit={() => setEditingId("")}
                                onArchive={(id) => { const project = projects.find((item) => item.id === id); if (project) archiveProjectWithConfirm(project); }}
                                onRestore={restoreProject}
                                onDelete={(id) => { const project = projects.find((item) => item.id === id); if (project) removeProject(project); }}
                            />
                        </div>
                    ) : (
                        <section className="flex min-h-[320px] flex-col items-center justify-center border-b border-[var(--studio-border-subtle)] px-6 text-center">
                            <Folder className="size-11 text-[var(--studio-text-muted)]" />
                            <h2 className="mt-4 text-xl font-medium text-[var(--studio-text-primary)]">没有匹配的项目</h2>
                            <p className="mt-3 text-sm text-[var(--studio-text-secondary)]">可以清空搜索条件，或新建项目开始制作。</p>
                        </section>
                    )}
                </div>
            </section>

            <CanvasCreateProjectModal
                open={createOpen}
                defaultTitle={defaultTitle}
                config={effectiveConfig}
                modalTitle="新建项目"
                nameLabel="项目名称"
                namePlaceholder="例如：毕业季短剧第一季"
                okText="创建项目"
                helperText="创建项目后，在项目详情中新建或导入分集剧本。"
                onCancel={() => setCreateOpen(false)}
                onCreate={createAndOpen}
            />
        </>
    );
}

function ProjectFilterBar({ activeFilter, onFilterChange }: { activeFilter: ProjectStatusFilter; onFilterChange: (filter: ProjectStatusFilter) => void }) {
    return (
        <div className="flex flex-wrap items-center gap-5">
            {PROJECT_STATUS_FILTERS.map((label) => {
                const active = activeFilter === label;
                return (
                    <button
                        key={label}
                        type="button"
                        className={`inline-flex h-9 items-center border-b text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)] ${active ? "border-[var(--studio-accent)] text-[var(--studio-text-primary)]" : "border-transparent text-[var(--studio-text-muted)] hover:text-[var(--studio-text-primary)]"}`}
                        onClick={() => onFilterChange(label)}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
