"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { bindAssetBreakdownAssets, buildAssetBreakdownDraftsFromScript, createAssetBreakdownBriefDraft, mergeAssetBreakdownItems, type AssetBreakdownItem, type AssetBreakdownWriteInput } from "../utils/asset-breakdown";

type AssetBreakdownStore = {
    items: AssetBreakdownItem[];
    addItem: (input: AssetBreakdownWriteInput) => string;
    updateItem: (id: string, patch: Partial<AssetBreakdownWriteInput>) => void;
    removeItem: (id: string) => void;
    generateDraftsFromScript: (input: Parameters<typeof buildAssetBreakdownDraftsFromScript>[0]) => number;
    importAgentDrafts: (input: { projectId: string; episodeId: string; drafts: AssetBreakdownWriteInput[] }) => number;
    createBriefDraft: (id: string) => void;
    bindAssets: (id: string, assetIds: string[]) => void;
};

const ASSET_BREAKDOWN_STORE_KEY = "infinite-canvas:asset_breakdown_store";

const assetBreakdownStorage: PersistStorage<AssetBreakdownStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetBreakdownStore>;
        parsed.state.items = parsed.state.items || [];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAssetBreakdownStore = create<AssetBreakdownStore>()(
    persist(
        (set) => ({
            items: [],
            addItem: (input) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ items: [{ ...normalizeWriteInput(input), id, createdAt: now, updatedAt: now }, ...state.items] }));
                return id;
            },
            updateItem: (id, patch) =>
                set((state) => ({
                    items: state.items.map((item) => (item.id === id ? { ...item, ...normalizeWriteInput({ ...item, ...patch }), id, createdAt: item.createdAt, updatedAt: new Date().toISOString() } : item)),
                })),
            removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
            generateDraftsFromScript: (input) => {
                const drafts = buildAssetBreakdownDraftsFromScript(input).map((draft) => ({ ...draft, id: nanoid() }));
                set((state) => {
                    const sameEpisode = state.items.filter((item) => item.projectId === input.projectId && item.episodeId === input.episodeId);
                    const other = state.items.filter((item) => item.projectId !== input.projectId || item.episodeId !== input.episodeId);
                    return { items: [...mergeAssetBreakdownItems([...sameEpisode, ...drafts]), ...other] };
                });
                return drafts.length;
            },
            importAgentDrafts: (input) => {
                const now = new Date().toISOString();
                const drafts = input.drafts.map((draft) => ({ ...normalizeWriteInput(draft), id: nanoid(), createdAt: now, updatedAt: now }));
                set((state) => {
                    const sameEpisode = state.items.filter((item) => item.projectId === input.projectId && item.episodeId === input.episodeId);
                    const other = state.items.filter((item) => item.projectId !== input.projectId || item.episodeId !== input.episodeId);
                    return { items: [...mergeAssetBreakdownItems([...sameEpisode, ...drafts]), ...other] };
                });
                return drafts.length;
            },
            createBriefDraft: (id) =>
                set((state) => ({
                    items: state.items.map((item) => (item.id === id ? createAssetBreakdownBriefDraft(item, `brief-${nanoid()}`) : item)),
                })),
            bindAssets: (id, assetIds) =>
                set((state) => ({
                    items: state.items.map((item) => (item.id === id ? bindAssetBreakdownAssets(item, assetIds) : item)),
                })),
        }),
        {
            name: ASSET_BREAKDOWN_STORE_KEY,
            storage: assetBreakdownStorage,
            partialize: (state) => ({ items: state.items }) as StorageValue<AssetBreakdownStore>["state"],
        },
    ),
);

function normalizeWriteInput(input: AssetBreakdownWriteInput): AssetBreakdownWriteInput {
    return {
        ...input,
        name: input.name.trim() || "未命名资产",
        description: input.description.trim(),
        sourceText: input.sourceText.trim(),
        tags: Array.from(new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))),
        productionBibleItemId: input.productionBibleItemId?.trim() || undefined,
        briefId: input.briefId?.trim() || undefined,
        assetIds: Array.from(new Set(input.assetIds.map((id) => id.trim()).filter(Boolean))),
        warnings: input.warnings?.map((warning) => warning.trim()).filter(Boolean),
    };
}
