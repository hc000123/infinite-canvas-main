import axios from "axios";

import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export const AI_REQUEST_TIMEOUT_MS = 120_000;
export const AI_VIDEO_CONTENT_TIMEOUT_MS = 300_000;
export const AI_VIDEO_POLL_INTERVAL_MS = 2500;
export const AI_VIDEO_MAX_POLL_ATTEMPTS = 240;

export type AiProviderProtocol = AiConfig["videoProtocol"];
const reasoningEfforts = new Set<AiConfig["reasoningEffort"]>(["minimal", "low", "medium", "high"]);

export function aiApiUrl(_config: AiConfig, path: string, _protocol: AiProviderProtocol = "openai") {
    return `/api/v1${path}`;
}

export function aiHeaders(_config: AiConfig, contentType?: string, _protocol: AiProviderProtocol = "openai") {
    const token = useUserStore.getState().token;
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export function refreshRemoteUser(_config: AiConfig) {
    void useUserStore.getState().hydrateUser();
}

export function aiReasoningPayload(config: AiConfig) {
    if (config.thinkingMode !== "true") return {};
    const effort = reasoningEfforts.has(config.reasoningEffort) ? config.reasoningEffort : "medium";
    return { reasoning_effort: effort };
}

export function normalizeAiError(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") return `${fallback}：请求超时`;
        if (!error.response) return `${fallback}：网络连接失败`;
        const responseData = error.response?.data;
        const message = readErrorMessage(responseData);
        if (message) return error.response.status ? `${fallback}：HTTP ${error.response.status}：${message}` : `${fallback}：${message}`;
        return error.response?.status ? `${fallback}：HTTP ${error.response.status}` : fallback;
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
    const payload = value as { msg?: unknown; message?: unknown; detail?: unknown; error?: { code?: unknown; message?: unknown; type?: unknown }; errors?: unknown };
    if (typeof payload.msg === "string") return payload.msg;
    const errorMessage = [payload.error?.code, payload.error?.message || payload.error?.type].filter((item): item is string => typeof item === "string" && item.trim().length > 0).join("：");
    if (errorMessage) return errorMessage;
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.errors)) return payload.errors.map(readErrorMessage).filter(Boolean).join("；") || undefined;
    return undefined;
}

export function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
