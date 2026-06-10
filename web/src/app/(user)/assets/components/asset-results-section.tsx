"use client";

import { Empty, Pagination } from "antd";

import type { Asset, AssetFolder } from "@/stores/use-asset-store";
import type { AssetSortMode } from "../asset-page-filters";
import type { OutdatedAssetVersionUsage } from "../asset-version-outdated-references";
import { AssetCard } from "./asset-card";
import { AssetListToolbar } from "./asset-list-toolbar";
import { OutdatedReferencesPanel } from "./outdated-references-panel";

type BulkReviewAction = "submit" | "refresh" | "";

type Props = {
    allFilteredSelected: boolean;
    bulkReviewAction: BulkReviewAction;
    canvasLibraryFilter: string;
    filteredCount: number;
    folderMap: Map<string, AssetFolder>;
    page: number;
    pageSize: number;
    projectContextFilter: string;
    referenceVersionFilter: "all" | "outdated";
    refreshingReviewId: string | null;
    selectedAssetIds: Set<string>;
    selectedAssetSummary: string;
    selectedAssetsCount: number;
    selectedInFilteredCount: number;
    selectedOutdatedUsageIds: Set<string>;
    selectedVolcengineRefreshCount: number;
    selectedVolcengineSubmitCount: number;
    sortMode: AssetSortMode;
    submittingReviewId: string | null;
    usages: OutdatedAssetVersionUsage[];
    visibleAssets: Asset[];
    onAddToProjectLibrary: () => void;
    onBulkDelete: () => void;
    onBulkMove: () => void;
    onBulkTag: () => void;
    onClearOutdatedSelection: () => void;
    onClearSelected: () => void;
    onCopyAsset: (asset: Asset) => void;
    onDeleteAsset: (asset: Asset) => void;
    onDownloadAsset: (asset: Asset) => void;
    onEditAsset: (asset: Asset) => void;
    onExportSelected: () => void;
    onOpenAsset: (asset: Asset) => void;
    onOpenBulkOutdated: () => void;
    onPageChange: (page: number, pageSize: number) => void;
    onRefreshAssetReview: (asset: Asset) => void;
    onRefreshSelectedReviews: () => void;
    onRemoveFromProjectLibrary: () => void;
    onSelectFiltered: () => void;
    onSelectOutdatedUsages: () => void;
    onSortModeChange: (value: AssetSortMode) => void;
    onSubmitAssetReview: (asset: Asset) => void;
    onSubmitSelectedReviews: () => void;
    onToggleAsset: (assetId: string) => void;
    onToggleOutdatedUsage: (usageId: string) => void;
    onUpdateOutdatedUsage: (usage: OutdatedAssetVersionUsage) => void;
};

export function AssetResultsSection({
    allFilteredSelected,
    bulkReviewAction,
    canvasLibraryFilter,
    filteredCount,
    folderMap,
    page,
    pageSize,
    projectContextFilter,
    referenceVersionFilter,
    refreshingReviewId,
    selectedAssetIds,
    selectedAssetSummary,
    selectedAssetsCount,
    selectedInFilteredCount,
    selectedOutdatedUsageIds,
    selectedVolcengineRefreshCount,
    selectedVolcengineSubmitCount,
    sortMode,
    submittingReviewId,
    usages,
    visibleAssets,
    onAddToProjectLibrary,
    onBulkDelete,
    onBulkMove,
    onBulkTag,
    onClearOutdatedSelection,
    onClearSelected,
    onCopyAsset,
    onDeleteAsset,
    onDownloadAsset,
    onEditAsset,
    onExportSelected,
    onOpenAsset,
    onOpenBulkOutdated,
    onPageChange,
    onRefreshAssetReview,
    onRefreshSelectedReviews,
    onRemoveFromProjectLibrary,
    onSelectFiltered,
    onSelectOutdatedUsages,
    onSortModeChange,
    onSubmitAssetReview,
    onSubmitSelectedReviews,
    onToggleAsset,
    onToggleOutdatedUsage,
    onUpdateOutdatedUsage,
}: Props) {
    return (
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
            {referenceVersionFilter === "outdated" ? (
                <OutdatedReferencesPanel
                    usages={usages}
                    selectedIds={selectedOutdatedUsageIds}
                    onToggle={onToggleOutdatedUsage}
                    onSelectAll={onSelectOutdatedUsages}
                    onClear={onClearOutdatedSelection}
                    onUpdateOne={onUpdateOutdatedUsage}
                    onOpenBatch={onOpenBulkOutdated}
                />
            ) : null}
            {referenceVersionFilter !== "outdated" ? (
                <AssetListToolbar
                    allFilteredSelected={allFilteredSelected}
                    bulkReviewAction={bulkReviewAction}
                    filteredCount={filteredCount}
                    projectContextFilter={projectContextFilter}
                    selectedCount={selectedAssetsCount}
                    selectedInFilteredCount={selectedInFilteredCount}
                    selectedSummary={selectedAssetSummary}
                    selectedVolcengineRefreshCount={selectedVolcengineRefreshCount}
                    selectedVolcengineSubmitCount={selectedVolcengineSubmitCount}
                    sortMode={sortMode}
                    onAddToProjectLibrary={onAddToProjectLibrary}
                    onBulkDelete={onBulkDelete}
                    onBulkMove={onBulkMove}
                    onBulkTag={onBulkTag}
                    onClearSelected={onClearSelected}
                    onExportSelected={onExportSelected}
                    onRefreshSelectedReviews={onRefreshSelectedReviews}
                    onRemoveFromProjectLibrary={onRemoveFromProjectLibrary}
                    onSelectFiltered={onSelectFiltered}
                    onSortModeChange={onSortModeChange}
                    onSubmitSelectedReviews={onSubmitSelectedReviews}
                />
            ) : null}
            {referenceVersionFilter !== "outdated" ? (
                <>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {visibleAssets.map((asset) => (
                            <AssetCard
                                key={asset.id}
                                asset={asset}
                                folderName={asset.folderId ? folderMap.get(asset.folderId)?.name : ""}
                                selected={selectedAssetIds.has(asset.id)}
                                refreshingReview={refreshingReviewId === asset.id}
                                onSelect={() => onToggleAsset(asset.id)}
                                onOpen={() => onOpenAsset(asset)}
                                onEdit={() => onEditAsset(asset)}
                                onCopy={onCopyAsset}
                                onDownload={onDownloadAsset}
                                onDelete={() => onDeleteAsset(asset)}
                                submittingReview={submittingReviewId === asset.id}
                                onReview={() => onSubmitAssetReview(asset)}
                                onRefreshReview={() => onRefreshAssetReview(asset)}
                                projectLibraryProjectId={projectContextFilter}
                                canvasLibraryCanvasId={canvasLibraryFilter}
                            />
                        ))}
                    </div>

                    {!visibleAssets.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到素材" className="py-20" /> : null}

                    <div className="flex justify-center">
                        <Pagination current={page} pageSize={pageSize} total={filteredCount} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} onChange={onPageChange} />
                    </div>
                </>
            ) : null}
        </div>
    );
}
