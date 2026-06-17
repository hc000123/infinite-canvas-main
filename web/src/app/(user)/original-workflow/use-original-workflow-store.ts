"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

export type OriginalWorkflowExecutionMode = "cloud-worker" | "local-runner";

type OriginalWorkflowSettings = {
    artSkillPresetId: string;
    codexApiBaseUrl: string;
    codexApiKey: string;
    codexModel: string;
    episode: string;
    executionMode: OriginalWorkflowExecutionMode;
    projectSlug: string;
    rootPath: string;
    scriptSkillPresetId: string;
    storyboardSkillPresetId: string;
    setArtSkillPresetId: (artSkillPresetId: string) => void;
    setCodexApiBaseUrl: (codexApiBaseUrl: string) => void;
    setCodexApiKey: (codexApiKey: string) => void;
    setCodexModel: (codexModel: string) => void;
    setEpisode: (episode: string) => void;
    setExecutionMode: (executionMode: OriginalWorkflowExecutionMode) => void;
    setProjectSlug: (projectSlug: string) => void;
    setRootPath: (rootPath: string) => void;
    setScriptSkillPresetId: (scriptSkillPresetId: string) => void;
    setStoryboardSkillPresetId: (storyboardSkillPresetId: string) => void;
};

const STORE_KEY = "infinite-canvas:original_workflow_settings";
const defaultRootPath = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/hc工作流-新版/seedance-original-workflow-plus-director-method-v5";
const defaultV5PresetId = "seedance-original-format-director-method-v5";

const storage: PersistStorage<OriginalWorkflowSettings> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<OriginalWorkflowSettings>;
        parsed.state.artSkillPresetId ||= defaultV5PresetId;
        parsed.state.codexApiBaseUrl ||= "";
        parsed.state.codexApiKey ||= "";
        parsed.state.codexModel ||= "";
        parsed.state.episode ||= "ep05";
        parsed.state.executionMode = parsed.state.executionMode === "cloud-worker" ? "cloud-worker" : "local-runner";
        parsed.state.projectSlug ||= "demo-project";
        parsed.state.rootPath ||= defaultRootPath;
        parsed.state.scriptSkillPresetId ||= defaultV5PresetId;
        parsed.state.storyboardSkillPresetId ||= defaultV5PresetId;
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useOriginalWorkflowStore = create<OriginalWorkflowSettings>()(
    persist(
        (set) => ({
            artSkillPresetId: defaultV5PresetId,
            codexApiBaseUrl: "",
            codexApiKey: "",
            codexModel: "",
            episode: "ep05",
            executionMode: "local-runner",
            projectSlug: "demo-project",
            rootPath: defaultRootPath,
            scriptSkillPresetId: defaultV5PresetId,
            storyboardSkillPresetId: defaultV5PresetId,
            setArtSkillPresetId: (artSkillPresetId) => set({ artSkillPresetId }),
            setCodexApiBaseUrl: (codexApiBaseUrl) => set({ codexApiBaseUrl }),
            setCodexApiKey: (codexApiKey) => set({ codexApiKey }),
            setCodexModel: (codexModel) => set({ codexModel }),
            setEpisode: (episode) => set({ episode }),
            setExecutionMode: (executionMode) => set({ executionMode }),
            setProjectSlug: (projectSlug) => set({ projectSlug }),
            setRootPath: (rootPath) => set({ rootPath }),
            setScriptSkillPresetId: (scriptSkillPresetId) => set({ scriptSkillPresetId }),
            setStoryboardSkillPresetId: (storyboardSkillPresetId) => set({ storyboardSkillPresetId }),
        }),
        {
            name: STORE_KEY,
            storage,
            partialize: (state) => ({ artSkillPresetId: state.artSkillPresetId, codexApiBaseUrl: state.codexApiBaseUrl, codexApiKey: state.codexApiKey, codexModel: state.codexModel, episode: state.episode, executionMode: state.executionMode, projectSlug: state.projectSlug, rootPath: state.rootPath, scriptSkillPresetId: state.scriptSkillPresetId, storyboardSkillPresetId: state.storyboardSkillPresetId }) as StorageValue<OriginalWorkflowSettings>["state"],
        },
    ),
);
