import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { AI_REQUEST_TIMEOUT_MS, AI_VIDEO_CONTENT_TIMEOUT_MS, AI_VIDEO_MAX_POLL_ATTEMPTS, AI_VIDEO_POLL_INTERVAL_MS, aiApiUrl, aiHeaders, delay, normalizeAiError, refreshRemoteUser } from "@/services/api/ai-provider";
import { buildSeedanceVideoTaskPayload } from "@/services/api/video-reference";
import { type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/video";

export type NormalizedVideoTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type NormalizedVideoTask = {
    id: string;
    status: NormalizedVideoTaskStatus;
    rawStatus?: string;
    videoUrl?: string;
    errorMessage?: string;
    createdAt?: number;
    updatedAt?: number;
    executionExpiresAfter?: number;
    videoUrlExpiresAt?: number;
    seed?: number;
    resolution?: string;
    ratio?: string;
    duration?: number;
    generateAudio?: boolean;
    watermark?: boolean;
};

type VideoGenerationOptions = {
    onStatus?: (task: NormalizedVideoTask) => void;
};

export type VideoGenerationReferences = ReferenceImage[] | { images?: ReferenceImage[]; videos?: ReferenceVideo[] };

type VideoResponse = {
    id: string;
    status?: string;
    raw_status?: string;
    video_url?: string;
    content?: { video_url?: string };
    error?: { code?: string; message?: string };
    created_at?: number;
    updated_at?: number;
    execution_expires_after?: number;
    video_url_expires_at?: number;
    seed?: number;
    resolution?: string;
    ratio?: string;
    duration?: number;
    generate_audio?: boolean;
    watermark?: boolean;
};
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string };

type ArkVideoResponse = {
    id?: string;
    task_id?: string;
    status?: string;
    video_url?: string;
    url?: string;
    content?: { video_url?: string; url?: string } | Array<{ video_url?: string; url?: string }>;
    output?: { video_url?: string; url?: string } | Array<{ video_url?: string; url?: string }>;
    result?: { video_url?: string; url?: string } | Array<{ video_url?: string; url?: string }>;
    error?: { code?: string; message?: string };
    message?: string;
    msg?: string;
    fail_reason?: string;
    error_code?: string;
    created_at?: number;
    updated_at?: number;
    execution_expires_after?: number;
    video_url_expires_at?: number;
    seed?: number;
    resolution?: string;
    ratio?: string;
    duration?: number;
    generate_audio?: boolean;
    watermark?: boolean;
    data?: ArkVideoResponse;
    task?: ArkVideoResponse;
};

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: VideoGenerationReferences = [], options: VideoGenerationOptions = {}) {
    if (config.channelMode === "local" && config.videoProtocol === "volcengine-ark") {
        return requestSeedanceVideoGeneration(config, prompt, references, options);
    }
    return requestOpenAICompatibleVideoGeneration(config, prompt, references, options);
}

export async function createSeedanceVideoTask(config: AiConfig, prompt: string, references: VideoGenerationReferences = []) {
    try {
        const response = await axios.post<ArkVideoResponse>(aiApiUrl(config, "/contents/generations/tasks", "volcengine-ark"), await buildSeedanceVideoPayload(config, prompt, references), {
            headers: aiHeaders(config, "application/json", "volcengine-ark"),
            timeout: AI_REQUEST_TIMEOUT_MS,
        });
        return normalizeSeedanceVideoTask(response.data);
    } catch (error) {
        throw new Error(normalizeAiError(error, "视频任务创建失败"));
    }
}

export async function querySeedanceVideoTask(config: AiConfig, taskId: string) {
    try {
        const response = await axios.get<ArkVideoResponse>(aiApiUrl(config, `/contents/generations/tasks/${encodeURIComponent(taskId)}`, "volcengine-ark"), {
            headers: aiHeaders(config, undefined, "volcengine-ark"),
            timeout: AI_REQUEST_TIMEOUT_MS,
        });
        return normalizeSeedanceVideoTask(response.data);
    } catch (error) {
        throw new Error(normalizeAiError(error, "视频任务查询失败"));
    }
}

export function normalizeSeedanceVideoTask(payload: ArkVideoResponse): NormalizedVideoTask {
    const task = payload.data || payload.task || payload;
    const id = task.id || task.task_id || "";
    if (!id) throw new Error("视频接口没有返回任务 ID");
    return {
        id,
        status: normalizeVideoTaskStatus(task.status),
        rawStatus: task.status,
        videoUrl: readTaskVideoUrl(task),
        errorMessage: formatTaskError(task.error?.message || task.message || task.msg || task.fail_reason, task.error?.code || task.error_code),
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        executionExpiresAfter: task.execution_expires_after,
        videoUrlExpiresAt: task.video_url_expires_at || calculateVideoUrlExpiresAt(task.updated_at || task.created_at, task.execution_expires_after),
        seed: task.seed,
        resolution: task.resolution,
        ratio: task.ratio,
        duration: task.duration,
        generateAudio: task.generate_audio,
        watermark: task.watermark,
    };
}

function normalizeOpenAICompatibleVideoTask(payload: VideoResponse): NormalizedVideoTask {
    return {
        id: payload.id,
        status: normalizeVideoTaskStatus(payload.status),
        rawStatus: payload.raw_status || payload.status,
        videoUrl: payload.video_url || payload.content?.video_url,
        errorMessage: formatTaskError(payload.error?.message, payload.error?.code),
        createdAt: payload.created_at,
        updatedAt: payload.updated_at,
        executionExpiresAfter: payload.execution_expires_after,
        videoUrlExpiresAt: payload.video_url_expires_at || calculateVideoUrlExpiresAt(payload.updated_at || payload.created_at, payload.execution_expires_after),
        seed: payload.seed,
        resolution: payload.resolution,
        ratio: payload.ratio,
        duration: payload.duration,
        generateAudio: payload.generate_audio,
        watermark: payload.watermark,
    };
}

function normalizeVideoTaskStatus(status = ""): NormalizedVideoTaskStatus {
    switch (status.trim().toLowerCase()) {
        case "succeeded":
        case "success":
        case "completed":
            return "succeeded";
        case "running":
        case "processing":
        case "in_progress":
            return "running";
        case "failed":
        case "error":
        case "expired":
            return "failed";
        case "cancelled":
        case "canceled":
            return "cancelled";
        case "queued":
        case "pending":
        case "created":
        default:
            return "queued";
    }
}

function formatTaskError(message?: string, code?: string) {
    if (!message) return code;
    return code ? `${code}: ${message}` : message;
}

function calculateVideoUrlExpiresAt(base?: number, expiresAfter?: number) {
    return base && expiresAfter ? base + expiresAfter : undefined;
}

function isSeedanceProtocol(config: AiConfig) {
    return config.videoProtocol === "volcengine-ark";
}

async function requestOpenAICompatibleVideoGeneration(config: AiConfig, prompt: string, references: VideoGenerationReferences, options: VideoGenerationOptions) {
    const model = config.model || config.videoModel;
    const { images } = normalizeVideoGenerationReferences(references);
    try {
        const task = await pollVideoTask(await createOpenAICompatibleVideoTask(config, prompt, images, model), (taskId) => queryOpenAICompatibleVideoTask(config, taskId, model), options);
        const blob = await fetchOpenAICompatibleVideoContent(config, model, task);
        await assertVideoBlob(blob);
        refreshRemoteUser(config);
        return blob;
    } catch (error) {
        throw new Error(normalizeAiError(error, "视频生成失败"));
    }
}

async function requestSeedanceVideoGeneration(config: AiConfig, prompt: string, references: VideoGenerationReferences, options: VideoGenerationOptions) {
    try {
        const task = await pollVideoTask(await createSeedanceVideoTask(config, prompt, references), (taskId) => querySeedanceVideoTask(config, taskId), options);
        const blob = await fetchSeedanceVideoContent(task);
        await assertVideoBlob(blob);
        return blob;
    } catch (error) {
        throw new Error(normalizeAiError(error, "视频生成失败"));
    }
}

async function createOpenAICompatibleVideoTask(config: AiConfig, prompt: string, references: ReferenceImage[], model: string) {
    const body = await buildOpenAICompatibleVideoPayload(config, prompt, references, model);
    const response = await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, {
        headers: aiHeaders(config),
        timeout: AI_REQUEST_TIMEOUT_MS,
    });
    const task = normalizeOpenAICompatibleVideoTask(unwrapVideoResponse(response.data));
    if (!task.id) throw new Error("视频接口没有返回任务 ID");
    return task;
}

async function queryOpenAICompatibleVideoTask(config: AiConfig, taskId: string, model: string) {
    const response = await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${taskId}`), {
        headers: aiHeaders(config),
        params: config.channelMode === "remote" ? { model } : undefined,
        timeout: AI_REQUEST_TIMEOUT_MS,
    });
    return normalizeOpenAICompatibleVideoTask(unwrapVideoResponse(response.data));
}

async function pollVideoTask(initialTask: NormalizedVideoTask, queryTask: (taskId: string) => Promise<NormalizedVideoTask>, options: VideoGenerationOptions) {
    let task = initialTask;
    options.onStatus?.(task);
    for (let attempts = 0; task.status !== "succeeded"; attempts += 1) {
        if (task.status === "failed" || task.status === "cancelled") throw new Error(task.errorMessage || "视频生成失败");
        if (attempts >= AI_VIDEO_MAX_POLL_ATTEMPTS) throw new Error("视频生成超时，请稍后重试");
        await delay(AI_VIDEO_POLL_INTERVAL_MS);
        task = await queryTask(task.id);
        options.onStatus?.(task);
    }
    return task;
}

async function buildOpenAICompatibleVideoPayload(config: AiConfig, prompt: string, references: ReferenceImage[], model: string) {
    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    if (isSeedanceProtocol(config)) {
        body.append("duration", String(normalizeSeedanceDuration(config.videoSeconds)));
        body.append("ratio", normalizeSeedanceRatio(config.size));
        body.append("resolution", normalizeSeedanceResolution(config.vquality));
        appendSeedanceControls(body, config);
    }
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    return body;
}

async function buildSeedanceVideoPayload(config: AiConfig, prompt: string, references: VideoGenerationReferences) {
    const { images, videos } = normalizeVideoGenerationReferences(references);
    const imageUrls = (await Promise.all(images.slice(0, 9).map((image) => imageToDataUrl(image)))).filter((url): url is string => Boolean(url));
    const videoUrls = (await Promise.all(videos.slice(0, 3).map((video) => videoToDataUrl(video)))).filter((url): url is string => Boolean(url));
    return buildSeedanceVideoTaskPayload(config, prompt, imageUrls, videoUrls);
}

function normalizeVideoGenerationReferences(references: VideoGenerationReferences) {
    return Array.isArray(references) ? { images: references, videos: [] } : { images: references.images || [], videos: references.videos || [] };
}

async function videoToDataUrl(video: ReferenceVideo) {
    const url = video.url || (await resolveMediaUrl(video.storageKey, ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取视频失败"));
        reader.readAsDataURL(blob);
    });
}

function readTaskVideoUrl(task: ArkVideoResponse): string | undefined {
    if (task.video_url || task.url) return task.video_url || task.url;
    for (const value of [task.content, task.output, task.result]) {
        if (!value) continue;
        if (Array.isArray(value)) {
            const item = value.find((entry) => entry.video_url || entry.url);
            if (item) return item.video_url || item.url;
        } else if (value.video_url || value.url) {
            return value.video_url || value.url;
        }
    }
    return undefined;
}

function appendSeedanceControls(body: FormData, config: AiConfig) {
    body.append("generate_audio", String(config.videoGenerateAudio === "true"));
    body.append("watermark", String(config.videoWatermark === "true"));
    const seed = normalizeSeedanceSeed(config.videoSeed);
    if (seed !== undefined) body.append("seed", String(seed));
}

async function fetchOpenAICompatibleVideoContent(config: AiConfig, model: string, task: NormalizedVideoTask) {
    return config.channelMode === "local" && task.videoUrl ? fetchVideoBlob(task.videoUrl) : fetchVideoContent(config, model, task.id);
}

async function fetchSeedanceVideoContent(task: NormalizedVideoTask) {
    if (!task.videoUrl) throw new Error("视频任务没有返回可下载地址");
    return fetchVideoBlob(task.videoUrl);
}

async function fetchVideoContent(config: AiConfig, model: string, taskId: string) {
    const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${taskId}/content`), {
        headers: aiHeaders(config),
        params: config.channelMode === "remote" ? { model } : undefined,
        responseType: "blob",
        timeout: AI_VIDEO_CONTENT_TIMEOUT_MS,
    });
    return content.data;
}

async function fetchVideoBlob(url: string) {
    const content = await axios.get<Blob>(url, { responseType: "blob", timeout: AI_VIDEO_CONTENT_TIMEOUT_MS });
    return content.data;
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function normalizeSeedanceDuration(value: string) {
    const seconds = Math.floor(Number(value) || 5);
    if (seconds <= 5) return 5;
    if (seconds <= 10) return 10;
    return 15;
}

function normalizeSeedanceRatio(value: string) {
    if (value === "auto" || value === "adaptive") return "adaptive";
    if (["16:9", "9:16", "1:1", "4:3", "3:4"].includes(value)) return value;
    const size = normalizeVideoSize(value);
    if (!size) return "16:9";
    if (["16:9", "9:16", "1:1", "4:3", "3:4"].includes(size)) return size;
    if (size === "1024x1024") return "1:1";
    if (size === "720x1280" || size === "1024x1792") return "9:16";
    if (size === "1280x720" || size === "1792x1024") return "16:9";
    return size.includes("x") && Number(size.split("x")[0]) < Number(size.split("x")[1]) ? "9:16" : "16:9";
}

function normalizeSeedanceResolution(value: string) {
    const resolution = Number(normalizeVideoResolution(value).replace(/p$/i, "")) || 720;
    return resolution >= 1080 ? "1080p" : "720p";
}

function normalizeSeedanceSeed(value: string) {
    const seed = Math.floor(Number(value));
    return Number.isFinite(seed) && value.trim() ? seed : undefined;
}

function unwrapVideoResponse(payload: ApiVideoResponse): VideoResponse {
    if (!payload) throw new Error("接口没有返回视频任务");
    if ("code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || "请求失败");
        if (!payload.data) throw new Error("接口没有返回视频任务");
        return payload.data;
    }
    return payload as VideoResponse;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "视频下载失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}
