export type ModelProviderKey = "openai" | "anthropic" | "google" | "xai" | "deepseek" | "zhipu" | "other";

export type ModelPickerOption = {
    value: string;
    provider: ModelProviderKey;
    providerLabel: string;
    searchText: string;
};

type BuildModelPickerOptionsInput = {
    models: string[];
    value?: string;
};

const providerRules: Array<{ key: ModelProviderKey; label: string; aliases: string[] }> = [
    { key: "openai", label: "OpenAI", aliases: ["openai", "gpt", "codex", "dall-e", "dalle", "o1", "o3", "o4"] },
    { key: "anthropic", label: "Anthropic", aliases: ["anthropic", "claude", "sonnet", "opus", "haiku"] },
    { key: "google", label: "Google", aliases: ["google", "gemini", "imagen", "veo"] },
    { key: "xai", label: "xAI", aliases: ["xai", "grok"] },
    { key: "deepseek", label: "DeepSeek", aliases: ["deepseek"] },
    { key: "zhipu", label: "智谱", aliases: ["zhipu", "glm"] },
];

export function buildModelPickerOptions({ models, value }: BuildModelPickerOptionsInput) {
    const values = uniqueModels([value, ...models]);
    return values.map((model) => {
        const provider = resolveModelProvider(model);
        return {
            value: model,
            provider: provider.key,
            providerLabel: provider.label,
            searchText: [model, provider.label, ...provider.aliases].join(" ").toLowerCase(),
        };
    });
}

export function filterModelPickerOptions(options: ModelPickerOption[], keyword: string) {
    const query = keyword.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.searchText.includes(query));
}

export function resolveCustomModelCandidate(keyword: string, options: ModelPickerOption[], allowCustomModel: boolean) {
    if (!allowCustomModel) return "";
    const model = keyword.trim();
    if (!model) return "";
    const normalizedModel = model.toLowerCase();
    return options.some((option) => option.value.toLowerCase() === normalizedModel) ? "" : model;
}

export function groupModelPickerOptions(options: ModelPickerOption[]) {
    const groups: Array<{ key: ModelProviderKey; label: string; options: ModelPickerOption[] }> = [
        ...providerRules.map((provider) => ({ key: provider.key, label: provider.label, options: options.filter((option) => option.provider === provider.key) })),
        { key: "other" as const, label: "其他模型", options: options.filter((option) => option.provider === "other") },
    ];
    return groups.filter((group) => group.options.length);
}

export function resolveModelProvider(model: string) {
    const name = model.toLowerCase();
    const provider = providerRules.find((item) => item.aliases.some((alias) => name.includes(alias)));
    return provider || { key: "other" as const, label: "其他", aliases: [] };
}

function uniqueModels(models: Array<string | undefined>) {
    const seen = new Set<string>();
    return models
        .map((model) => model?.trim() || "")
        .filter((model) => {
            if (!model || seen.has(model)) return false;
            seen.add(model);
            return true;
        });
}
