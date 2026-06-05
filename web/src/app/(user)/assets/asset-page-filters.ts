import type { Asset, AssetKind } from "../../../stores/use-asset-store.ts";
import { assetMatchesGenerationFilters } from "./asset-generation.ts";

export type AssetProjectContext = {
    id: string;
    title: string;
};

type CreativeProjectLike = {
    id: string;
    title?: string;
};

type CanvasProjectLike = {
    id: string;
    title?: string;
};

type ProductionBibleAssetSource = {
    projectId: string;
    assetRefs: Array<{ assetId: string }>;
};

type StoryboardGroupLike = {
    id: string;
    projectId: string;
};

type StoryboardShotLike = {
    groupId: string;
    assetRefs: Array<{ assetId: string }>;
};

type AssetListFilters = {
    keyword: string;
    kindFilter: AssetKind | "all";
    folderFilter: string | "all" | "root";
    generationSourceFilter?: string;
    generationActionFilter?: string;
    generationModelProviderFilter?: string;
    generationTaskFilter: "all" | "with" | "without";
    projectContextFilter: string;
    projectReferencedAssetIds: Set<string>;
    searchText: (asset: Asset) => string;
};

export function supportedAssetList(assets: Array<Asset | { kind?: string }>): Asset[] {
    return assets.filter((asset): asset is Asset => asset.kind === "text" || asset.kind === "image" || asset.kind === "video" || asset.kind === "audio");
}

export function activeAssetFolderId(folderFilter: string | "all" | "root") {
    return folderFilter !== "all" && folderFilter !== "root" ? folderFilter : undefined;
}

export function buildAssetProjectContexts(creativeProjects: CreativeProjectLike[], canvasProjects: CanvasProjectLike[]): AssetProjectContext[] {
    const creativeIds = new Set(creativeProjects.map((project) => project.id));
    return [
        ...creativeProjects.map((project) => ({ id: project.id, title: project.title || "未命名项目" })),
        ...canvasProjects.filter((project) => !creativeIds.has(project.id)).map((project) => ({ id: project.id, title: `${project.title || "未命名画布"}（旧画布）` })),
    ];
}

export function projectReferencedAssetIds(projectId: string, productionBibleItems: ProductionBibleAssetSource[], storyboardGroups: StoryboardGroupLike[], storyboardShots: StoryboardShotLike[]) {
    if (!projectId) return new Set<string>();
    const groupIds = new Set(storyboardGroups.filter((group) => group.projectId === projectId).map((group) => group.id));
    return new Set<string>([
        ...productionBibleItems.filter((item) => item.projectId === projectId).flatMap((item) => item.assetRefs.map((ref) => ref.assetId)),
        ...storyboardShots.filter((shot) => groupIds.has(shot.groupId)).flatMap((shot) => shot.assetRefs.map((ref) => ref.assetId)),
    ]);
}

export function filterAssetList(assets: Asset[], filters: AssetListFilters) {
    const query = filters.keyword.trim().toLowerCase();
    const activeFolderId = activeAssetFolderId(filters.folderFilter);
    return assets.filter((asset) => {
        if (filters.kindFilter !== "all" && asset.kind !== filters.kindFilter) return false;
        if (filters.folderFilter === "root" && asset.folderId) return false;
        if (activeFolderId && asset.folderId !== activeFolderId) return false;
        if (
            !assetMatchesGenerationFilters(asset, {
                source: filters.generationSourceFilter,
                action: filters.generationActionFilter,
                modelProvider: filters.generationModelProviderFilter,
                taskId: filters.generationTaskFilter,
                projectId: filters.projectContextFilter || undefined,
                referencedAssetIds: filters.projectReferencedAssetIds,
            })
        )
            return false;
        if (!query) return true;
        return filters.searchText(asset).includes(query);
    });
}

export function paginateAssetList(assets: Asset[], page: number, pageSize: number) {
    const start = (page - 1) * pageSize;
    return assets.slice(start, start + pageSize);
}

export function selectedAssetsFromIds(assets: Asset[], selectedAssetIds: Set<string>) {
    return assets.filter((asset) => selectedAssetIds.has(asset.id));
}

export function selectedCountInAssets(assets: Asset[], selectedAssetIds: Set<string>) {
    return assets.filter((asset) => selectedAssetIds.has(asset.id)).length;
}

export function areAllAssetsSelected(assets: Asset[], selectedAssetIds: Set<string>) {
    return assets.length > 0 && selectedCountInAssets(assets, selectedAssetIds) === assets.length;
}

export function selectedAssetSummary(assets: Asset[]) {
    if (!assets.length) return "未选择素材";
    const names = assets
        .slice(0, 3)
        .map((asset) => asset.title || "未命名素材")
        .join("、");
    return assets.length > 3 ? `${names} 等 ${assets.length} 个` : names;
}
