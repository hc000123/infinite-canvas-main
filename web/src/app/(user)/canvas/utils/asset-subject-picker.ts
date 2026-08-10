import type { Asset, AssetSubject, AssetVariant, ImageAsset } from "../../../../stores/use-asset-store.ts";
import { assetsForEpisode } from "../../assets/asset-subjects.ts";

export type AssetSubjectPickerItem = {
    subject: AssetSubject;
    variants: AssetVariant[];
    assets: ImageAsset[];
    primaryVariant: AssetVariant;
    currentAsset?: ImageAsset;
    status: "ready" | "incomplete";
};

export function buildAssetSubjectPickerItems(input: { subjects: AssetSubject[]; variants: AssetVariant[]; assets: Asset[]; projectId?: string; episodeId?: string }) {
    const applicableAssets = (input.projectId && input.episodeId
        ? assetsForEpisode(input.assets, input.projectId, input.episodeId)
        : input.assets).filter((asset): asset is ImageAsset => asset.kind === "image" && Boolean(asset.assetBinding?.subjectId) && (!input.projectId || asset.assetBinding?.projectId === input.projectId));
    return input.subjects
        .filter((subject) => !input.projectId || subject.projectId === input.projectId)
        .map((subject): AssetSubjectPickerItem | null => {
            const variants = input.variants.filter((variant) => variant.subjectId === subject.id).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
            const primaryVariant = variants[0];
            if (!primaryVariant) return null;
            const assets = applicableAssets.filter((asset) => asset.assetBinding?.subjectId === subject.id);
            const currentAsset = assets.find((asset) => asset.id === primaryVariant.currentAssetId);
            return { subject, variants, assets, primaryVariant, currentAsset, status: currentAsset ? "ready" : "incomplete" };
        })
        .filter((item): item is AssetSubjectPickerItem => item !== null);
}

export function resolveSubjectPickerAsset(item: AssetSubjectPickerItem, selection: { variantId?: string; assetId?: string } = {}) {
    const variant = selection.variantId ? item.variants.find((candidate) => candidate.id === selection.variantId) : item.primaryVariant;
    if (!variant) return undefined;
    const variantAssets = item.assets.filter((asset) => asset.assetBinding?.variantId === variant.id || (!asset.assetBinding?.variantId && asset.assetBinding?.variantName === variant.name));
    if (selection.assetId) return variantAssets.find((asset) => asset.id === selection.assetId);
    return variantAssets.find((asset) => asset.id === variant.currentAssetId);
}
