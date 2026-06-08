"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { failQueueItem, retryQueueItem, startQueueItem, succeedQueueItem, type GenerationQueueItem } from "../utils/generation-queue";

type GenerationQueueStore = {
    items: GenerationQueueItem[];
    paused: boolean;
    concurrency: number;
    setConcurrency: (value: number) => void;
    upsertItems: (items: GenerationQueueItem[]) => void;
    replaceGroupItems: (projectId: string, storyboardGroupId: string, items: GenerationQueueItem[]) => void;
    startQueue: (projectId: string, storyboardGroupId?: string) => void;
    pauseQueue: (projectId: string, storyboardGroupId?: string) => void;
    resumeQueue: (projectId: string, storyboardGroupId?: string) => void;
    cancelQueue: (projectId: string, storyboardGroupId?: string) => void;
    retryItem: (id: string) => void;
    retryFailed: (projectId: string, storyboardGroupId?: string) => void;
    markRunning: (id: string, taskId?: string) => void;
    markSucceeded: (id: string, result?: { taskId?: string; resultAssetId?: string }) => void;
    markFailed: (id: string, error: string) => void;
};

const GENERATION_QUEUE_STORE_KEY = "infinite-canvas:generation_queue_store";

const generationQueueStorage: PersistStorage<GenerationQueueStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<GenerationQueueStore>;
        parsed.state.items = parsed.state.items || [];
        parsed.state.concurrency = Math.max(1, parsed.state.concurrency || 1);
        parsed.state.paused = parsed.state.paused === true;
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useGenerationQueueStore = create<GenerationQueueStore>()(
    persist(
        (set) => ({
            items: [],
            paused: false,
            concurrency: 10,
            setConcurrency: (value) => set({ concurrency: Math.max(1, Math.min(10, Math.floor(value) || 1)) }),
            upsertItems: (items) =>
                set((state) => {
                    const incomingIds = new Set(items.map((item) => item.id));
                    return { items: [...state.items.filter((item) => !incomingIds.has(item.id)), ...items] };
                }),
            replaceGroupItems: (projectId, storyboardGroupId, items) =>
                set((state) => ({
                    items: [...state.items.filter((item) => item.projectId !== projectId || item.storyboardGroupId !== storyboardGroupId), ...items],
                })),
            startQueue: (projectId, storyboardGroupId) =>
                set((state) => ({
                    paused: false,
                    items: state.items.map((item) => (queueScope(item, projectId, storyboardGroupId) && (item.status === "paused" || item.status === "cancelled") ? { ...item, status: "queued", updatedAt: new Date().toISOString() } : item)),
                })),
            pauseQueue: (projectId, storyboardGroupId) =>
                set((state) => ({
                    paused: true,
                    items: state.items.map((item) => (queueScope(item, projectId, storyboardGroupId) && item.status === "queued" ? { ...item, status: "paused", updatedAt: new Date().toISOString() } : item)),
                })),
            resumeQueue: (projectId, storyboardGroupId) =>
                set((state) => ({
                    paused: false,
                    items: state.items.map((item) => (queueScope(item, projectId, storyboardGroupId) && item.status === "paused" ? { ...item, status: "queued", updatedAt: new Date().toISOString() } : item)),
                })),
            cancelQueue: (projectId, storyboardGroupId) =>
                set((state) => ({
                    items: state.items.map((item) => (queueScope(item, projectId, storyboardGroupId) && (item.status === "queued" || item.status === "paused") ? { ...item, status: "cancelled", updatedAt: new Date().toISOString() } : item)),
                })),
            retryItem: (id) =>
                set((state) => ({
                    items: state.items.map((item) => (item.id === id && (item.status === "failed" || item.status === "cancelled") ? retryQueueItem(item) : item)),
                })),
            retryFailed: (projectId, storyboardGroupId) =>
                set((state) => ({
                    paused: false,
                    items: state.items.map((item) => (queueScope(item, projectId, storyboardGroupId) && item.status === "failed" ? retryQueueItem(item) : item)),
                })),
            markRunning: (id, taskId) => set((state) => ({ items: state.items.map((item) => (item.id === id ? startQueueItem(item, taskId) : item)) })),
            markSucceeded: (id, result = {}) => set((state) => ({ items: state.items.map((item) => (item.id === id ? succeedQueueItem(item, result) : item)) })),
            markFailed: (id, error) => set((state) => ({ items: state.items.map((item) => (item.id === id ? failQueueItem(item, error) : item)) })),
        }),
        {
            name: GENERATION_QUEUE_STORE_KEY,
            storage: generationQueueStorage,
            partialize: (state) => ({ items: state.items, paused: state.paused, concurrency: state.concurrency }) as StorageValue<GenerationQueueStore>["state"],
        },
    ),
);

function queueScope(item: GenerationQueueItem, projectId: string, storyboardGroupId?: string) {
    return item.projectId === projectId && (!storyboardGroupId || item.storyboardGroupId === storyboardGroupId);
}
