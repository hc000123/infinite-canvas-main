import type { UploadedImage } from "../../../services/image-storage.ts";
import type { AssetVariant, AssetWriteInput, ImageAsset } from "../../../stores/use-asset-store.ts";
import type { ReferenceImage } from "../../../types/image.ts";

export type AssetImageGenerationSnapshot = {
    prompt: string;
    model: string;
    quality: string;
    size: string;
    capabilityTrace?: unknown;
};

export function buildAssetImageRevisionHref(asset: ImageAsset, returnTo?: string) {
    const params = new URLSearchParams();
    const subjectId = asset.assetBinding?.subjectId;
    const variantId = asset.assetBinding?.variantId;
    const projectId = asset.assetBinding?.projectId || readString(asset.metadata?.projectId);
    if (variantId) params.set("variantId", variantId);
    if (returnTo) params.set("returnTo", returnTo);
    if (subjectId) return `/assets/${encodeURIComponent(subjectId)}${params.size ? `?${params.toString()}` : ""}`;
    return projectId ? `/assets?projectId=${encodeURIComponent(projectId)}` : "/assets";
}

export function assetImageGenerationSnapshot(asset: ImageAsset): Partial<AssetImageGenerationSnapshot> {
    const generation = readRecord(asset.metadata?.generation);
    const config = readRecord(generation.config);
    return {
        prompt: readString(generation.prompt) || asset.note || "",
        model: readString(generation.model) || readString(config.imageModel) || readString(config.model),
        quality: readString(generation.quality) || readString(config.quality),
        size: readString(generation.size) || readString(config.size),
        capabilityTrace: generation.capabilityTrace || asset.metadata?.capabilityTrace,
    };
}

export function assetImageReference(asset: ImageAsset): ReferenceImage {
    return { id: `asset-revision:${asset.id}`, name: asset.title, type: asset.data.mimeType, dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey };
}

export function revisedImageAssetInput(asset: ImageAsset, stored: UploadedImage, snapshot: AssetImageGenerationSnapshot): AssetWriteInput {
    const sourceMetadata = { ...(asset.metadata || {}) };
    delete sourceMetadata.assetVersions;
    delete sourceMetadata.currentAssetVersionId;
    delete sourceMetadata.generation;
    delete sourceMetadata.volcengineAsset;
    return {
        kind: "image",
        title: asset.title,
        coverUrl: stored.url,
        favorite: asset.favorite,
        folderId: asset.folderId,
        assetBinding: asset.assetBinding ? { ...asset.assetBinding, episodeIds: [...asset.assetBinding.episodeIds] } : undefined,
        tags: [...asset.tags],
        source: "生图工作台",
        note: snapshot.prompt,
        data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
        metadata: {
            ...sourceMetadata,
            source: "image-page",
            sourceAssetId: asset.id,
            generation: { prompt: snapshot.prompt, model: snapshot.model, quality: snapshot.quality, size: snapshot.size, createdAt: new Date().toISOString(), ...(snapshot.capabilityTrace ? { capabilityTrace: snapshot.capabilityTrace } : {}) },
            ...(snapshot.capabilityTrace ? { capabilityTrace: snapshot.capabilityTrace } : {}),
        },
    };
}

export function boundVariantId(asset: ImageAsset, variants: AssetVariant[]) {
    const binding = asset.assetBinding;
    if (!binding) return undefined;
    if (binding.variantId && variants.some((variant) => variant.id === binding.variantId && variant.subjectId === binding.subjectId)) return binding.variantId;
    return variants.find((variant) => variant.subjectId === binding.subjectId && variant.name === binding.variantName)?.id;
}

function readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
