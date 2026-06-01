"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { apiGet } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";

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
    textModel: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoSeed: string;
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

export const defaultConfig: AiConfig = {
    channelMode: "local",
    videoProtocol: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    volcengineBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    volcengineApiKey: "",
    model: "gpt-image-2",
    imageModel: "gpt-image-2",
    videoModel: "grok-imagine-video",
    seedanceModel: "doubao-seedance-2-0-260128",
    textModel: "gpt-5.5",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "false",
    videoWatermark: "false",
    videoSeed: "",
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

function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null) {
    const channelMode = modelChannel?.allowCustomChannel ? config.channelMode : "remote";
    if (channelMode === "local" || !modelChannel) {
        return { ...config, channelMode, videoModel: config.videoProtocol === "volcengine-ark" ? config.seedanceModel : config.videoModel };
    }
    const models = modelChannel.availableModels;
    const classifiedModels = classifyAiModels(models);
    const fallbackModel = modelChannel.defaultModel || models[0] || "";
    return {
        ...config,
        channelMode,
        models,
        imageModels: classifiedModels.imageModels,
        videoModels: classifiedModels.videoModels,
        textModels: classifiedModels.textModels,
        model: models.includes(config.model) ? config.model : fallbackModel,
        imageModel: models.includes(config.imageModel) ? config.imageModel : modelChannel.defaultImageModel || fallbackModel,
        videoModel: models.includes(config.videoModel) ? config.videoModel : modelChannel.defaultVideoModel || fallbackModel,
        textModel: models.includes(config.textModel) ? config.textModel : modelChannel.defaultTextModel || fallbackModel,
        systemPrompt: modelChannel.systemPrompt,
    };
}

function isAiConfigReady(config: AiConfig, model: string) {
    const modelName = model.trim();
    if (!modelName) return false;
    if (config.channelMode === "remote") return true;
    const seedanceModel = (config.seedanceModel || config.videoModel).trim();
    const isSeedanceModel = config.videoProtocol === "volcengine-ark" && (modelName === seedanceModel || modelName.toLowerCase().includes("seedance"));
    return isSeedanceModel ? Boolean(config.volcengineApiKey.trim() && seedanceModel) : Boolean(config.baseUrl.trim() && config.apiKey.trim());
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
                        channelMode: config.channelMode || "remote",
                        videoProtocol: config.videoProtocol || "openai",
                        volcengineBaseUrl: config.volcengineBaseUrl || defaultConfig.volcengineBaseUrl,
                        volcengineApiKey: config.volcengineApiKey || "",
                        imageModel: config.imageModel || config.model,
                        videoModel: config.videoModel || "grok-imagine-video",
                        seedanceModel: config.seedanceModel || defaultConfig.seedanceModel,
                        textModel: config.textModel || config.model,
                        imageModels: Array.isArray(config.imageModels) && config.imageModels.length ? config.imageModels : classifiedModels.imageModels,
                        videoModels: Array.isArray(config.videoModels) && config.videoModels.length ? config.videoModels : classifiedModels.videoModels,
                        textModels: Array.isArray(config.textModels) && config.textModels.length ? config.textModels : classifiedModels.textModels,
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "false",
                        videoWatermark: config.videoWatermark || "false",
                        videoSeed: config.videoSeed || "",
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

export function buildApiUrl(baseUrl: string, path: string, protocol: AiConfig["videoProtocol"] = "openai") {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const apiBaseUrl = protocol === "openai" && !normalizedBaseUrl.endsWith("/v1") ? `${normalizedBaseUrl}/v1` : normalizedBaseUrl;
    return `${apiBaseUrl}${path}`;
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
