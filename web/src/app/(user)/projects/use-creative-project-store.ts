"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { attachCanvasToCreativeProject, createCreativeProject, detachCanvasFromCreativeProject, UNFILED_CREATIVE_PROJECT_TITLE, updateCreativeProject, type CreativeProject, type CreativeProjectWriteInput } from "./creative-projects";
import type { CanvasProjectPreset } from "../canvas/utils/canvas-project-preset";

type CreativeProjectStore = {
    hydrated: boolean;
    projects: CreativeProject[];
    createProject: (input: CreativeProjectWriteInput) => string;
    updateProject: (id: string, patch: Partial<CreativeProjectWriteInput>) => void;
    renameProject: (id: string, title: string) => void;
    archiveProject: (id: string) => void;
    restoreProject: (id: string) => void;
    deleteProject: (id: string) => void;
    attachCanvas: (projectId: string, canvasId: string) => void;
    detachCanvas: (projectId: string, canvasId: string) => void;
    ensureUnfiledProject: (preset?: CanvasProjectPreset) => string;
};

const CREATIVE_PROJECT_STORE_KEY = "infinite-canvas:creative_project_store";

const creativeProjectStorage: PersistStorage<CreativeProjectStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CreativeProjectStore>;
        parsed.state.projects = parsed.state.projects || [];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCreativeProjectStore = create<CreativeProjectStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            createProject: (input) => {
                const now = new Date().toISOString();
                const project = createCreativeProject(input, nanoid(), now);
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? updateCreativeProject(project, patch, new Date().toISOString()) : project)),
                })),
            renameProject: (id, title) => get().updateProject(id, { title }),
            archiveProject: (id) => get().updateProject(id, { status: "archived" }),
            restoreProject: (id) => get().updateProject(id, { status: "active" }),
            deleteProject: (id) => set((state) => ({ projects: state.projects.filter((project) => project.id !== id) })),
            attachCanvas: (projectId, canvasId) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === projectId ? attachCanvasToCreativeProject(project, canvasId, new Date().toISOString()) : project)),
                })),
            detachCanvas: (projectId, canvasId) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === projectId ? detachCanvasFromCreativeProject(project, canvasId, new Date().toISOString()) : project)),
                })),
            ensureUnfiledProject: (preset) => {
                const existing = get().projects.find((project) => project.title === UNFILED_CREATIVE_PROJECT_TITLE);
                if (existing) return existing.id;
                return get().createProject({ title: UNFILED_CREATIVE_PROJECT_TITLE, description: "旧画布和未明确归属的画布会暂时放在这里。", preset });
            },
        }),
        {
            name: CREATIVE_PROJECT_STORE_KEY,
            storage: creativeProjectStorage,
            partialize: (state) => ({ projects: state.projects }) as StorageValue<CreativeProjectStore>["state"],
            onRehydrateStorage: () => () => {
                useCreativeProjectStore.setState({ hydrated: true });
            },
        },
    ),
);
