"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import { normalizeProductionBibleInput, type ProductionBibleItem, type ProductionBibleWriteInput } from "../utils/production-bible";

type ProductionBibleStore = {
    items: ProductionBibleItem[];
    addItem: (input: ProductionBibleWriteInput) => string;
    updateItem: (id: string, patch: Partial<ProductionBibleWriteInput>) => void;
    removeItem: (id: string) => void;
};

const PRODUCTION_BIBLE_STORE_KEY = "infinite-canvas:production_bible_store";

const productionBibleStorage: PersistStorage<ProductionBibleStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<ProductionBibleStore>;
        parsed.state.items = parsed.state.items || [];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useProductionBibleStore = create<ProductionBibleStore>()(
    persist(
        (set) => ({
            items: [],
            addItem: (input) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const normalized = normalizeProductionBibleInput(input);
                set((state) => ({ items: [{ ...normalized, id, createdAt: now, updatedAt: now }, ...state.items] }));
                return id;
            },
            updateItem: (id, patch) =>
                set((state) => ({
                    items: state.items.map((item) => {
                        if (item.id !== id) return item;
                        const normalized = normalizeProductionBibleInput({ ...item, ...patch });
                        return { ...item, ...normalized, updatedAt: new Date().toISOString() };
                    }),
                })),
            removeItem: (id) =>
                set((state) => ({
                    items: state.items.filter((item) => item.id !== id),
                })),
        }),
        {
            name: PRODUCTION_BIBLE_STORE_KEY,
            storage: productionBibleStorage,
            partialize: (state) => ({ items: state.items }) as StorageValue<ProductionBibleStore>["state"],
        },
    ),
);
