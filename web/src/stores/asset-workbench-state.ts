import { nextAssetSubjectCode } from "../app/(user)/assets/asset-subjects.ts";
import type { Asset, AssetCategory, AssetSubject, AssetVariant, AssetWorkbenchImage } from "./use-asset-store.ts";

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

type OrganizeAssetCollectionsInput = {
    assets: Asset[];
    variants: AssetVariant[];
    assetId: string;
    subject: AssetSubject;
    variantId: string;
    allEpisodes: boolean;
    episodeIds: string[];
    setCurrent: boolean;
    now: string;
};

export function organizeAssetCollections(input: OrganizeAssetCollectionsInput) {
    const asset = input.assets.find((item) => item.id === input.assetId);
    if (!asset) throw new Error("待整理内容不存在");
    const variant = input.variants.find((item) => item.id === input.variantId && item.subjectId === input.subject.id);
    if (!variant) throw new Error("请选择这个资产主体下的形态");
    const binding = {
        projectId: input.subject.projectId,
        subjectId: input.subject.id,
        category: input.subject.category,
        variantId: variant.id,
        variantName: variant.name,
        allEpisodes: input.allEpisodes,
        episodeIds: input.allEpisodes ? [] : Array.from(new Set(input.episodeIds)),
    };
    return {
        assets: input.assets.map((item) => (item.id === asset.id ? ({ ...item, assetBinding: binding, updatedAt: input.now } as Asset) : item)),
        variants:
            asset.kind === "image" && input.setCurrent
                ? input.variants.map((item) => (item.id === variant.id ? { ...item, currentAssetId: asset.id, updatedAt: input.now } : item))
                : input.variants,
    };
}

export function createSubjectFromAssetCollections(input: {
    assets: Asset[];
    subjects: AssetSubject[];
    variants: AssetVariant[];
    assetId: string;
    projectId: string;
    category: AssetCategory;
    name: string;
    subjectId: string;
    variantId: string;
    now: string;
}) {
    const name = input.name.trim();
    if (!name) throw new Error("请输入资产主体名称");
    if (input.subjects.some((subject) => subject.projectId === input.projectId && subject.category === input.category && subject.name === name)) throw new Error("同名资产主体已存在，请归入已有主体");
    const subject: AssetSubject = {
        id: input.subjectId,
        projectId: input.projectId,
        category: input.category,
        code: nextAssetSubjectCode(input.subjects, input.projectId, input.category),
        name,
        tags: [],
        createdAt: input.now,
        updatedAt: input.now,
    };
    const variant = createDefaultAssetVariant(subject.id, subject.category, input.variantId, input.now);
    const organized = organizeAssetCollections({ assets: input.assets, variants: [...input.variants, variant], assetId: input.assetId, subject, variantId: variant.id, allEpisodes: true, episodeIds: [], setCurrent: true, now: input.now });
    return { subjects: [...input.subjects, subject], ...organized };
}
