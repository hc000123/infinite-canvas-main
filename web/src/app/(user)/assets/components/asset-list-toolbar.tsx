"use client";

import { Download, Library, Trash2 } from "lucide-react";
import { Button, Select } from "antd";

import type { AssetSortMode } from "../asset-page-filters";

type BulkReviewAction = "submit" | "refresh" | "";

export function AssetListToolbar({
    allFilteredSelected,
    allVisibleProductionBibleSelected,
    bulkReviewAction,
    filteredCount,
    productionBibleCount,
    projectContextFilter,
    selectedCount,
    selectedInFilteredCount,
    selectedProductionBibleCount,
    selectedProductionBibleInVisibleCount,
    selectedProductionBibleSummary,
    selectedSummary,
    selectedVolcengineRefreshCount,
    selectedVolcengineSubmitCount,
    sortMode,
    onAddToProjectLibrary,
    onBulkDelete,
    onBulkDeleteProductionBibleItems,
    onBulkMove,
    onBulkTag,
    onClearSelected,
    onClearSelectedProductionBibleItems,
    onExportSelected,
    onRefreshSelectedReviews,
    onRemoveFromProjectLibrary,
    onSelectFiltered,
    onSelectVisibleProductionBibleItems,
    onSortModeChange,
    onSubmitSelectedReviews,
}: {
    allFilteredSelected: boolean;
    allVisibleProductionBibleSelected: boolean;
    bulkReviewAction: BulkReviewAction;
    filteredCount: number;
    productionBibleCount: number;
    projectContextFilter: string;
    selectedCount: number;
    selectedInFilteredCount: number;
    selectedProductionBibleCount: number;
    selectedProductionBibleInVisibleCount: number;
    selectedProductionBibleSummary: string;
    selectedSummary: string;
    selectedVolcengineRefreshCount: number;
    selectedVolcengineSubmitCount: number;
    sortMode: AssetSortMode;
    onAddToProjectLibrary: () => void;
    onBulkDelete: () => void;
    onBulkDeleteProductionBibleItems: () => void;
    onBulkMove: () => void;
    onBulkTag: () => void;
    onClearSelected: () => void;
    onClearSelectedProductionBibleItems: () => void;
    onExportSelected: () => void;
    onRefreshSelectedReviews: () => void;
    onRemoveFromProjectLibrary: () => void;
    onSelectFiltered: () => void;
    onSelectVisibleProductionBibleItems: () => void;
    onSortModeChange: (value: AssetSortMode) => void;
    onSubmitSelectedReviews: () => void;
}) {
    return (
        <div className="grid gap-3">
            <div className="studio-toolbar flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">素材结果</div>
                    <div className="mt-1 text-sm text-[var(--studio-text-secondary)]">
                        当前筛选 <span className="font-semibold text-[var(--studio-text-primary)]">{filteredCount}</span> 个素材
                        {productionBibleCount ? (
                            <>
                                {" / "}
                                <span className="font-semibold text-[var(--studio-text-primary)]">{productionBibleCount}</span> 个设定
                            </>
                        ) : null}
                        {selectedInFilteredCount ? <span className="ml-2 text-[var(--studio-text-muted)]">已选 {selectedInFilteredCount} 个</span> : null}
                        {selectedProductionBibleInVisibleCount ? <span className="ml-2 text-[var(--studio-text-muted)]">已选设定 {selectedProductionBibleInVisibleCount} 个</span> : null}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    <Select
                        size="middle"
                        className="w-32"
                        value={sortMode}
                        options={[
                            { label: "名称升序", value: "title_asc" },
                            { label: "原始顺序", value: "default" },
                            { label: "最近更新", value: "updated_desc" },
                            { label: "最近生成", value: "generation_desc" },
                            { label: "创建时间", value: "created_desc" },
                        ]}
                        onChange={(value) => onSortModeChange(value as AssetSortMode)}
                    />
                    <Button size="middle" disabled={!filteredCount || allFilteredSelected} onClick={onSelectFiltered}>
                        全选当前素材
                    </Button>
                    {productionBibleCount ? (
                        <Button size="middle" disabled={allVisibleProductionBibleSelected} onClick={onSelectVisibleProductionBibleItems}>
                            全选当前设定
                        </Button>
                    ) : null}
                </div>
            </div>
            {selectedProductionBibleCount ? (
                <div className="studio-section flex flex-col gap-4 border-[var(--studio-accent-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="text-base font-semibold text-[var(--studio-text-primary)]">已选择 {selectedProductionBibleCount} 个设定</div>
                        <div className="mt-1 truncate text-[13px] text-[var(--studio-text-muted)]">{selectedProductionBibleSummary}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <Button size="middle" danger icon={<Trash2 className="size-3.5" />} onClick={onBulkDeleteProductionBibleItems}>
                            删除选中设定
                        </Button>
                        <Button size="middle" onClick={onClearSelectedProductionBibleItems}>
                            清空设定选择
                        </Button>
                    </div>
                </div>
            ) : null}
            {selectedCount ? (
                <div className="studio-section flex flex-col gap-4 border-[var(--studio-accent-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="text-base font-semibold text-[var(--studio-text-primary)]">已选择 {selectedCount} 个素材</div>
                        <div className="mt-1 truncate text-[13px] text-[var(--studio-text-muted)]">{selectedSummary}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <Button size="middle" icon={<Download className="size-3.5" />} onClick={onExportSelected}>
                            导出选中
                        </Button>
                        <Button size="middle" onClick={onBulkMove}>
                            移动文件夹
                        </Button>
                        <Button size="middle" onClick={onBulkTag}>
                            添加标签
                        </Button>
                        {projectContextFilter ? (
                            <>
                                <Button size="middle" icon={<Library className="size-3.5" />} onClick={onAddToProjectLibrary}>
                                    发送到项目库
                                </Button>
                                <Button size="middle" onClick={onRemoveFromProjectLibrary}>
                                    移出项目库
                                </Button>
                            </>
                        ) : null}
                        <Button size="middle" disabled={!selectedVolcengineSubmitCount || bulkReviewAction !== ""} loading={bulkReviewAction === "submit"} onClick={onSubmitSelectedReviews}>
                            提交加白{selectedVolcengineSubmitCount ? ` ${selectedVolcengineSubmitCount}` : ""}
                        </Button>
                        <Button size="middle" disabled={!selectedVolcengineRefreshCount || bulkReviewAction !== ""} loading={bulkReviewAction === "refresh"} onClick={onRefreshSelectedReviews}>
                            刷新加白{selectedVolcengineRefreshCount ? ` ${selectedVolcengineRefreshCount}` : ""}
                        </Button>
                        <Button size="middle" danger icon={<Trash2 className="size-3.5" />} onClick={onBulkDelete}>
                            删除选中
                        </Button>
                        <Button size="middle" onClick={onClearSelected}>
                            清空选择
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
