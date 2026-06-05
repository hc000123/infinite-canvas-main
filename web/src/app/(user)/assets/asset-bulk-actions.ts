import type { Asset } from "@/stores/use-asset-store";

type VolcengineReviewableAsset = Extract<Asset, { kind: "image" | "video" }>;

export function buildBulkMoveAssetPatches(assets: Asset[], folderId?: string) {
    return assets.map((asset) => ({
        id: asset.id,
        patch: { folderId: folderId || undefined },
    }));
}

export function buildBulkTagAssetPatches(assets: Asset[], tags: string[]) {
    const normalizedTags = normalizeTags(tags);
    return assets.map((asset) => ({
        id: asset.id,
        patch: { tags: mergeTags(asset.tags || [], normalizedTags) },
    }));
}

export function normalizeTags(tags: string[]) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const tag of tags) {
        const value = tag.trim();
        const key = value.toLowerCase();
        if (!value || seen.has(key)) continue;
        seen.add(key);
        result.push(value);
    }
    return result;
}

function mergeTags(current: string[], incoming: string[]) {
    return normalizeTags([...current, ...incoming]);
}

export function assetsForVolcengineSubmit(assets: Asset[]): VolcengineReviewableAsset[] {
    return assets.filter((asset) => {
        if (asset.kind !== "image" && asset.kind !== "video") return false;
        const status = asset.metadata?.volcengineAsset?.status;
        return status !== "Active" && status !== "Processing";
    }) as VolcengineReviewableAsset[];
}

export function assetsForVolcengineRefresh(assets: Asset[]): VolcengineReviewableAsset[] {
    return assets.filter((asset) => (asset.kind === "image" || asset.kind === "video") && Boolean(asset.metadata?.volcengineAsset?.assetId)) as VolcengineReviewableAsset[];
}
