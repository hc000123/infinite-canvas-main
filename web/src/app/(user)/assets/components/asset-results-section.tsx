"use client";

import { useState } from "react";
import { Button, Empty, Pagination, Tooltip } from "antd";
import { CheckSquare, ChevronDown, ChevronRight, Square, Trash2 } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { cn } from "@/lib/utils";
import { assetEpisodeTitle, primaryAssetEpisodeKey } from "../asset-episode";
import type { AssetProjectResultGroup } from "../asset-project-groups";
import type { AssetSortMode } from "../asset-page-filters";
import type { OutdatedAssetVersionUsage } from "../asset-version-outdated-references";
import { productionBibleKindLabel, type ProductionBibleItem } from "../../canvas/utils/production-bible";
import { assetKindLabel } from "../asset-utils";
import { workflowAssetInfo } from "../workflow-asset-image";
import { AssetRow } from "./asset-card";
import { AssetListToolbar } from "./asset-list-toolbar";
import { OutdatedReferencesPanel } from "./outdated-references-panel";

type BulkReviewAction = "submit" | "refresh" | "";

type Props = {
    allFilteredSelected: boolean;
    allVisibleProductionBibleSelected: boolean;
    assetPaginationEnabled: boolean;
    bulkReviewAction: BulkReviewAction;
    episodeTitleMap: Record<string, string>;
    filteredCount: number;
    page: number;
    pageSize: number;
    productionBibleCount: number;
    projectContextFilter: string;
    referenceVersionFilter: "all" | "outdated";
    refreshingReviewId: string | null;
    generatingWorkflowAssetId: string | null;
    uploadingWorkflowAssetId: string | null;
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
    showEpisodeGroups: boolean;
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
    onMatchWorkflowImage: (asset: Asset) => void;
    onUploadWorkflowImage: (asset: Asset) => void;
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
    assetPaginationEnabled,
    bulkReviewAction,
    episodeTitleMap,
    filteredCount,
    page,
    pageSize,
    productionBibleCount,
    projectContextFilter,
    referenceVersionFilter,
    refreshingReviewId,
    generatingWorkflowAssetId,
    uploadingWorkflowAssetId,
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
    showEpisodeGroups,
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
    onMatchWorkflowImage,
    onUploadWorkflowImage,
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
    const [collapsedAssetTypeGroups, setCollapsedAssetTypeGroups] = useState<Record<string, boolean>>({});
    const hasVisibleResults = visibleAssetGroups.some((group) => group.assets.length || group.productionBibleItems.length);
    const showAssetPagination = assetPaginationEnabled && filteredCount > pageSize;
    const toggleAssetTypeGroup = (id: string) => setCollapsedAssetTypeGroups((value) => ({ ...value, [id]: !value[id] }));
    const expandAssetTypeGroup = (id: string) => setCollapsedAssetTypeGroups((value) => ({ ...value, [id]: false }));
    const renderAssetTypeGroups = (groupId: string, typeGroups: AssetTypeGroup[], scopeId = "") => (
        <div className="grid gap-3">
            {typeGroups.map((typeGroup) => {
                const typeGroupId = assetTypeGroupDomId(groupId, scopeId ? `${scopeId}-${typeGroup.id}` : typeGroup.id);
                const collapsed = collapsedAssetTypeGroups[typeGroupId] === true;
                const stats = workflowAssetTypeStats(typeGroup.assets);
                return (
                    <section key={typeGroup.id} id={typeGroupId} className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
                        <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => toggleAssetTypeGroup(typeGroupId)} aria-expanded={!collapsed}>
                            <span className="flex min-w-0 items-center gap-2">
                                {collapsed ? <ChevronRight className="size-4 shrink-0 text-[var(--studio-text-muted)]" /> : <ChevronDown className="size-4 shrink-0 text-[var(--studio-accent)]" />}
                                <span className="truncate text-base font-semibold text-[var(--studio-text-primary)]">{typeGroup.title}</span>
                                <span className="rounded-md border border-[var(--studio-border-subtle)] px-2 py-0.5 text-xs text-[var(--studio-text-secondary)]">{typeGroup.assets.length}</span>
                            </span>
                            {stats.total ? (
                                <span className="shrink-0 text-xs text-[var(--studio-text-muted)]">
                                    已生图 {stats.generated} / 待生图 {stats.pending}
                                </span>
                            ) : null}
                        </button>
                        {!collapsed ? (
                            <div className="grid gap-2.5 border-t border-[var(--studio-border-subtle)] p-3">
                                {typeGroup.assets.map((asset) => (
                                    <AssetRow
                                        key={asset.id}
                                        asset={asset}
                                        selected={selectedAssetIds.has(asset.id)}
                                        refreshingReview={refreshingReviewId === asset.id}
                                        generatingWorkflowImage={generatingWorkflowAssetId === asset.id}
                                        uploadingWorkflowImage={uploadingWorkflowAssetId === asset.id}
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
                                        onMatchWorkflowImage={onMatchWorkflowImage}
                                        onUploadWorkflowImage={onUploadWorkflowImage}
                                    />
                                ))}
                            </div>
                        ) : null}
                    </section>
                );
            })}
        </div>
    );

    return (
        <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
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
                        {visibleAssetGroups.map((group) => {
                            const episodeGroups = showEpisodeGroups ? buildAssetEpisodeGroups(group.assets, episodeTitleMap) : [];
                            const projectTypeGroups = showEpisodeGroups ? [] : buildAssetTypeGroups(group.assets);
                            return (
                                <section key={group.id} className="grid gap-4 border-t border-[var(--studio-border-subtle)] pt-6 first:border-t-0 first:pt-0">
                                    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                                        <div className="min-w-0">
                                            <div className="text-xs font-semibold tracking-normal text-[var(--studio-accent)]">项目素材库</div>
                                            <h2 className="mt-1 truncate text-xl font-semibold leading-7 text-[var(--studio-text-primary)]">{group.title}</h2>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs font-medium text-[var(--studio-text-secondary)]">
                                            <span className="rounded-md border border-[var(--studio-border-subtle)] px-2.5 py-1">设定 {group.productionBibleItems.length}</span>
                                            <span className="rounded-md border border-[var(--studio-border-subtle)] px-2.5 py-1">素材 {group.assets.length}</span>
                                        </div>
                                    </div>
                                    {showEpisodeGroups && episodeGroups.length ? (
                                        <div className="flex flex-wrap gap-2">
                                            {episodeGroups.map((episodeGroup) => (
                                                <span key={episodeGroup.id} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-2.5 py-1 text-xs font-medium text-[var(--studio-text-secondary)]">
                                                    {episodeGroup.title} {episodeGroup.assets.length}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                    {!showEpisodeGroups && projectTypeGroups.length ? (
                                        <div className="flex flex-wrap gap-2">
                                            {projectTypeGroups.map((typeGroup) => {
                                                const typeGroupId = assetTypeGroupDomId(group.id, typeGroup.id);
                                                return (
                                                    <button key={typeGroup.id} type="button" className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-2.5 py-1 text-xs font-medium text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-accent)] hover:text-[var(--studio-accent)]" onClick={() => expandAssetTypeGroup(typeGroupId)}>
                                                        {typeGroup.title} {typeGroup.assets.length}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : null}

                                    {group.productionBibleItems.length ? (
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                            {group.productionBibleItems.map((item) => (
                                                <ProductionBibleSummaryCard key={item.id} item={item} selected={selectedProductionBibleItemIds.has(item.id)} onDelete={onDeleteProductionBibleItem} onSelect={() => onToggleProductionBibleItem(item.id)} />
                                            ))}
                                        </div>
                                    ) : null}

                                    {showEpisodeGroups && episodeGroups.length ? (
                                        <div className="grid gap-5">
                                            {episodeGroups.map((episodeGroup) => {
                                                const assetTypeGroups = buildAssetTypeGroups(episodeGroup.assets);
                                                return (
                                                    <section key={episodeGroup.id} className="grid gap-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                                                        <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
                                                            <div className="min-w-0">
                                                                <div className="text-xs font-semibold tracking-normal text-[var(--studio-text-muted)]">集数</div>
                                                                <h3 className="mt-0.5 truncate text-base font-semibold text-[var(--studio-text-primary)]">{episodeGroup.title}</h3>
                                                            </div>
                                                            <span className="text-xs text-[var(--studio-text-muted)]">素材 {episodeGroup.assets.length}</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 px-1">
                                                            {assetTypeGroups.map((typeGroup) => {
                                                                const typeGroupId = assetTypeGroupDomId(group.id, `${episodeGroup.id}-${typeGroup.id}`);
                                                                return (
                                                                    <button key={typeGroup.id} type="button" className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-2.5 py-1 text-xs font-medium text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-accent)] hover:text-[var(--studio-accent)]" onClick={() => expandAssetTypeGroup(typeGroupId)}>
                                                                        {typeGroup.title} {typeGroup.assets.length}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        {renderAssetTypeGroups(group.id, assetTypeGroups, episodeGroup.id)}
                                                    </section>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                    {!showEpisodeGroups && projectTypeGroups.length ? renderAssetTypeGroups(group.id, projectTypeGroups) : null}
                                </section>
                            );
                        })}
                    </div>

                    {!hasVisibleResults ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到素材或设定" className="py-20" /> : null}

                    {showAssetPagination ? (
                        <div className="flex justify-center">
                            <Pagination current={page} pageSize={pageSize} total={filteredCount} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} onChange={onPageChange} />
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

type AssetEpisodeGroup = {
    id: string;
    title: string;
    assets: Asset[];
};

function buildAssetEpisodeGroups(assets: Asset[], labels: Record<string, string>): AssetEpisodeGroup[] {
    const groups = new Map<string, AssetEpisodeGroup>();
    assets.forEach((asset) => {
        const id = primaryAssetEpisodeKey(asset) || "__episode_unknown";
        const title = assetEpisodeTitle(asset, labels);
        const group = groups.get(id) || { id, title, assets: [] };
        group.assets.push(asset);
        groups.set(id, group);
    });
    return Array.from(groups.values()).sort((a, b) => assetEpisodeSortIndex(a.title) - assetEpisodeSortIndex(b.title) || a.title.localeCompare(b.title, "zh-Hans-CN"));
}

function assetEpisodeSortIndex(title: string) {
    const match = title.match(/第\s*(\d+)\s*集/);
    return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

type AssetTypeGroup = {
    id: string;
    title: string;
    assets: Asset[];
};

function buildAssetTypeGroups(assets: Asset[]): AssetTypeGroup[] {
    const groups = new Map<string, AssetTypeGroup>();
    assets.forEach((asset) => {
        const title = assetTypeGroupTitle(asset);
        const id = normalizeAssetTypeGroupId(title);
        const group = groups.get(id) || { id, title, assets: [] };
        group.assets.push(asset);
        groups.set(id, group);
    });
    return Array.from(groups.values()).sort((a, b) => assetTypeSortIndex(a.title) - assetTypeSortIndex(b.title) || a.title.localeCompare(b.title, "zh-Hans-CN"));
}

function assetTypeGroupTitle(asset: Asset) {
    const workflowType = workflowAssetInfo(asset)?.type?.trim();
    if (workflowType) return workflowType;
    const titleType = asset.title.split("·").pop()?.trim();
    if (titleType && titleType.length <= 8) return titleType;
    return assetKindLabel(asset.kind);
}

function normalizeAssetTypeGroupId(value: string) {
    return value.replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5-]/g, "") || "asset";
}

function assetTypeGroupDomId(projectId: string, typeId: string) {
    return `asset-group-${normalizeAssetTypeGroupId(projectId)}-${normalizeAssetTypeGroupId(typeId)}`;
}

function assetTypeSortIndex(title: string) {
    const order = ["角色", "人物", "场景", "环境", "道具", "服装", "妆发", "图片", "视频", "音频", "文本"];
    const index = order.findIndex((item) => title.includes(item));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function workflowAssetTypeStats(assets: Asset[]) {
    const workflowAssets = assets.filter((asset) => workflowAssetInfo(asset));
    const generated = workflowAssets.filter((asset) => asset.kind === "image" || workflowAssetInfo(asset)?.status === "image_generated").length;
    const pending = workflowAssets.filter((asset) => asset.kind === "text").length;
    return { total: workflowAssets.length, generated, pending };
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
