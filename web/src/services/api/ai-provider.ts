import axios from "axios";

import { shouldUseBrowserAIKey } from "@/services/api/ai-channel-boundary";
import { buildApiUrl, defaultConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export const AI_REQUEST_TIMEOUT_MS = 120_000;
export const AI_VIDEO_CONTENT_TIMEOUT_MS = 300_000;
export const AI_VIDEO_POLL_INTERVAL_MS = 2500;
export const AI_VIDEO_MAX_POLL_ATTEMPTS = 240;

export type AiProviderProtocol = AiConfig["videoProtocol"];

export function aiApiUrl(config: AiConfig, path: string, protocol: AiProviderProtocol = "openai") {
    const baseUrl = protocol === "volcengine-ark" ? config.volcengineBaseUrl || defaultConfig.volcengineBaseUrl : config.baseUrl;
    return config.channelMode === "remote" ? `/api/v1${path}` : buildApiUrl(baseUrl, path, protocol);
}

export function aiHeaders(config: AiConfig, contentType?: string, protocol: AiProviderProtocol = "openai") {
    const token = useUserStore.getState().token;
    const apiKey = protocol === "volcengine-ark" ? config.volcengineApiKey : config.apiKey;
    return shouldUseBrowserAIKey(config.channelMode)
        ? {
              Authorization: `Bearer ${apiKey}`,
              ...(contentType ? { "Content-Type": contentType } : {}),
          }
        : {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(contentType ? { "Content-Type": contentType } : {}),
          };
}

export function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

export function normalizeAiError(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") return `${fallback}：请求超时`;
        const responseData = error.response?.data;
        const message = readErrorMessage(responseData);
        return message || (error.response?.status ? `${fallback}：${error.response.status}` : fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function readErrorMessage(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === "string") {
        try {
            return readErrorMessage(JSON.parse(value));
        } catch {
            return value;
        }
    }
    if (typeof value !== "object") return undefined;
    const payload = value as { msg?: unknown; message?: unknown; error?: { message?: unknown } };
    if (typeof payload.msg === "string") return payload.msg;
    if (typeof payload.error?.message === "string") return payload.error.message;
    if (typeof payload.message === "string") return payload.message;
    return undefined;
}

export function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
