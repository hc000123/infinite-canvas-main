"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import {
    applyStoryboardShotGenerationError,
    applyStoryboardShotGenerationStarted,
    applyStoryboardShotGenerationSuccess,
    buildStoryboardTableDraftsFromScript,
    buildStoryboardGroupFromScriptEpisode,
    buildStoryboardGroupFromScriptScene,
    createShotGroupFromSelection,
    normalizeShotGroup,
    normalizeStoryboardGroup,
    normalizeStoryboardShot,
    normalizeStoryboardTableShot,
    orderedStoryboardGroups,
    orderedStoryboardShots,
    orderedStoryboardTableShots,
    reorderStoryboardItems,
    reorderStoryboardTableShots,
    type ShotGroup,
    type ShotGroupWriteInput,
    type StoryboardGroup,
    type StoryboardGroupWriteInput,
    type StoryboardNodeRef,
    type StoryboardShot,
    type StoryboardShotWriteInput,
    type StoryboardTableShot,
    type StoryboardTableShotWriteInput,
} from "../utils/storyboard-management";
import type { ScriptEpisode, ScriptScene } from "../utils/script-management";

type StoryboardStore = {
    groups: StoryboardGroup[];
    shots: StoryboardShot[];
    tableShots: StoryboardTableShot[];
    shotGroups: ShotGroup[];
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
    generateTableShotsFromScript: (input: { projectId: string; canvasId: string; episodeId: string; scriptText: string }) => number;
    addTableShot: (input: Omit<StoryboardTableShotWriteInput, "order"> & { order?: number }) => string;
    updateTableShot: (id: string, patch: Partial<StoryboardTableShotWriteInput>) => void;
    removeTableShot: (id: string) => void;
    moveTableShot: (id: string, direction: "up" | "down") => void;
    createShotGroup: (shotIds: string[]) => { id?: string; errors?: string[] };
    updateShotGroup: (id: string, patch: Partial<ShotGroupWriteInput>) => void;
    removeShotGroup: (id: string) => void;
    attachShotGroupCanvasNodes: (groupId: string, refs: StoryboardNodeRef[]) => void;
};

const STORYBOARD_STORE_KEY = "infinite-canvas:storyboard_store";

const storyboardStorage: PersistStorage<StoryboardStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<StoryboardStore>;
        parsed.state.groups = parsed.state.groups || [];
        parsed.state.shots = parsed.state.shots || [];
        parsed.state.tableShots = parsed.state.tableShots || [];
        parsed.state.shotGroups = parsed.state.shotGroups || [];
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
            tableShots: [],
            shotGroups: [],
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
            generateTableShotsFromScript: (input) => {
                const drafts = buildStoryboardTableDraftsFromScript({
                    ...input,
                    idFactory: () => nanoid(),
                });
                set((state) => ({
                    tableShots: [...state.tableShots.filter((shot) => !(shot.canvasId === input.canvasId && shot.episodeId === input.episodeId)), ...drafts],
                    shotGroups: state.shotGroups.filter((group) => !(group.canvasId === input.canvasId && group.episodeId === input.episodeId)),
                }));
                return drafts.length;
            },
            addTableShot: (input) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const order = input.order ?? nextOrder(orderedStoryboardTableShots(get().tableShots, input.canvasId, input.episodeId));
                const shot = normalizeStoryboardTableShot({ ...input, order });
                set((state) => ({ tableShots: [...state.tableShots, { ...shot, id, createdAt: now, updatedAt: now }] }));
                return id;
            },
            updateTableShot: (id, patch) =>
                set((state) => ({
                    tableShots: state.tableShots.map((shot) => (shot.id === id ? { ...shot, ...normalizeStoryboardTableShot({ ...shot, ...patch }), updatedAt: new Date().toISOString() } : shot)),
                })),
            removeTableShot: (id) =>
                set((state) => ({
                    tableShots: state.tableShots.filter((shot) => shot.id !== id),
                    shotGroups: state.shotGroups.map((group) => ({ ...group, shotIds: group.shotIds.filter((shotId) => shotId !== id) })).filter((group) => group.shotIds.length),
                })),
            moveTableShot: (id, direction) => set((state) => ({ tableShots: reorderStoryboardTableShots(state.tableShots, id, direction) })),
            createShotGroup: (shotIds) => {
                const tableShots = get().tableShots.filter((shot) => shotIds.includes(shot.id));
                const result = createShotGroupFromSelection({ shots: tableShots, id: nanoid() });
                if (!result.ok) return { errors: result.errors };
                set((state) => ({ shotGroups: [...state.shotGroups, result.group] }));
                return { id: result.group.id };
            },
            updateShotGroup: (id, patch) =>
                set((state) => ({
                    shotGroups: state.shotGroups.map((group) => (group.id === id ? { ...group, ...normalizeShotGroup({ ...group, ...patch }), updatedAt: new Date().toISOString() } : group)),
                })),
            removeShotGroup: (id) => set((state) => ({ shotGroups: state.shotGroups.filter((group) => group.id !== id) })),
            attachShotGroupCanvasNodes: (groupId, refs) =>
                set((state) => ({
                    shotGroups: state.shotGroups.map((group) =>
                        group.id === groupId
                            ? {
                                  ...group,
                                  status: refs.length ? "in_canvas" : group.status,
                                  updatedAt: new Date().toISOString(),
                              }
                            : group,
                    ),
                    tableShots: state.tableShots.map((shot) => (state.shotGroups.find((group) => group.id === groupId)?.shotIds.includes(shot.id) ? { ...shot, updatedAt: new Date().toISOString() } : shot)),
                })),
        }),
        {
            name: STORYBOARD_STORE_KEY,
            storage: storyboardStorage,
            partialize: (state) => ({ groups: state.groups, shots: state.shots, tableShots: state.tableShots, shotGroups: state.shotGroups }) as StorageValue<StoryboardStore>["state"],
        },
    ),
);

function nextOrder<T extends { order: number }>(items: T[]) {
    return items.reduce((max, item) => Math.max(max, item.order), 0) + 1;
}
