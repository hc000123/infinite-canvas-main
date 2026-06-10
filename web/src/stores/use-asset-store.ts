"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { cleanupUnusedImages, getImageBlob, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, getMediaBlob, resolveMediaUrl } from "@/services/file-storage";
import type { VolcengineReviewMetadata } from "@/services/volcengine-asset-metadata";
import { assetFingerprintCandidates, buildBlobFingerprint, fallbackAssetFingerprint, mergeAssetMetadata, mergeDuplicateAsset } from "./asset-dedupe";

export type AssetKind = "text" | "image" | "video" | "audio";
export type VolcengineAssetMetadata = VolcengineReviewMetadata;
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type AudioAsset = AssetBase<"audio"> & { data: { url: string; storageKey?: string; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset | AudioAsset;
export type AssetWriteInput = Asset extends infer T ? (T extends Asset ? Omit<T, "id" | "createdAt" | "updatedAt"> : never) : never;
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
    folderId?: string;
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
    addAsset: (asset: AssetWriteInput) => string;
    addAssetOnce: (asset: AssetWriteInput, options?: { blob?: Blob }) => Promise<string>;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    addFolder: (name: string) => string;
    ensureProjectFolder: (projectId: string, name: string) => string;
    updateFolder: (id: string, name: string) => void;
    removeFolder: (id: string) => void;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.folders = parsed.state.folders || [];
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
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                return id;
            },
            addAssetOnce: async (asset, options) => {
                if (asset.kind === "text") return get().addAsset(asset);
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
                    get().cleanupImages({ assets });
                    return { assets };
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
            cleanupImages: (extra) => {
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
            partialize: (state) => ({ assets: state.assets, folders: state.folders }) as StorageValue<AssetStore>["state"],
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
