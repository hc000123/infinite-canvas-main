import axios from "axios";

import { type AiConfig } from "@/stores/use-config-store";
import { AI_REQUEST_TIMEOUT_MS, aiApiUrl, aiHeaders, normalizeAiError, refreshRemoteUser } from "@/services/api/ai-provider";
import { aiTaskTraceHeaders, readAiTaskLedgerFromHeaders, type AiTaskLedger, type AiTaskTrace } from "@/services/api/ai-task-trace";
import { nanoid } from "nanoid";
import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    choices?: Array<Record<string, unknown>>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};

export type GeneratedImageResult = {
    id: string;
    dataUrl: string;
    aiTask?: AiTaskLedger;
};

const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : undefined;
}

/** Map "quality + ratio" to an explicit pixel dimension like "3840x2160". Returns undefined when quality is auto. */
function resolveSize(quality: string, ratio: string): string | undefined {
    const basePixels = QUALITY_BASE[quality];
    if (!basePixels || ratio === "auto" || !ratio) return undefined;

    const parts = ratio.split(":");
    if (parts.length !== 2) return undefined;
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!w || !h) return undefined;

    const targetPixels = basePixels * basePixels;
    const isLandscape = w >= h;
    const longRatio = isLandscape ? w / h : h / w;

    const longSideRaw = Math.sqrt(targetPixels * longRatio);
    const longSide = Math.floor(longSideRaw / 16) * 16;
    const shortSide = Math.round(longSide / longRatio / 16) * 16;

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;

    return `${width}x${height}`;
}

function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value === "auto") return undefined;
    if (/^\d+x\d+$/.test(value)) return value;
    return (quality && resolveSize(quality, value)) || value;
}

function resolveImageDataUrl(item: Record<string, unknown>) {
    if (typeof item.b64_json === "string" && item.b64_json) {
        return normalizeImageDataUrl(item.b64_json);
    }
    if (typeof item.url === "string" && item.url) {
        return item.url;
    }
    return null;
}

function normalizeImageDataUrl(value: string) {
    return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
}

export function parseImagePayload(payload: ImageApiResponse) {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.msg || "请求失败");
    }
    const imageUrls = uniqueImageUrls([...(payload.data?.map(resolveImageDataUrl).filter((value): value is string => Boolean(value)) || []), ...collectChatImageUrls(payload.choices)]);
    const images = imageUrls.map((dataUrl) => ({ id: nanoid(), dataUrl }));

    if (images.length === 0) {
        throw new Error("接口没有返回图片");
    }

    return images;
}

function collectChatImageUrls(value: unknown) {
    const output: string[] = [];
    collectImageUrls(value, output);
    return output;
}

function collectImageUrls(value: unknown, output: string[]) {
    if (!value) return;
    if (typeof value === "string") {
        extractImageUrlsFromText(value).forEach((url) => output.push(url));
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => collectImageUrls(item, output));
        return;
    }
    if (typeof value !== "object") return;
    const payload = value as Record<string, unknown>;
    const directUrl = resolveImageDataUrl(payload);
    if (directUrl) output.push(directUrl);
    for (const key of ["message", "content", "images", "image", "image_url", "output", "result"]) {
        collectImageUrls(payload[key], output);
    }
}

function extractImageUrlsFromText(value: string) {
    const text = value.trim();
    if (!text) return [];
    try {
        if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
            return collectChatImageUrls(JSON.parse(text));
        }
    } catch {
        // plain text content
    }
    const urls: string[] = [];
    if (text.startsWith("data:image/") || /^https?:\/\//i.test(text)) urls.push(text);
    for (const match of text.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) {
        const url = match[1]?.trim();
        if (url) urls.push(url);
    }
    for (const match of text.matchAll(/https?:\/\/[^\s"'`)]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'`)]+)?/gi)) {
        urls.push(match[0]);
    }
    for (const match of text.matchAll(/data:image\/[^;\s]+;base64,[^\s"'`)]+/g)) {
        urls.push(match[0]);
    }
    return urls;
}

function uniqueImageUrls(urls: string[]) {
    const seen = new Set<string>();
    return urls.filter((url) => {
        if (seen.has(url)) return false;
        seen.add(url);
        return true;
    });
}

function parseStreamChunk(chunk: string, onDelta: (value: string) => void) {
    let deltaText = "";
    for (const eventBlock of chunk.split("\n\n")) {
        const data = eventBlock
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6);
        if (!data || data === "[DONE]") continue;
        const delta = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content || "";
        deltaText += delta;
    }
    if (deltaText) onDelta(deltaText);
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function withSystemMessage(config: AiConfig, messages: ChatCompletionMessage[]) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

export async function requestGeneration(config: AiConfig, prompt: string, trace?: AiTaskTrace) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    try {
        const response = await postImageGeneration(
            config,
            {
                model: config.model,
                prompt: withSystemPrompt(config, prompt),
                n,
                ...(quality ? { quality } : {}),
                ...(requestSize ? { size: requestSize } : {}),
                response_format: "b64_json",
            },
            trace,
        );
        const images = withAiTaskLedger(parseImagePayload(response.data), readAiTaskLedgerFromHeaders(response.headers));
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(normalizeAiError(error, "请求失败"));
    }
}

function postImageGeneration(config: AiConfig, payload: Record<string, unknown>, trace?: AiTaskTrace) {
    return axios.post<ImageApiResponse>(aiApiUrl(config, "/images/generations"), payload, {
        headers: { ...aiHeaders(config, "application/json"), ...aiTaskTraceHeaders(config, trace) },
        timeout: AI_REQUEST_TIMEOUT_MS,
    });
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], trace?: AiTaskTrace) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    if (shouldUseGeminiImageChatAdapter(config.model)) {
        try {
            const response = await postGeminiImageEdit(config, prompt, references, { n, quality, size: requestSize }, trace);
            const images = withAiTaskLedger(parseImagePayload(response.data), readAiTaskLedgerFromHeaders(response.headers));
            refreshRemoteUser(config);
            return images;
        } catch (error) {
            throw new Error(normalizeAiError(error, "请求失败"));
        }
    }
    const formData = new FormData();
    formData.set("model", config.model);
    formData.set("prompt", withSystemPrompt(config, prompt));
    formData.set("n", String(n));
    formData.set("response_format", "b64_json");
    if (quality) {
        formData.set("quality", quality);
    }
    if (requestSize) {
        formData.set("size", requestSize);
    }
    const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => formData.append("image", file));

    try {
        const response = await postImageEdit(config, formData, trace);
        const images = withAiTaskLedger(parseImagePayload(response.data), readAiTaskLedgerFromHeaders(response.headers));
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(normalizeAiError(error, "请求失败"));
    }
}

export function shouldUseGeminiImageChatAdapter(model: string) {
    return model.toLowerCase().includes("gemini");
}

async function postGeminiImageEdit(config: AiConfig, prompt: string, references: ReferenceImage[], options: { n: number; quality?: string; size?: string }, trace?: AiTaskTrace) {
    return axios.post<ImageApiResponse>(aiApiUrl(config, "/chat/completions"), await buildGeminiImageEditPayload(config, prompt, references, options), {
        headers: { ...aiHeaders(config, "application/json"), ...aiTaskTraceHeaders(config, trace) },
        timeout: AI_REQUEST_TIMEOUT_MS,
    });
}

async function buildGeminiImageEditPayload(config: AiConfig, prompt: string, references: ReferenceImage[], options: { n: number; quality?: string; size?: string }) {
    const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [{ type: "text", text: prompt }];
    const images = await Promise.all(references.map((image) => imageToDataUrl(image)));
    images.filter((url): url is string => Boolean(url)).forEach((url) => content.push({ type: "image_url", image_url: { url } }));
    return {
        model: config.model,
        messages: withSystemMessage(config, [{ role: "user" as const, content }]),
        stream: false,
        n: options.n,
        ...(options.quality ? { quality: options.quality } : {}),
        ...(options.size ? { size: options.size } : {}),
    };
}

function postImageEdit(config: AiConfig, body: FormData, trace?: AiTaskTrace) {
    return axios.post<ImageApiResponse>(aiApiUrl(config, "/images/edits"), body, {
        headers: { ...aiHeaders(config), ...aiTaskTraceHeaders(config, trace) },
        timeout: AI_REQUEST_TIMEOUT_MS,
    });
}

function withAiTaskLedger(images: GeneratedImageResult[], aiTask: AiTaskLedger): GeneratedImageResult[] {
    if (!aiTask.aiTaskId) return images;
    return images.map((image) => ({ ...image, aiTask }));
}

export async function requestImageQuestion(config: AiConfig, messages: ChatCompletionMessage[], onDelta: (text: string) => void) {
    let buffer = "";
    let answer = "";
    let processedLength = 0;

    try {
        const response = await axios.post(
            aiApiUrl(config, "/chat/completions"),
            {
                model: config.model,
                messages: withSystemMessage(config, messages),
                stream: true,
            },
            {
                headers: {
                    ...aiHeaders(config, "application/json"),
                } as Record<string, string>,
                responseType: "text",
                onDownloadProgress: (event) => {
                    const responseText = String(event.event?.target?.responseText || "");
                    const nextText = responseText.slice(processedLength);
                    processedLength = responseText.length;
                    buffer += nextText;
                    const chunks = buffer.split("\n\n");
                    buffer = chunks.pop() || "";
                    for (const chunk of chunks) {
                        parseStreamChunk(chunk, (delta) => {
                            answer += delta;
                            onDelta(answer);
                        });
                    }
                },
            },
        );
        if (typeof response.data === "object" && response.data && "code" in response.data && (response.data as { code?: number; msg?: string }).code !== 0) {
            throw new Error((response.data as { msg?: string }).msg || "请求失败");
        }
        if (typeof response.data === "string") {
            let apiError = "";
            try {
                const payload = JSON.parse(response.data) as { code?: number; msg?: string };
                if (typeof payload.code === "number" && payload.code !== 0) {
                    apiError = payload.msg || "请求失败";
                }
            } catch {
                // ignore plain text stream content
            }
            if (apiError) throw new Error(apiError);
        }
        if (buffer) {
            parseStreamChunk(buffer, (delta) => {
                answer += delta;
                onDelta(answer);
            });
        }
    } catch (error) {
        throw new Error(normalizeAiError(error, "请求失败"));
    }
    refreshRemoteUser(config);
    return answer || "没有返回内容";
}

export async function fetchImageModels(config: AiConfig) {
    if (config.channelMode === "remote") return config.models;
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(aiApiUrl(config, "/models", "openai"), {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
            },
            timeout: AI_REQUEST_TIMEOUT_MS,
        });
        return (response.data.data || [])
            .map((model) => model.id)
            .filter((id): id is string => Boolean(id))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(normalizeAiError(error, "读取模型失败"));
    }
}
