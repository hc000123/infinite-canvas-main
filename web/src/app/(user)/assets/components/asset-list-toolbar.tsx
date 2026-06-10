"use client";

import { Download, Library, Trash2 } from "lucide-react";
import { Button, Select } from "antd";

import type { AssetSortMode } from "../asset-page-filters";

type BulkReviewAction = "submit" | "refresh" | "";

export function AssetListToolbar({
    allFilteredSelected,
    bulkReviewAction,
    filteredCount,
    projectContextFilter,
    selectedCount,
    selectedInFilteredCount,
    selectedSummary,
    selectedVolcengineRefreshCount,
    selectedVolcengineSubmitCount,
    sortMode,
    onAddToProjectLibrary,
    onBulkDelete,
    onBulkMove,
    onBulkTag,
    onClearSelected,
    onExportSelected,
    onRefreshSelectedReviews,
    onRemoveFromProjectLibrary,
    onSelectFiltered,
    onSortModeChange,
    onSubmitSelectedReviews,
}: {
    allFilteredSelected: boolean;
    bulkReviewAction: BulkReviewAction;
    filteredCount: number;
    projectContextFilter: string;
    selectedCount: number;
    selectedInFilteredCount: number;
    selectedSummary: string;
    selectedVolcengineRefreshCount: number;
    selectedVolcengineSubmitCount: number;
    sortMode: AssetSortMode;
    onAddToProjectLibrary: () => void;
    onBulkDelete: () => void;
    onBulkMove: () => void;
    onBulkTag: () => void;
    onClearSelected: () => void;
    onExportSelected: () => void;
    onRefreshSelectedReviews: () => void;
    onRemoveFromProjectLibrary: () => void;
    onSelectFiltered: () => void;
    onSortModeChange: (value: AssetSortMode) => void;
    onSubmitSelectedReviews: () => void;
}) {
    return (
        <div className="grid gap-3">
            <div className="studio-panel flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm text-[var(--studio-text-secondary)]">
                    当前筛选 <span className="font-semibold text-[var(--studio-text-primary)]">{filteredCount}</span> 个素材
                    {selectedInFilteredCount ? <span className="ml-2 text-[var(--studio-text-muted)]">已选 {selectedInFilteredCount} 个</span> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    <Select
                        size="middle"
                        className="w-32"
                        value={sortMode}
                        options={[
                            { label: "默认排序", value: "default" },
                            { label: "最近更新", value: "updated_desc" },
                            { label: "最近生成", value: "generation_desc" },
                            { label: "创建时间", value: "created_desc" },
                            { label: "标题 A-Z", value: "title_asc" },
                        ]}
                        onChange={(value) => onSortModeChange(value as AssetSortMode)}
                    />
                    <Button size="middle" disabled={!filteredCount || allFilteredSelected} onClick={onSelectFiltered}>
                        全选当前结果
                    </Button>
                </div>
            </div>
            {selectedCount ? (
                <div className="studio-panel flex flex-col gap-4 border-[var(--studio-accent-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
