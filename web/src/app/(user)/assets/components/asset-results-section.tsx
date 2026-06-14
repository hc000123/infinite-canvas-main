"use client";

import { Button, Empty, Pagination, Tooltip } from "antd";
import { CheckSquare, Square, Trash2 } from "lucide-react";

import type { Asset, AssetFolder } from "@/stores/use-asset-store";
import { cn } from "@/lib/utils";
import type { AssetProjectResultGroup } from "../asset-project-groups";
import type { AssetSortMode } from "../asset-page-filters";
import type { OutdatedAssetVersionUsage } from "../asset-version-outdated-references";
import { productionBibleKindLabel, type ProductionBibleItem } from "../../canvas/utils/production-bible";
import { AssetCard } from "./asset-card";
import { AssetListToolbar } from "./asset-list-toolbar";
import { OutdatedReferencesPanel } from "./outdated-references-panel";

type BulkReviewAction = "submit" | "refresh" | "";

type Props = {
    allFilteredSelected: boolean;
    allVisibleProductionBibleSelected: boolean;
    bulkReviewAction: BulkReviewAction;
    canvasLibraryFilter: string;
    filteredCount: number;
    folderMap: Map<string, AssetFolder>;
    page: number;
    pageSize: number;
    productionBibleCount: number;
    projectContextFilter: string;
    referenceVersionFilter: "all" | "outdated";
    refreshingReviewId: string | null;
    generatingWorkflowAssetId: string | null;
    selectedAssetIds: Set<string>;
    selectedAssetSummary: string;
    selectedAssetsCount: number;
    selectedInFilteredCount: number;
    selectedOutdatedUsageIds: Set<string>;
    selectedProductionBibleCount: number;
    selectedProductionBibleInVisibleCount: number;
    selectedProductionBibleItemIds: Set<string>;
    selectedProductionBibleSummary: string;
    selectedVolcengineRefreshCount: number;
    selectedVolcengineSubmitCount: number;
    sortMode: AssetSortMode;
    submittingReviewId: string | null;
    usages: OutdatedAssetVersionUsage[];
    visibleAssetGroups: AssetProjectResultGroup[];
    onAddToProjectLibrary: () => void;
    onBulkDelete: () => void;
    onBulkMove: () => void;
    onBulkTag: () => void;
    onClearOutdatedSelection: () => void;
    onClearSelected: () => void;
    onClearSelectedProductionBibleItems: () => void;
    onCopyAsset: (asset: Asset) => void;
    onDeleteAsset: (asset: Asset) => void;
    onDeleteProductionBibleItem: (item: ProductionBibleItem) => void;
    onBulkDeleteProductionBibleItems: () => void;
    onDownloadAsset: (asset: Asset) => void;
    onEditAsset: (asset: Asset) => void;
    onExportSelected: () => void;
    onOpenAsset: (asset: Asset) => void;
    onOpenBulkOutdated: () => void;
    onPageChange: (page: number, pageSize: number) => void;
    onRefreshAssetReview: (asset: Asset) => void;
    onGenerateWorkflowImage: (asset: Asset) => void;
    onRefreshSelectedReviews: () => void;
    onRemoveFromProjectLibrary: () => void;
    onSelectFiltered: () => void;
    onSelectOutdatedUsages: () => void;
    onSelectVisibleProductionBibleItems: () => void;
    onSortModeChange: (value: AssetSortMode) => void;
    onSubmitAssetReview: (asset: Asset) => void;
    onSubmitSelectedReviews: () => void;
    onToggleAsset: (assetId: string) => void;
    onToggleOutdatedUsage: (usageId: string) => void;
    onToggleProductionBibleItem: (itemId: string) => void;
    onUpdateOutdatedUsage: (usage: OutdatedAssetVersionUsage) => void;
};

export function AssetResultsSection({
    allFilteredSelected,
    allVisibleProductionBibleSelected,
    bulkReviewAction,
    canvasLibraryFilter,
    filteredCount,
    folderMap,
    page,
    pageSize,
    productionBibleCount,
    projectContextFilter,
    referenceVersionFilter,
    refreshingReviewId,
    generatingWorkflowAssetId,
    selectedAssetIds,
    selectedAssetSummary,
    selectedAssetsCount,
    selectedInFilteredCount,
    selectedOutdatedUsageIds,
    selectedProductionBibleCount,
    selectedProductionBibleInVisibleCount,
    selectedProductionBibleItemIds,
    selectedProductionBibleSummary,
    selectedVolcengineRefreshCount,
    selectedVolcengineSubmitCount,
    sortMode,
    submittingReviewId,
    usages,
    visibleAssetGroups,
    onAddToProjectLibrary,
    onBulkDelete,
    onBulkMove,
    onBulkTag,
    onClearOutdatedSelection,
    onClearSelected,
    onClearSelectedProductionBibleItems,
    onCopyAsset,
    onDeleteAsset,
    onDeleteProductionBibleItem,
    onBulkDeleteProductionBibleItems,
    onDownloadAsset,
    onEditAsset,
    onExportSelected,
    onOpenAsset,
    onOpenBulkOutdated,
    onPageChange,
    onRefreshAssetReview,
    onGenerateWorkflowImage,
    onRefreshSelectedReviews,
    onRemoveFromProjectLibrary,
    onSelectFiltered,
    onSelectOutdatedUsages,
    onSelectVisibleProductionBibleItems,
    onSortModeChange,
    onSubmitAssetReview,
    onSubmitSelectedReviews,
    onToggleAsset,
    onToggleOutdatedUsage,
    onToggleProductionBibleItem,
    onUpdateOutdatedUsage,
}: Props) {
    const hasVisibleResults = visibleAssetGroups.some((group) => group.assets.length || group.productionBibleItems.length);
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
                    allVisibleProductionBibleSelected={allVisibleProductionBibleSelected}
                    bulkReviewAction={bulkReviewAction}
                    filteredCount={filteredCount}
                    productionBibleCount={productionBibleCount}
                    projectContextFilter={projectContextFilter}
                    selectedCount={selectedAssetsCount}
                    selectedInFilteredCount={selectedInFilteredCount}
                    selectedProductionBibleCount={selectedProductionBibleCount}
                    selectedProductionBibleInVisibleCount={selectedProductionBibleInVisibleCount}
                    selectedProductionBibleSummary={selectedProductionBibleSummary}
                    selectedSummary={selectedAssetSummary}
                    selectedVolcengineRefreshCount={selectedVolcengineRefreshCount}
                    selectedVolcengineSubmitCount={selectedVolcengineSubmitCount}
                    sortMode={sortMode}
                    onAddToProjectLibrary={onAddToProjectLibrary}
                    onBulkDelete={onBulkDelete}
                    onBulkDeleteProductionBibleItems={onBulkDeleteProductionBibleItems}
                    onBulkMove={onBulkMove}
                    onBulkTag={onBulkTag}
                    onClearSelected={onClearSelected}
                    onClearSelectedProductionBibleItems={onClearSelectedProductionBibleItems}
                    onExportSelected={onExportSelected}
                    onRefreshSelectedReviews={onRefreshSelectedReviews}
                    onRemoveFromProjectLibrary={onRemoveFromProjectLibrary}
                    onSelectFiltered={onSelectFiltered}
                    onSelectVisibleProductionBibleItems={onSelectVisibleProductionBibleItems}
                    onSortModeChange={onSortModeChange}
                    onSubmitSelectedReviews={onSubmitSelectedReviews}
                />
            ) : null}
            {referenceVersionFilter !== "outdated" ? (
                <>
                    <div className="grid gap-8">
                        {visibleAssetGroups.map((group) => (
                            <section key={group.id} className="grid gap-4 border-t border-[var(--studio-border-subtle)] pt-6 first:border-t-0 first:pt-0">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--studio-accent)]">Project Library</div>
                                        <h2 className="mt-1 truncate text-xl font-semibold leading-7 text-[var(--studio-text-primary)]">{group.title}</h2>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs font-medium text-[var(--studio-text-secondary)]">
                                        <span className="rounded-md border border-[var(--studio-border-subtle)] px-2.5 py-1">设定 {group.productionBibleItems.length}</span>
                                        <span className="rounded-md border border-[var(--studio-border-subtle)] px-2.5 py-1">素材 {group.assets.length}</span>
                                    </div>
                                </div>

                                {group.productionBibleItems.length ? (
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {group.productionBibleItems.map((item) => (
                                            <ProductionBibleSummaryCard key={item.id} item={item} selected={selectedProductionBibleItemIds.has(item.id)} onDelete={onDeleteProductionBibleItem} onSelect={() => onToggleProductionBibleItem(item.id)} />
                                        ))}
                                    </div>
                                ) : null}

                                {group.assets.length ? (
                                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {group.assets.map((asset) => (
                                            <AssetCard
                                                key={asset.id}
                                                asset={asset}
                                                folderName={asset.folderId ? folderMap.get(asset.folderId)?.name : ""}
                                                selected={selectedAssetIds.has(asset.id)}
                                                refreshingReview={refreshingReviewId === asset.id}
                                                generatingWorkflowImage={generatingWorkflowAssetId === asset.id}
                                                onSelect={() => onToggleAsset(asset.id)}
                                                onOpen={() => onOpenAsset(asset)}
                                                onEdit={() => onEditAsset(asset)}
                                                onCopy={onCopyAsset}
                                                onDownload={onDownloadAsset}
                                                onDelete={() => onDeleteAsset(asset)}
                                                submittingReview={submittingReviewId === asset.id}
                                                onReview={() => onSubmitAssetReview(asset)}
                                                onRefreshReview={() => onRefreshAssetReview(asset)}
                                                onGenerateWorkflowImage={onGenerateWorkflowImage}
                                                projectLibraryProjectId={group.isUnfiled ? projectContextFilter : group.id}
                                                canvasLibraryCanvasId={canvasLibraryFilter}
                                            />
                                        ))}
                                    </div>
                                ) : null}
                            </section>
                        ))}
                    </div>

                    {!hasVisibleResults ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到素材或设定" className="py-20" /> : null}

                    <div className="flex justify-center">
                        <Pagination current={page} pageSize={pageSize} total={filteredCount} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} onChange={onPageChange} />
                    </div>
                </>
            ) : null}
        </div>
    );
}

function ProductionBibleSummaryCard({ item, selected, onDelete, onSelect }: { item: ProductionBibleItem; selected: boolean; onDelete: (item: ProductionBibleItem) => void; onSelect: () => void }) {
    const snippet = [item.promptSnippets.positive, item.promptSnippets.consistency].filter(Boolean).join(" / ");
    const title = item.name || "未命名设定";
    return (
        <article className={cn("rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-4", selected && "border-[var(--studio-accent)] ring-2 ring-[var(--studio-accent)]")}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-2">
                    <Tooltip title={selected ? "取消选择设定" : "选择设定"}>
                        <Button
                            aria-label={selected ? `取消选择设定 ${title}` : `选择设定 ${title}`}
                            aria-pressed={selected}
                            className={cn("mt-0.5 !h-7 !w-7 !min-w-7 !p-0", selected && "!border-[var(--studio-accent)] !bg-[var(--studio-accent)] !text-[var(--primary-foreground)]")}
                            icon={selected ? <CheckSquare size={14} /> : <Square size={14} />}
                            size="small"
                            type={selected ? "primary" : "default"}
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelect();
                            }}
                        />
                    </Tooltip>
                    <div className="min-w-0">
                        <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                            <span className="rounded-md bg-[var(--studio-accent-soft)] px-2 py-0.5 text-[var(--studio-accent)]">设定库</span>
                            <span className="rounded-md border border-[var(--studio-border-subtle)] px-2 py-0.5 text-[var(--studio-text-secondary)]">{productionBibleKindLabel(item.kind)}</span>
                        </div>
                        <h3 className="mt-2 truncate text-base font-semibold leading-6 text-[var(--studio-text-primary)]">{title}</h3>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <span className="rounded-md border border-[var(--studio-border-subtle)] px-2 py-1 text-xs text-[var(--studio-text-secondary)]">{item.assetRefs.length ? `已绑定 ${item.assetRefs.length}` : "未绑定"}</span>
                    <Tooltip title="删除设定">
                        <Button
                            aria-label={`删除设定 ${title}`}
                            className="text-[var(--studio-text-muted)] hover:text-red-400"
                            danger
                            icon={<Trash2 size={14} />}
                            size="small"
                            type="text"
                            onClick={(event) => {
                                event.stopPropagation();
                                onDelete(item);
                            }}
                        />
                    </Tooltip>
                </div>
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--studio-text-secondary)]">{item.description || "暂无设定描述"}</p>
            {item.tags.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded-md border border-[var(--studio-border-subtle)] px-2 py-0.5 text-xs text-[var(--studio-text-muted)]">
                            {tag}
                        </span>
                    ))}
                </div>
            ) : null}
            {snippet ? <div className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--studio-text-muted)]">{snippet}</div> : null}
        </article>
    );
}
