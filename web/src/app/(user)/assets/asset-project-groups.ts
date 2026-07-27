import type { Asset, AssetFolder } from "@/stores/use-asset-store";
import type { ProductionBibleItem } from "../canvas/utils/production-bible";
import { assetGenerationProjectId, assetGenerationRecords } from "./asset-generation.ts";
import { assetProjectLibraryEntries } from "./asset-project-library.ts";

const UNFILED_GROUP_ID = "__unfiled_project_assets__";

export type AssetProjectResultGroup = {
    id: string;
    title: string;
    assets: Asset[];
    productionBibleItems: ProductionBibleItem[];
    isUnfiled?: boolean;
};

export function buildAssetProjectResultGroups({
    assets,
    folderMap,
    forcedProjectId,
    productionBibleItems,
    projectOrder,
    projectReferencedAssetIdsByProject,
    projectTitles,
}: {
    assets: Asset[];
    folderMap: Map<string, AssetFolder>;
    forcedProjectId?: string;
    productionBibleItems: ProductionBibleItem[];
    projectOrder: string[];
    projectReferencedAssetIdsByProject: Map<string, Set<string>>;
    projectTitles: Record<string, string>;
}): AssetProjectResultGroup[] {
    const groups = new Map<string, AssetProjectResultGroup>();
    const ensureGroup = (projectId: string) => {
        const id = projectId || UNFILED_GROUP_ID;
        const existing = groups.get(id);
        if (existing) return existing;
        const group: AssetProjectResultGroup = {
            id,
            title: projectId ? projectTitles[projectId] || projectId : "未归属项目",
            assets: [],
            productionBibleItems: [],
            isUnfiled: !projectId,
        };
        groups.set(id, group);
        return group;
    };

    assets.forEach((asset) => {
        ensureGroup(forcedProjectId || resolveAssetProjectId(asset, folderMap, projectReferencedAssetIdsByProject)).assets.push(asset);
    });
    productionBibleItems.forEach((item) => {
        ensureGroup(item.projectId).productionBibleItems.push(item);
    });

    const orderMap = new Map(projectOrder.map((projectId, index) => [projectId, index]));
    return Array.from(groups.values())
        .filter((group) => group.assets.length || group.productionBibleItems.length)
        .sort((a, b) => projectGroupSortIndex(a, orderMap) - projectGroupSortIndex(b, orderMap) || a.title.localeCompare(b.title, "zh-Hans-CN"));
}

export function resolveAssetProjectId(asset: Asset, folderMap: Map<string, AssetFolder>, projectReferencedAssetIdsByProject: Map<string, Set<string>>) {
    if (asset.assetBinding?.projectId) return asset.assetBinding.projectId;
    const folderProjectId = asset.folderId ? folderMap.get(asset.folderId)?.projectId || "" : "";
    if (folderProjectId) return folderProjectId;

    const libraryProjectId = assetProjectLibraryEntries(asset)[0]?.projectId || "";
    if (libraryProjectId) return libraryProjectId;

    for (const [projectId, assetIds] of projectReferencedAssetIdsByProject.entries()) {
        if (assetIds.has(asset.id)) return projectId;
    }

    const records = assetGenerationRecords(asset);
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const projectId = assetGenerationProjectId(records[index]);
        if (projectId) return projectId;
    }

    return "";
}

function projectGroupSortIndex(group: AssetProjectResultGroup, orderMap: Map<string, number>) {
    if (group.isUnfiled) return Number.MAX_SAFE_INTEGER;
    return orderMap.get(group.id) ?? Number.MAX_SAFE_INTEGER - 1;
}
