"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

type OriginalWorkflowSettings = {
    codexApiBaseUrl: string;
    codexApiKey: string;
    codexModel: string;
    episode: string;
    projectSlug: string;
    rootPath: string;
    setCodexApiBaseUrl: (codexApiBaseUrl: string) => void;
    setCodexApiKey: (codexApiKey: string) => void;
    setCodexModel: (codexModel: string) => void;
    setEpisode: (episode: string) => void;
    setProjectSlug: (projectSlug: string) => void;
    setRootPath: (rootPath: string) => void;
};

const STORE_KEY = "infinite-canvas:original_workflow_settings";
const defaultRootPath = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/hc工作流-新版/seedance-original-workflow-plus-director-method-v5";

const storage: PersistStorage<OriginalWorkflowSettings> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<OriginalWorkflowSettings>;
        parsed.state.codexApiBaseUrl ||= "";
        parsed.state.codexApiKey ||= "";
        parsed.state.codexModel ||= "";
        parsed.state.episode ||= "ep05";
        parsed.state.projectSlug ||= "demo-project";
        parsed.state.rootPath ||= defaultRootPath;
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useOriginalWorkflowStore = create<OriginalWorkflowSettings>()(
    persist(
        (set) => ({
            codexApiBaseUrl: "",
            codexApiKey: "",
            codexModel: "",
            episode: "ep05",
            projectSlug: "demo-project",
            rootPath: defaultRootPath,
            setCodexApiBaseUrl: (codexApiBaseUrl) => set({ codexApiBaseUrl }),
            setCodexApiKey: (codexApiKey) => set({ codexApiKey }),
            setCodexModel: (codexModel) => set({ codexModel }),
            setEpisode: (episode) => set({ episode }),
            setProjectSlug: (projectSlug) => set({ projectSlug }),
            setRootPath: (rootPath) => set({ rootPath }),
        }),
        {
            name: STORE_KEY,
            storage,
            partialize: (state) => ({ codexApiBaseUrl: state.codexApiBaseUrl, codexApiKey: state.codexApiKey, codexModel: state.codexModel, episode: state.episode, projectSlug: state.projectSlug, rootPath: state.rootPath }) as StorageValue<OriginalWorkflowSettings>["state"],
        },
    ),
);
