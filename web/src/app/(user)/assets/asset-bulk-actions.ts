import type { Asset } from "@/stores/use-asset-store";

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
