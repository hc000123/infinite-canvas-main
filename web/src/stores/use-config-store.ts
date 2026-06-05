"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { normalizeSeedanceImageRoleMode, type SeedanceImageRoleMode } from "@/services/api/video-reference";
import { apiGet } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";
import { inferRemoteVideoProtocol, resolveAllowedVideoProtocol, resolveEffectiveChannelMode } from "@/services/api/ai-channel-boundary";

export type AiModelKind = "image" | "video" | "text";

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
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    quality: string;
    size: string;
    count: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";

const useDevDefaults = process.env.NODE_ENV === "development";
const devChannelMode: AiConfig["channelMode"] | "" = useDevDefaults && process.env.NEXT_PUBLIC_DEV_AI_CHANNEL_MODE === "remote" ? "remote" : useDevDefaults && process.env.NEXT_PUBLIC_DEV_AI_CHANNEL_MODE === "local" ? "local" : "";
const devVideoProtocol: AiConfig["videoProtocol"] | "" = useDevDefaults && process.env.NEXT_PUBLIC_DEV_AI_VIDEO_PROTOCOL === "volcengine-ark" ? "volcengine-ark" : "";

export const defaultConfig: AiConfig = {
    channelMode: devChannelMode || "local",
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
    videoGenerateAudio: "false",
    videoWatermark: "false",
    videoSeed: "",
    videoPromptReviewEnabled: "true",
    returnLastFrame: "true",
    videoTaskMode: "generate",
    videoEditType: "replace",
    videoExtendDirection: "forward",
    videoReferenceImageMode: "reference",
    systemPrompt: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
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
    loadPublicSettings: () => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

export function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null) {
    const channelMode = modelChannel ? resolveEffectiveChannelMode(config.channelMode, modelChannel.allowCustomChannel) : "remote";
    const localVideoProtocol = resolveAllowedVideoProtocol("local", config.videoProtocol);
    if (channelMode === "local" || !modelChannel) {
        return { ...config, channelMode, videoProtocol: localVideoProtocol, videoModel: config.videoModel };
    }
    const models = modelChannel.availableModels;
    const classifiedModels = classifyAiModels(models);
    const fallbackModel = modelChannel.defaultModel || models[0] || "";
    const videoModel = models.includes(config.videoModel) ? config.videoModel : modelChannel.defaultVideoModel || fallbackModel;
    return {
        ...config,
        channelMode,
        videoProtocol: inferRemoteVideoProtocol(videoModel, config.videoProtocol),
        models,
        imageModels: classifiedModels.imageModels,
        videoModels: classifiedModels.videoModels,
        textModels: classifiedModels.textModels,
        model: models.includes(config.model) ? config.model : fallbackModel,
        imageModel: models.includes(config.imageModel) ? config.imageModel : modelChannel.defaultImageModel || fallbackModel,
        videoModel,
        textModel: models.includes(config.textModel) ? config.textModel : modelChannel.defaultTextModel || fallbackModel,
        systemPrompt: modelChannel.systemPrompt,
    };
}

function isAiConfigReady(config: AiConfig, model: string) {
    const modelName = model.trim();
    if (!modelName) return false;
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_SKIP_AI_CONFIG !== "false") return true;
    if (config.channelMode === "remote") return true;
    return Boolean(config.baseUrl.trim() && config.apiKey.trim());
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
            loadPublicSettings: async () => {
                if (get().isPublicSettingsLoading) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/settings") });
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
            partialize: (state) => ({ config: state.config }),
            merge: (persisted, current) => {
                const config = { ...defaultConfig, ...((persisted as Partial<ConfigStore>).config || {}) };
                const classifiedModels = classifyAiModels(config.models);
                return {
                    ...current,
                    config: {
                        ...config,
                        channelMode: config.channelMode || defaultConfig.channelMode,
                        videoProtocol: config.channelMode === "local" ? "openai" : config.videoProtocol || defaultConfig.videoProtocol,
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
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "false",
                        videoWatermark: config.videoWatermark || "false",
                        videoSeed: config.videoSeed || "",
                        videoPromptReviewEnabled: config.videoPromptReviewEnabled === "false" ? "false" : "true",
                        returnLastFrame: config.returnLastFrame || defaultConfig.returnLastFrame,
                        videoTaskMode: normalizeVideoTaskMode(config.videoTaskMode),
                        videoEditType: normalizeVideoEditType(config.videoEditType),
                        videoExtendDirection: normalizeVideoExtendDirection(config.videoExtendDirection),
                        videoReferenceImageMode: normalizeSeedanceImageRoleMode(config.videoReferenceImageMode),
                    },
                };
            },
        },
    ),
);

export function useEffectiveConfig() {
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
        if (["gpt-image", "image", "imagen", "seedream", "dall-e", "dalle", "flux", "sdxl", "stable-diffusion", "midjourney"].some((keyword) => name.includes(keyword))) {
            imageModels.push(model);
            return;
        }
        if (!["embedding", "moderation", "whisper", "tts", "audio", "rerank"].some((keyword) => name.includes(keyword))) {
            textModels.push(model);
        }
    });
    return { imageModels, videoModels, textModels };
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
