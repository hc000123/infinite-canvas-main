import type { Asset, AssetWriteInput } from "@/stores/use-asset-store";

const GENERATED_ASSET_DESTINATION_KEYS = [
    "assetBriefId",
    "assetBreakdownItemId",
    "briefId",
    "productionBibleItemId",
    "productionPackageId",
    "productionVideoVersionId",
    "shotGroupId",
    "storyboardShotId",
] as const;

export function shouldWriteGeneratedAsset(asset: AssetWriteInput) {
    if (asset.assetBinding) return true;
    const generation = readRecord(asset.metadata?.generation);
    return GENERATED_ASSET_DESTINATION_KEYS.some((key) => Boolean(readString(generation[key])));
}

export function inheritGeneratedAssetBinding(asset: AssetWriteInput, source?: Asset): AssetWriteInput {
    if (!source?.assetBinding) return asset;
    return {
        ...asset,
        title: source.title,
        folderId: source.folderId,
        assetBinding: { ...source.assetBinding, episodeIds: [...source.assetBinding.episodeIds] },
        metadata: { ...asset.metadata, sourceAssetId: source.id },
    } as AssetWriteInput;
}

export function generatedSourceAssetId(asset: AssetWriteInput) {
    return readString(asset.metadata?.sourceAssetId) || readString(readRecord(asset.metadata?.generation).sourceAssetId);
}

function readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
