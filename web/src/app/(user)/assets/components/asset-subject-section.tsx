"use client";

import { Button, Tag, Tooltip } from "antd";
import { ArrowRight, CheckSquare, Edit3, ImageOff, Square } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { Asset, AssetSubject, AssetVariant } from "@/stores/use-asset-store";
import { assetVersionRecords } from "../asset-version-history";
import { assetCategoryLabel } from "../asset-subjects";

export type AssetSubjectGroup = { subject: AssetSubject; assets: Asset[] };

export function AssetSubjectSection({
    groups,
    episodeTitleMap,
    selectedAssetIds,
    variants,
    onEditAsset,
    onOpenAsset,
    onToggleAsset,
}: {
    groups: AssetSubjectGroup[];
    episodeTitleMap: Record<string, string>;
    selectedAssetIds: Set<string>;
    variants: AssetVariant[];
    onEditAsset: (asset: Asset) => void;
    onOpenAsset: (asset: Asset) => void;
    onToggleAsset: (assetId: string) => void;
}) {
    if (!groups.length) return null;
    return (
        <div className="grid gap-4">
            {groups.map(({ subject, assets }) => {
                const subjectVariants = variants.filter((variant) => variant.subjectId === subject.id);
                return (
                <article key={subject.id} className="overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
                    <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Tag className="m-0">{assetCategoryLabel(subject.category)}</Tag>
                                <span className="text-xs font-semibold text-[var(--studio-accent)]">{subject.code}</span>
                                <h3 className="truncate text-base font-semibold text-[var(--studio-text-primary)]">{subject.name}</h3>
                            </div>
                            {subject.tags.length ? <div className="mt-2 text-xs text-[var(--studio-text-muted)]">{subject.tags.join(" · ")}</div> : null}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-[var(--studio-text-muted)]">{subjectVariants.length} 个形态 · {assets.length} 个版本</span>
                            <Link href={`/assets/${subject.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--studio-accent)] hover:opacity-80">
                                进入工作台 <ArrowRight className="size-3.5" />
                            </Link>
                        </div>
                    </header>
                    <div className="grid grid-cols-2 gap-3 border-t border-[var(--studio-border-subtle)] p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {!assets.length ? (
                            <Link href={`/assets/${subject.id}`} className="col-span-full flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-[var(--studio-text-muted)] transition hover:border-[var(--studio-accent)] hover:text-[var(--studio-accent)]">
                                <ImageOff className="mb-2 size-5" />
                                <span className="text-sm font-medium">待生产</span>
                                <span className="mt-1 text-xs">进入工作台添加参考图并生成候选</span>
                            </Link>
                        ) : null}
                        {assets.map((asset) => {
                            const binding = asset.assetBinding!;
                            const selected = selectedAssetIds.has(asset.id);
                            const versionCount = Math.max(1, assetVersionRecords(asset).length);
                            const episodeLabels = binding.allEpisodes ? ["全剧通用"] : binding.episodeIds.map((id) => episodeTitleMap[id] || id);
                            return (
                                <div
                                    key={asset.id}
                                    className={cn("group overflow-hidden rounded-md border bg-[var(--studio-panel-bg)]", selected ? "border-[var(--studio-accent)] ring-2 ring-[var(--studio-focus-ring)]" : "border-[var(--studio-border-subtle)]")}
                                >
                                    <button type="button" className="relative block aspect-[4/3] w-full overflow-hidden bg-[var(--studio-elevated-bg)]" onClick={() => onOpenAsset(asset)}>
                                        <img src={asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "")} alt={asset.title} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
                                        <span className="absolute bottom-2 right-2 rounded bg-[var(--studio-media-overlay)] px-1.5 py-0.5 text-[10px] text-[var(--studio-on-media)]">v{versionCount}</span>
                                    </button>
                                    <div className="p-2.5">
                                        <div className="flex items-start gap-2">
                                            <Tooltip title={selected ? "取消选择" : "选择形态"}>
                                                <Button size="small" type="text" className="!h-6 !w-6 !min-w-6 !p-0" icon={selected ? <CheckSquare size={14} /> : <Square size={14} />} onClick={() => onToggleAsset(asset.id)} />
                                            </Tooltip>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-semibold text-[var(--studio-text-primary)]">{binding.variantName}</div>
                                                <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--studio-text-muted)]">{episodeLabels.join("、")}</div>
                                            </div>
                                            <Tooltip title="编辑分类与适用集数">
                                                <Button size="small" type="text" className="!h-6 !w-6 !min-w-6 !p-0" icon={<Edit3 size={13} />} onClick={() => onEditAsset(asset)} />
                                            </Tooltip>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </article>
                );
            })}
        </div>
    );
}
