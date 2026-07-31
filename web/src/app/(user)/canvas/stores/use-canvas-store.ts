import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";
import type { CanvasEpisodeContext } from "../utils/canvas-episode-context";
import type { CanvasProjectPreset } from "../utils/canvas-project-preset";
import { createEpisodeMainCanvasScriptNode } from "../utils/episode-main-canvas-script-node.ts";
import { canCreateEpisodeChildCanvas, episodeMainCanvas } from "../utils/episode-canvas-hierarchy.ts";

export type CanvasProject = {
    id: string;
    projectId?: string;
    title: string;
    episodeId?: string;
    episodeTitle?: string;
    canvasRole?: "main" | "child";
    parentCanvasId?: string;
    scriptId?: string;
    scriptSnapshot?: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    preset?: CanvasProjectPreset;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    createProject: (title?: string, preset?: CanvasProjectPreset, options?: { projectId?: string; episodeContext?: CanvasEpisodeContext }) => string;
    ensureEpisodeMainCanvas: (input: { projectId: string; title: string; preset?: CanvasProjectPreset; episodeContext: CanvasEpisodeContext }) => string;
    createEpisodeChildCanvas: (mainCanvasId: string, title: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    flushProjects: () => Promise<void>;
    updateProject: (
        id: string,
        patch: Partial<
            Pick<
                CanvasProject,
                "projectId" | "episodeId" | "episodeTitle" | "scriptId" | "scriptSnapshot" | "canvasRole" | "parentCanvasId" | "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport" | "preset"
            >
        >,
    ) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "projects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;
let queuedPersistWrite: { name: string; value: StorageValue<CanvasStore> } | null = null;

async function flushQueuedCanvasStore() {
    if (!queuedPersistWrite) return;
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    const write = queuedPersistWrite;
    queuedPersistWrite = null;
    await localForageStorage.setItem(write.name, JSON.stringify(write.value));
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects) return;
        queuedPersistState = nextState;
        queuedPersistWrite = { name, value };
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            void flushQueuedCanvasStore();
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            createProject: (title = "未命名画布", preset, options) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    projectId: options?.projectId,
                    title,
                    episodeId: options?.episodeContext?.episodeId,
                    episodeTitle: options?.episodeContext?.episodeTitle,
                    scriptId: options?.episodeContext?.scriptId,
                    scriptSnapshot: options?.episodeContext?.scriptSnapshot,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                    preset,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            ensureEpisodeMainCanvas: ({ projectId, title, preset, episodeContext }) => {
                const existing = episodeMainCanvas(get().projects, projectId, episodeContext.episodeId);
                if (existing) {
                    set((state) => ({
                        projects: state.projects.map((canvas) =>
                            canvas.id === existing.id
                                ? { ...canvas, title, preset, episodeTitle: episodeContext.episodeTitle, scriptId: episodeContext.scriptId, scriptSnapshot: episodeContext.scriptSnapshot, canvasRole: "main", parentCanvasId: undefined, updatedAt: new Date().toISOString() }
                                : canvas,
                        ),
                    }));
                    return existing.id;
                }
                const now = new Date().toISOString();
                const id = nanoid();
                const scriptNode = createEpisodeMainCanvasScriptNode(episodeContext);
                set((state) => ({
                    projects: [
                        {
                            id,
                            projectId,
                            title,
                            episodeId: episodeContext.episodeId,
                            episodeTitle: episodeContext.episodeTitle,
                            scriptId: episodeContext.scriptId,
                            scriptSnapshot: episodeContext.scriptSnapshot,
                            canvasRole: "main",
                            createdAt: now,
                            updatedAt: now,
                            nodes: scriptNode ? [scriptNode] : [],
                            connections: [],
                            chatSessions: [],
                            activeChatId: null,
                            backgroundMode: "lines",
                            showImageInfo: false,
                            viewport: initialViewport,
                            preset,
                        },
                        ...state.projects,
                    ],
                }));
                return id;
            },
            createEpisodeChildCanvas: (mainCanvasId, title) => {
                const projects = get().projects;
                const candidate = projects.find((canvas) => canvas.id === mainCanvasId);
                const parent = canCreateEpisodeChildCanvas(candidate, projects) ? candidate : undefined;
                if (!parent) throw new Error("只有分集主画布可以新建子画布");
                const now = new Date().toISOString();
                const id = nanoid();
                const childCount = get().projects.filter((canvas) => canvas.parentCanvasId === parent.id).length;
                set((state) => ({
                    projects: [
                        {
                            ...parent,
                            id,
                            title: title.trim() || `${parent.title}-子画布-${childCount + 1}`,
                            canvasRole: "child" as const,
                            parentCanvasId: parent.id,
                            createdAt: now,
                            updatedAt: now,
                            nodes: [],
                            connections: [],
                            chatSessions: [],
                            activeChatId: null,
                            viewport: initialViewport,
                        },
                        ...state.projects,
                    ].map((canvas) => (canvas.id === parent.id ? { ...canvas, canvasRole: "main" as const, parentCanvasId: undefined, updatedAt: now } : canvas)),
                }));
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    id: nanoid(),
                    projectId: source.projectId,
                    title: source.title || "导入画布",
                    episodeId: source.episodeId,
                    episodeTitle: source.episodeTitle,
                    canvasRole: source.canvasRole,
                    parentCanvasId: source.parentCanvasId,
                    scriptId: source.scriptId,
                    scriptSnapshot: source.scriptSnapshot,
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                    preset: source.preset,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const deletedIds = new Set(ids);
                    state.projects.forEach((project) => {
                        if (project.parentCanvasId && deletedIds.has(project.parentCanvasId)) deletedIds.add(project.id);
                    });
                    const projects = state.projects.filter((project) => !deletedIds.has(project.id));
                    return { projects };
                }),
            flushProjects: flushQueuedCanvasStore,
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)),
                })),
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => () => {
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);
