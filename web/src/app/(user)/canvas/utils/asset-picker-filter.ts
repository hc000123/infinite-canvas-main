import type { Asset, AssetCategory, AssetKind } from "@/stores/use-asset-store";

export type AssetPickerCategoryFilter = AssetCategory | "all" | "unclassified";
export type AssetPickerScopeFilter = "all" | "episode" | "project" | "unbound";
export type AssetPickerSort = "created_desc" | "title_asc" | "updated_desc";

type AssetPickerFilterInput = {
    allowedKinds: ReadonlySet<AssetKind>;
    category: AssetPickerCategoryFilter;
    episodeId?: string;
    favoriteOnly: boolean;
    folder: string | "all" | "root";
    folderProjectIdByFolderId: ReadonlyMap<string, string>;
    keyword: string;
    projectId?: string;
    scope: AssetPickerScopeFilter;
    sort: AssetPickerSort;
    subjectNameById: ReadonlyMap<string, string>;
};

const titleCollator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

export function filterAssetsForPicker(assets: Asset[], input: AssetPickerFilterInput) {
    const query = input.keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return assets
        .filter((asset) => input.allowedKinds.has(asset.kind))
        .filter((asset) => input.category === "all" || (input.category === "unclassified" ? !asset.assetBinding : asset.assetBinding?.category === input.category))
        .filter((asset) => !input.favoriteOnly || asset.favorite)
        .filter((asset) => input.folder === "all" || (input.folder === "root" ? !asset.folderId : asset.folderId === input.folder))
        .filter((asset) => assetMatchesScope(asset, input))
        .filter((asset) => !query.length || query.every((term) => pickerAssetSearchText(asset, input.subjectNameById).includes(term)))
        .sort((left, right) => {
            if (input.sort === "title_asc") return titleCollator.compare(left.title, right.title);
            if (input.sort === "created_desc") return right.createdAt.localeCompare(left.createdAt);
            return right.updatedAt.localeCompare(left.updatedAt);
        });
}

function assetMatchesScope(asset: Asset, input: AssetPickerFilterInput) {
    if (input.scope === "all") return true;
    const assetProjectId = asset.assetBinding?.projectId || (asset.folderId ? input.folderProjectIdByFolderId.get(asset.folderId) || "" : "");
    if (input.scope === "unbound") return !assetProjectId;
    if (!input.projectId || assetProjectId !== input.projectId) return false;
    if (input.scope === "project") return true;
    return Boolean(input.episodeId && asset.assetBinding && (asset.assetBinding.allEpisodes || asset.assetBinding.episodeIds.includes(input.episodeId)));
}

function pickerAssetSearchText(asset: Asset, subjectNameById: ReadonlyMap<string, string>) {
    return [asset.title, ...(asset.tags || []), asset.note, asset.source, asset.assetBinding?.variantName, asset.assetBinding?.subjectId ? subjectNameById.get(asset.assetBinding.subjectId) : ""].filter(Boolean).join(" ").toLowerCase();
}
