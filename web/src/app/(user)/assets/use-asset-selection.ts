import { useEffect, useMemo, useState } from "react";

import type { Asset } from "@/stores/use-asset-store";
import { assetsForVolcengineRefresh, assetsForVolcengineSubmit } from "./asset-bulk-actions";
import type { OutdatedAssetVersionUsage } from "./asset-version-outdated-references";
import { selectedOutdatedUsageSummary } from "./asset-version-outdated-references";
import { areAllAssetsSelected, selectedAssetSummary as formatSelectedAssetSummary, selectedAssetsFromIds, selectedCountInAssets } from "./asset-page-filters";

export function useAssetSelection({ filteredAssets, outdatedAssetVersionUsages, validAssets }: { filteredAssets: Asset[]; outdatedAssetVersionUsages: OutdatedAssetVersionUsage[]; validAssets: Asset[] }) {
    const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
    const [selectedOutdatedUsageIds, setSelectedOutdatedUsageIds] = useState<Set<string>>(() => new Set());
    const selectedAssets = useMemo(() => selectedAssetsFromIds(validAssets, selectedAssetIds), [validAssets, selectedAssetIds]);
    const selectedVolcengineSubmitAssets = useMemo(() => assetsForVolcengineSubmit(selectedAssets), [selectedAssets]);
    const selectedVolcengineRefreshAssets = useMemo(() => assetsForVolcengineRefresh(selectedAssets), [selectedAssets]);
    const selectedInFilteredCount = useMemo(() => selectedCountInAssets(filteredAssets, selectedAssetIds), [filteredAssets, selectedAssetIds]);
    const allFilteredSelected = useMemo(() => areAllAssetsSelected(filteredAssets, selectedAssetIds), [filteredAssets, selectedAssetIds]);
    const selectedAssetSummary = useMemo(() => formatSelectedAssetSummary(selectedAssets), [selectedAssets]);
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
        clearSelectedAssets,
        clearSelectedOutdatedUsages,
        removeOutdatedUsageIds,
        selectAllOutdatedUsages,
        selectFilteredAssets,
        selectedAssetIds,
        selectedAssets,
        selectedAssetSummary,
        selectedInFilteredCount,
        selectedOutdatedUsageConfirmItems,
        selectedOutdatedUsageIds,
        selectedOutdatedUsageItems,
        selectedVolcengineRefreshAssets,
        selectedVolcengineSubmitAssets,
        toggleAssetSelected,
        toggleOutdatedUsageSelected,
    };
}
