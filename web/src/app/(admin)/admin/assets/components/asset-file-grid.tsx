"use client";

import { FileAudio, FileText, FileVideo, ImageIcon } from "lucide-react";
import { Checkbox, Empty, Pagination, Segmented, Tag, Typography } from "antd";
import { useState, type DragEvent } from "react";

import type { AdminAsset } from "@/services/api/admin";

export function AssetFileGrid({ assets, loading, selectedIds, page, pageSize, total, onPageChange, onOpen, onSelectionChange, onDropFiles }: { assets: AdminAsset[]; loading: boolean; selectedIds: string[]; page: number; pageSize: number; total: number; onPageChange: (page: number, pageSize: number) => void; onOpen: (asset: AdminAsset) => void; onSelectionChange: (ids: string[]) => void; onDropFiles: (files: File[]) => void }) {
    const [view, setView] = useState<"grid" | "list">("grid");
    const [dragging, setDragging] = useState(false);
    const selected = new Set(selectedIds);
    const toggle = (id: string) => onSelectionChange(selected.has(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
    const drop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        onDropFiles(Array.from(event.dataTransfer.files));
    };

    return (
        <section
            className={`studio-panel relative min-h-[460px] flex-1 p-4 transition ${dragging ? "ring-2 ring-[var(--studio-accent)]" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
            onDrop={drop}
        >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Checkbox checked={assets.length > 0 && assets.every((asset) => selected.has(asset.id))} indeterminate={assets.some((asset) => selected.has(asset.id)) && !assets.every((asset) => selected.has(asset.id))} onChange={(event) => onSelectionChange(event.target.checked ? Array.from(new Set([...selectedIds, ...assets.map((asset) => asset.id)])) : selectedIds.filter((id) => !assets.some((asset) => asset.id === id)))}>选择本页</Checkbox>
                    <Typography.Text type="secondary">共 {total} 个素材</Typography.Text>
                </div>
                <Segmented size="small" value={view} options={[{ label: "缩略图", value: "grid" }, { label: "列表", value: "list" }]} onChange={(value) => setView(value as "grid" | "list")} />
            </div>

            {!assets.length && !loading ? <div className="grid min-h-[350px] place-items-center"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前目录没有素材，拖入文件即可上传" /></div> : null}
            {view === "grid" ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {assets.map((asset) => (
                        <article key={asset.id} className={`group relative overflow-hidden rounded-lg border bg-[var(--studio-panel-bg)] transition hover:border-[var(--studio-accent)] ${selected.has(asset.id) ? "border-[var(--studio-accent)] ring-1 ring-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)]"}`}>
                            <button type="button" className="block w-full text-left" onClick={() => onOpen(asset)}>
                                <AssetPreview asset={asset} className="aspect-video w-full" />
                                <div className="p-3">
                                    <Typography.Text strong ellipsis className="block">{asset.title}</Typography.Text>
                                    <div className="mt-2 flex flex-wrap gap-1"><Tag>{assetTypeLabel(asset.type)}</Tag>{asset.category ? <Tag>{asset.category}</Tag> : null}{asset.allEpisodes ? <Tag color="blue">全剧</Tag> : null}</div>
                                </div>
                            </button>
                            <Checkbox aria-label={`选择 ${asset.title}`} checked={selected.has(asset.id)} className="absolute left-3 top-3 rounded bg-[var(--studio-panel-bg)] p-1" onClick={(event) => event.stopPropagation()} onChange={() => toggle(asset.id)} />
                        </article>
                    ))}
                </div>
            ) : (
                <div className="divide-y divide-[var(--studio-border-subtle)]">
                    {assets.map((asset) => (
                        <div key={asset.id} className="flex items-center gap-3 py-2">
                            <Checkbox checked={selected.has(asset.id)} onChange={() => toggle(asset.id)} />
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(asset)}>
                                <AssetPreview asset={asset} className="size-12 shrink-0 rounded-md" />
                                <span className="min-w-0 flex-1"><Typography.Text strong ellipsis className="block">{asset.title}</Typography.Text><Typography.Text type="secondary" className="text-xs">{asset.category || "未分类"}{asset.episodeNumbers?.length ? ` · 第 ${asset.episodeNumbers.join("、")} 集` : asset.allEpisodes ? " · 全剧通用" : ""}</Typography.Text></span>
                                <Tag>{assetTypeLabel(asset.type)}</Tag>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {total > pageSize ? <div className="mt-5 flex justify-center"><Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={[24, 48, 96]} onChange={onPageChange} /></div> : null}
            {dragging ? <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-lg border-2 border-dashed border-[var(--studio-accent)] bg-[var(--studio-panel-bg)]/90 text-base font-semibold text-[var(--studio-accent)]">松开即可上传到当前文件夹</div> : null}
        </section>
    );
}

function AssetPreview({ asset, className }: { asset: AdminAsset; className: string }) {
    if (asset.type === "image" && (asset.coverUrl || asset.url)) return <img src={asset.coverUrl || asset.url} alt={asset.title} className={`${className} bg-[var(--studio-panel-muted-bg)] object-cover`} />;
    const Icon = asset.type === "video" ? FileVideo : asset.type === "audio" ? FileAudio : asset.type === "text" ? FileText : ImageIcon;
    return <span className={`${className} grid place-items-center bg-[var(--studio-panel-muted-bg)] text-[var(--studio-text-muted)]`}><Icon className="size-7" /></span>;
}

export function assetTypeLabel(type: AdminAsset["type"]) {
    return type === "image" ? "图片" : type === "video" ? "视频" : type === "audio" ? "音频" : "文本";
}
