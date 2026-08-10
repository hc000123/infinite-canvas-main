import type { Asset, AssetKind, AssetSubject, AssetVariant, AssetWorkbenchImage, AudioAsset, ImageAsset, VideoAsset } from "../../../stores/use-asset-store.ts";
import { assetInProjectLibrary } from "./asset-project-library.ts";

export type GalleryMediaAsset = ImageAsset | VideoAsset | AudioAsset;
export type AssetSubjectSummary = {
    subject: AssetSubject;
    coverAsset?: ImageAsset;
    variantCount: number;
    formalImageCount: number;
};
export type AssetCenterSubjectSummary = {
    subject: AssetSubject;
    variants: AssetVariant[];
    primaryVariant: AssetVariant;
    coverAsset?: ImageAsset;
    variantCount: number;
    pendingCount: number;
    versionCount: number;
    relatedMediaCount: number;
    readiness: "empty" | "pending" | "ready";
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

export function buildAssetCenterSubjects(input: {
    subjects: AssetSubject[];
    variants: AssetVariant[];
    assets: Asset[];
    workbenchImages: AssetWorkbenchImage[];
    projectId: string;
}) {
    return input.subjects
        .filter((subject) => !input.projectId || subject.projectId === input.projectId)
        .map((subject): AssetCenterSubjectSummary | null => {
            const variants = input.variants.filter((variant) => variant.subjectId === subject.id).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
            const primaryVariant = variants[0];
            if (!primaryVariant) return null;
            const formalImages = input.assets.filter((asset): asset is ImageAsset => asset.kind === "image" && asset.assetBinding?.subjectId === subject.id);
            const coverAsset = formalImages.find((asset) => asset.id === primaryVariant.currentAssetId);
            const pendingCount = input.workbenchImages.filter((image) => image.subjectId === subject.id && image.role === "candidate" && !image.selectedAssetId).length;
            const relatedMediaCount = input.assets.filter((asset) => asset.kind !== "image" && asset.assetBinding?.subjectId === subject.id).length;
            return {
                subject,
                variants,
                primaryVariant,
                coverAsset,
                variantCount: variants.length,
                pendingCount,
                versionCount: formalImages.length,
                relatedMediaCount,
                readiness: coverAsset ? "ready" : pendingCount ? "pending" : "empty",
            } satisfies AssetCenterSubjectSummary;
        })
        .filter((summary): summary is AssetCenterSubjectSummary => summary !== null);
}

export function unorganizedAssets(assets: Asset[], projectId: string) {
    return assets.filter((asset) => {
        if (asset.assetBinding?.subjectId) return false;
        if (!projectId) return true;
        const generation = asset.metadata?.generation;
        return assetInProjectLibrary(asset, projectId) || (generation && typeof generation === "object" && "projectId" in generation && generation.projectId === projectId) || asset.metadata?.projectId === projectId;
    });
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
