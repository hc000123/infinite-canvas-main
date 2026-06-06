import type { Asset } from "@/stores/use-asset-store";

export type AssetCanvasLibraryEntry = {
    canvasId: string;
    addedAt: string;
    updatedAt: string;
};

export function assetCanvasLibraryEntries(asset: Pick<Asset, "metadata"> | null | undefined): AssetCanvasLibraryEntry[] {
    const entries = asset?.metadata?.canvasLibraries;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry): AssetCanvasLibraryEntry[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const record = entry as Partial<AssetCanvasLibraryEntry>;
        if (!record.canvasId || typeof record.canvasId !== "string") return [];
        return [
            {
                canvasId: record.canvasId,
                addedAt: typeof record.addedAt === "string" ? record.addedAt : "",
                updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
            },
        ];
    });
}

export function assetInCanvasLibrary(asset: Pick<Asset, "metadata"> | null | undefined, canvasId: string) {
    return Boolean(canvasId) && assetCanvasLibraryEntries(asset).some((entry) => entry.canvasId === canvasId);
}

export function buildAddCanvasLibraryAssetPatch(asset: Asset, canvasIds: string[], now: string) {
    const entries = assetCanvasLibraryEntries(asset);
    const next = new Map(entries.map((entry) => [entry.canvasId, entry]));
    uniqueIds(canvasIds).forEach((canvasId) => {
        const existing = next.get(canvasId);
        next.set(canvasId, existing ? { ...existing, updatedAt: now } : { canvasId, addedAt: now, updatedAt: now });
    });
    return {
        metadata: {
            ...(asset.metadata || {}),
            canvasLibraries: Array.from(next.values()),
        },
    };
}

export function buildRemoveCanvasLibraryAssetPatch(asset: Asset, canvasIds: string[]) {
    const removing = new Set(uniqueIds(canvasIds));
    return {
        metadata: {
            ...(asset.metadata || {}),
            canvasLibraries: assetCanvasLibraryEntries(asset).filter((entry) => !removing.has(entry.canvasId)),
        },
    };
}

function uniqueIds(ids: string[]) {
    return Array.from(new Set(ids.filter(Boolean)));
}
