"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { normalizePromptProfile, promptProfileActiveKey, type PromptProfile, type PromptProfileScope, type PromptProfileWriteInput, type PromptRecipeNodeGroup } from "@/components/prompts/prompt-profile";
import { localForageStorage } from "@/lib/localforage-storage";

type PromptProfileStore = {
    hydrated: boolean;
    profiles: PromptProfile[];
    activeProfileIds: Record<string, string>;
    addProfile: (input: PromptProfileWriteInput) => string;
    updateProfile: (id: string, patch: Partial<PromptProfileWriteInput>) => void;
    removeProfile: (id: string) => void;
    setActiveProfile: (scope: PromptProfileScope, nodeGroup: PromptRecipeNodeGroup, profileId: string, projectId?: string) => void;
};

const PROMPT_PROFILE_STORE_KEY = "infinite-canvas:prompt_profile_store";

const promptProfileStorage: PersistStorage<PromptProfileStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<PromptProfileStore>;
        parsed.state.profiles = (parsed.state.profiles || []).map((profile) => normalizePromptProfile(profile));
        parsed.state.activeProfileIds = parsed.state.activeProfileIds || {};
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const usePromptProfileStore = create<PromptProfileStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            profiles: [],
            activeProfileIds: {},
            addProfile: (input) => {
                const now = new Date().toISOString();
                const profile = normalizePromptProfile({ ...input, id: nanoid(), createdAt: now, updatedAt: now });
                set((state) => ({ profiles: [profile, ...state.profiles] }));
                return profile.id;
            },
            updateProfile: (id, patch) =>
                set((state) => ({
                    profiles: state.profiles.map((profile) => (profile.id === id ? normalizePromptProfile({ ...profile, ...patch, id: profile.id, createdAt: profile.createdAt, updatedAt: new Date().toISOString() }) : profile)),
                })),
            removeProfile: (id) =>
                set((state) => ({
                    profiles: state.profiles.filter((profile) => profile.id !== id),
                    activeProfileIds: Object.fromEntries(Object.entries(state.activeProfileIds).filter(([, profileId]) => profileId !== id)),
                })),
            setActiveProfile: (scope, nodeGroup, profileId, projectId) => {
                const key = promptProfileActiveKey(scope, nodeGroup, projectId);
                if (!profileId) {
                    set((state) => ({ activeProfileIds: Object.fromEntries(Object.entries(state.activeProfileIds).filter(([entryKey]) => entryKey !== key)) }));
                    return;
                }
                const profile = get().profiles.find((item) => item.id === profileId);
                const matchesProject = scope === "personal" ? profile?.scope === "personal" : profile?.scope === "project" && profile.projectId === projectId;
                if (!profile || profile.nodeGroup !== nodeGroup || !matchesProject) return;
                set((state) => ({ activeProfileIds: { ...state.activeProfileIds, [key]: profileId } }));
            },
        }),
        {
            name: PROMPT_PROFILE_STORE_KEY,
            storage: promptProfileStorage,
            partialize: (state) => ({ profiles: state.profiles, activeProfileIds: state.activeProfileIds }) as StorageValue<PromptProfileStore>["state"],
            onRehydrateStorage: () => () => usePromptProfileStore.setState({ hydrated: true }),
        },
    ),
);

export function activePromptProfile(state: Pick<PromptProfileStore, "profiles" | "activeProfileIds">, scope: PromptProfileScope, nodeGroup: PromptRecipeNodeGroup, projectId?: string) {
    const id = state.activeProfileIds[promptProfileActiveKey(scope, nodeGroup, projectId)];
    return state.profiles.find((profile) => profile.id === id);
}
