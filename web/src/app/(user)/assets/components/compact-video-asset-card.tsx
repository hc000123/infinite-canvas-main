"use client";

import { CheckSquare, Download, Eye, PencilLine, RefreshCw, ShieldCheck, Square, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { canSubmitVolcengineReview, isVolcengineReviewProcessing, shouldShowVolcengineReviewAction } from "@/services/volcengine-asset-metadata";
import type { VideoAsset } from "@/stores/use-asset-store";
import { assetMediaInfo, videoPreviewUrl, volcengineReviewActionLabel } from "../asset-utils";
import { AssetIconButton, VolcengineAssetTag } from "./asset-card";

export function CompactVideoAssetCard(props: {
    asset: VideoAsset;
    selected: boolean;
    refreshingReview: boolean;
    submittingReview: boolean;
    onSelect: () => void;
    onOpen: () => void;
    onEdit: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onReview: () => void;
    onRefreshReview: () => void;
}) {
    const { asset } = props;
    const previewUrl = videoPreviewUrl(asset.data.url);

    return (
        <article
            className={cn(
                "group min-w-0 overflow-hidden rounded-lg border bg-[var(--studio-elevated-bg)] transition",
                props.selected ? "border-[var(--studio-accent)] shadow-[0_0_0_1px_var(--studio-accent)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-accent)]",
            )}
        >
            <div className="relative aspect-[4/3] overflow-hidden bg-[var(--studio-shell-bg)]">
                <button
                    type="button"
                    aria-label={props.selected ? `取消选择素材 ${asset.title}` : `选择素材 ${asset.title}`}
                    aria-pressed={props.selected}
                    className={cn(
                        "absolute left-2 top-2 z-10 grid size-7 place-items-center rounded-md border border-[var(--studio-border-strong)] bg-[var(--studio-media-overlay)] text-[var(--studio-on-media)] backdrop-blur transition hover:border-[var(--studio-accent)] hover:text-[var(--studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]",
                        props.selected && "border-[var(--studio-accent)] bg-[var(--studio-accent)] text-[var(--primary-foreground)] hover:text-[var(--primary-foreground)]",
                    )}
                    onClick={props.onSelect}
                >
                    {props.selected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                </button>
                <button type="button" className="size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-accent)]" aria-label={`查看素材详情：${asset.title}`} onClick={props.onOpen}>
                    {asset.coverUrl ? <img src={asset.coverUrl} alt={asset.title} className="size-full object-cover" /> : <video src={previewUrl} muted playsInline preload="metadata" className="size-full object-cover" />}
                </button>
                <div
                    className={cn(
                        "absolute bottom-2 left-2 right-2 flex flex-wrap justify-end gap-1 rounded-md bg-[var(--studio-media-overlay)] p-1 opacity-100 backdrop-blur transition lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100",
                        props.selected && "lg:opacity-100",
                    )}
                >
                    <AssetIconButton title="查看" icon={<Eye className="size-3.5" />} onClick={props.onOpen} />
                    <AssetIconButton title="编辑" icon={<PencilLine className="size-3.5" />} onClick={props.onEdit} />
                    <AssetIconButton title="下载" icon={<Download className="size-3.5" />} onClick={props.onDownload} />
                    {shouldShowVolcengineReviewAction(asset.kind) ? (
                        asset.metadata?.volcengineAsset?.assetId && !canSubmitVolcengineReview(asset.metadata.volcengineAsset) ? (
                            <AssetIconButton
                                title={volcengineReviewActionLabel(asset.metadata.volcengineAsset.status)}
                                icon={<RefreshCw className={cn("size-3.5", isVolcengineReviewProcessing(asset.metadata.volcengineAsset) && !props.refreshingReview && "animate-spin")} />}
                                loading={props.refreshingReview}
                                onClick={props.onRefreshReview}
                            />
                        ) : (
                            <AssetIconButton title={asset.metadata?.volcengineAsset?.status === "Failed" ? "重新加白" : "加白"} icon={<ShieldCheck className="size-3.5" />} loading={props.submittingReview} onClick={props.onReview} />
                        )
                    ) : null}
                    <AssetIconButton title="删除" icon={<Trash2 className="size-3.5" />} danger onClick={props.onDelete} />
                </div>
            </div>
            <button type="button" className="block w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-accent)]" title={asset.title} onClick={props.onOpen}>
                <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[var(--studio-text-primary)]">{asset.title || "未命名视频"}</span>
                <span className="mt-2 block truncate text-[11px] text-[var(--studio-text-muted)]">{assetMediaInfo(asset)}</span>
                <span className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-[var(--studio-text-secondary)]">
                    {asset.source ? <span className="truncate">{asset.source}</span> : null}
                    {asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
                </span>
            </button>
        </article>
    );
}
