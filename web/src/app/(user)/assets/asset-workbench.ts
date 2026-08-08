import type { Asset, AssetBinding, AssetCategory, AssetSubject, ImageAsset } from "../../../stores/use-asset-store.ts";
import type { ReferenceImage } from "../../../types/image.ts";

export type AssetReferenceScope = "project" | "all";

export type AssetVariantLike = {
    id: string;
    subjectId: string;
    name: string;
    prompt: string;
    referenceImageIds: string[];
};

export type AssetWorkbenchImageLike = {
    id: string;
    subjectId: string;
    variantId: string;
    title: string;
    dataUrl: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    generation?: Record<string, unknown>;
};

export type CandidateAssetInput = Omit<ImageAsset, "createdAt" | "id" | "updatedAt"> & {
    assetBinding: AssetBinding & { variantId: string };
};

export function defaultVariantName(category: AssetCategory | "blocking") {
    return category === "character" ? "基础形象" : "基础状态";
}

export function validateVariantName(name: string, variants: Array<Pick<AssetVariantLike, "id" | "name">>, currentId = "") {
    const value = name.trim();
    if (!value) return "请输入形态名称";
    if (variants.some((variant) => variant.id !== currentId && variant.name.trim() === value)) return "形态名称已存在";
    return "";
}

export function filterReferenceAssets(assets: Asset[], projectId: string, scope: AssetReferenceScope) {
    return assets.filter((asset) => asset.kind === "image" && (scope === "all" || assetProjectId(asset) === projectId));
}

export function candidateAssetInput(subject: AssetSubject, variant: AssetVariantLike, candidate: AssetWorkbenchImageLike): CandidateAssetInput {
    return {
        kind: "image",
        title: `${subject.name} · ${variant.name}`,
        coverUrl: candidate.dataUrl,
        tags: subject.tags,
        source: "资产工作台",
        note: variant.prompt,
        assetBinding: {
            projectId: subject.projectId,
            subjectId: subject.id,
            category: subject.category,
            variantId: variant.id,
            variantName: variant.name,
            allEpisodes: true,
            episodeIds: [],
        },
        data: {
            dataUrl: candidate.dataUrl,
            storageKey: candidate.storageKey,
            width: candidate.width,
            height: candidate.height,
            bytes: candidate.bytes,
            mimeType: candidate.mimeType,
        },
        metadata: {
            source: "asset-workbench",
            projectId: subject.projectId,
            subjectId: subject.id,
            variantId: variant.id,
            generation: candidate.generation,
        },
    };
}

export function workbenchImageReference(image: AssetWorkbenchImageLike): ReferenceImage {
    return {
        id: image.id,
        name: image.title,
        type: image.mimeType,
        dataUrl: image.dataUrl,
        storageKey: image.storageKey,
    };
}

function assetProjectId(asset: Asset) {
    if (asset.assetBinding?.projectId) return asset.assetBinding.projectId;
    return typeof asset.metadata?.projectId === "string" ? asset.metadata.projectId : "";
}
