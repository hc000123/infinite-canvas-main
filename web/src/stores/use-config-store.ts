"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { modelsForCapability, protocolForModel } from "../lib/ai-model-catalog.ts";
import { classifyAiModels, type AiModelKind } from "../lib/ai-model-kind.ts";
import { localForageStorage } from "../lib/localforage-storage.ts";
import { normalizeSeedanceImageRoleMode, normalizeVideoReferenceMode, type SeedanceImageRoleMode, type VideoReferenceMode } from "../services/api/video-reference.ts";
import { apiGet } from "../services/api/request.ts";
import type { AdminModelCapability, AdminModelCost, AdminModelProtocol, AdminModelSource, AdminModelTextEndpoint, AdminPublicSettings } from "../services/api/admin.ts";
import { resolveAllowedVideoProtocol } from "../services/api/ai-channel-boundary.ts";

export { classifyAiModels };
export type { AiModelKind };
export type TextModelEndpointType = "chat_completions" | "responses";

export type AiConfig = {
    channelMode: "remote" | "local";
    videoProtocol: "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud";
    baseUrl: string;
    apiKey: string;
    volcengineBaseUrl: string;
    volcengineApiKey: string;
    model: string;
    imageModel: string;
    videoModel: string;
    seedanceModel: string;
    seedanceEndpointId: string;
    textModel: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoSeed: string;
    videoPromptReviewEnabled: string;
    returnLastFrame: string;
    videoTaskMode: "generate" | "edit" | "extend";
    videoEditType: "replace" | "add" | "remove" | "inpaint";
    videoExtendDirection: "forward" | "backward";
    videoReferenceImageMode: SeedanceImageRoleMode;
    videoReferenceMode: VideoReferenceMode;
    systemPrompt: string;
    thinkingMode: string;
    reasoningEffort: "minimal" | "low" | "medium" | "high";
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    modelCosts: AdminModelCost[];
    modelProtocols: AdminModelProtocol[];
    modelCapabilities: AdminModelCapability[];
    modelSources: AdminModelSource[];
    modelTextEndpoints: AdminModelTextEndpoint[];
    quality: string;
    size: string;
    count: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";

const useDevDefaults = process.env.NODE_ENV === "development";
const devVideoProtocolValue = process.env.NEXT_PUBLIC_DEV_AI_VIDEO_PROTOCOL;
const devVideoProtocol: AiConfig["videoProtocol"] | "" = useDevDefaults && (devVideoProtocolValue === "volcengine-ark" || devVideoProtocolValue === "jimeng-cli" || devVideoProtocolValue === "xinglian-cloud") ? devVideoProtocolValue : "";

export const defaultConfig: AiConfig = {
    channelMode: "remote",
    videoProtocol: devVideoProtocol || "openai",
    baseUrl: (useDevDefaults && process.env.NEXT_PUBLIC_DEV_AI_BASE_URL) || "https://api.openai.com",
    apiKey: (useDevDefaults && process.env.NEXT_PUBLIC_DEV_AI_API_KEY) || "",
    volcengineBaseUrl: (useDevDefaults && process.env.NEXT_PUBLIC_DEV_VOLCENGINE_BASE_URL) || "https://ark.cn-beijing.volces.com/api/v3",
    volcengineApiKey: (useDevDefaults && process.env.NEXT_PUBLIC_DEV_VOLCENGINE_API_KEY) || "",
    model: (useDevDefaults && process.env.NEXT_PUBLIC_DEV_AI_MODEL) || "gpt-image-2",
    imageModel: (useDevDefaults && (process.env.NEXT_PUBLIC_DEV_AI_IMAGE_MODEL || process.env.NEXT_PUBLIC_DEV_AI_MODEL)) || "gpt-image-2",
    videoModel: (useDevDefaults && process.env.NEXT_PUBLIC_DEV_AI_VIDEO_MODEL) || "grok-imagine-video",
    seedanceModel: (useDevDefaults && process.env.NEXT_PUBLIC_DEV_SEEDANCE_MODEL) || "doubao-seedance-2-0-260128",
    seedanceEndpointId: (useDevDefaults && process.env.NEXT_PUBLIC_DEV_SEEDANCE_ENDPOINT_ID) || "",
    textModel: (useDevDefaults && (process.env.NEXT_PUBLIC_DEV_AI_TEXT_MODEL || process.env.NEXT_PUBLIC_DEV_AI_MODEL)) || "gpt-5.5",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoSeed: "",
    videoPromptReviewEnabled: "true",
    returnLastFrame: "true",
    videoTaskMode: "generate",
    videoEditType: "replace",
    videoExtendDirection: "forward",
    videoReferenceImageMode: "reference",
    videoReferenceMode: "auto",
    systemPrompt: "",
    thinkingMode: "false",
    reasoningEffort: "medium",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    modelCosts: [],
    modelProtocols: [],
    modelCapabilities: [],
    modelSources: [],
    modelTextEndpoints: [],
    quality: "auto",
    size: "1:1",
    count: "1",
};

type ConfigStore = {
    config: AiConfig;
    publicSettings: AdminPublicSettings | null;
    hasLoadedPublicSettings: boolean;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    loadPublicSettings: (options?: { force?: boolean }) => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

const configStorage: PersistStorage<ConfigStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        return value ? (JSON.parse(value) as StorageValue<ConfigStore>) : null;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null): AiConfig {
    const channelMode = "remote";
    const localVideoProtocol = resolveAllowedVideoProtocol("local", config.videoProtocol);
    if (!modelChannel) {
        return { ...config, channelMode, videoProtocol: localVideoProtocol, videoModel: config.videoModel, modelCosts: config.modelCosts || [], modelProtocols: config.modelProtocols || [], modelSources: config.modelSources || [] };
    }
    const modelCosts = modelChannel.modelCosts || [];
    const modelProtocols = modelChannel.modelProtocols || [];
    const models = uniqueModels(modelChannel.availableModels.map(normalizeVisibleRemoteVideoModel).filter(Boolean));
    const modelCapabilities = normalizeModelCapabilities(modelChannel.modelCapabilities || [], models);
    const modelSources = normalizeModelSources(modelChannel.modelSources || [], models);
    const catalogConfig = { ...config, models, modelCosts, modelCapabilities, modelProtocols, modelSources };
    const catalogVideoModels = modelsForCapability(catalogConfig, "video");
    const catalogImageModels = modelsForCapability(catalogConfig, "image");
    const catalogTextModels = modelsForCapability(catalogConfig, "text");
    const normalizedDefaultVideoModel = normalizeVisibleRemoteVideoModel(modelChannel.defaultVideoModel);
    const defaultVideoModel = catalogVideoModels.includes(normalizedDefaultVideoModel) ? normalizedDefaultVideoModel : catalogVideoModels[0] || "";
    const imageDefault = catalogImageModels.includes(modelChannel.defaultImageModel) ? modelChannel.defaultImageModel : catalogImageModels[0] || "";
    const textDefault = catalogTextModels.includes(modelChannel.defaultTextModel) ? modelChannel.defaultTextModel : catalogTextModels[0] || "";
    const videoModels = uniqueModels([defaultVideoModel, ...catalogVideoModels]);
    const imageModels = uniqueModels([imageDefault, ...catalogImageModels]);
    const textModels = uniqueModels([textDefault, ...catalogTextModels]);
    const selectedImageModel = imageModels.includes(config.imageModel) ? config.imageModel : "";
    const selectedTextModel = textModels.includes(config.textModel) ? config.textModel : "";
    const selectedVideoModel = normalizeVisibleRemoteVideoModel(config.videoModel);
    const visibleSelectedVideoModel = videoModels.includes(selectedVideoModel) ? selectedVideoModel : "";
    const modelTextEndpoints = normalizeModelTextEndpoints(modelChannel.modelTextEndpoints || [], textModels);
    const videoModel = visibleSelectedVideoModel || defaultVideoModel;
    const imageModel = selectedImageModel || imageDefault;
    const textModel = selectedTextModel || textDefault;
    const videoProtocol = protocolForModel(catalogConfig, videoModel);
    return {
        ...config,
        channelMode,
        videoProtocol,
        models,
        imageModels,
        videoModels,
        textModels,
        modelCosts,
        modelProtocols,
        modelCapabilities,
        modelSources,
        modelTextEndpoints,
        model: textModel,
        imageModel,
        videoModel,
        seedanceModel: videoProtocol === "volcengine-ark" ? videoModel : config.seedanceModel,
        seedanceEndpointId: "",
        textModel,
    };
}

function isAiConfigReady(_config: AiConfig, model: string) {
    const modelName = model.trim();
    if (!modelName) return false;
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_SKIP_AI_CONFIG !== "false") return true;
    return true;
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            publicSettings: null,
            hasLoadedPublicSettings: false,
            isPublicSettingsLoading: false,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            loadPublicSettings: async (options = {}) => {
                if (get().isPublicSettingsLoading && !options.force) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ hasLoadedPublicSettings: true, publicSettings: await apiGet<AdminPublicSettings>("/api/settings") });
                } catch (error) {
                    if (process.env.NODE_ENV === "development") {
                        console.warn("公共设置加载失败，已使用本地默认配置继续运行。", error);
                    }
                    set({ hasLoadedPublicSettings: true, publicSettings: null });
                } finally {
                    set({ isPublicSettingsLoading: false });
                }
            },
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            storage: configStorage,
            partialize: (state) => ({ config: state.config }) as StorageValue<ConfigStore>["state"],
            merge: (persisted, current) => {
                const config = { ...defaultConfig, ...((persisted as Partial<ConfigStore>).config || {}) };
                const classifiedModels = classifyAiModels(config.models);
                return {
                    ...current,
                    config: {
                        ...config,
                        channelMode: "remote",
                        videoProtocol: config.videoProtocol || defaultConfig.videoProtocol,
                        baseUrl: config.baseUrl || defaultConfig.baseUrl,
                        apiKey: config.apiKey || defaultConfig.apiKey,
                        volcengineBaseUrl: config.volcengineBaseUrl || defaultConfig.volcengineBaseUrl,
                        volcengineApiKey: config.volcengineApiKey || defaultConfig.volcengineApiKey,
                        model: config.model || defaultConfig.model,
                        imageModel: config.imageModel || config.model || defaultConfig.imageModel,
                        videoModel: config.videoModel || defaultConfig.videoModel,
                        seedanceModel: config.seedanceModel || defaultConfig.seedanceModel,
                        seedanceEndpointId: config.seedanceEndpointId || defaultConfig.seedanceEndpointId,
                        textModel: config.textModel || config.model || defaultConfig.textModel,
                        imageModels: Array.isArray(config.imageModels) && config.imageModels.length ? config.imageModels : classifiedModels.imageModels,
                        videoModels: Array.isArray(config.videoModels) && config.videoModels.length ? config.videoModels : classifiedModels.videoModels,
                        textModels: Array.isArray(config.textModels) && config.textModels.length ? config.textModels : classifiedModels.textModels,
                        modelCosts: Array.isArray(config.modelCosts) ? config.modelCosts : [],
                        modelProtocols: Array.isArray(config.modelProtocols) ? config.modelProtocols : [],
                        modelCapabilities: Array.isArray(config.modelCapabilities) ? config.modelCapabilities : [],
                        modelSources: Array.isArray(config.modelSources) ? config.modelSources : [],
                        modelTextEndpoints: Array.isArray(config.modelTextEndpoints) ? config.modelTextEndpoints : [],
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio === "false" ? "true" : config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        videoSeed: config.videoSeed || "",
                        videoPromptReviewEnabled: config.videoPromptReviewEnabled === "false" ? "false" : "true",
                        returnLastFrame: config.returnLastFrame || defaultConfig.returnLastFrame,
                        videoTaskMode: normalizeVideoTaskMode(config.videoTaskMode),
                        videoEditType: normalizeVideoEditType(config.videoEditType),
                        videoExtendDirection: normalizeVideoExtendDirection(config.videoExtendDirection),
                        videoReferenceImageMode: normalizeSeedanceImageRoleMode(config.videoReferenceImageMode),
                        videoReferenceMode: normalizeVideoReferenceMode(config.videoReferenceMode),
                        thinkingMode: config.thinkingMode === "true" ? "true" : "false",
                        reasoningEffort: normalizeReasoningEffort(config.reasoningEffort),
                    },
                };
            },
        },
    ),
);

export function useEffectiveConfig(): AiConfig {
    const config = useConfigStore((state) => state.config);
    const modelChannel = useConfigStore((state) => state.publicSettings?.modelChannel || null);
    return useMemo(() => resolveEffectiveConfig(config, modelChannel), [config, modelChannel]);
}

function normalizeVideoTaskMode(value?: string): AiConfig["videoTaskMode"] {
    return value === "edit" || value === "extend" ? value : "generate";
}

function normalizeVideoEditType(value?: string): AiConfig["videoEditType"] {
    return value === "add" || value === "remove" || value === "inpaint" ? value : "replace";
}

function normalizeVideoExtendDirection(value?: string): AiConfig["videoExtendDirection"] {
    return value === "backward" ? "backward" : "forward";
}

function normalizeReasoningEffort(value?: string): AiConfig["reasoningEffort"] {
    return value === "minimal" || value === "low" || value === "high" ? value : "medium";
}

export function buildApiUrl(baseUrl: string, path: string, protocol: AiConfig["videoProtocol"] = "openai") {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const apiBaseUrl = protocol === "openai" && !normalizedBaseUrl.endsWith("/v1") ? `${normalizedBaseUrl}/v1` : normalizedBaseUrl;
    return `${apiBaseUrl}${path}`;
}

export function resolveSeedanceRequestModel(config: Pick<AiConfig, "seedanceEndpointId" | "seedanceModel" | "videoModel" | "model">) {
    return (config.seedanceEndpointId || config.seedanceModel || config.videoModel || config.model).trim();
}

export function textModelEndpointType(config: Pick<AiConfig, "modelTextEndpoints">, model: string): TextModelEndpointType {
    const modelName = model.trim();
    const configured = config.modelTextEndpoints.find((item) => item.model === modelName)?.endpointType;
    if (configured === "responses" || configured === "chat_completions") return configured;
    return defaultTextModelEndpointType(modelName);
}

function normalizeModelTextEndpoints(items: AdminModelTextEndpoint[], models: string[]) {
    const availableModels = uniqueModels(models);
    const modelSet = new Set(availableModels);
    const seen = new Set<string>();
    const result = items
        .map((item) => ({ model: item.model.trim(), endpointType: normalizeTextModelEndpointType(item.endpointType, item.model) }))
        .filter((item) => {
            if (!item.model || seen.has(item.model) || !modelSet.has(item.model)) return false;
            seen.add(item.model);
            return true;
        });
    availableModels.forEach((model) => {
        if (!seen.has(model)) result.push({ model, endpointType: defaultTextModelEndpointType(model) });
    });
    return result;
}

function normalizeModelCapabilities(items: AdminModelCapability[], models: string[]) {
    const availableModels = new Set(uniqueModels(models));
    const allowedCapabilities = new Set(["text", "image", "video"]);
    const byModel = new Map<string, Set<string>>();
    items.forEach((item) => {
        const model = item.model.trim();
        if (!model || !availableModels.has(model)) return;
        const capabilities = byModel.get(model) || new Set<string>();
        item.capabilities.forEach((capability) => {
            const value = capability.trim().toLowerCase();
            if (allowedCapabilities.has(value)) capabilities.add(value);
        });
        if (capabilities.size) byModel.set(model, capabilities);
    });
    return Array.from(byModel.entries()).map(([model, capabilities]) => ({ model, capabilities: Array.from(capabilities) }));
}

function normalizeModelSources(items: AdminModelSource[], models: string[]) {
    const availableModels = new Set(uniqueModels(models));
    const seen = new Set<string>();
    return items
        .map((item) => ({
            model: item.model.trim(),
            channelId: item.channelId.trim(),
            channelName: item.channelName.trim(),
            protocol: item.protocol,
        }))
        .filter((item) => {
            const key = `${item.model}:${item.channelId || item.channelName}:${item.protocol}`;
            if (!item.model || !availableModels.has(item.model) || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function normalizeTextModelEndpointType(value: string | undefined, model: string): TextModelEndpointType {
    if (value === "responses" || value === "chat_completions") return value;
    return defaultTextModelEndpointType(model);
}

function defaultTextModelEndpointType(model: string): TextModelEndpointType {
    return model.trim().toLowerCase().includes("gpt-5.5") ? "responses" : "chat_completions";
}

function uniqueModels(models: string[]) {
    const seen = new Set<string>();
    return models
        .map((model) => model.trim())
        .filter((model) => {
            if (!model || seen.has(model)) return false;
            seen.add(model);
            return true;
        });
}

function isEndpointModel(model: string) {
    return model.trim().toLowerCase().startsWith("ep-");
}

function normalizeVisibleRemoteVideoModel(model: string) {
    const value = model.trim();
    if (!value || isEndpointModel(value)) return "";
    return value;
}
