"use client";

import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Empty, Input, Modal, Tag } from "antd";
import { Archive, Box, FolderOpen, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";

import { useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasCreateProjectModal } from "../canvas/components/canvas-create-project-modal";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { canvasProjectPresetSummary, type CanvasProjectPreset } from "../canvas/utils/canvas-project-preset";
import { UNFILED_CREATIVE_PROJECT_TITLE, canvasIdsForCreativeProject, unfiledCanvasProjects, type CreativeProject } from "./creative-projects";
import { shouldOpenProjectCardFromTarget } from "./project-card-navigation";
import { useCreativeProjectStore } from "./use-creative-project-store";

export default function ProjectsPage() {
    const router = useRouter();
    const { modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState("");
    const [editingTitle, setEditingTitle] = useState("");
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
    const activeProjects = projects.filter((project) => project.status !== "archived");
    const archivedProjects = projects.filter((project) => project.status === "archived");
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
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <p className="text-xs text-stone-500">项目工作台</p>
                        <h1 className="mt-3 text-3xl font-semibold">创作项目</h1>
                        <p className="mt-2 text-sm text-stone-500">按项目组织画布、剧本、分镜、设定库、素材和生成队列。</p>
                    </div>
                    <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                        新建项目
                    </Button>
                </header>

                {!hydrated ? (
                    <section className="flex min-h-[320px] items-center justify-center border-y border-stone-200 text-sm text-stone-500 dark:border-stone-800">正在加载项目...</section>
                ) : activeProjects.length || unfiledCanvases.length ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {activeProjects.map((project) => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                canvasCount={canvasIdsForCreativeProject(project, canvases).length}
                                editing={editingId === project.id}
                                editingTitle={editingTitle}
                                onEditingTitleChange={setEditingTitle}
                                onEdit={() => {
                                    setEditingId(project.id);
                                    setEditingTitle(project.title);
                                }}
                                onSave={() => {
                                    renameProject(project.id, editingTitle);
                                    setEditingId("");
                                }}
                                onCancel={() => setEditingId("")}
                                onArchive={() => archiveProject(project.id)}
                                onDelete={() => removeProject(project)}
                                onOpen={() => router.push(`/projects/${project.id}`)}
                            />
                        ))}
                        {unfiledCanvases.length ? <UnfiledProjectCard count={unfiledCanvases.length} /> : null}
                    </div>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-stone-200 text-center dark:border-stone-800">
                        <Box className="size-10 text-stone-400" />
                        <h2 className="mt-4 text-xl font-medium">还没有创作项目</h2>
                        <p className="mt-3 text-sm text-stone-500">新建项目后，可以从同一个入口进入画布、剧本、分镜和素材。</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                            新建项目
                        </Button>
                    </section>
                )}

                {archivedProjects.length ? (
                    <section className="border-t border-stone-200 pt-6 dark:border-stone-800">
                        <h2 className="text-sm font-medium text-stone-500">已归档</h2>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {archivedProjects.map((project) => (
                                <article key={project.id} className="rounded-2xl border border-stone-200 p-5 opacity-75 dark:border-stone-800">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="truncate text-base font-semibold">{project.title}</h3>
                                            <p className="mt-1 text-xs text-stone-500">{canvasIdsForCreativeProject(project, canvases).length} 个画布</p>
                                        </div>
                                        <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => restoreProject(project.id)}>
                                            恢复
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                ) : null}
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

function ProjectCard({
    project,
    canvasCount,
    editing,
    editingTitle,
    onEditingTitleChange,
    onEdit,
    onSave,
    onCancel,
    onArchive,
    onDelete,
    onOpen,
}: {
    project: CreativeProject;
    canvasCount: number;
    editing: boolean;
    editingTitle: string;
    onEditingTitleChange: (title: string) => void;
    onEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    onArchive: () => void;
    onDelete: () => void;
    onOpen: () => void;
}) {
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
            className={`flex min-h-52 flex-col justify-between rounded-2xl bg-[#f1eee8] p-5 transition hover:bg-[#ebe6dc] dark:bg-white/5 dark:hover:bg-white/10 ${openable ? "cursor-pointer" : ""}`}
            role={openable ? "link" : undefined}
            tabIndex={openable ? 0 : undefined}
            aria-label={openable ? `打开项目 ${project.title}` : undefined}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
        >
            <div>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {editing ? (
                            <Input value={editingTitle} autoFocus onChange={(event) => onEditingTitleChange(event.target.value)} onPressEnter={onSave} />
                        ) : (
                            <h2 className="truncate text-xl font-semibold text-stone-950 dark:text-stone-100">{project.title}</h2>
                        )}
                        <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-400">
                            {canvasCount} 个画布 · {canvasProjectPresetSummary(project.preset)}
                        </p>
                        {project.description ? <p className="mt-2 line-clamp-2 text-sm text-stone-500">{project.description}</p> : null}
                    </div>
                    <Tag className="m-0 shrink-0" color="processing">
                        active
                    </Tag>
                </div>
            </div>
            <div className="mt-8 flex items-center justify-between gap-3">
                <p className="text-xs text-stone-500">更新于 {formatProjectDate(project.updatedAt)}</p>
                <div className="flex items-center gap-1">
                    {editing ? (
                        <>
                            <Button size="small" type="primary" onClick={onSave}>
                                保存
                            </Button>
                            <Button size="small" onClick={onCancel}>
                                取消
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button type="text" size="small" shape="circle" icon={<FolderOpen className="size-4" />} href={`/projects/${project.id}`} aria-label="打开" />
                            <Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={onEdit} aria-label="重命名" />
                            <Button type="text" size="small" shape="circle" icon={<Archive className="size-4" />} onClick={onArchive} aria-label="归档" />
                            <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} danger onClick={onDelete} aria-label="删除" />
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}

function UnfiledProjectCard({ count }: { count: number }) {
    return (
        <article className="flex min-h-52 flex-col justify-between rounded-2xl border border-dashed border-stone-300 p-5 dark:border-stone-700">
            <div>
                <h2 className="text-xl font-semibold">{UNFILED_CREATIVE_PROJECT_TITLE}</h2>
                <p className="mt-3 text-sm leading-6 text-stone-500">发现 {count} 个旧画布没有项目归属，可继续从画布库打开，也可以在项目详情里轻量绑定。</p>
            </div>
            <Button href="/canvas">打开画布库</Button>
        </article>
    );
}

function formatProjectDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
