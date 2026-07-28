import type { Prompt, PromptNodeGroup, PromptSlot } from "@/services/api/prompts";
import { normalizePromptMetadata, promptSlotLabel } from "./prompt-template";

export type PromptProfileScope = "personal" | "project";
export type PromptRecipeNodeGroup = Extract<PromptNodeGroup, "image" | "video">;

export type PromptProfileBlock = {
    id: string;
    title: string;
    slot: PromptSlot;
    content: string;
    enabled: boolean;
};

export type PromptProfile = {
    id: string;
    name: string;
    scope: PromptProfileScope;
    projectId?: string;
    nodeGroup: PromptRecipeNodeGroup;
    blocks: PromptProfileBlock[];
    createdAt: string;
    updatedAt: string;
};

export type PromptProfileWriteInput = Omit<PromptProfile, "id" | "createdAt" | "updatedAt">;

export type PromptRecipeSection = {
    id: string;
    source: "task" | "template" | "project" | "personal" | "company";
    title: string;
    slot?: PromptSlot | string;
    content: string;
    locked: boolean;
};

export type PromptRecipe = {
    text: string;
    sections: PromptRecipeSection[];
    warnings: string[];
};

export function promptProfileActiveKey(scope: PromptProfileScope, nodeGroup: PromptRecipeNodeGroup, projectId?: string) {
    return scope === "project" ? `project:${projectId || ""}:${nodeGroup}` : `personal:${nodeGroup}`;
}

export function normalizePromptProfile(profile: PromptProfile): PromptProfile;
export function normalizePromptProfile(profile: PromptProfileWriteInput): PromptProfileWriteInput;
export function normalizePromptProfile(profile: PromptProfile | PromptProfileWriteInput): PromptProfile | PromptProfileWriteInput {
    const seen = new Set<string>();
    const blocks = (profile.blocks || []).flatMap((block) => {
        const content = block.content.trim();
        if (!content || seen.has(content)) return [];
        seen.add(content);
        return [
            {
                ...block,
                title: block.title.trim() || promptSlotLabel(block.slot),
                slot: block.slot || "constraint",
                content,
                enabled: block.enabled !== false,
            },
        ];
    });
    return {
        ...profile,
        name: profile.name.trim() || (profile.scope === "project" ? "未命名项目风格" : "未命名个人习惯"),
        ...(profile.scope === "project" && profile.projectId?.trim() ? { projectId: profile.projectId.trim() } : { projectId: undefined }),
        blocks,
    };
}

export function composePromptRecipe({ task = "", template = "", companyStandards = [], projectProfile, personalProfile, companyAvailable = true }: { task?: string; template?: string; companyStandards?: Prompt[]; projectProfile?: PromptProfile; personalProfile?: PromptProfile; companyAvailable?: boolean }): PromptRecipe {
    const sections: PromptRecipeSection[] = [];
    const seen = new Set<string>();
    const add = (section: PromptRecipeSection) => {
        const content = section.content.trim();
        if (!content || seen.has(content)) return;
        seen.add(content);
        sections.push({ ...section, content });
    };
    add({ id: "task", source: "task", title: "本次任务", content: task, locked: false });
    add({ id: "template", source: "template", title: "选用模板", content: template, locked: false });
    addProfileSections(sections, seen, projectProfile, "project");
    addProfileSections(sections, seen, personalProfile, "personal");
    for (const standard of companyStandards) {
        const metadata = normalizePromptMetadata(standard.metadata);
        if (metadata.kind !== "standard" || metadata.enabled === false || !["required", "recommended"].includes(String(metadata.policy))) continue;
        add({
            id: `company:${standard.id}`,
            source: "company",
            title: standard.title,
            slot: metadata.slot,
            content: standard.prompt,
            locked: metadata.policy === "required",
        });
    }
    const text = sections.map((section) => section.content).join("\n\n");
    const warnings: string[] = [];
    if (!companyAvailable) warnings.push("公司标准读取失败，本次结果未验证公司规则。");
    if (/\{[^{}\s]+\}/.test(text)) warnings.push("仍有模板变量未填写，请补充后再应用完整配方。");
    return { text, sections, warnings };
}

function addProfileSections(sections: PromptRecipeSection[], seen: Set<string>, profile: PromptProfile | undefined, source: "project" | "personal") {
    if (!profile) return;
    for (const block of normalizePromptProfile(profile).blocks) {
        const content = block.content.trim();
        if (!block.enabled || !content || seen.has(content)) continue;
        seen.add(content);
        sections.push({ id: `${source}:${profile.id}:${block.id}`, source, title: block.title, slot: block.slot, content, locked: false });
    }
}
