"use client";

import type { Asset } from "@/stores/use-asset-store";
import type { CanvasProject } from "../canvas/stores/use-canvas-store";
import type { ProductionBibleItem } from "../canvas/utils/production-bible";
import type { ShotGroup, StoryboardShot, StoryboardTableShot } from "../canvas/utils/storyboard-management";
import { canvasProjectIdFromUsage } from "./asset-version-files";
import {
    updateCanvasProjectAssetReferenceToLatest,
    updateProductionBibleAssetReferenceToLatest,
    updateShotGroupAssetReferenceToLatest,
    updateStoryboardShotAssetReferenceToLatest,
    updateStoryboardTableShotAssetReferenceToLatest,
    type OutdatedAssetVersionUsage,
} from "./asset-version-outdated-references";

type MessageApi = {
    success: (content: string) => unknown;
    warning: (content: string) => unknown;
};

type Props = {
    message: MessageApi;
    productionBibleItems: ProductionBibleItem[];
    projects: CanvasProject[];
    removeOutdatedUsageIds: (ids: string[]) => void;
    selectedOutdatedUsageItems: OutdatedAssetVersionUsage[];
    setBulkOutdatedOpen: (open: boolean) => void;
    shotGroups: ShotGroup[];
    storyboardShots: StoryboardShot[];
    storyboardTableShots: StoryboardTableShot[];
    updateCanvasProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes">>) => void;
    updateProductionBibleItem: (id: string, patch: Partial<Pick<ProductionBibleItem, "assetRefs">>) => void;
    updateShotGroup: (id: string, patch: Partial<Pick<ShotGroup, "assetRefs" | "audioRefs">>) => void;
    updateStoryboardShot: (id: string, patch: Partial<Pick<StoryboardShot, "assetRefs">>) => void;
    updateStoryboardTableShot: (id: string, patch: Partial<Pick<StoryboardTableShot, "assetRefs">>) => void;
    validAssets: Asset[];
};

export function useAssetOutdatedReferenceActions({
    message,
    productionBibleItems,
    projects,
    removeOutdatedUsageIds,
    selectedOutdatedUsageItems,
    setBulkOutdatedOpen,
    shotGroups,
    storyboardShots,
    storyboardTableShots,
    updateCanvasProject,
    updateProductionBibleItem,
    updateShotGroup,
    updateStoryboardShot,
    updateStoryboardTableShot,
    validAssets,
}: Props) {
    const applyOutdatedUsageUpdates = (usages: OutdatedAssetVersionUsage[]) => {
        const assetsById = new Map(validAssets.map((asset) => [asset.id, asset]));
        const now = new Date().toISOString();
        let updated = 0;
        for (const usage of usages) {
            const asset = assetsById.get(usage.assetId);
            if (!asset) continue;
            if (usage.kind === "canvas-node") {
                const canvasId = canvasProjectIdFromUsage(usage);
                const project = projects.find((item) => item.id === canvasId);
                if (!project) continue;
                const next = updateCanvasProjectAssetReferenceToLatest(project, usage, asset, now);
                if (next !== project) {
                    updateCanvasProject(project.id, { nodes: next.nodes });
                    updated += 1;
                }
            } else if (usage.kind === "storyboard-shot") {
                const shot = storyboardShots.find((item) => item.id === usage.objectId);
                if (!shot) continue;
                const next = updateStoryboardShotAssetReferenceToLatest(shot, usage, asset, now);
                if (next !== shot) {
                    updateStoryboardShot(shot.id, { assetRefs: next.assetRefs });
                    updated += 1;
                }
            } else if (usage.kind === "storyboard-table-shot") {
                const shot = storyboardTableShots.find((item) => item.id === usage.objectId);
                if (!shot) continue;
                const next = updateStoryboardTableShotAssetReferenceToLatest(shot, usage, asset, now);
                if (next !== shot) {
                    updateStoryboardTableShot(shot.id, { assetRefs: next.assetRefs });
                    updated += 1;
                }
            } else if (usage.kind === "shot-group") {
                const group = shotGroups.find((item) => item.id === usage.objectId);
                if (!group) continue;
                const next = updateShotGroupAssetReferenceToLatest(group, usage, asset, now);
                if (next !== group) {
                    updateShotGroup(group.id, { assetRefs: next.assetRefs, audioRefs: next.audioRefs });
                    updated += 1;
                }
            } else {
                const item = productionBibleItems.find((entry) => entry.id === usage.objectId);
                if (!item) continue;
                const next = updateProductionBibleAssetReferenceToLatest(item, usage, asset, now);
                if (next !== item) {
                    updateProductionBibleItem(item.id, { assetRefs: next.assetRefs });
                    updated += 1;
                }
            }
        }
        if (updated) {
            removeOutdatedUsageIds(usages.map((usage) => usage.id));
        }
        return updated;
    };

    const updateOutdatedUsageToLatest = (usage: OutdatedAssetVersionUsage) => {
        const updated = applyOutdatedUsageUpdates([usage]);
        if (updated) message.success("已更新到素材最新版");
        else message.warning("没有可更新的引用");
    };

    const applySelectedOutdatedUsages = () => {
        const updated = applyOutdatedUsageUpdates(selectedOutdatedUsageItems);
        setBulkOutdatedOpen(false);
        if (updated) message.success(`已更新 ${updated} 处引用到最新版`);
        else message.warning("没有可更新的引用");
    };

    return { applySelectedOutdatedUsages, updateOutdatedUsageToLatest };
}
