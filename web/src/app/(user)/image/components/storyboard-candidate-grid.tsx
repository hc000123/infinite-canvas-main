"use client";

import { Button, Dropdown, Empty, Tag } from "antd";
import { Check, Download, FolderPlus, ImagePlus, LoaderCircle, MoreHorizontal, RefreshCw } from "lucide-react";

import { formatBytes, formatDuration } from "@/lib/image-utils";
import type { StoryboardWorkbenchImage } from "../../canvas/utils/storyboard-management";

export type StoryboardGenerationSlotView = { id: string; status: "pending" | "failed"; error?: string };

type Props = {
    candidates: StoryboardWorkbenchImage[];
    selectedId?: string;
    slots: StoryboardGenerationSlotView[];
    onAddReference: (candidate: StoryboardWorkbenchImage) => void;
    onDelete: (candidate: StoryboardWorkbenchImage) => void;
    onDownload: (candidate: StoryboardWorkbenchImage) => void;
    onRetry: (slotId: string) => void;
    onSaveAsset: (candidate: StoryboardWorkbenchImage) => void;
    onSelect: (candidate: StoryboardWorkbenchImage) => void;
};

export function StoryboardCandidateGrid({ candidates, selectedId, slots, onAddReference, onDelete, onDownload, onRetry, onSaveAsset, onSelect }: Props) {
    return (
        <section className="thin-scrollbar min-h-0 overflow-y-auto bg-[var(--studio-panel-bg)] p-4 lg:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--studio-border-subtle)] pb-4">
                <div><h2 className="text-xl font-semibold text-[var(--studio-text-primary)]">候选结果</h2><p className="mt-1 text-xs text-[var(--studio-text-muted)]">当前镜头只能确定一张最终分镜图，取消或改选不会删除候选。</p></div>
                <div className="flex gap-2"><Tag className="studio-tag">全部 {candidates.length}</Tag><Tag className="studio-tag">已选 {selectedId ? 1 : 0}</Tag></div>
            </div>
            {candidates.length || slots.length ? (
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                    {slots.map((slot) => slot.status === "pending" ? <PendingCandidate key={slot.id} /> : <FailedCandidate key={slot.id} error={slot.error || "生成失败"} onRetry={() => onRetry(slot.id)} />)}
                    {candidates.map((candidate) => {
                        const selected = selectedId === candidate.id;
                        return <article key={candidate.id} className={`overflow-hidden rounded-lg border bg-[var(--studio-panel-muted-bg)] transition ${selected ? "border-[var(--studio-accent)] shadow-[0_0_0_1px_var(--studio-accent)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-border-strong)]"}`}>
                            <div className="relative aspect-video overflow-hidden bg-[var(--studio-control-bg)]"><img src={candidate.dataUrl} alt={candidate.title} className="size-full object-contain" />{selected ? <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-[var(--studio-accent)] px-2 py-1 text-xs font-semibold text-[var(--studio-on-media)]"><Check className="size-3" />已选取</span> : null}</div>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--studio-border-subtle)] p-3">
                                <div className="text-[11px] text-[var(--studio-text-muted)]">{candidate.width}×{candidate.height} · {formatBytes(candidate.bytes)}{candidate.durationMs ? ` · ${formatDuration(candidate.durationMs)}` : ""}</div>
                                <div className="flex gap-1.5"><Button size="small" type={selected ? "default" : "primary"} icon={<Check className="size-3.5" />} onClick={() => onSelect(candidate)}>{selected ? "取消选取" : "选为分镜"}</Button><Dropdown trigger={["click"]} menu={{ items: [{ key: "save", icon: <FolderPlus className="size-3.5" />, label: candidate.savedAssetId ? "已保存到资产" : "保存到资产", disabled: Boolean(candidate.savedAssetId) }, { key: "reference", icon: <ImagePlus className="size-3.5" />, label: "加入参考图" }, { key: "download", icon: <Download className="size-3.5" />, label: "下载" }, { type: "divider" }, { key: "delete", danger: true, label: "删除候选" }], onClick: ({ key }) => { if (key === "save") onSaveAsset(candidate); if (key === "reference") onAddReference(candidate); if (key === "download") onDownload(candidate); if (key === "delete") onDelete(candidate); } }}><Button size="small" icon={<MoreHorizontal className="size-3.5" />} aria-label="更多候选动作" /></Dropdown></div>
                            </div>
                        </article>;
                    })}
                </div>
            ) : <div className="grid min-h-[420px] place-items-center rounded-lg border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)]"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前镜头还没有候选图" /></div>}
        </section>
    );
}

function PendingCandidate() {
    return <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)] text-sm text-[var(--studio-text-muted)]"><div className="text-center"><LoaderCircle className="mx-auto mb-2 size-6 animate-spin text-[var(--studio-accent)]" />正在生成候选</div></div>;
}

function FailedCandidate({ error, onRetry }: { error: string; onRetry: () => void }) {
    return <div className="studio-semantic-danger studio-semantic-notice grid aspect-video place-items-center rounded-lg border p-4 text-center"><div><div className="text-sm font-semibold">生成失败</div><p className="mt-2 line-clamp-3 text-xs">{error}</p><Button className="!mt-3" size="small" danger icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>重试</Button></div></div>;
}
