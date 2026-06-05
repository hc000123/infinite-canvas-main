import type { Prompt, PromptMetadata, PromptNodeGroup, PromptTemplateType, PromptVariable } from "../../services/api/prompts";
import type { ProductionBibleItem } from "../../app/(user)/canvas/utils/production-bible";

export const promptNodeGroupOptions: Array<{ label: string; value: PromptNodeGroup }> = [
    { label: "文本节点", value: "text" },
    { label: "图片节点", value: "image" },
    { label: "视频节点", value: "video" },
];

export const promptTypeOptions: Array<{ label: string; value: PromptTemplateType }> = [
    { label: "素材片段", value: "asset" },
    { label: "图片模板", value: "image" },
    { label: "视频模板", value: "video" },
    { label: "宫格模板", value: "grid" },
    { label: "正向词", value: "positive" },
    { label: "负向词", value: "negative" },
    { label: "工作流", value: "workflow" },
];

export const promptInputKindOptions = ["text", "image", "video", "audio", "multimodal"].map((value) => ({ label: inputOutputKindLabel(value), value }));
export const promptOutputKindOptions = ["text", "image", "video", "asset", "workflow"].map((value) => ({ label: inputOutputKindLabel(value), value }));

export function promptTypeLabel(type?: string) {
    return promptTypeOptions.find((item) => item.value === type)?.label || type || "普通";
}

export function promptNodeGroupLabel(nodeGroup?: string) {
    return promptNodeGroupOptions.find((item) => item.value === nodeGroup)?.label || nodeGroup || "未分组";
}

export function promptTypesForNodeGroup(nodeGroup?: string) {
    if (nodeGroup === "image") return ["image", "asset", "grid", "positive", "negative", "workflow"];
    if (nodeGroup === "video") return ["video", "positive", "negative", "workflow", "asset"];
    if (nodeGroup === "text") return ["workflow", "asset", "positive", "negative"];
    return promptTypeOptions.map((item) => item.value);
}

export function defaultPromptTypeForNodeGroup(nodeGroup?: string) {
    if (nodeGroup === "video") return "video";
    if (nodeGroup === "image") return "image";
    return "workflow";
}

export function inputOutputKindLabel(kind?: string) {
    if (kind === "text") return "文本";
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    if (kind === "asset") return "素材";
    if (kind === "workflow") return "工作流";
    if (kind === "multimodal") return "多模态";
    return kind || "未指定";
}

export function normalizePromptMetadata(metadata?: PromptMetadata): PromptMetadata {
    return {
        nodeGroup: metadata?.nodeGroup || "",
        type: metadata?.type || "",
        scenario: metadata?.scenario || "",
        provider: metadata?.provider || "",
        model: metadata?.model || "",
        inputKind: metadata?.inputKind || "",
        outputKind: metadata?.outputKind || "",
        variables: normalizePromptVariables(metadata?.variables || []),
        favorite: metadata?.favorite === true,
    };
}

export function normalizePromptVariables(variables: PromptVariable[]) {
    const seen = new Set<string>();
    const result: PromptVariable[] = [];
    for (const variable of variables) {
        const name = variable.name.trim().replace(/[{}]/g, "");
        if (!name || seen.has(name)) continue;
        seen.add(name);
        result.push({
            name,
            description: variable.description?.trim() || "",
            defaultValue: variable.defaultValue?.trim() || "",
        });
    }
    return result;
}

export function promptVariablesFromTemplate(prompt: string, metadata?: PromptMetadata) {
    const fromPrompt = Array.from(prompt.matchAll(/\{([^{}\s]+)\}/g)).map((match) => match[1]);
    return normalizePromptVariables([...(metadata?.variables || []), ...fromPrompt.map((name) => ({ name }))]);
}

export function renderPromptTemplate(prompt: string, values: Record<string, string>) {
    return prompt.replace(/\{([^{}\s]+)\}/g, (match, name: string) => {
        const value = values[name]?.trim();
        return value || match;
    });
}

export function parsePromptVariablesText(text: string) {
    return normalizePromptVariables(
        text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const [name = "", description = "", defaultValue = ""] = line.split("|").map((item) => item.trim());
                return { name, description, defaultValue };
            }),
    );
}

export function formatPromptVariablesText(variables?: PromptVariable[]) {
    return normalizePromptVariables(variables || [])
        .map((item) => [item.name, item.description || "", item.defaultValue || ""].join(" | ").replace(/(\s\|\s)*$/g, ""))
        .join("\n");
}

export function productionBibleValueForVariable(variable: string, item: ProductionBibleItem) {
    const snippets = item.promptSnippets;
    const base = [item.name, item.description, snippets.positive, snippets.consistency].filter(Boolean).join("，");
    if (variable.includes("角色") && item.kind === "character") return base;
    if (variable.includes("场景") && item.kind === "scene") return base;
    if (variable.includes("道具") && item.kind === "prop") return base;
    return base;
}

export function promptSearchText(prompt: Prompt) {
    const metadata = normalizePromptMetadata(prompt.metadata);
    return [
        prompt.title,
        prompt.prompt,
        prompt.preview,
        ...(prompt.tags || []),
        metadata.nodeGroup,
        metadata.type,
        metadata.scenario,
        metadata.provider,
        metadata.model,
        metadata.inputKind,
        metadata.outputKind,
        ...(metadata.variables || []).map((item) => `${item.name} ${item.description || ""}`),
    ]
        .join(" ")
        .toLowerCase();
}
