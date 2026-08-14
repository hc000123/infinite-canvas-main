"use client";

import { Check, Download, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Input, Tooltip } from "antd";

import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { exportCanvasProjects } from "../utils/canvas-export";
import { canvasProjectPresetSummary } from "../utils/canvas-project-preset";

export function CanvasProjectCard({ project, projectTitle }: { project: CanvasProject; projectTitle?: string }) {
    const router = useRouter();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const open = () => router.push(`/canvas/${project.id}`);
    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };

    return (
        <article className="studio-panel group flex min-h-52 cursor-pointer flex-col justify-between p-5 transition hover:-translate-y-0.5 hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]" onClick={() => !editing && open()}>
            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    checked={selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => toggleSelected(project.id, event.target.checked)}
                    className="mt-1 size-4 accent-[var(--studio-accent)]"
                    aria-label={`选择 ${project.title}`}
                />
                {editing ? (
                    <Input className="min-w-0" value={editingTitle} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
                ) : (
                    <button
                        type="button"
                        className="min-w-0 cursor-pointer text-left"
                        onClick={(event) => {
                            event.stopPropagation();
                            open();
                        }}
                    >
                        <h2 className="break-words text-xl font-semibold leading-7">{project.title}</h2>
                        <p className="mt-3 text-sm leading-6 text-[var(--studio-text-secondary)]">
                            {project.nodes.length} 个节点 · {project.connections.length} 条连线
                        </p>
                        {projectTitle ? <p className="mt-1 truncate text-xs leading-5 text-[var(--studio-text-muted)]">所属项目：{projectTitle}</p> : null}
                        {project.preset ? <p className="mt-1 break-words text-xs leading-5 text-[var(--studio-text-muted)]">{canvasProjectPresetSummary(project.preset)}</p> : null}
                    </button>
                )}
            </div>
            <div className="mt-8 flex items-end justify-between gap-3">
                <p className="text-xs text-[var(--studio-text-muted)]">更新于 {new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    {editing ? (
                        <>
                            <Tooltip title="保存名称">
                                <Button type="text" size="small" shape="circle" icon={<Check className="size-4" />} onClick={saveTitle} aria-label="保存名称" />
                            </Tooltip>
                            <Tooltip title="取消重命名">
                                <Button type="text" size="small" shape="circle" icon={<X className="size-4" />} onClick={stopEditing} aria-label="取消重命名" />
                            </Tooltip>
                        </>
                    ) : (
                        <>
                            <Tooltip title="导出画布">
                                <Button type="text" size="small" shape="circle" icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects([project], project.title || "眨眼之间")} aria-label="导出画布" />
                            </Tooltip>
                            <Tooltip title="重命名画布">
                                <Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={() => startEditing(project.id, project.title)} aria-label="重命名画布" />
                            </Tooltip>
                            <Tooltip title="删除画布">
                                <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds([project.id])} aria-label="删除画布" />
                            </Tooltip>
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}
