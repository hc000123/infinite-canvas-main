"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { buildImageBriefFromAssetBreakdown, buildImageBriefFromProductionBible, buildImageBriefFromShotGroup, mergeImageBriefResultAssetIds, normalizeImageBriefInput, type ImageBrief, type ImageBriefWriteInput } from "../utils/image-brief";
import type { AssetBreakdownItem } from "../utils/asset-breakdown";
import type { ProductionBibleItem } from "../utils/production-bible";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";

type ImageBriefStore = {
    briefs: ImageBrief[];
    addBrief: (input: ImageBriefWriteInput) => string;
    updateBrief: (id: string, patch: Partial<ImageBriefWriteInput>) => void;
    removeBrief: (id: string) => void;
    createFromAssetBreakdown: (item: AssetBreakdownItem) => string;
    createFromProductionBible: (item: ProductionBibleItem, context?: { canvasId?: string; episodeId?: string; episodeTitle?: string }) => string;
    createFromShotGroup: (group: ShotGroup, shots: StoryboardTableShot[]) => string;
    addResultAsset: (briefId: string, assetId: string, status?: ImageBrief["status"]) => void;
};

const IMAGE_BRIEF_STORE_KEY = "infinite-canvas:image_brief_store";

const imageBriefStorage: PersistStorage<ImageBriefStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<ImageBriefStore>;
        parsed.state.briefs = parsed.state.briefs || [];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useImageBriefStore = create<ImageBriefStore>()(
    persist(
        (set) => ({
            briefs: [],
            addBrief: (input) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ briefs: [{ ...normalizeImageBriefInput(input), id, createdAt: now, updatedAt: now }, ...state.briefs] }));
                return id;
            },
            updateBrief: (id, patch) =>
                set((state) => ({
                    briefs: state.briefs.map((brief) => {
                        if (brief.id !== id) return brief;
                        return { ...brief, ...normalizeImageBriefInput({ ...brief, ...patch }), id, createdAt: brief.createdAt, updatedAt: new Date().toISOString() };
                    }),
                })),
            removeBrief: (id) => set((state) => ({ briefs: state.briefs.filter((brief) => brief.id !== id) })),
            createFromAssetBreakdown: (item) => {
                const id = nanoid();
                set((state) => ({ briefs: [buildImageBriefFromAssetBreakdown(item, id), ...state.briefs.filter((brief) => brief.sourceType !== "asset_breakdown" || brief.sourceId !== item.id)] }));
                return id;
            },
            createFromProductionBible: (item, context = {}) => {
                const id = nanoid();
                set((state) => ({ briefs: [buildImageBriefFromProductionBible(item, context, id), ...state.briefs.filter((brief) => brief.sourceType !== "production_bible" || brief.sourceId !== item.id)] }));
                return id;
            },
            createFromShotGroup: (group, shots) => {
                const id = nanoid();
                set((state) => ({ briefs: [buildImageBriefFromShotGroup(group, shots, id), ...state.briefs.filter((brief) => brief.sourceType !== "storyboard" || brief.sourceId !== group.id)] }));
                return id;
            },
            addResultAsset: (briefId, assetId, status = "generated") =>
                set((state) => ({
                    briefs: state.briefs.map((brief) => (brief.id === briefId ? { ...brief, ...mergeImageBriefResultAssetIds(brief, assetId, status), primaryAssetId: brief.primaryAssetId || assetId, updatedAt: new Date().toISOString() } : brief)),
                })),
        }),
        {
            name: IMAGE_BRIEF_STORE_KEY,
            storage: imageBriefStorage,
            partialize: (state) => ({ briefs: state.briefs }) as StorageValue<ImageBriefStore>["state"],
        },
    ),
);
