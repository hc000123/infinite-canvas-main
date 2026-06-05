"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { AgentTask, AgentTaskStatus } from "./agent-workbench";

type AgentTaskStore = {
    tasks: AgentTask[];
    addTask: (task: AgentTask) => void;
    updateTaskStatus: (id: string, status: AgentTaskStatus) => void;
    removeTask: (id: string) => void;
};

const AGENT_TASK_STORE_KEY = "infinite-canvas:agent_task_store";

const agentTaskStorage: PersistStorage<AgentTaskStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AgentTaskStore>;
        parsed.state.tasks = parsed.state.tasks || [];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAgentTaskStore = create<AgentTaskStore>()(
    persist(
        (set) => ({
            tasks: [],
            addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
            updateTaskStatus: (id, status) =>
                set((state) => ({
                    tasks: state.tasks.map((task) => (task.id === id ? { ...task, status, updatedAt: new Date().toISOString() } : task)),
                })),
            removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),
        }),
        {
            name: AGENT_TASK_STORE_KEY,
            storage: agentTaskStorage,
            partialize: (state) => ({ tasks: state.tasks }) as StorageValue<AgentTaskStore>["state"],
        },
    ),
);
