"use client";

import { Button, Empty } from "antd";
import { FolderInput } from "lucide-react";

import type { Asset, ImageAsset } from "@/stores/use-asset-store";
import { CompactMediaAssetCard } from "./compact-media-asset-card";

type Props = {
    assets: Asset[];
    selectedIds: Set<string>;
    refreshingReviewId: string | null;
    submittingReviewId: string | null;
    onOrganize: (asset: Asset) => void;
    onSelect: (assetId: string) => void;
    onOpen: (asset: Asset) => void;
    onEdit: (asset: Asset) => void;
    onToggleFavorite: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    onDelete: (asset: Asset) => void;
    onReview: (asset: Asset) => void;
    onRefreshReview: (asset: Asset) => void;
    onReviseImage: (asset: ImageAsset) => void;
};

export function AssetInboxSection(props: Props) {
    if (!props.assets.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="待整理区是空的" className="py-20" />;
    return (
        <section className="mx-auto max-w-[1680px]">
            <div className="mb-4 flex items-end justify-between gap-4">
                <div><h2 className="text-lg font-semibold text-[var(--studio-text-primary)]">待整理</h2><p className="mt-1 text-sm text-[var(--studio-text-muted)]">把零散素材归入已有主体，或直接创建新的资产主体。</p></div>
                <span className="shrink-0 text-xs text-[var(--studio-text-muted)]">{props.assets.length} 项</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {props.assets.map((asset) => (
                    <div key={asset.id} className="grid min-w-0 gap-2">
                        <CompactMediaAssetCard
                            asset={asset}
                            selected={props.selectedIds.has(asset.id)}
                            refreshingReview={props.refreshingReviewId === asset.id}
                            submittingReview={props.submittingReviewId === asset.id}
                            onSelect={() => props.onSelect(asset.id)}
                            onOpen={() => props.onOpen(asset)}
                            onEdit={() => props.onEdit(asset)}
                            onToggleFavorite={() => props.onToggleFavorite(asset)}
                            onDownload={() => props.onDownload(asset)}
                            onDelete={() => props.onDelete(asset)}
                            onReview={() => props.onReview(asset)}
                            onRefreshReview={() => props.onRefreshReview(asset)}
                            onReviseImage={asset.kind === "image" ? () => props.onReviseImage(asset) : undefined}
                        />
                        <Button block type="primary" icon={<FolderInput className="size-4" />} onClick={() => props.onOrganize(asset)}>整理</Button>
                    </div>
                ))}
            </div>
        </section>
    );
}
