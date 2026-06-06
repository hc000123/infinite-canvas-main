"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { AgentConfig } from "./agent-settings";
import {
    approveAgentRun,
    createAgentRunRecord,
    listAgentRunsByAgentKind,
    listAgentRunsByEpisode,
    listAgentRunsByProject,
    markAgentRunApplied,
    markAgentRunFailed,
    rejectAgentRun,
    updateAgentRunDraft,
    type AgentDraftOutput,
    type AgentRunInput,
    type AgentRunKind,
    type AgentRunRecord,
} from "./agent-runner";

type AgentRunnerStore = {
    runs: AgentRunRecord[];
    createRun: (config: AgentConfig, input: AgentRunInput, draftOutput?: unknown) => string;
    updateDraft: (id: string, draftOutput: unknown) => void;
    approveRun: (id: string) => void;
    rejectRun: (id: string) => void;
    markApplied: (id: string) => void;
    markFailed: (id: string, errorMessage: string) => void;
    listRunsByProject: (projectId: string) => AgentRunRecord[];
    listRunsByEpisode: (episodeId: string) => AgentRunRecord[];
    listRunsByAgentKind: (agentKind: AgentRunKind) => AgentRunRecord[];
};

const AGENT_RUNNER_STORE_KEY = "infinite-canvas:agent_runner_store";

const agentRunnerStorage: PersistStorage<AgentRunnerStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AgentRunnerStore>;
        parsed.state.runs = (parsed.state.runs || []).map(normalizeStoredRun);
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAgentRunnerStore = create<AgentRunnerStore>()(
    persist(
        (set, get) => ({
            runs: [],
            createRun: (config, input, draftOutput) => {
                const now = new Date().toISOString();
                const id = `agent-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const run = createAgentRunRecord({ config, input, id, now, draftOutput });
                set((state) => ({ runs: [run, ...state.runs] }));
                return id;
            },
            updateDraft: (id, draftOutput) =>
                set((state) => ({
                    runs: state.runs.map((run) => (run.id === id ? updateAgentRunDraft(run, draftOutput, new Date().toISOString()) : run)),
                })),
            approveRun: (id) =>
                set((state) => ({
                    runs: state.runs.map((run) => (run.id === id ? approveAgentRun(run, new Date().toISOString()) : run)),
                })),
            rejectRun: (id) =>
                set((state) => ({
                    runs: state.runs.map((run) => (run.id === id ? rejectAgentRun(run, new Date().toISOString()) : run)),
                })),
            markApplied: (id) =>
                set((state) => ({
                    runs: state.runs.map((run) => (run.id === id ? markAgentRunApplied(run, new Date().toISOString()) : run)),
                })),
            markFailed: (id, errorMessage) =>
                set((state) => ({
                    runs: state.runs.map((run) => (run.id === id ? markAgentRunFailed(run, errorMessage, new Date().toISOString()) : run)),
                })),
            listRunsByProject: (projectId) => listAgentRunsByProject(get().runs, projectId),
            listRunsByEpisode: (episodeId) => listAgentRunsByEpisode(get().runs, episodeId),
            listRunsByAgentKind: (agentKind) => listAgentRunsByAgentKind(get().runs, agentKind),
        }),
        {
            name: AGENT_RUNNER_STORE_KEY,
            storage: agentRunnerStorage,
            partialize: (state) => ({ runs: state.runs }) as StorageValue<AgentRunnerStore>["state"],
        },
    ),
);

function normalizeStoredRun(run: AgentRunRecord): AgentRunRecord {
    return {
        ...run,
        draftOutput: normalizeStoredDraftOutput(run.draftOutput),
        proposedActions: run.proposedActions || [],
    };
}

function normalizeStoredDraftOutput(output: AgentDraftOutput | undefined): AgentDraftOutput {
    return {
        summary: output?.summary || "",
        items: output?.items || [],
        rawJson: output?.rawJson || {},
        warnings: output?.warnings || [],
        schemaVersion: output?.schemaVersion || "1.0.0",
    };
}
