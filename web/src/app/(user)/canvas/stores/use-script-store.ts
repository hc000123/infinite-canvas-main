"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import {
    normalizeScriptEpisode,
    normalizeScriptScene,
    orderedScriptScenes,
    parseScriptScenesFromText,
    reorderScriptItems,
    type ScriptEpisode,
    type ScriptEpisodeWriteInput,
    type ScriptProject,
    type ScriptScene,
    type ScriptSceneWriteInput,
} from "../utils/script-management";

type ScriptStore = {
    projects: ScriptProject[];
    episodes: ScriptEpisode[];
    scenes: ScriptScene[];
    upsertProject: (projectId: string, outline: string) => void;
    addEpisode: (input: Omit<ScriptEpisodeWriteInput, "order"> & { order?: number }) => string;
    updateEpisode: (id: string, patch: Partial<ScriptEpisodeWriteInput>) => void;
    removeEpisode: (id: string) => void;
    moveEpisode: (id: string, direction: "up" | "down") => void;
    addScene: (input: Omit<ScriptSceneWriteInput, "order"> & { order?: number }) => string;
    updateScene: (id: string, patch: Partial<ScriptSceneWriteInput>) => void;
    removeScene: (id: string) => void;
    moveScene: (id: string, direction: "up" | "down") => void;
    importScenesFromText: (episodeId: string, text: string) => string[];
    markSceneStoryboardDraft: (id: string) => string;
    markEpisodeStoryboardDraft: (episodeId: string) => string;
};

const SCRIPT_STORE_KEY = "infinite-canvas:script_store";

const scriptStorage: PersistStorage<ScriptStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<ScriptStore>;
        parsed.state.projects = parsed.state.projects || [];
        parsed.state.episodes = parsed.state.episodes || [];
        parsed.state.scenes = parsed.state.scenes || [];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useScriptStore = create<ScriptStore>()(
    persist(
        (set, get) => ({
            projects: [],
            episodes: [],
            scenes: [],
            upsertProject: (projectId, outline) =>
                set((state) => {
                    const now = new Date().toISOString();
                    const existing = state.projects.find((item) => item.projectId === projectId);
                    if (!existing) return { projects: [...state.projects, { projectId, outline: outline.trim(), createdAt: now, updatedAt: now }] };
                    return { projects: state.projects.map((item) => (item.projectId === projectId ? { ...item, outline: outline.trim(), updatedAt: now } : item)) };
                }),
            addEpisode: (input) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const order = input.order ?? nextOrder(get().episodes.filter((episode) => episode.projectId === input.projectId));
                const episode = normalizeScriptEpisode({ ...input, order });
                set((state) => ({ episodes: [...state.episodes, { ...episode, id, sceneIds: [], createdAt: now, updatedAt: now }] }));
                return id;
            },
            updateEpisode: (id, patch) =>
                set((state) => ({
                    episodes: state.episodes.map((episode) => (episode.id === id ? { ...episode, ...normalizeScriptEpisode({ ...episode, ...patch }), sceneIds: episode.sceneIds, updatedAt: new Date().toISOString() } : episode)),
                })),
            removeEpisode: (id) =>
                set((state) => ({
                    episodes: state.episodes.filter((episode) => episode.id !== id),
                    scenes: state.scenes.filter((scene) => scene.episodeId !== id),
                })),
            moveEpisode: (id, direction) => set((state) => ({ episodes: reorderScriptItems(state.episodes, id, direction) })),
            addScene: (input) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const order = input.order ?? nextOrder(get().scenes.filter((scene) => scene.episodeId === input.episodeId));
                const scene = normalizeScriptScene({ ...input, order });
                set((state) => ({
                    scenes: [...state.scenes, { ...scene, id, createdAt: now, updatedAt: now }],
                    episodes: state.episodes.map((episode) => (episode.id === input.episodeId ? { ...episode, sceneIds: [...episode.sceneIds, id], updatedAt: now } : episode)),
                }));
                return id;
            },
            updateScene: (id, patch) =>
                set((state) => ({
                    scenes: state.scenes.map((scene) => (scene.id === id ? { ...scene, ...normalizeScriptScene({ ...scene, ...patch }), updatedAt: new Date().toISOString() } : scene)),
                })),
            removeScene: (id) =>
                set((state) => ({
                    scenes: state.scenes.filter((scene) => scene.id !== id),
                    episodes: state.episodes.map((episode) => ({ ...episode, sceneIds: episode.sceneIds.filter((sceneId) => sceneId !== id) })),
                })),
            moveScene: (id, direction) => set((state) => ({ scenes: reorderScriptItems(state.scenes, id, direction) })),
            importScenesFromText: (episodeId, text) => {
                const drafts = parseScriptScenesFromText(text);
                const ids: string[] = [];
                const startOrder = nextOrder(orderedScriptScenes(get().scenes, episodeId)) - 1;
                drafts.forEach((draft, index) => {
                    ids.push(get().addScene({ episodeId, order: startOrder + index + 1, characterIds: [], ...draft }));
                });
                return ids;
            },
            markSceneStoryboardDraft: (id) => {
                const storyboardGroupId = `storyboard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                get().updateScene(id, { storyboardGroupId });
                return storyboardGroupId;
            },
            markEpisodeStoryboardDraft: (episodeId) => {
                const storyboardGroupId = `storyboard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                set((state) => ({
                    scenes: state.scenes.map((scene) => (scene.episodeId === episodeId ? { ...scene, storyboardGroupId, updatedAt: new Date().toISOString() } : scene)),
                }));
                return storyboardGroupId;
            },
        }),
        {
            name: SCRIPT_STORE_KEY,
            storage: scriptStorage,
            partialize: (state) => ({ projects: state.projects, episodes: state.episodes, scenes: state.scenes }) as StorageValue<ScriptStore>["state"],
        },
    ),
);

function nextOrder<T extends { order: number }>(items: T[]) {
    return items.reduce((max, item) => Math.max(max, item.order), 0) + 1;
}
