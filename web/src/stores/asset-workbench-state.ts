import type { Asset, AssetCategory, AssetVariant, AssetWorkbenchImage } from "./use-asset-store.ts";

export function createDefaultAssetVariant(subjectId: string, category: AssetCategory, id: string, now: string): AssetVariant {
    return {
        id,
        subjectId,
        name: category === "character" ? "基础形象" : "基础状态",
        prompt: "",
        referenceImageIds: [],
        createdAt: now,
        updatedAt: now,
    };
}

export function duplicateAssetVariant(source: AssetVariant, name: string, id: string, now: string): AssetVariant {
    return {
        ...source,
        id,
        name: name.trim(),
        referenceImageIds: [...source.referenceImageIds],
        config: source.config ? { ...source.config } : undefined,
        currentAssetId: undefined,
        createdAt: now,
        updatedAt: now,
    };
}

export function renameAssetVariantCollections(variants: AssetVariant[], assets: Asset[], id: string, name: string, now: string) {
    const value = name.trim();
    return {
        variants: variants.map((variant) => (variant.id === id ? { ...variant, name: value, updatedAt: now } : variant)),
        assets: assets.map((asset) =>
            asset.assetBinding?.variantId === id ? ({ ...asset, assetBinding: { ...asset.assetBinding, variantName: value }, updatedAt: now } as Asset) : asset,
        ),
    };
}

export function removeAssetVariantCollections(variants: AssetVariant[], workbenchImages: AssetWorkbenchImage[], id: string) {
    const target = variants.find((variant) => variant.id === id);
    if (!target || variants.filter((variant) => variant.subjectId === target.subjectId).length <= 1) return { removed: false, variants, workbenchImages };
    return {
        removed: true,
        variants: variants.filter((variant) => variant.id !== id),
        workbenchImages: workbenchImages.filter((image) => image.variantId !== id),
    };
}

export function removeAssetSubjectCollections(variants: AssetVariant[], workbenchImages: AssetWorkbenchImage[], assets: Asset[], subjectId: string, now: string) {
    return {
        variants: variants.filter((variant) => variant.subjectId !== subjectId),
        workbenchImages: workbenchImages.filter((image) => image.subjectId !== subjectId),
        assets: assets.map((asset) => (asset.assetBinding?.subjectId === subjectId ? ({ ...asset, assetBinding: undefined, updatedAt: now } as Asset) : asset)),
    };
}

export function clearRemovedAssetFromVariants(variants: AssetVariant[], assetId: string, now: string) {
    return variants.map((variant) => (variant.currentAssetId === assetId ? { ...variant, currentAssetId: undefined, updatedAt: now } : variant));
}
