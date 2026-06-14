import { useEffect, useMemo, useState } from "react";

import type { Asset } from "@/stores/use-asset-store";
import type { ProductionBibleItem } from "../canvas/utils/production-bible";
import { assetsForVolcengineRefresh, assetsForVolcengineSubmit } from "./asset-bulk-actions";
import type { OutdatedAssetVersionUsage } from "./asset-version-outdated-references";
import { selectedOutdatedUsageSummary } from "./asset-version-outdated-references";
import { areAllAssetsSelected, selectedAssetSummary as formatSelectedAssetSummary, selectedAssetsFromIds, selectedCountInAssets } from "./asset-page-filters";

export function useAssetSelection({
    filteredAssets,
    outdatedAssetVersionUsages,
    productionBibleItems,
    validAssets,
    visibleProductionBibleItems,
}: {
    filteredAssets: Asset[];
    outdatedAssetVersionUsages: OutdatedAssetVersionUsage[];
    productionBibleItems: ProductionBibleItem[];
    validAssets: Asset[];
    visibleProductionBibleItems: ProductionBibleItem[];
}) {
    const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
    const [selectedOutdatedUsageIds, setSelectedOutdatedUsageIds] = useState<Set<string>>(() => new Set());
    const [selectedProductionBibleItemIds, setSelectedProductionBibleItemIds] = useState<Set<string>>(() => new Set());
    const selectedAssets = useMemo(() => selectedAssetsFromIds(validAssets, selectedAssetIds), [validAssets, selectedAssetIds]);
    const selectedProductionBibleItems = useMemo(() => productionBibleItems.filter((item) => selectedProductionBibleItemIds.has(item.id)), [productionBibleItems, selectedProductionBibleItemIds]);
    const selectedVolcengineSubmitAssets = useMemo(() => assetsForVolcengineSubmit(selectedAssets), [selectedAssets]);
    const selectedVolcengineRefreshAssets = useMemo(() => assetsForVolcengineRefresh(selectedAssets), [selectedAssets]);
    const selectedInFilteredCount = useMemo(() => selectedCountInAssets(filteredAssets, selectedAssetIds), [filteredAssets, selectedAssetIds]);
    const allFilteredSelected = useMemo(() => areAllAssetsSelected(filteredAssets, selectedAssetIds), [filteredAssets, selectedAssetIds]);
    const selectedProductionBibleInVisibleCount = useMemo(() => visibleProductionBibleItems.filter((item) => selectedProductionBibleItemIds.has(item.id)).length, [selectedProductionBibleItemIds, visibleProductionBibleItems]);
    const allVisibleProductionBibleSelected = useMemo(() => Boolean(visibleProductionBibleItems.length) && visibleProductionBibleItems.every((item) => selectedProductionBibleItemIds.has(item.id)), [selectedProductionBibleItemIds, visibleProductionBibleItems]);
    const selectedAssetSummary = useMemo(() => formatSelectedAssetSummary(selectedAssets), [selectedAssets]);
    const selectedProductionBibleItemSummary = useMemo(() => {
        if (!selectedProductionBibleItems.length) return "";
        const names = selectedProductionBibleItems.slice(0, 4).map((item) => item.name || "未命名设定");
        return selectedProductionBibleItems.length > names.length ? `${names.join("、")} 等 ${selectedProductionBibleItems.length} 个设定` : names.join("、");
    }, [selectedProductionBibleItems]);
    const selectedOutdatedUsageItems = useMemo(() => outdatedAssetVersionUsages.filter((usage) => selectedOutdatedUsageIds.has(usage.id)), [outdatedAssetVersionUsages, selectedOutdatedUsageIds]);
    const selectedOutdatedUsageConfirmItems = useMemo(() => selectedOutdatedUsageSummary(outdatedAssetVersionUsages, selectedOutdatedUsageIds), [outdatedAssetVersionUsages, selectedOutdatedUsageIds]);

    useEffect(() => {
        const existingIds = new Set(validAssets.map((asset) => asset.id));
        setSelectedAssetIds((current) => {
            let changed = false;
            const next = new Set<string>();
            current.forEach((id) => {
                if (existingIds.has(id)) next.add(id);
                else changed = true;
            });
            return changed ? next : current;
        });
    }, [validAssets]);

    useEffect(() => {
        const existingIds = new Set(productionBibleItems.map((item) => item.id));
        setSelectedProductionBibleItemIds((current) => {
            let changed = false;
            const next = new Set<string>();
            current.forEach((id) => {
                if (existingIds.has(id)) next.add(id);
                else changed = true;
            });
            return changed ? next : current;
        });
    }, [productionBibleItems]);

    useEffect(() => {
        const existingIds = new Set(outdatedAssetVersionUsages.map((usage) => usage.id));
        setSelectedOutdatedUsageIds((current) => {
            let changed = false;
            const next = new Set<string>();
            current.forEach((id) => {
                if (existingIds.has(id)) next.add(id);
                else changed = true;
            });
            return changed ? next : current;
        });
    }, [outdatedAssetVersionUsages]);

    const toggleAssetSelected = (assetId: string) => {
        setSelectedAssetIds((current) => {
            const next = new Set(current);
            if (next.has(assetId)) next.delete(assetId);
            else next.add(assetId);
            return next;
        });
    };

    const selectFilteredAssets = () => {
        if (!filteredAssets.length) return;
        setSelectedAssetIds((current) => {
            const next = new Set(current);
            filteredAssets.forEach((asset) => next.add(asset.id));
            return next;
        });
    };

    const clearSelectedAssets = () => {
        setSelectedAssetIds(new Set());
    };

    const toggleProductionBibleItemSelected = (itemId: string) => {
        setSelectedProductionBibleItemIds((current) => {
            const next = new Set(current);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    const selectVisibleProductionBibleItems = () => {
        if (!visibleProductionBibleItems.length) return;
        setSelectedProductionBibleItemIds((current) => {
            const next = new Set(current);
            visibleProductionBibleItems.forEach((item) => next.add(item.id));
            return next;
        });
    };

    const clearSelectedProductionBibleItems = () => {
        setSelectedProductionBibleItemIds(new Set());
    };

    const toggleOutdatedUsageSelected = (usageId: string) => {
        setSelectedOutdatedUsageIds((current) => {
            const next = new Set(current);
            if (next.has(usageId)) next.delete(usageId);
            else next.add(usageId);
            return next;
        });
    };

    const selectAllOutdatedUsages = () => {
        setSelectedOutdatedUsageIds(new Set(outdatedAssetVersionUsages.map((usage) => usage.id)));
    };

    const clearSelectedOutdatedUsages = () => {
        setSelectedOutdatedUsageIds(new Set());
    };

    const removeOutdatedUsageIds = (usageIds: string[]) => {
        setSelectedOutdatedUsageIds((current) => {
            const next = new Set(current);
            usageIds.forEach((id) => next.delete(id));
            return next;
        });
    };

    return {
        allFilteredSelected,
        allVisibleProductionBibleSelected,
        clearSelectedAssets,
        clearSelectedOutdatedUsages,
        clearSelectedProductionBibleItems,
        removeOutdatedUsageIds,
        selectAllOutdatedUsages,
        selectFilteredAssets,
        selectVisibleProductionBibleItems,
        selectedAssetIds,
        selectedAssets,
        selectedAssetSummary,
        selectedInFilteredCount,
        selectedOutdatedUsageConfirmItems,
        selectedOutdatedUsageIds,
        selectedOutdatedUsageItems,
        selectedProductionBibleInVisibleCount,
        selectedProductionBibleItemIds,
        selectedProductionBibleItems,
        selectedProductionBibleItemSummary,
        selectedVolcengineRefreshAssets,
        selectedVolcengineSubmitAssets,
        toggleAssetSelected,
        toggleOutdatedUsageSelected,
        toggleProductionBibleItemSelected,
    };
}
