"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import {
    applyStoryboardShotGenerationError,
    applyStoryboardShotGenerationStarted,
    applyStoryboardShotGenerationSuccess,
    buildStoryboardGroupFromScriptEpisode,
    buildStoryboardGroupFromScriptScene,
    normalizeStoryboardGroup,
    normalizeStoryboardShot,
    orderedStoryboardGroups,
    orderedStoryboardShots,
    reorderStoryboardItems,
    type StoryboardGroup,
    type StoryboardGroupWriteInput,
    type StoryboardNodeRef,
    type StoryboardShot,
    type StoryboardShotWriteInput,
} from "../utils/storyboard-management";
import type { ScriptEpisode, ScriptScene } from "../utils/script-management";

type StoryboardStore = {
    groups: StoryboardGroup[];
    shots: StoryboardShot[];
    addGroup: (input: Omit<StoryboardGroupWriteInput, "order"> & { order?: number }) => string;
    updateGroup: (id: string, patch: Partial<StoryboardGroupWriteInput>) => void;
    removeGroup: (id: string) => void;
    addShot: (input: Omit<StoryboardShotWriteInput, "order"> & { order?: number }) => string;
    updateShot: (id: string, patch: Partial<StoryboardShotWriteInput>) => void;
    removeShot: (id: string) => void;
    moveShot: (id: string, direction: "up" | "down") => void;
    createGroupFromScriptScene: (projectId: string, scene: ScriptScene, preset?: Record<string, unknown>) => string;
    createGroupFromScriptEpisode: (projectId: string, episode: ScriptEpisode, scenes: ScriptScene[], preset?: Record<string, unknown>) => string;
    attachShotCanvasNodes: (shotNodeRefs: Record<string, StoryboardNodeRef[]>) => void;
    markShotGenerating: (input: { storyboardShotId?: string; nodeId?: string; taskId?: string }) => void;
    markShotSucceeded: (input: { storyboardShotId?: string; assetId?: string; nodeId?: string; taskId?: string }) => void;
    markShotFailed: (input: { storyboardShotId?: string; nodeId?: string; taskId?: string; errorMessage?: string }) => void;
};

const STORYBOARD_STORE_KEY = "infinite-canvas:storyboard_store";

const storyboardStorage: PersistStorage<StoryboardStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<StoryboardStore>;
        parsed.state.groups = parsed.state.groups || [];
        parsed.state.shots = parsed.state.shots || [];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useStoryboardStore = create<StoryboardStore>()(
    persist(
        (set, get) => ({
            groups: [],
            shots: [],
            addGroup: (input) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const order = input.order ?? nextOrder(orderedStoryboardGroups(get().groups, input.projectId));
                const group = normalizeStoryboardGroup({ ...input, order });
                set((state) => ({ groups: [...state.groups, { ...group, id, shotIds: [], createdAt: now, updatedAt: now }] }));
                return id;
            },
            updateGroup: (id, patch) =>
                set((state) => ({
                    groups: state.groups.map((group) => (group.id === id ? { ...group, ...normalizeStoryboardGroup({ ...group, ...patch }), shotIds: group.shotIds, updatedAt: new Date().toISOString() } : group)),
                })),
            removeGroup: (id) =>
                set((state) => ({
                    groups: state.groups.filter((group) => group.id !== id),
                    shots: state.shots.filter((shot) => shot.groupId !== id),
                })),
            addShot: (input) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const order = input.order ?? nextOrder(orderedStoryboardShots(get().shots, input.groupId));
                const shot = normalizeStoryboardShot({ ...input, order });
                set((state) => ({
                    shots: [...state.shots, { ...shot, id, createdAt: now, updatedAt: now }],
                    groups: state.groups.map((group) => (group.id === input.groupId ? { ...group, shotIds: [...group.shotIds, id], updatedAt: now } : group)),
                }));
                return id;
            },
            updateShot: (id, patch) =>
                set((state) => ({
                    shots: state.shots.map((shot) => (shot.id === id ? { ...shot, ...normalizeStoryboardShot({ ...shot, ...patch }), updatedAt: new Date().toISOString() } : shot)),
                })),
            removeShot: (id) =>
                set((state) => ({
                    shots: state.shots.filter((shot) => shot.id !== id),
                    groups: state.groups.map((group) => ({ ...group, shotIds: group.shotIds.filter((shotId) => shotId !== id) })),
                })),
            moveShot: (id, direction) =>
                set((state) => {
                    const shot = state.shots.find((item) => item.id === id);
                    return { shots: reorderStoryboardItems(state.shots, id, direction, (item) => item.groupId === shot?.groupId) };
                }),
            createGroupFromScriptScene: (projectId, scene, preset) => {
                const ids = { groupId: nanoid(), shotId: nanoid() };
                const result = buildStoryboardGroupFromScriptScene(scene, { projectId, ...ids, preset });
                set((state) => ({ groups: [...state.groups, result.group], shots: [...state.shots, ...result.shots] }));
                return ids.groupId;
            },
            createGroupFromScriptEpisode: (projectId, episode, scenes, preset) => {
                const groupId = nanoid();
                const shotIds = scenes.map(() => nanoid());
                const result = buildStoryboardGroupFromScriptEpisode(episode, scenes, { projectId, groupId, shotIds, preset });
                set((state) => ({ groups: [...state.groups, result.group], shots: [...state.shots, ...result.shots] }));
                return groupId;
            },
            attachShotCanvasNodes: (shotNodeRefs) =>
                set((state) => ({
                    shots: state.shots.map((shot) => {
                        const refs = shotNodeRefs[shot.id];
                        if (!refs?.length) return shot;
                        return { ...shot, nodeRefs: refs, status: "in_canvas", updatedAt: new Date().toISOString() };
                    }),
                })),
            markShotGenerating: (input) =>
                set((state) => ({
                    shots: applyStoryboardShotGenerationStarted(state.shots, input),
                })),
            markShotSucceeded: (input) =>
                set((state) => ({
                    shots: applyStoryboardShotGenerationSuccess(state.shots, input),
                })),
            markShotFailed: (input) =>
                set((state) => ({
                    shots: applyStoryboardShotGenerationError(state.shots, input),
                })),
        }),
        {
            name: STORYBOARD_STORE_KEY,
            storage: storyboardStorage,
            partialize: (state) => ({ groups: state.groups, shots: state.shots }) as StorageValue<StoryboardStore>["state"],
        },
    ),
);

function nextOrder<T extends { order: number }>(items: T[]) {
    return items.reduce((max, item) => Math.max(max, item.order), 0) + 1;
}
