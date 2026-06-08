import type { AiConfig } from "@/stores/use-config-store";

const configPackageKeys = [
    "channelMode",
    "videoProtocol",
    "baseUrl",
    "apiKey",
    "volcengineBaseUrl",
    "volcengineApiKey",
    "model",
    "imageModel",
    "videoModel",
    "seedanceModel",
    "seedanceEndpointId",
    "textModel",
    "videoSeconds",
    "vquality",
    "videoGenerateAudio",
    "videoWatermark",
    "videoSeed",
    "videoPromptReviewEnabled",
    "returnLastFrame",
    "videoTaskMode",
    "videoEditType",
    "videoExtendDirection",
    "videoReferenceImageMode",
    "systemPrompt",
    "thinkingMode",
    "reasoningEffort",
    "models",
    "imageModels",
    "videoModels",
    "textModels",
    "quality",
    "size",
    "count",
] as const satisfies readonly (keyof AiConfig)[];

const listKeys = new Set<keyof AiConfig>(["models", "imageModels", "videoModels", "textModels"]);

export function parseAiConfigPackage(text: string) {
    const input = JSON.parse(text) as unknown;
    const source = configPackageSource(input);
    const patch: Partial<AiConfig> = {};
    const importedKeys: (keyof AiConfig)[] = [];
    configPackageKeys.forEach((key) => {
        const value = source[key as string];
        const normalized = normalizeConfigPackageValue(key, value);
        if (normalized === undefined) return;
        patch[key] = normalized as never;
        importedKeys.push(key);
    });
    if (!importedKeys.length) throw new Error("配置包里没有可导入的 AI 配置字段");
    return { patch, importedKeys };
}

export function createAiConfigPackageTemplate() {
    return JSON.stringify(
        {
            schema: "blink-workbench.ai-config.v1",
            aiConfig: {
                channelMode: "local",
                baseUrl: "https://api.openai.com",
                apiKey: "sk-...",
                imageModel: "gpt-image-2",
                videoModel: "grok-imagine-video",
                textModel: "gpt-5.5",
                videoProtocol: "openai",
                seedanceEndpointId: "",
                seedanceModel: "doubao-seedance-2-0-260128",
                models: ["gpt-image-2", "grok-imagine-video", "gpt-5.5"],
                imageModels: ["gpt-image-2"],
                videoModels: ["grok-imagine-video"],
                textModels: ["gpt-5.5"],
                systemPrompt: "",
                thinkingMode: "false",
                reasoningEffort: "medium",
            },
        },
        null,
        2,
    );
}

function configPackageSource(input: unknown): Record<string, unknown> {
    if (!isPlainObject(input)) throw new Error("配置包必须是 JSON 对象");
    const nested = input.aiConfig || input.config || input.settings;
    if (isPlainObject(nested)) return nested;
    return input;
}

function normalizeConfigPackageValue(key: keyof AiConfig, value: unknown) {
    if (value === undefined || value === null) return undefined;
    if (listKeys.has(key)) return normalizeStringList(value);
    if (key === "channelMode") return value === "remote" ? "remote" : value === "local" ? "local" : undefined;
    if (key === "videoProtocol") return value === "volcengine-ark" ? "volcengine-ark" : value === "openai" ? "openai" : undefined;
    if (key === "videoTaskMode") return value === "edit" || value === "extend" ? value : value === "generate" ? "generate" : undefined;
    if (key === "videoEditType") return value === "add" || value === "remove" || value === "inpaint" ? value : value === "replace" ? "replace" : undefined;
    if (key === "videoExtendDirection") return value === "backward" ? "backward" : value === "forward" ? "forward" : undefined;
    if (key === "reasoningEffort") return value === "minimal" || value === "low" || value === "medium" || value === "high" ? value : undefined;
    if (typeof value === "boolean") return String(value);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string") return value;
    return undefined;
}

function normalizeStringList(value: unknown) {
    const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : [];
    const seen = new Set<string>();
    return raw
        .map((item) => String(item).trim())
        .filter((item) => {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
