import type { Asset } from "@/stores/use-asset-store";
import type { CanvasProject } from "../canvas/stores/use-canvas-store.ts";
import type { ProductionBibleItem } from "../canvas/utils/production-bible.ts";
import type { StoryboardGroup, StoryboardShot } from "../canvas/utils/storyboard-management.ts";
import { collectAssetVersionUsageReferences, updateAssetReferenceToLatest, type AssetVersionUsageReference } from "./asset-version-references.ts";

export type OutdatedAssetVersionUsage = AssetVersionUsageReference & {
    assetId: string;
    assetTitle: string;
    latestVersionNumber?: number;
};

export type AssetVersionOutdatedSources = {
    canvasProjects?: CanvasProject[];
    storyboardGroups?: StoryboardGroup[];
    storyboardShots?: StoryboardShot[];
    productionBibleItems?: ProductionBibleItem[];
    projectTitles?: Record<string, string>;
};

export function collectOutdatedAssetVersionUsages(assets: Asset[], sources: AssetVersionOutdatedSources = {}, projectId = ""): OutdatedAssetVersionUsage[] {
    return assets.flatMap((asset) =>
        collectAssetVersionUsageReferences(asset, sources)
            .filter((usage) => usage.hasNewVersion && (!projectId || usage.projectId === projectId))
            .map((usage) => ({
                ...usage,
                assetId: asset.id,
                assetTitle: asset.title,
                latestVersionNumber: latestAssetVersionNumber(asset),
            })),
    );
}

export function selectedOutdatedUsageSummary(usages: OutdatedAssetVersionUsage[], selectedIds: Set<string>) {
    return usages
        .filter((usage) => selectedIds.has(usage.id))
        .map((usage) => ({
            id: usage.id,
            assetId: usage.assetId,
            assetTitle: usage.assetTitle,
            label: outdatedUsageLabel(usage),
            currentVersionNumber: usage.assetVersion?.versionNumber,
            latestVersionNumber: usage.latestVersionNumber,
        }));
}

export function outdatedUsageLabel(usage: OutdatedAssetVersionUsage) {
    return [usage.projectTitle, usage.contextTitle, usage.objectTitle, usage.assetTitle].filter(Boolean).join(" / ");
}

export function updateCanvasProjectAssetReferenceToLatest(project: CanvasProject, usage: OutdatedAssetVersionUsage, asset: Asset, now = new Date().toISOString()): CanvasProject {
    if (usage.kind !== "canvas-node" || usage.assetId !== asset.id) return project;
    let changed = false;
    const nodes = project.nodes.map((node) => {
        if (node.id !== usage.objectId || node.metadata?.sourceAssetId !== asset.id || !node.metadata.assetVersion) return node;
        changed = true;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                assetVersion: updateAssetReferenceToLatest(node.metadata.assetVersion, asset, now),
                assetReferenceMode: "fixed-version" as const,
            },
        };
    });
    return changed ? { ...project, nodes } : project;
}

export function updateStoryboardShotAssetReferenceToLatest(shot: StoryboardShot, usage: OutdatedAssetVersionUsage, asset: Asset, now = new Date().toISOString()): StoryboardShot {
    if (usage.kind !== "storyboard-shot" || usage.objectId !== shot.id || usage.assetId !== asset.id) return shot;
    let changed = false;
    const assetRefs = shot.assetRefs.map((ref) => {
        if (ref.assetId !== asset.id || !ref.assetVersion) return ref;
        changed = true;
        return {
            ...ref,
            assetVersion: updateAssetReferenceToLatest(ref.assetVersion, asset, now),
        };
    });
    return changed ? { ...shot, assetRefs } : shot;
}

export function updateProductionBibleAssetReferenceToLatest(item: ProductionBibleItem, usage: OutdatedAssetVersionUsage, asset: Asset, now = new Date().toISOString()): ProductionBibleItem {
    if (usage.kind !== "production-bible" || usage.objectId !== item.id || usage.assetId !== asset.id) return item;
    let changed = false;
    const assetRefs = item.assetRefs.map((ref) => {
        if (ref.assetId !== asset.id || !ref.assetVersion) return ref;
        changed = true;
        return {
            ...ref,
            assetVersion: updateAssetReferenceToLatest(ref.assetVersion, asset, now),
        };
    });
    return changed ? { ...item, assetRefs } : item;
}

function latestAssetVersionNumber(asset: Asset) {
    const versions = Array.isArray(asset.metadata?.assetVersions) ? asset.metadata.assetVersions : [];
    return versions.reduce<number | undefined>((max, item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return max;
        const versionNumber = (item as { versionNumber?: unknown }).versionNumber;
        if (typeof versionNumber !== "number") return max;
        return Math.max(max || 0, versionNumber);
    }, undefined);
}
