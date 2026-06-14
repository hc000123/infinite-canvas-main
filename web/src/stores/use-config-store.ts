"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "../lib/localforage-storage.ts";
import { normalizeSeedanceImageRoleMode, type SeedanceImageRoleMode } from "../services/api/video-reference.ts";
import { apiGet } from "../services/api/request.ts";
import type { AdminModelTextEndpoint, AdminPublicSettings } from "../services/api/admin.ts";
import { inferRemoteVideoProtocol, resolveAllowedVideoProtocol } from "../services/api/ai-channel-boundary.ts";

export type AiModelKind = "image" | "video" | "text";
export type TextModelEndpointType = "chat_completions" | "responses";

export type AiConfig = {
    channelMode: "remote" | "local";
    videoProtocol: "openai" | "volcengine-ark";
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
    systemPrompt: string;
    thinkingMode: string;
    reasoningEffort: "minimal" | "low" | "medium" | "high";
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    modelTextEndpoints: AdminModelTextEndpoint[];
    quality: string;
    size: string;
    count: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";

const useDevDefaults = process.env.NODE_ENV === "development";
const devVideoProtocol: AiConfig["videoProtocol"] | "" = useDevDefaults && process.env.NEXT_PUBLIC_DEV_AI_VIDEO_PROTOCOL === "volcengine-ark" ? "volcengine-ark" : "";

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
    systemPrompt: "",
    thinkingMode: "false",
    reasoningEffort: "medium",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    modelTextEndpoints: [],
    quality: "auto",
    size: "1:1",
    count: "1",
};

type ConfigStore = {
    config: AiConfig;
    publicSettings: AdminPublicSettings | null;
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
        const value = (await localForageStorage.getItem(name)) || (typeof window === "undefined" ? null : window.localStorage.getItem(name));
        return value ? (JSON.parse(value) as StorageValue<ConfigStore>) : null;
    },
    setItem: async (name, value) => {
        await localForageStorage.setItem(name, JSON.stringify(value));
        if (typeof window !== "undefined") window.localStorage.removeItem(name);
    },
    removeItem: async (name) => {
        await localForageStorage.removeItem(name);
        if (typeof window !== "undefined") window.localStorage.removeItem(name);
    },
};

export function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null): AiConfig {
    const channelMode = "remote";
    const localVideoProtocol = resolveAllowedVideoProtocol("local", config.videoProtocol);
    if (!modelChannel) {
        return { ...config, channelMode, videoProtocol: localVideoProtocol, videoModel: config.videoModel };
    }
    const models = uniqueModels([modelChannel.defaultModel, modelChannel.defaultImageModel, modelChannel.defaultVideoModel, modelChannel.defaultTextModel, ...modelChannel.availableModels].map(normalizeVisibleRemoteVideoModel).filter(Boolean));
    const classifiedModels = classifyAiModels(models);
    const fallbackModel = (modelChannel.defaultModel && models.includes(modelChannel.defaultModel) ? modelChannel.defaultModel : models[0]) || "";
    const normalizedDefaultVideoModel = normalizeVisibleRemoteVideoModel(modelChannel.defaultVideoModel);
    const defaultVideoModel = normalizedDefaultVideoModel && models.includes(normalizedDefaultVideoModel) ? normalizedDefaultVideoModel : "";
    const imageDefault = modelChannel.defaultImageModel && models.includes(modelChannel.defaultImageModel) ? modelChannel.defaultImageModel : "";
    const textDefault = modelChannel.defaultTextModel && models.includes(modelChannel.defaultTextModel) ? modelChannel.defaultTextModel : "";
    const modelTextEndpoints = normalizeModelTextEndpoints(modelChannel.modelTextEndpoints || [], models);
    const videoCandidates = uniqueModels([defaultVideoModel, ...classifiedModels.videoModels]).filter(Boolean);
    const videoModel = videoCandidates[0] || "";
    const videoProtocol = inferRemoteVideoProtocol(videoModel, config.videoProtocol, modelChannel.modelProtocols || []);
    return {
        ...config,
        channelMode,
        videoProtocol,
        models,
        imageModels: classifiedModels.imageModels,
        videoModels: classifiedModels.videoModels,
        textModels: classifiedModels.textModels,
        modelTextEndpoints,
        model: models.includes(config.model) ? config.model : fallbackModel,
        imageModel: imageDefault || fallbackModel,
        videoModel,
        seedanceModel: videoProtocol === "volcengine-ark" ? videoModel : config.seedanceModel,
        textModel: textDefault || fallbackModel,
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
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/settings") });
                } catch (error) {
                    if (process.env.NODE_ENV === "development") {
                        console.warn("公共设置加载失败，已使用本地默认配置继续运行。", error);
                    }
                    set({ publicSettings: null });
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

export function classifyAiModels(models: string[]) {
    const imageModels: string[] = [];
    const videoModels: string[] = [];
    const textModels: string[] = [];
    uniqueModels(models).forEach((model) => {
        const name = model.toLowerCase();
        if (["seedance", "video", "veo", "sora", "kling", "hailuo", "runway", "wan"].some((keyword) => name.includes(keyword))) {
            videoModels.push(model);
            return;
        }
        if (["gpt-image", "image", "imagen", "seedream", "banana", "dall-e", "dalle", "flux", "sdxl", "stable-diffusion", "midjourney"].some((keyword) => name.includes(keyword))) {
            imageModels.push(model);
            return;
        }
        if (!["embedding", "moderation", "whisper", "tts", "audio", "rerank"].some((keyword) => name.includes(keyword))) {
            textModels.push(model);
        }
    });
    return { imageModels, videoModels, textModels };
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
