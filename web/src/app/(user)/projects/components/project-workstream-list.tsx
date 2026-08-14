"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Dropdown, Input } from "antd";
import { Archive, ArrowUpRight, Edit3, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";

import type { ProjectWorkstreamItem } from "../project-workstream";

type ProjectWorkstreamListProps = {
    editingId: string;
    editingTitle: string;
    items: ProjectWorkstreamItem[];
    onArchive: (id: string) => void;
    onCancelEdit: () => void;
    onDelete: (id: string) => void;
    onEditingTitleChange: (title: string) => void;
    onRestore: (id: string) => void;
    onSaveEdit: (id: string) => void;
    onStartEdit: (item: ProjectWorkstreamItem) => void;
};

export function ProjectWorkstreamList({ editingId, editingTitle, items, onArchive, onCancelEdit, onDelete, onEditingTitleChange, onRestore, onSaveEdit, onStartEdit }: ProjectWorkstreamListProps) {
    const router = useRouter();
    return (
        <div className="border-t border-[var(--studio-border-subtle)]">
            {items.map((item) => {
                const editing = editingId === item.id;
                const projectHref = `/projects/${item.id}`;
                return (
                    <article
                        key={item.id}
                        className="group -mx-3 grid cursor-pointer gap-4 border-b border-[var(--studio-border-subtle)] px-3 py-6 transition-colors duration-100 hover:bg-[var(--studio-hover-bg)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                        onClick={(event) => {
                            if (!editing && !event.defaultPrevented && !isProjectRowControl(event.target)) router.push(projectHref);
                        }}
                    >
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                                {editing ? <Input autoFocus value={editingTitle} className="max-w-md" onChange={(event) => onEditingTitleChange(event.target.value)} onPressEnter={() => onSaveEdit(item.id)} /> : <h2 className="text-xl font-semibold tracking-[-0.025em] text-[var(--studio-text-primary)]">{item.title}</h2>}
                                <span className="text-xs text-[var(--studio-text-muted)]">{item.statusLabel}</span>
                            </div>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--studio-text-secondary)]">{item.summary}</p>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--studio-text-muted)]"><span>{item.meta}</span><span>{item.presetSummary}</span><span>{formatProjectDate(item.updatedAt)}</span></div>
                            {editing ? <div className="mt-3 flex gap-2"><Button size="small" type="primary" onClick={() => onSaveEdit(item.id)}>保存</Button><Button size="small" onClick={onCancelEdit}>取消</Button></div> : null}
                        </div>
                        <div className="flex items-center justify-end gap-1">
                            <Link href={projectHref} className="inline-flex h-9 items-center gap-2 border-b border-[var(--studio-text-primary)] px-1 text-sm font-medium text-[var(--studio-text-primary)] transition-colors group-hover:border-[var(--studio-accent)] group-hover:text-[var(--studio-accent)]">
                                {item.actionLabel}<ArrowUpRight className="size-4" />
                            </Link>
                            <Dropdown
                                placement="bottomRight"
                                menu={{
                                    items: item.status === "archived"
                                        ? [{ key: "restore", icon: <RotateCcw className="size-4" />, label: "恢复项目", onClick: () => onRestore(item.id) }]
                                        : [
                                              { key: "edit", icon: <Edit3 className="size-4" />, label: "重命名", onClick: () => onStartEdit(item) },
                                              { key: "archive", icon: <Archive className="size-4" />, label: "归档项目", onClick: () => onArchive(item.id) },
                                              { type: "divider" },
                                              { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除项目", onClick: () => onDelete(item.id) },
                                          ],
                                }}
                            >
                                <Button type="text" className="!size-9 !p-0" icon={<MoreHorizontal className="size-4" />} aria-label={`${item.title}的更多操作`} />
                            </Dropdown>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

function isProjectRowControl(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("a, button, input, textarea, select, [role='menuitem']"));
}

function formatProjectDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
