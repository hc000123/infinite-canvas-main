"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { ProjectCacheContext, ProjectCacheMediaKind } from "@/services/project-cache-context";
import { projectCacheRetryFailure, recoverProjectCacheRetryingItems } from "@/services/project-cache-context";

export type ProjectCacheQueueItem = {
    id: string;
    storageKey: string;
    kind: ProjectCacheMediaKind;
    filename: string;
    context: ProjectCacheContext;
    attempts: number;
    status: "queued" | "retrying" | "pending";
    error?: string;
    createdAt: string;
};

type ProjectCacheQueueStore = {
    items: ProjectCacheQueueItem[];
    enqueue: (item: Omit<ProjectCacheQueueItem, "attempts" | "createdAt" | "status">) => void;
    markRetrying: (id: string) => void;
    markFailed: (id: string, error: string) => void;
    remove: (id: string) => void;
    retry: (id: string) => void;
};

const storage: PersistStorage<ProjectCacheQueueStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        return value ? (JSON.parse(value) as StorageValue<ProjectCacheQueueStore>) : null;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useProjectCacheQueueStore = create<ProjectCacheQueueStore>()(
    persist(
        (set) => ({
            items: [],
            enqueue: (item) => set((state) => ({ items: [...state.items.filter((entry) => entry.id !== item.id), { ...item, attempts: 0, status: "queued", createdAt: new Date().toISOString() }] })),
            markRetrying: (id) => set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, status: "retrying" } : item)) })),
            markFailed: (id, error) => set((state) => ({ items: state.items.map((item) => (item.id === id ? projectCacheRetryFailure(item, error) : item)) })),
            remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
            retry: (id) => set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, attempts: 0, status: "queued", error: undefined } : item)) })),
        }),
        {
            name: "infinite-canvas:project_cache_queue",
            storage,
            partialize: (state) => ({ items: state.items }) as StorageValue<ProjectCacheQueueStore>["state"],
            merge: (persisted, current) => {
                const saved = (persisted || {}) as Partial<ProjectCacheQueueStore>;
                return { ...current, ...saved, items: recoverProjectCacheRetryingItems(saved.items || []) };
            },
        },
    ),
);
