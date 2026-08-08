import type { Asset, AssetKind, AssetSubject, AssetVariant, AudioAsset, ImageAsset, VideoAsset } from "../../../stores/use-asset-store.ts";

export type GalleryMediaAsset = ImageAsset | VideoAsset | AudioAsset;
export type AssetSubjectSummary = {
    subject: AssetSubject;
    coverAsset?: ImageAsset;
    variantCount: number;
    formalImageCount: number;
};

export function isGalleryMediaAsset(asset: Asset): asset is GalleryMediaAsset {
    return asset.kind === "image" || asset.kind === "video" || asset.kind === "audio";
}

export function buildAssetSubjectSummary(subject: AssetSubject, assets: Asset[], variants: AssetVariant[]): AssetSubjectSummary {
    const subjectVariants = variants.filter((variant) => variant.subjectId === subject.id);
    const formalImages = assets.filter((asset): asset is ImageAsset => asset.kind === "image" && asset.assetBinding?.subjectId === subject.id);
    const currentIds = new Set(subjectVariants.map((variant) => variant.currentAssetId).filter((id): id is string => Boolean(id)));
    return {
        subject,
        coverAsset: formalImages.find((asset) => currentIds.has(asset.id)) || [...formalImages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
        variantCount: subjectVariants.length,
        formalImageCount: formalImages.length,
    };
}

export function visibleGallerySubjectGroups(input: {
    groups: Array<{ subject: AssetSubject; assets: Asset[] }>;
    kindFilter: AssetKind | "all";
    keyword: string;
    hasScopedAssetFilter: boolean;
}) {
    if (input.kindFilter !== "all" && input.kindFilter !== "image") return [];
    const query = input.keyword.trim().toLowerCase();
    return input.groups.filter(({ subject, assets }) => {
        if (assets.length) return true;
        if (input.hasScopedAssetFilter) return false;
        if (!query) return true;
        return [subject.name, subject.code, ...subject.tags].join(" ").toLowerCase().includes(query);
    });
}
