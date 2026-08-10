import type { AdminModelChannel, AdminSettings } from "../../../../services/api/admin.ts";
import { sanitizeModelChannelPublication } from "./model-channel-publication.ts";

export type ModelChannelPresetId = "volcengine" | "xinglian" | "jimeng" | "comfly" | "geeknow" | "openai-compatible";
export type ModelChannelPresetInput = {
    apiKey?: string;
    endpointId?: string;
    seedance25EndpointId?: string;
    name?: string;
    baseUrl?: string;
    capability?: "text" | "image" | "video";
    models?: string[];
};
export type ModelChannelPresetResult = {
    settings: AdminSettings;
    summary: { added: string[]; updated: string[]; disabled: string[]; publishedModels: string[] };
};
export type ModelChannelPresetDefinition = {
    id: ModelChannelPresetId;
    name: string;
    description: string;
    tag: string;
};

export const XINGLIAN_MODELS = ["sd2-720p-fast", "sd2-720p", "sd2-720p-sh", "sd2-720p-mini", "sd2-1080p-mini", "sd2-1080p-fast", "sd2-1080p", "sd2-720p-ax-fast", "sd2-720p-ax"] as const;
export const VOLCENGINE_ARK_MODELS = {
    seedance20: "doubao-seedance-2-0",
    seedance25: "doubao-seedance-2-5",
} as const;
export const JIMENG_MODELS = ["seedance2.0mini", "seedance2.0fast", "seedance2.0", "seedance2.0_vip", "seedance2.0fast_vip", "seedance2.5"] as const;
export const COMFLY_TEXT_MODELS = ["gpt-5.5-pro", "gpt-5.5", "gemini-3.1-pro-preview"] as const;
export const COMFLY_IMAGE_MODELS = ["gemini-3.1-flash-image-preview", "nano-banana-pro", "nano-banana-2", "nano-banana-pro-2k", "gpt-image-2-all"] as const;
export const COMFLY_VIDEO_MODELS = ["veo3.1-fast", "veo3.1"] as const;
export const GEEKNOW_TEXT_MODELS = ["gpt-5.5", "gpt-5.4", "claude-opus-4-8", "claude-sonnet-5", "gemini-3.5-flash", "deepseek-v4-pro", "qwen-max"] as const;
export const GEEKNOW_IMAGE_MODELS = ["gpt-image-2", "gpt-image-2-pro", "gpt-image-2-vip", "doubao-seedream-4-5-251128", "doubao-seedream-5-0-260128", "grok-4-2-image"] as const;
export const GEEKNOW_VIDEO_MODELS = ["grok-imagine-video", "grok-imagine-video-1.5-preview", "sora-2", "veo_3_1", "veo_3_1-fast", "doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128", "minimax-h3-768p", "minimax-h3-2k", "minimax-h3-pro-768p", "minimax-h3-pro-2k", "manxue-2.5", "omni-fast", "omni-fast-v2v"] as const;

export const MODEL_CHANNEL_PRESETS: readonly ModelChannelPresetDefinition[] = [
    { id: "volcengine", name: "火山 Ark", description: "Seedance 企业 API；只需 Key 和 EP。", tag: "视频" },
    { id: "xinglian", name: "星链云", description: "一次配置 9 个 SD2 视频模型到私有渠道。", tag: "视频" },
    { id: "jimeng", name: "即梦 CLI", description: "自动配置六个模型；普通用户需在个人配置完成即梦网页登录。", tag: "本地 CLI" },
    { id: "comfly", name: "Comfly", description: "一次 Key 自动拆分文本、图片和视频渠道。", tag: "整包" },
    { id: "geeknow", name: "GeekNow", description: "一次 Key 配置文本、图片和视频三个私有渠道。", tag: "整包" },
    { id: "openai-compatible", name: "通用中转", description: "适用于其他 OpenAI 兼容服务。", tag: "自定义" },
];

export function applyModelChannelPreset(settings: AdminSettings, presetId: ModelChannelPresetId, input: ModelChannelPresetInput): ModelChannelPresetResult {
    const next = structuredClone(settings);
    const summary: ModelChannelPresetResult["summary"] = { added: [], updated: [], disabled: [], publishedModels: [] };
    if (presetId === "volcengine") applyVolcengine(next, input, summary);
    if (presetId === "xinglian") applyXinglian(next, input, summary);
    if (presetId === "jimeng") applyJimeng(next, summary);
    if (presetId === "comfly") applyComfly(next, input, summary);
    if (presetId === "geeknow") applyGeekNow(next, input, summary);
    if (presetId === "openai-compatible") applyOpenAICompatible(next, input, summary);
    next.public.modelChannel = sanitizeModelChannelPublication(next.public.modelChannel, next.private.channels);
    summary.publishedModels = [...next.public.modelChannel.availableModels];
    return { settings: next, summary };
}

function applyVolcengine(settings: AdminSettings, input: ModelChannelPresetInput, summary: ModelChannelPresetResult["summary"]) {
    const baseUrl = "https://ark.cn-beijing.volces.com/api/v3";
    const index = findChannelIndex(settings.private.channels, "volcengine-seedance", (item) => item.protocol === "volcengine-ark" && trimURL(item.baseUrl) === baseUrl);
    const current = settings.private.channels[index];
    const apiKey = credential(input.apiKey, current?.apiKey);
    const currentMappings = current?.endpointMappings || [];
    const endpointId = firstValue(input.endpointId, currentMappings.find((item) => item.model === VOLCENGINE_ARK_MODELS.seedance20)?.endpointId, currentMappings.length ? "" : current?.endpointId);
    const seedance25EndpointId = firstValue(input.seedance25EndpointId, currentMappings.find((item) => item.model === VOLCENGINE_ARK_MODELS.seedance25)?.endpointId);
    const endpointMappings: AdminModelChannel["endpointMappings"] = [{ model: VOLCENGINE_ARK_MODELS.seedance20, endpointId }];
    if (seedance25EndpointId) endpointMappings.push({ model: VOLCENGINE_ARK_MODELS.seedance25, endpointId: seedance25EndpointId });
    requireValue(apiKey, "请填写火山 API Key");
    requireValue(endpointId, "请填写 Seedance 2.0 Endpoint / EP");
    upsertChannel(
        settings,
        index,
        channelTemplate({
            id: "volcengine-seedance",
            protocol: "volcengine-ark",
            name: "火山 Ark / Seedance",
            baseUrl,
            apiKey,
            endpointId,
            endpointMappings,
            models: endpointMappings.map((item) => item.model),
            capabilities: ["video", "video_query", "asset_review", "preflight"],
            remark: "厂商预设：火山 Ark / Seedance",
        }),
        summary,
    );
}

function applyXinglian(settings: AdminSettings, input: ModelChannelPresetInput, summary: ModelChannelPresetResult["summary"]) {
    const baseUrl = "https://www.vjimeng.vip/v1";
    const index = findChannelIndex(settings.private.channels, "xinglian-cloud", (item) => item.protocol === "xinglian-cloud" && trimURL(item.baseUrl) === trimURL(baseUrl));
    const apiKey = credential(input.apiKey, settings.private.channels[index]?.apiKey);
    requireValue(apiKey, "请填写星链云 API Key");
    upsertChannel(
        settings,
        index,
        channelTemplate({
            id: "xinglian-cloud",
            protocol: "xinglian-cloud",
            name: "星链云",
            baseUrl,
            apiKey,
            models: [...XINGLIAN_MODELS],
            capabilities: ["video", "video_query", "preflight"],
            remark: "厂商预设：星链云 SD2",
        }),
        summary,
    );
}

function applyJimeng(settings: AdminSettings, summary: ModelChannelPresetResult["summary"]) {
    const index = findChannelIndex(settings.private.channels, "jimeng-video", (item) => item.protocol === "jimeng-cli");
    const current = settings.private.channels[index];
    upsertChannel(
        settings,
        index,
        channelTemplate({
            ...current,
            id: "jimeng-video",
            protocol: "jimeng-cli",
            name: "即梦 Seedance",
            baseUrl: "",
            apiKey: "",
            models: [...JIMENG_MODELS],
            capabilities: ["video", "video_query", "preflight", "cli_workflow"],
            concurrencyLimit: current?.concurrencyLimit || 1,
            remark: "厂商预设：即梦 CLI / Seedance",
        }),
        summary,
    );
}

function applyComfly(settings: AdminSettings, input: ModelChannelPresetInput, summary: ModelChannelPresetResult["summary"]) {
    const baseUrl = "https://ai.comfly.org";
    const legacy = settings.private.channels.find((item) => item.id === "comfly");
    const existing = settings.private.channels.find((item) => item.id.startsWith("comfly-") && item.apiKey);
    const apiKey = credential(input.apiKey, existing?.apiKey, legacy?.apiKey);
    requireValue(apiKey, "请填写 Comfly API Key");
    const templates = [
        channelTemplate({ id: "comfly-text", name: "Comfly 文本", baseUrl, apiKey, models: [...COMFLY_TEXT_MODELS], capabilities: ["text"], remark: "厂商预设：Comfly 文本" }),
        channelTemplate({ id: "comfly-image", name: "Comfly 图片", baseUrl, apiKey, models: [...COMFLY_IMAGE_MODELS], capabilities: ["image"], remark: "厂商预设：Comfly 图片" }),
        channelTemplate({ id: "comfly-video", name: "Comfly 视频", baseUrl, apiKey, models: [...COMFLY_VIDEO_MODELS], capabilities: ["video", "video_query"], remark: "厂商预设：Comfly 视频" }),
    ];
    for (const template of templates) {
        upsertChannel(settings, settings.private.channels.findIndex((item) => item.id === template.id), template, summary);
    }
    if (legacy?.enabled) {
        legacy.enabled = false;
        summary.disabled.push(legacy.name || legacy.id);
    }
}

function applyGeekNow(settings: AdminSettings, input: ModelChannelPresetInput, summary: ModelChannelPresetResult["summary"]) {
    const baseUrl = "https://www.geeknow.top/v1";
    const saved = settings.private.channels.find((item) => item.id.startsWith("geeknow-") && item.apiKey);
    const apiKey = credential(input.apiKey, saved?.apiKey);
    requireValue(apiKey, "请填写 GeekNow API Key");
    const templates = [
        channelTemplate({ id: "geeknow-text", name: "GeekNow 文本", baseUrl, apiKey, models: [...GEEKNOW_TEXT_MODELS], capabilities: ["text"], remark: "厂商预设：GeekNow 文本" }),
        channelTemplate({ id: "geeknow-image", name: "GeekNow 图片", baseUrl, apiKey, models: [...GEEKNOW_IMAGE_MODELS], capabilities: ["image"], remark: "厂商预设：GeekNow 图片" }),
        channelTemplate({ id: "geeknow-video", name: "GeekNow 视频", baseUrl, apiKey, models: [...GEEKNOW_VIDEO_MODELS], capabilities: ["video", "video_query"], remark: "厂商预设：GeekNow 视频" }),
    ];
    for (const template of templates) {
        upsertChannel(settings, settings.private.channels.findIndex((item) => item.id === template.id), template, summary);
    }
}

function applyOpenAICompatible(settings: AdminSettings, input: ModelChannelPresetInput, summary: ModelChannelPresetResult["summary"]) {
    const name = firstValue(input.name);
    const baseUrl = trimURL(input.baseUrl || "");
    const capability = input.capability;
    const models = uniqueValues(input.models || []);
    requireValue(name, "请填写渠道名称");
    requireValue(baseUrl, "请填写 Base URL");
    requireValue(capability, "请选择渠道能力");
    if (!models.length) throw new Error("请填写至少一个模型");
    const id = `openai-${slug(name)}`;
    const index = settings.private.channels.findIndex((item) => item.id === id);
    const apiKey = credential(input.apiKey, settings.private.channels[index]?.apiKey);
    requireValue(apiKey, "请填写 API Key");
    upsertChannel(
        settings,
        index,
        channelTemplate({
            id,
            name,
            baseUrl,
            apiKey,
            models,
            capabilities: capability === "video" ? ["video", "video_query"] : [capability],
            remark: "厂商预设：通用 OpenAI 兼容",
        }),
        summary,
    );
}

function channelTemplate(overrides: Partial<AdminModelChannel>): AdminModelChannel {
    return {
        id: "",
        protocol: "openai",
        name: "",
        baseUrl: "",
        apiKey: "",
        cliPath: "",
        workDir: "",
        outputDir: "",
        timeoutSeconds: 0,
        sessionId: 0,
        concurrencyLimit: 1,
        endpointId: "",
        endpointMappings: [],
        models: [],
        capabilities: ["text"],
        environment: "prod",
        weight: 1,
        enabled: true,
        remark: "",
        ...overrides,
    };
}

function upsertChannel(settings: AdminSettings, index: number, channel: AdminModelChannel, summary: ModelChannelPresetResult["summary"]) {
    if (index >= 0) {
        settings.private.channels[index] = channel;
        summary.updated.push(channel.name);
        return;
    }
    settings.private.channels.push(channel);
    summary.added.push(channel.name);
}

function findChannelIndex(channels: AdminModelChannel[], id: string, fallback: (channel: AdminModelChannel) => boolean) {
    const exact = channels.findIndex((item) => item.id === id);
    return exact >= 0 ? exact : channels.findIndex(fallback);
}

function credential(...values: Array<string | undefined>) {
    return firstValue(...values);
}

function firstValue(...values: Array<string | undefined>) {
    return values.map((item) => (item || "").trim()).find(Boolean) || "";
}

function uniqueValues(values: readonly string[]) {
    return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function requireValue(value: string | undefined, message: string): asserts value is string {
    if (!value) throw new Error(message);
}

function trimURL(value: string) {
    return value.trim().replace(/\/+$/, "");
}

function slug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "channel";
}
