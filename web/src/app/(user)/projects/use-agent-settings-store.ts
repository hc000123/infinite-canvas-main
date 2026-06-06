"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { defaultAgentConfig, defaultAgentConfigs, mergeAgentConfigs, normalizeAgentConfig, type AgentConfig, type AgentConfigKind } from "./agent-settings";

type AgentSettingsStore = {
    globalConfigs: AgentConfig[];
    projectConfigs: Record<string, AgentConfig[]>;
    episodeConfigs: Record<string, AgentConfig[]>;
    resolvedProjectConfigs: (projectId: string) => AgentConfig[];
    saveProjectConfig: (projectId: string, config: AgentConfig) => void;
    saveGlobalConfig: (config: AgentConfig) => void;
    copyDefaultToProject: (projectId: string, kind: AgentConfigKind) => void;
    resetProjectConfig: (projectId: string, kind: AgentConfigKind) => void;
};

const AGENT_SETTINGS_STORE_KEY = "infinite-canvas:agent_settings_store";

const agentSettingsStorage: PersistStorage<AgentSettingsStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AgentSettingsStore>;
        parsed.state.globalConfigs = (parsed.state.globalConfigs || []).map(normalizeAgentConfig);
        parsed.state.projectConfigs = normalizeConfigRecord(parsed.state.projectConfigs);
        parsed.state.episodeConfigs = normalizeConfigRecord(parsed.state.episodeConfigs);
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAgentSettingsStore = create<AgentSettingsStore>()(
    persist(
        (set, get) => ({
            globalConfigs: [],
            projectConfigs: {},
            episodeConfigs: {},
            resolvedProjectConfigs: (projectId) => mergeAgentConfigs(defaultAgentConfigs(), get().globalConfigs, get().projectConfigs[projectId] || []),
            saveProjectConfig: (projectId, config) =>
                set((state) => ({
                    projectConfigs: {
                        ...state.projectConfigs,
                        [projectId]: upsertConfig(state.projectConfigs[projectId] || [], { ...normalizeAgentConfig(config), projectId, updatedAt: new Date().toISOString() }),
                    },
                })),
            saveGlobalConfig: (config) =>
                set((state) => ({
                    globalConfigs: upsertConfig(state.globalConfigs, { ...normalizeAgentConfig(config), updatedAt: new Date().toISOString() }),
                })),
            copyDefaultToProject: (projectId, kind) =>
                set((state) => ({
                    projectConfigs: {
                        ...state.projectConfigs,
                        [projectId]: upsertConfig(state.projectConfigs[projectId] || [], { ...defaultAgentConfig(kind, new Date().toISOString()), id: `agent-config-${projectId}-${kind}`, projectId }),
                    },
                })),
            resetProjectConfig: (projectId, kind) =>
                set((state) => ({
                    projectConfigs: {
                        ...state.projectConfigs,
                        [projectId]: (state.projectConfigs[projectId] || []).filter((config) => config.kind !== kind),
                    },
                })),
        }),
        {
            name: AGENT_SETTINGS_STORE_KEY,
            storage: agentSettingsStorage,
            partialize: (state) =>
                ({
                    globalConfigs: state.globalConfigs,
                    projectConfigs: state.projectConfigs,
                    episodeConfigs: state.episodeConfigs,
                }) as StorageValue<AgentSettingsStore>["state"],
        },
    ),
);

function normalizeConfigRecord(record: Record<string, AgentConfig[]> | undefined) {
    return Object.fromEntries(Object.entries(record || {}).map(([key, configs]) => [key, (configs || []).map(normalizeAgentConfig)]));
}

function upsertConfig(configs: AgentConfig[], config: AgentConfig) {
    return [config, ...configs.filter((item) => item.kind !== config.kind)];
}
