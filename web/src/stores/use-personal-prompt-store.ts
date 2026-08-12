"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { deletePromptFolder, normalizePromptFolderName, type PersonalPrompt, type PersonalPromptFolder, type PersonalPromptWriteInput } from "./prompt-library";

type PersonalPromptStore = {
    hydrated: boolean;
    folders: PersonalPromptFolder[];
    prompts: PersonalPrompt[];
    addFolder: (name: string) => string;
    renameFolder: (id: string, name: string) => void;
    removeFolder: (id: string) => void;
    addPrompt: (input: PersonalPromptWriteInput) => string;
    updatePrompt: (id: string, patch: Partial<PersonalPromptWriteInput>) => void;
    removePrompt: (id: string) => void;
    duplicatePrompt: (id: string) => string | undefined;
};

const STORE_KEY = "infinite-canvas:personal_prompt_library";

const storage: PersistStorage<PersonalPromptStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<PersonalPromptStore>;
        parsed.state.folders = parsed.state.folders || [];
        parsed.state.prompts = parsed.state.prompts || [];
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const usePersonalPromptStore = create<PersonalPromptStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            folders: [],
            prompts: [],
            addFolder: (name) => {
                const now = new Date().toISOString();
                const folder = { id: nanoid(), name: normalizePromptFolderName(name), createdAt: now, updatedAt: now };
                set((state) => ({ folders: [...state.folders, folder] }));
                return folder.id;
            },
            renameFolder: (id, name) =>
                set((state) => ({ folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name: normalizePromptFolderName(name), updatedAt: new Date().toISOString() } : folder)) })),
            removeFolder: (id) => set((state) => deletePromptFolder(state.folders, state.prompts, id)),
            addPrompt: (input) => {
                const now = new Date().toISOString();
                const prompt = { ...input, id: nanoid(), title: input.title.trim(), prompt: input.prompt.trim(), tags: input.tags.map((tag) => tag.trim()).filter(Boolean), createdAt: now, updatedAt: now };
                set((state) => ({ prompts: [prompt, ...state.prompts] }));
                return prompt.id;
            },
            updatePrompt: (id, patch) =>
                set((state) => ({
                    prompts: state.prompts.map((prompt) =>
                        prompt.id === id
                            ? { ...prompt, ...patch, title: patch.title?.trim() || prompt.title, prompt: patch.prompt?.trim() || prompt.prompt, tags: patch.tags?.map((tag) => tag.trim()).filter(Boolean) || prompt.tags, updatedAt: new Date().toISOString() }
                            : prompt,
                    ),
                })),
            removePrompt: (id) => set((state) => ({ prompts: state.prompts.filter((prompt) => prompt.id !== id) })),
            duplicatePrompt: (id) => {
                const source = get().prompts.find((prompt) => prompt.id === id);
                if (!source) return undefined;
                return get().addPrompt({ ...source, title: `${source.title} 副本` });
            },
        }),
        {
            name: STORE_KEY,
            storage,
            partialize: (state) => ({ folders: state.folders, prompts: state.prompts }) as StorageValue<PersonalPromptStore>["state"],
            onRehydrateStorage: () => () => usePersonalPromptStore.setState({ hydrated: true }),
        },
    ),
);
