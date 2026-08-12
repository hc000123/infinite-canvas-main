export const promptCategoryOptions = [
    { value: "scene", label: "场景", color: "green" },
    { value: "prop", label: "道具", color: "gold" },
    { value: "character", label: "角色", color: "magenta" },
    { value: "video", label: "视频", color: "blue" },
    { value: "text", label: "文本", color: "cyan" },
] as const;

export type PromptBusinessCategory = (typeof promptCategoryOptions)[number]["value"];

export function promptCategoryLabel(category: string) {
    return promptCategoryOptions.find((item) => item.value === category)?.label || category;
}

export function promptCategoryColor(category: string) {
    return promptCategoryOptions.find((item) => item.value === category)?.color;
}
