export type SkillTrialTextPreview = {
    label: string;
    text: string;
};

export function resolveSkillTrialTextPreview(value: unknown): SkillTrialTextPreview | undefined {
    if (typeof value === "string" && value.trim()) return { label: "文本内容", text: value };
    if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
    const productionScript = (value as Record<string, unknown>).productionScript;
    return typeof productionScript === "string" && productionScript.trim() ? { label: "剧本正文", text: productionScript } : undefined;
}
