"use client";

import { Button, Empty, Pagination, Tooltip } from "antd";
import { CheckSquare, Square, Trash2 } from "lucide-react";

import type { Asset, AssetKind, AssetSubject, AssetVariant, ImageAsset } from "@/stores/use-asset-store";
import { cn } from "@/lib/utils";
import { buildAssetSubjectSummary, isGalleryMediaAsset, visibleGallerySubjectGroups } from "../asset-gallery";
import type { AssetProjectResultGroup } from "../asset-project-groups";
import { subjectAssetGroups } from "../asset-subjects";
import type { OutdatedAssetVersionUsage } from "../asset-version-outdated-references";
import { productionBibleKindLabel, type ProductionBibleItem } from "../../canvas/utils/production-bible";
import { AssetListToolbar } from "./asset-list-toolbar";
import { AssetSubjectCard } from "./asset-subject-card";
import { CompactMediaAssetCard } from "./compact-media-asset-card";
import { OutdatedReferencesPanel } from "./outdated-references-panel";

type BulkReviewAction = "submit" | "refresh" | "";

type Props = {
    allFilteredSelected: boolean;
    allVisibleProductionBibleSelected: boolean;
    bulkReviewAction: BulkReviewAction;
    filteredCount: number;
    hasScopedAssetFilter: boolean;
    kindFilter: AssetKind | "all";
    keyword: string;
    page: number;
    pageCount: number;
    productionBibleCount: number;
    projectContextFilter: string;
    referenceVersionFilter: "all" | "outdated";
    refreshingReviewId: string | null;
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
    subjects: AssetSubject[];
    submittingReviewId: string | null;
    usages: OutdatedAssetVersionUsage[];
    variants: AssetVariant[];
    visibleAssetGroups: AssetProjectResultGroup[];
    onAddToProjectLibrary: () => void;
    onBulkDelete: () => void;
    onBulkMove: () => void;
    onBulkTag: () => void;
    onClearOutdatedSelection: () => void;
    onClearSelected: () => void;
    onClearSelectedProductionBibleItems: () => void;
    onDeleteAsset: (asset: Asset) => void;
    onDeleteProductionBibleItem: (item: ProductionBibleItem) => void;
    onBulkDeleteProductionBibleItems: () => void;
    onDownloadAsset: (asset: Asset) => void;
    onEditAsset: (asset: Asset) => void;
    onExportSelected: () => void;
    onOpenAsset: (asset: Asset) => void;
    onOpenBulkOutdated: () => void;
    onPageChange: (page: number) => void;
    onRefreshAssetReview: (asset: Asset) => void;
    onRefreshSelectedReviews: () => void;
    onRemoveFromProjectLibrary: () => void;
    onReviseImage: (asset: ImageAsset) => void;
    onSelectFiltered: () => void;
    onSelectOutdatedUsages: () => void;
    onSelectVisibleProductionBibleItems: () => void;
    onSubmitAssetReview: (asset: Asset) => void;
    onSubmitSelectedReviews: () => void;
    onToggleAsset: (assetId: string) => void;
    onToggleFavorite: (asset: Asset) => void;
    onToggleOutdatedUsage: (usageId: string) => void;
    onToggleProductionBibleItem: (itemId: string) => void;
    onUpdateOutdatedUsage: (usage: OutdatedAssetVersionUsage) => void;
};

export function AssetResultsSection(props: Props) {
    const galleryGroups = props.visibleAssetGroups.map((group) => {
        const subjectGroups = group.isUnfiled ? [] : subjectAssetGroups(props.subjects, group.assets, group.id);
        const visibleSubjects = visibleGallerySubjectGroups({ groups: subjectGroups, kindFilter: props.kindFilter, keyword: props.keyword, hasScopedAssetFilter: props.hasScopedAssetFilter });
        const structuredIds = new Set(subjectGroups.flatMap((item) => item.assets.map((asset) => asset.id)));
        const ordinaryAssets = group.assets.filter((asset) => !structuredIds.has(asset.id)).filter(isGalleryMediaAsset);
        return { group, visibleSubjects, ordinaryAssets };
    });
    const hasVisibleResults = galleryGroups.some(({ group, visibleSubjects, ordinaryAssets }) => group.productionBibleItems.length || visibleSubjects.length || ordinaryAssets.length);

    return (
        <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
            {props.referenceVersionFilter === "outdated" ? (
                <OutdatedReferencesPanel usages={props.usages} selectedIds={props.selectedOutdatedUsageIds} onToggle={props.onToggleOutdatedUsage} onSelectAll={props.onSelectOutdatedUsages} onClear={props.onClearOutdatedSelection} onUpdateOne={props.onUpdateOutdatedUsage} onOpenBatch={props.onOpenBulkOutdated} />
            ) : (
                <>
                    <AssetListToolbar
                        allFilteredSelected={props.allFilteredSelected}
                        allVisibleProductionBibleSelected={props.allVisibleProductionBibleSelected}
                        bulkReviewAction={props.bulkReviewAction}
                        filteredCount={props.filteredCount}
                        productionBibleCount={props.productionBibleCount}
                        projectContextFilter={props.projectContextFilter}
                        selectedCount={props.selectedAssetsCount}
                        selectedInFilteredCount={props.selectedInFilteredCount}
                        selectedProductionBibleCount={props.selectedProductionBibleCount}
                        selectedProductionBibleInVisibleCount={props.selectedProductionBibleInVisibleCount}
                        selectedProductionBibleSummary={props.selectedProductionBibleSummary}
                        selectedSummary={props.selectedAssetSummary}
                        selectedVolcengineRefreshCount={props.selectedVolcengineRefreshCount}
                        selectedVolcengineSubmitCount={props.selectedVolcengineSubmitCount}
                        onAddToProjectLibrary={props.onAddToProjectLibrary}
                        onBulkDelete={props.onBulkDelete}
                        onBulkDeleteProductionBibleItems={props.onBulkDeleteProductionBibleItems}
                        onBulkMove={props.onBulkMove}
                        onBulkTag={props.onBulkTag}
                        onClearSelected={props.onClearSelected}
                        onClearSelectedProductionBibleItems={props.onClearSelectedProductionBibleItems}
                        onExportSelected={props.onExportSelected}
                        onRefreshSelectedReviews={props.onRefreshSelectedReviews}
                        onRemoveFromProjectLibrary={props.onRemoveFromProjectLibrary}
                        onSelectFiltered={props.onSelectFiltered}
                        onSelectVisibleProductionBibleItems={props.onSelectVisibleProductionBibleItems}
                        onSubmitSelectedReviews={props.onSubmitSelectedReviews}
                    />

                    <div className="grid gap-8">
                        {galleryGroups.map(({ group, visibleSubjects, ordinaryAssets }) => (
                            <section key={group.id} className="grid gap-4 border-t border-[var(--studio-border-subtle)] pt-6 first:border-t-0 first:pt-0">
                                <div className="flex items-end justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold text-[var(--studio-accent)]">项目资产</div>
                                        <h2 className="mt-1 truncate text-xl font-semibold leading-7 text-[var(--studio-text-primary)]">{group.title}</h2>
                                    </div>
                                    <div className="shrink-0 text-xs text-[var(--studio-text-muted)]">设定 {group.productionBibleItems.length} · 资产 {group.assets.length}</div>
                                </div>

                                {group.productionBibleItems.length ? (
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                        {group.productionBibleItems.map((item) => <ProductionBibleSummaryCard key={item.id} item={item} selected={props.selectedProductionBibleItemIds.has(item.id)} onDelete={props.onDeleteProductionBibleItem} onSelect={() => props.onToggleProductionBibleItem(item.id)} />)}
                                    </div>
                                ) : null}

                                {visibleSubjects.length || ordinaryAssets.length ? (
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                                        {visibleSubjects.map(({ subject, assets }) => <AssetSubjectCard key={subject.id} summary={buildAssetSubjectSummary(subject, assets, props.variants)} />)}
                                        {ordinaryAssets.map((asset) => (
                                            <CompactMediaAssetCard
                                                key={asset.id}
                                                asset={asset}
                                                selected={props.selectedAssetIds.has(asset.id)}
                                                refreshingReview={props.refreshingReviewId === asset.id}
                                                submittingReview={props.submittingReviewId === asset.id}
                                                onSelect={() => props.onToggleAsset(asset.id)}
                                                onOpen={() => props.onOpenAsset(asset)}
                                                onEdit={() => props.onEditAsset(asset)}
                                                onToggleFavorite={() => props.onToggleFavorite(asset)}
                                                onDownload={() => props.onDownloadAsset(asset)}
                                                onDelete={() => props.onDeleteAsset(asset)}
                                                onReview={() => props.onSubmitAssetReview(asset)}
                                                onRefreshReview={() => props.onRefreshAssetReview(asset)}
                                                onReviseImage={asset.kind === "image" ? () => props.onReviseImage(asset) : undefined}
                                            />
                                        ))}
                                    </div>
                                ) : null}
                            </section>
                        ))}
                    </div>

                    {!hasVisibleResults ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到媒体资产或设定" className="py-20" /> : null}
                    {props.pageCount > 1 ? <div className="flex justify-center"><Pagination current={props.page} pageSize={1} total={props.pageCount} showSizeChanger={false} onChange={props.onPageChange} /></div> : null}
                </>
            )}
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
                    <Tooltip title={selected ? "取消选择设定" : "选择设定"}><Button aria-label={selected ? `取消选择设定 ${title}` : `选择设定 ${title}`} aria-pressed={selected} className={cn("mt-0.5 !h-7 !w-7 !min-w-7 !p-0", selected && "!border-[var(--studio-accent)] !bg-[var(--studio-accent)] !text-[var(--primary-foreground)]")} icon={selected ? <CheckSquare size={14} /> : <Square size={14} />} size="small" type={selected ? "primary" : "default"} onClick={(event) => { event.stopPropagation(); onSelect(); }} /></Tooltip>
                    <div className="min-w-0"><div className="flex flex-wrap gap-1.5 text-[11px] font-medium"><span className="rounded-md bg-[var(--studio-accent-soft)] px-2 py-0.5 text-[var(--studio-accent)]">设定库</span><span className="rounded-md border border-[var(--studio-border-subtle)] px-2 py-0.5 text-[var(--studio-text-secondary)]">{productionBibleKindLabel(item.kind)}</span></div><h3 className="mt-2 truncate text-base font-semibold leading-6 text-[var(--studio-text-primary)]">{title}</h3></div>
                </div>
                <div className="flex shrink-0 items-center gap-1"><span className="rounded-md border border-[var(--studio-border-subtle)] px-2 py-1 text-xs text-[var(--studio-text-secondary)]">{item.assetRefs.length ? `已绑定 ${item.assetRefs.length}` : "未绑定"}</span><Tooltip title="删除设定"><Button aria-label={`删除设定 ${title}`} className="text-[var(--studio-text-muted)] hover:text-[var(--studio-danger)]" danger icon={<Trash2 size={14} />} size="small" type="text" onClick={(event) => { event.stopPropagation(); onDelete(item); }} /></Tooltip></div>
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--studio-text-secondary)]">{item.description || "暂无设定描述"}</p>
            {item.tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{item.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-md border border-[var(--studio-border-subtle)] px-2 py-0.5 text-xs text-[var(--studio-text-muted)]">{tag}</span>)}</div> : null}
            {snippet ? <div className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--studio-text-muted)]">{snippet}</div> : null}
        </article>
    );
}
