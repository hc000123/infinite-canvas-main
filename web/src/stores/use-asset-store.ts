"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { cleanupUnusedImages, getImageBlob, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, getMediaBlob, resolveMediaUrl } from "@/services/file-storage";
import type { VolcengineReviewMetadata } from "@/services/volcengine-asset-metadata";
import { assetFingerprintCandidates, buildBlobFingerprint, fallbackAssetFingerprint, findWorkflowAssetDuplicate, mergeAssetMetadata, mergeDuplicateAsset } from "./asset-dedupe";
import { createAssetStoreHydrationGate, mergeHydratedAssetCollections } from "./asset-store-hydration";
import { nextAssetSubjectCode } from "@/app/(user)/assets/asset-subjects";
import { clearRemovedAssetFromVariants, createDefaultAssetVariant, createSubjectFromAssetCollections, duplicateAssetVariant, organizeAssetCollections, removeAssetSubjectCollections, removeAssetVariantCollections, renameAssetVariantCollections } from "./asset-workbench-state";

export type AssetKind = "text" | "image" | "video" | "audio";
export type VolcengineAssetMetadata = VolcengineReviewMetadata;
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type AudioAsset = AssetBase<"audio"> & { data: { url: string; storageKey?: string; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset | AudioAsset;
export type AssetWriteInput = Asset extends infer T ? (T extends Asset ? Omit<T, "id" | "createdAt" | "updatedAt"> : never) : never;
export type AssetCategory = "character" | "scene" | "prop" | "blocking" | "other";
export type AssetBinding = {
    projectId: string;
    subjectId: string;
    category: AssetCategory;
    variantId?: string;
    variantName: string;
    allEpisodes: boolean;
    episodeIds: string[];
};
export type AssetSubject = {
    id: string;
    projectId: string;
    category: AssetCategory;
    code: string;
    sourceKey?: string;
    name: string;
    tags: string[];
    note?: string;
    voiceAssetId?: string;
    createdAt: string;
    updatedAt: string;
};
export type AssetVariant = {
    id: string;
    subjectId: string;
    name: string;
    prompt: string;
    referenceImageIds: string[];
    currentAssetId?: string;
    config?: { imageModel?: string; quality?: string; size?: string; count?: string };
    createdAt: string;
    updatedAt: string;
};
export type AssetWorkbenchImage = {
    id: string;
    subjectId: string;
    variantId: string;
    role: "reference" | "candidate";
    source: "upload" | "generated" | "asset" | "candidate";
    title: string;
    dataUrl: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    sourceAssetId?: string;
    selectedAssetId?: string;
    generation?: { prompt: string; model: string; quality: string; size: string; createdAt: string };
    createdAt: string;
};
export type AssetFolder = {
    id: string;
    name: string;
    projectId?: string;
    createdAt: string;
    updatedAt: string;
};

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    favorite?: boolean;
    folderId?: string;
    assetBinding?: AssetBinding;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown> & { volcengineAsset?: VolcengineAssetMetadata };
};

type AssetStore = {
    assets: Asset[];
    folders: AssetFolder[];
    subjects: AssetSubject[];
    variants: AssetVariant[];
    workbenchImages: AssetWorkbenchImage[];
    addAsset: (asset: AssetWriteInput) => string;
    addAssetOnce: (asset: AssetWriteInput, options?: { blob?: Blob }) => Promise<string>;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    addFolder: (name: string) => string;
    ensureProjectFolder: (projectId: string, name: string) => string;
    updateFolder: (id: string, name: string) => void;
    removeFolder: (id: string) => void;
    ensureSubject: (input: Omit<AssetSubject, "code" | "createdAt" | "id" | "updatedAt"> & { code?: string }) => string;
    updateSubject: (id: string, patch: Partial<Pick<AssetSubject, "name" | "tags" | "note" | "voiceAssetId">>) => void;
    removeSubject: (id: string) => void;
    ensureVariant: (input: Omit<AssetVariant, "createdAt" | "id" | "updatedAt">) => string;
    updateVariant: (id: string, patch: Partial<Pick<AssetVariant, "config" | "currentAssetId" | "name" | "prompt" | "referenceImageIds">>) => void;
    duplicateVariant: (id: string, name: string) => string;
    removeVariant: (id: string) => boolean;
    addWorkbenchImage: (image: Omit<AssetWorkbenchImage, "createdAt" | "id">) => string;
    updateWorkbenchImage: (id: string, patch: Partial<Omit<AssetWorkbenchImage, "createdAt" | "id" | "subjectId" | "variantId">>) => void;
    removeWorkbenchImage: (id: string) => void;
    setVariantCurrentAsset: (variantId: string, assetId?: string) => void;
    bindAsset: (id: string, binding?: AssetBinding) => void;
    organizeAsset: (input: { assetId: string; subjectId: string; variantId: string; allEpisodes?: boolean; episodeIds?: string[]; setCurrent?: boolean }) => void;
    createSubjectFromAsset: (input: { assetId: string; projectId: string; category: AssetCategory; name: string }) => string;
    promoteWorkbenchImage: (input: { candidateId: string; asset: AssetWriteInput }) => Promise<string>;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";
const assetStoreHydration = createAssetStoreHydrationGate();

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.folders = parsed.state.folders || [];
        parsed.state.subjects = parsed.state.subjects || [];
        parsed.state.variants = parsed.state.variants || [];
        parsed.state.workbenchImages = await Promise.all(
            (parsed.state.workbenchImages || []).map(async (image) => ({ ...image, dataUrl: image.storageKey ? await resolveImageUrl(image.storageKey, image.dataUrl) : image.dataUrl })),
        );
        parsed.state.assets = await Promise.all(
            parsed.state.assets.map(async (asset) => {
                if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
                if (asset.kind === "audio" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey)
                    return {
                        ...asset,
                        coverUrl: asset.coverUrl.startsWith("blob:") ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl) : asset.coverUrl,
                        data: { ...asset.data, dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl) },
                    };
                if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl);
                return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            assets: [],
            folders: [],
            subjects: [],
            variants: [],
            workbenchImages: [],
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                return id;
            },
            addAssetOnce: async (asset, options) => {
                await assetStoreHydration.wait();
                if (asset.kind === "text") {
                    const matched = findWorkflowAssetDuplicate(get().assets, asset);
                    if (!matched) return get().addAsset(asset);
                    set((state) => ({ assets: state.assets.map((item) => (item.id === matched.id ? mergeDuplicateAsset(item, asset, "") : item)) }));
                    return matched.id;
                }
                const fingerprint = await buildAssetFingerprint(asset, options?.blob);
                if (!fingerprint) return get().addAsset(asset);
                const fallback = fallbackAssetFingerprint(asset);
                let id = "";
                set((state) => {
                    const matched = state.assets.find((item) => item.kind === asset.kind && assetFingerprintCandidates(item).some((value) => value === fingerprint || value === fallback));
                    if (!matched) {
                        id = nanoid();
                        const now = new Date().toISOString();
                        return { assets: [{ ...asset, id, createdAt: now, updatedAt: now, metadata: mergeAssetMetadata(undefined, asset.metadata, fingerprint) } as Asset, ...state.assets] };
                    }
                    id = matched.id;
                    return {
                        assets: state.assets.map((item) => (item.id === matched.id ? mergeDuplicateAsset(item, asset, fingerprint) : item)),
                    };
                });
                return id;
            },
            updateAsset: (id, patch) =>
                set((state) => ({
                    assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
                })),
            removeAsset: (id) =>
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    const variants = clearRemovedAssetFromVariants(state.variants, id, new Date().toISOString());
                    get().cleanupImages({ assets, workbenchImages: state.workbenchImages });
                    return { assets, variants };
                }),
            addFolder: (name) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ folders: [...state.folders, { id, name: name.trim(), createdAt: now, updatedAt: now }] }));
                return id;
            },
            ensureProjectFolder: (projectId, name) => {
                const title = name.trim() || "未命名项目";
                const now = new Date().toISOString();
                let id = "";
                set((state) => {
                    const existing = state.folders.find((folder) => folder.projectId === projectId);
                    if (existing) {
                        id = existing.id;
                        if (existing.name === title) return {};
                        return { folders: state.folders.map((folder) => (folder.id === existing.id ? { ...folder, name: title, updatedAt: now } : folder)) };
                    }
                    id = nanoid();
                    return { folders: [...state.folders, { id, name: title, projectId, createdAt: now, updatedAt: now }] };
                });
                return id;
            },
            updateFolder: (id, name) =>
                set((state) => ({
                    folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name: name.trim(), updatedAt: new Date().toISOString() } : folder)),
                })),
            removeFolder: (id) =>
                set((state) => ({
                    folders: state.folders.filter((folder) => folder.id !== id),
                    assets: state.assets.map((asset) => (asset.folderId === id ? ({ ...asset, folderId: undefined, updatedAt: new Date().toISOString() } as Asset) : asset)),
                })),
            ensureSubject: (input) => {
                const name = input.name.trim();
                const existing = get().subjects.find(
                    (subject) => subject.projectId === input.projectId && subject.category === input.category && ((input.sourceKey && subject.sourceKey === input.sourceKey) || (input.code && subject.code === input.code) || subject.name === name),
                );
                if (existing) {
                    if (!get().variants.some((variant) => variant.subjectId === existing.id)) {
                        const variant = createDefaultAssetVariant(existing.id, existing.category, nanoid(), new Date().toISOString());
                        set((state) => ({ variants: [...state.variants, variant] }));
                    }
                    return existing.id;
                }
                const now = new Date().toISOString();
                const id = nanoid();
                const code = input.code?.trim().toUpperCase() || nextAssetSubjectCode(get().subjects, input.projectId, input.category);
                set((state) => ({ subjects: [...state.subjects, { ...input, id, code, name, tags: Array.from(new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))), createdAt: now, updatedAt: now }] }));
                set((state) => ({ variants: [...state.variants, createDefaultAssetVariant(id, input.category, nanoid(), now)] }));
                return id;
            },
            updateSubject: (id, patch) =>
                set((state) => ({
                    subjects: state.subjects.map((subject) =>
                        subject.id === id
                            ? { ...subject, ...patch, name: patch.name?.trim() || subject.name, tags: patch.tags ? Array.from(new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))) : subject.tags, updatedAt: new Date().toISOString() }
                            : subject,
                    ),
                })),
            removeSubject: (id) =>
                set((state) => {
                    const next = removeAssetSubjectCollections(state.variants, state.workbenchImages, state.assets, id, new Date().toISOString());
                    get().cleanupImages({ assets: next.assets, workbenchImages: next.workbenchImages });
                    return { subjects: state.subjects.filter((subject) => subject.id !== id), ...next };
                }),
            ensureVariant: (input) => {
                const name = input.name.trim();
                const existing = get().variants.find((variant) => variant.subjectId === input.subjectId && variant.name === name);
                if (existing) return existing.id;
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ variants: [...state.variants, { ...input, id, name, prompt: input.prompt.trim(), referenceImageIds: [...input.referenceImageIds], config: input.config ? { ...input.config } : undefined, createdAt: now, updatedAt: now }] }));
                return id;
            },
            updateVariant: (id, patch) =>
                set((state) => {
                    const now = new Date().toISOString();
                    if (patch.name !== undefined) {
                        const renamed = renameAssetVariantCollections(state.variants, state.assets, id, patch.name, now);
                        return {
                            ...renamed,
                            variants: renamed.variants.map((variant) =>
                                variant.id === id
                                    ? { ...variant, ...patch, name: patch.name?.trim() || variant.name, prompt: patch.prompt?.trim() ?? variant.prompt, referenceImageIds: patch.referenceImageIds ? [...patch.referenceImageIds] : variant.referenceImageIds, config: patch.config ? { ...patch.config } : variant.config, updatedAt: now }
                                    : variant,
                            ),
                        };
                    }
                    return {
                        variants: state.variants.map((variant) =>
                            variant.id === id
                                ? { ...variant, ...patch, prompt: patch.prompt?.trim() ?? variant.prompt, referenceImageIds: patch.referenceImageIds ? [...patch.referenceImageIds] : variant.referenceImageIds, config: patch.config ? { ...patch.config } : variant.config, updatedAt: now }
                                : variant,
                        ),
                    };
                }),
            duplicateVariant: (id, name) => {
                const source = get().variants.find((variant) => variant.id === id);
                if (!source) return "";
                const existing = get().variants.find((variant) => variant.subjectId === source.subjectId && variant.name === name.trim());
                if (existing) return existing.id;
                const next = duplicateAssetVariant(source, name, nanoid(), new Date().toISOString());
                set((state) => ({ variants: [...state.variants, next] }));
                return next.id;
            },
            removeVariant: (id) => {
                const next = removeAssetVariantCollections(get().variants, get().workbenchImages, id);
                if (!next.removed) return false;
                set({ variants: next.variants, workbenchImages: next.workbenchImages });
                get().cleanupImages({ assets: get().assets, workbenchImages: next.workbenchImages });
                return true;
            },
            addWorkbenchImage: (image) => {
                const id = nanoid();
                set((state) => ({ workbenchImages: [{ ...image, id, createdAt: new Date().toISOString() }, ...state.workbenchImages] }));
                return id;
            },
            updateWorkbenchImage: (id, patch) => set((state) => ({ workbenchImages: state.workbenchImages.map((image) => (image.id === id ? { ...image, ...patch } : image)) })),
            removeWorkbenchImage: (id) =>
                set((state) => {
                    const workbenchImages = state.workbenchImages.filter((image) => image.id !== id);
                    const variants = state.variants.map((variant) => (variant.referenceImageIds.includes(id) ? { ...variant, referenceImageIds: variant.referenceImageIds.filter((imageId) => imageId !== id), updatedAt: new Date().toISOString() } : variant));
                    get().cleanupImages({ assets: state.assets, workbenchImages });
                    return { variants, workbenchImages };
                }),
            setVariantCurrentAsset: (variantId, currentAssetId) => set((state) => ({ variants: state.variants.map((variant) => (variant.id === variantId ? { ...variant, currentAssetId, updatedAt: new Date().toISOString() } : variant)) })),
            bindAsset: (id, assetBinding) => set((state) => ({ assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, assetBinding, updatedAt: new Date().toISOString() } as Asset) : asset)) })),
            organizeAsset: (input) =>
                set((state) => {
                    const subject = state.subjects.find((item) => item.id === input.subjectId);
                    if (!subject) throw new Error("资产主体不存在");
                    return organizeAssetCollections({
                        assets: state.assets,
                        variants: state.variants,
                        assetId: input.assetId,
                        subject,
                        variantId: input.variantId,
                        allEpisodes: input.allEpisodes !== false,
                        episodeIds: input.episodeIds || [],
                        setCurrent: input.setCurrent !== false,
                        now: new Date().toISOString(),
                    });
                }),
            createSubjectFromAsset: (input) => {
                const subjectId = nanoid();
                const variantId = nanoid();
                set((state) =>
                    createSubjectFromAssetCollections({
                        assets: state.assets,
                        subjects: state.subjects,
                        variants: state.variants,
                        ...input,
                        subjectId,
                        variantId,
                        now: new Date().toISOString(),
                    }),
                );
                return subjectId;
            },
            promoteWorkbenchImage: async ({ candidateId, asset }) => {
                const before = get();
                const candidate = before.workbenchImages.find((image) => image.id === candidateId && image.role === "candidate");
                if (!candidate) throw new Error("待选结果不存在");
                if (candidate.selectedAssetId) return candidate.selectedAssetId;
                const variant = before.variants.find((item) => item.id === candidate.variantId && item.subjectId === candidate.subjectId);
                const subject = before.subjects.find((item) => item.id === candidate.subjectId);
                if (!variant || !subject) throw new Error("待选结果的资产主体或形态不存在");
                const assetId = await get().addAssetOnce(asset);
                set((state) => {
                    const organized = organizeAssetCollections({ assets: state.assets, variants: state.variants, assetId, subject, variantId: variant.id, allEpisodes: true, episodeIds: [], setCurrent: true, now: new Date().toISOString() });
                    return { ...organized, workbenchImages: state.workbenchImages.map((image) => (image.id === candidateId ? { ...image, selectedAssetId: assetId } : image)) };
                });
                return assetId;
            },
            cleanupImages: (extra) => {
                if (typeof window === "undefined") return;
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/app/(user)/canvas/stores/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets, folders: state.folders, subjects: state.subjects, variants: state.variants, workbenchImages: state.workbenchImages }) as StorageValue<AssetStore>["state"],
            merge: (persisted, current) => {
                const saved = (persisted || {}) as Partial<AssetStore>;
                return { ...current, ...saved, ...mergeHydratedAssetCollections(saved, current) };
            },
            onRehydrateStorage: () => () => assetStoreHydration.release(),
        },
    ),
);

export async function buildAssetFingerprint(asset: AssetWriteInput | Asset, blob?: Blob | null) {
    if (asset.kind === "text") return "";
    const sourceBlob = blob || (await readAssetBlob(asset));
    const blobFingerprint = await buildBlobFingerprint(sourceBlob);
    if (blobFingerprint) return blobFingerprint;
    return fallbackAssetFingerprint(asset);
}

async function readAssetBlob(asset: AssetWriteInput | Asset) {
    try {
        if (asset.kind === "image") return asset.data.storageKey ? getImageBlob(asset.data.storageKey) : fetchAssetBlob(asset.data.dataUrl);
        if (asset.kind === "video" || asset.kind === "audio") return asset.data.storageKey ? getMediaBlob(asset.data.storageKey) : fetchAssetBlob(asset.data.url);
    } catch {
        return null;
    }
    return null;
}

async function fetchAssetBlob(url: string) {
    if (!url || (!url.startsWith("data:") && !url.startsWith("blob:"))) return null;
    return fetch(url).then((response) => response.blob());
}
