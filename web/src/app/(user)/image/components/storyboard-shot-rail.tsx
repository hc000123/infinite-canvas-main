"use client";

import { Button, Popconfirm } from "antd";
import { Check, Plus, Trash2 } from "lucide-react";

import type { StoryboardTableShot, StoryboardWorkbenchImage } from "../../canvas/utils/storyboard-management";

type Props = {
    shots: StoryboardTableShot[];
    activeId: string;
    candidatesById: Map<string, StoryboardWorkbenchImage>;
    onAdd: (count: number) => void;
    onDelete: (id: string) => void;
    onReorder: (activeId: string, overId: string) => void;
    onSelect: (id: string) => void;
};

export function StoryboardShotRail({ shots, activeId, candidatesById, onAdd, onDelete, onReorder, onSelect }: Props) {
    return (
        <section className="border-b border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <span className="text-sm font-semibold text-[var(--studio-text-primary)]">所有分镜</span>
                    <span className="ml-2 text-xs text-[var(--studio-text-muted)]">{shots.length} 个镜头 · 拖拽排序</span>
                </div>
                <div className="flex gap-2">
                    <Button size="small" onClick={() => onAdd(5)}>新增 5 镜</Button>
                    <Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={() => onAdd(1)}>新增镜头</Button>
                </div>
            </div>
            <div className="hover-scrollbar hover-scrollbar-hint flex min-w-0 gap-2 overflow-x-auto pb-2">
                {shots.map((shot, index) => {
                    const selected = candidatesById.get(shot.selectedCandidateId || "");
                    const active = shot.id === activeId;
                    return (
                        <div
                            key={shot.id}
                            className={`group relative w-28 shrink-0 rounded-lg border p-1.5 transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-active-bg)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] hover:border-[var(--studio-border-strong)]"}`}
                            draggable
                            onDragStart={(event) => event.dataTransfer.setData("text/storyboard-shot", shot.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                                event.preventDefault();
                                const draggedId = event.dataTransfer.getData("text/storyboard-shot");
                                if (draggedId) onReorder(draggedId, shot.id);
                            }}
                        >
                            <button type="button" className="block w-full text-left" onClick={() => onSelect(shot.id)}>
                                <div className="relative aspect-video overflow-hidden rounded-md bg-[var(--studio-control-bg)]">
                                    {selected?.dataUrl ? <img src={selected.dataUrl} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-xs text-[var(--studio-text-muted)]">镜 {index + 1}</div>}
                                    <span className="absolute left-1 top-1 rounded bg-[var(--studio-media-overlay)] px-1.5 py-0.5 text-[10px] text-[var(--studio-on-media)]">{String(index + 1).padStart(2, "0")}</span>
                                    {selected ? <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-[var(--studio-accent)] text-[var(--studio-on-media)]"><Check className="size-3" /></span> : null}
                                </div>
                                <div className="mt-1.5 truncate px-0.5 text-xs text-[var(--studio-text-secondary)]">{shot.title || `镜头 ${index + 1}`}</div>
                            </button>
                            <Popconfirm title="删除这个分镜槽位？" description="未保存为正式资产的候选和参考图记录会一起移除。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => onDelete(shot.id)}>
                                <button type="button" className="absolute -right-1.5 -top-1.5 hidden size-6 place-items-center rounded-full border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] text-[var(--studio-text-muted)] shadow-sm hover:text-[var(--studio-danger)] group-hover:grid" aria-label={`删除 ${shot.title}`}>
                                    <Trash2 className="size-3" />
                                </button>
                            </Popconfirm>
                        </div>
                    );
                })}
                {!shots.length ? <button type="button" className="grid h-[86px] w-28 shrink-0 place-items-center rounded-lg border border-dashed border-[var(--studio-border-strong)] text-xs text-[var(--studio-text-muted)]" onClick={() => onAdd(1)}>＋ 新增镜头</button> : null}
            </div>
        </section>
    );
}
