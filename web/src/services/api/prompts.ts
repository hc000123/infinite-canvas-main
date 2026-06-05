import { apiGet, compactApiParams } from "@/services/api/request";

export type Prompt = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    metadata?: PromptMetadata;
    category: string;
    githubUrl: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
};

export type PromptTemplateType = "asset" | "image" | "video" | "grid" | "positive" | "negative" | "workflow";
export type PromptNodeGroup = "text" | "image" | "video";

export type PromptVariable = {
    name: string;
    description?: string;
    defaultValue?: string;
};

export type PromptMetadata = {
    nodeGroup?: PromptNodeGroup | string;
    type?: PromptTemplateType | string;
    scenario?: string;
    provider?: string;
    model?: string;
    inputKind?: string;
    outputKind?: string;
    variables?: PromptVariable[];
    favorite?: boolean;
};

export const ALL_PROMPTS_OPTION = "全部";

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    nodeGroups?: string[];
    types?: string[];
    scenarios?: string[];
    total: number;
};

export async function fetchPrompts({
    keyword = "",
    tag = [],
    category = ALL_PROMPTS_OPTION,
    nodeGroup = ALL_PROMPTS_OPTION,
    type = ALL_PROMPTS_OPTION,
    scenario = ALL_PROMPTS_OPTION,
    favorite = false,
    page,
    pageSize,
}: { keyword?: string; tag?: string[]; category?: string; nodeGroup?: string; type?: string; scenario?: string; favorite?: boolean; page?: number; pageSize?: number } = {}) {
    return apiGet<PromptListResponse>(
        "/api/prompts",
        compactApiParams({
            ...(keyword ? { keyword } : {}),
            ...(tag.length ? { tag } : {}),
            ...(category !== ALL_PROMPTS_OPTION ? { category } : {}),
            ...(nodeGroup !== ALL_PROMPTS_OPTION ? { nodeGroup } : {}),
            ...(type !== ALL_PROMPTS_OPTION ? { type } : {}),
            ...(scenario !== ALL_PROMPTS_OPTION ? { scenario } : {}),
            ...(favorite ? { favorite: "true" } : {}),
            ...(page ? { page } : {}),
            ...(pageSize ? { pageSize } : {}),
        }),
    );
}

export function formatPromptDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
