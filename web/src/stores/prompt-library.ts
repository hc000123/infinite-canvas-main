import type { PromptNodeGroup, PromptTemplateType } from "@/services/api/prompts";

export type PersonalPromptFolder = {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
};

export type PersonalPrompt = {
    id: string;
    title: string;
    prompt: string;
    tags: string[];
    folderId?: string;
    nodeGroup: PromptNodeGroup;
    type: PromptTemplateType;
    createdAt: string;
    updatedAt: string;
};

export type PersonalPromptWriteInput = Omit<PersonalPrompt, "id" | "createdAt" | "updatedAt">;

export function normalizePromptFolderName(name: string) {
    const normalized = name.trim();
    if (!normalized) throw new Error("文件夹名称不能为空");
    return normalized;
}

export function deletePromptFolder(folders: PersonalPromptFolder[], prompts: PersonalPrompt[], folderId: string) {
    return {
        folders: folders.filter((folder) => folder.id !== folderId),
        prompts: prompts.map((prompt) => (prompt.folderId === folderId ? { ...prompt, folderId: undefined } : prompt)),
    };
}

export function matchesPromptLibraryFilter(
    item: Pick<PersonalPrompt, "title" | "prompt" | "tags" | "folderId" | "nodeGroup">,
    filter: { folderId?: string; keyword: string; nodeGroup: PromptNodeGroup | "all" },
) {
    if (filter.folderId && item.folderId !== filter.folderId) return false;
    if (filter.nodeGroup !== "all" && item.nodeGroup !== filter.nodeGroup) return false;
    const keyword = filter.keyword.trim().toLocaleLowerCase();
    if (!keyword) return true;
    return [item.title, item.prompt, ...item.tags].some((value) => value.toLocaleLowerCase().includes(keyword));
}
