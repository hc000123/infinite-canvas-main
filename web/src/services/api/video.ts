import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { AI_REQUEST_TIMEOUT_MS, AI_VIDEO_CONTENT_TIMEOUT_MS, AI_VIDEO_MAX_POLL_ATTEMPTS, AI_VIDEO_POLL_INTERVAL_MS, AI_VIDEO_TASK_TIMEOUT_MS, aiApiUrl, aiHeaders, delay, normalizeAiError, refreshRemoteUser } from "@/services/api/ai-provider";
import { isRemoteOrInlineMediaUrl, normalizeSeedanceRatio, normalizeSeedanceResolution, normalizeSeedanceSeed, normalizeVideoResolution, normalizeVideoSeconds, normalizeVideoSize } from "@/services/api/video-normalizers";
import { buildSeedanceVideoTaskPayload, defaultSeedanceImageRole, seedanceAssetURIFromImageReference, seedanceAssetURIFromVideoReference, type SeedanceImageReferenceInput, type SeedanceOrderedReferenceInput } from "@/services/api/video-reference";
import { buildDreaminaVideoPayload } from "@/services/api/dreamina-video-payload";
import { buildXinglianVideoPayload } from "@/services/api/xinglian-video-payload";
import { aiTaskTraceHeaders, readAiTaskLedgerFromHeaders, type AiTaskLedger, type AiTaskTrace } from "@/services/api/ai-task-trace";
import { type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/audio";
import type { ReferenceVideo } from "@/types/video";

export type NormalizedVideoTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type NormalizedVideoTask = {
    id: string;
    status: NormalizedVideoTaskStatus;
    rawStatus?: string;
    videoUrl?: string;
    lastFrameUrl?: string;
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
    aiTaskId?: string;
    upstreamTaskId?: string;
    aiTaskStatus?: string;
    aiTaskCredits?: number;
    creditLogId?: string;
    creditsRefunded?: number;
    refundedAt?: string;
    finishedAt?: string;
};

export class RecoverableVideoTaskError extends Error {
    task: NormalizedVideoTask;
    cause?: unknown;

    constructor(message: string, task: NormalizedVideoTask, cause?: unknown) {
        super(message);
        this.name = "RecoverableVideoTaskError";
        this.task = task;
        this.cause = cause;
    }
}

export function isRecoverableVideoTaskError(error: unknown): error is RecoverableVideoTaskError {
    return error instanceof RecoverableVideoTaskError;
}

type VideoGenerationOptions = {
    onStatus?: (task: NormalizedVideoTask) => void;
    trace?: AiTaskTrace;
};

export type VideoGenerationReferenceInput = { type: "image"; nodeId?: string; image: ReferenceImage } | { type: "video"; nodeId?: string; video: ReferenceVideo } | { type: "audio"; nodeId?: string; audio: ReferenceAudio };

export type VideoGenerationReferences = ReferenceImage[] | { images?: ReferenceImage[]; videos?: ReferenceVideo[]; audios?: ReferenceAudio[]; inputs?: VideoGenerationReferenceInput[] };

type VideoResponse = {
    id: string;
    status?: string;
    raw_status?: string;
    video_url?: string;
    last_frame_url?: string;
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
type VideoPreflightResponse = {
    channelName: string;
    model: string;
    protocol: string;
    baseUrl?: string;
    endpointId?: string;
    apiKeyConfigured?: boolean;
    apiKeyHint?: string;
    cliPath?: string;
    outputDir?: string;
    version?: string;
    loginReady?: boolean;
};
type ApiVideoPreflightResponse = { code?: number; data?: VideoPreflightResponse | null; msg?: string };

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: VideoGenerationReferences = [], options: VideoGenerationOptions = {}) {
    return requestOpenAICompatibleVideoGeneration(config, prompt, references, options);
}

export async function preflightVideoGeneration(config: AiConfig) {
    if (!shouldPreflightVideoProtocol(config.videoProtocol)) return undefined;
    const model = resolveVideoRequestModel(config);
    if (!model?.trim()) throw new Error("视频模型未配置，请先选择视频模型");
    try {
        const response = await axios.get<ApiVideoPreflightResponse>(aiApiUrl(config, "/videos/preflight"), {
            headers: aiHeaders(config),
            params: { model },
            timeout: AI_REQUEST_TIMEOUT_MS,
        });
        if (response.data?.code && response.data.code !== 0) throw new Error(response.data.msg || "视频通道预检失败");
        return response.data?.data || undefined;
    } catch (error) {
        throw new Error(normalizeAiError(error, "视频通道预检失败"));
    }
}

export async function refreshVideoTask(config: AiConfig, taskId: string) {
    return queryVideoTask(config, taskId, resolveVideoRequestModel(config));
}

export async function fetchVideoTaskContent(config: AiConfig, task: NormalizedVideoTask) {
    const blob = await fetchVideoContent(config, resolveVideoRequestModel(config), task);
    await assertVideoBlob(blob);
    return blob;
}

function normalizeVideoTask(payload: VideoResponse): NormalizedVideoTask {
    return {
        id: payload.id,
        status: normalizeVideoTaskStatus(payload.status),
        rawStatus: payload.raw_status || payload.status,
        videoUrl: payload.video_url || payload.content?.video_url,
        lastFrameUrl: payload.last_frame_url,
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

async function requestOpenAICompatibleVideoGeneration(config: AiConfig, prompt: string, references: VideoGenerationReferences, options: VideoGenerationOptions) {
    const model = resolveVideoRequestModel(config);
    const normalizedReferences = normalizeVideoGenerationReferences(references);
    try {
        assertVideoConfigReady(config, model);
        const initialTask = await createVideoTask(config, prompt, normalizedReferences, model, options.trace).catch((error) => {
            throw new Error(normalizeAiError(error, "视频任务创建失败"));
        });
        const task = await pollVideoTask(initialTask, (taskId) => queryVideoTask(config, taskId, model), options);
        const blob = await fetchVideoContent(config, model, task).catch((error) => {
            if (isTransientVideoRequestError(error)) throw new RecoverableVideoTaskError("网络中断，视频已生成，恢复连接后会继续回填。", task, error);
            throw error;
        });
        await assertVideoBlob(blob);
        refreshRemoteUser(config);
        return blob;
    } catch (error) {
        if (isRecoverableVideoTaskError(error)) throw error;
        throw new Error(normalizeAiError(error, "视频生成失败"));
    }
}

function assertVideoConfigReady(_config: AiConfig, model: string) {
    if (!model.trim()) throw new Error("视频模型未配置，请先选择视频模型");
}

async function createVideoTask(config: AiConfig, prompt: string, references: NormalizedVideoReferences, model: string, trace?: AiTaskTrace) {
    const body = await buildVideoPayload(config, prompt, references, model);
    const url = aiApiUrl(config, "/videos");
    const response = await axios.post<ApiVideoResponse>(url, body, {
        headers: { ...aiHeaders(config), ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...aiTaskTraceHeaders(config, trace) },
        timeout: AI_VIDEO_TASK_TIMEOUT_MS,
    });
    const task = mergeVideoTaskLedger(normalizeVideoTask(unwrapVideoResponse(response.data)), readAiTaskLedgerFromHeaders(response.headers));
    if (!task.id) throw new Error("视频接口没有返回任务 ID");
    return task;
}

async function queryVideoTask(config: AiConfig, taskId: string, model: string) {
    const url = aiApiUrl(config, `/videos/${taskId}`);
    const params: Record<string, string> = { model };
    const response = await axios.get<ApiVideoResponse>(url, {
        headers: aiHeaders(config),
        params,
        timeout: isLongRunningVideoProtocol(config.videoProtocol) ? AI_VIDEO_TASK_TIMEOUT_MS : AI_REQUEST_TIMEOUT_MS,
    });
    return normalizeVideoTask(unwrapVideoResponse(response.data));
}

function shouldPreflightVideoProtocol(protocol: AiConfig["videoProtocol"]) {
    return protocol === "volcengine-ark" || protocol === "jimeng-cli" || protocol === "xinglian-cloud";
}

function isLongRunningVideoProtocol(protocol: AiConfig["videoProtocol"]) {
    return protocol === "volcengine-ark" || protocol === "jimeng-cli" || protocol === "xinglian-cloud";
}

function resolveVideoRequestModel(config: AiConfig) {
    if (config.videoProtocol === "volcengine-ark") return (config.seedanceEndpointId || config.seedanceModel || config.videoModel || config.model).trim();
    return (config.videoModel || config.model).trim();
}

async function pollVideoTask(initialTask: NormalizedVideoTask, queryTask: (taskId: string) => Promise<NormalizedVideoTask>, options: VideoGenerationOptions) {
    let task = initialTask;
    options.onStatus?.(task);
    for (let attempts = 0; task.status !== "succeeded"; attempts += 1) {
        if (task.status === "failed" || task.status === "cancelled") throw new Error(task.errorMessage || "视频生成失败");
        if (attempts >= AI_VIDEO_MAX_POLL_ATTEMPTS) throw new Error("视频生成超时，请稍后重试");
        await delay(AI_VIDEO_POLL_INTERVAL_MS);
        try {
            task = await queryTask(task.id);
        } catch (error) {
            if (isTransientVideoRequestError(error)) throw new RecoverableVideoTaskError("网络中断，视频任务仍在生成，恢复连接后会继续同步。", task, error);
            throw error;
        }
        task = preserveVideoTaskLedger(task, initialTask);
        options.onStatus?.(task);
    }
    return task;
}

function mergeVideoTaskLedger(task: NormalizedVideoTask, ledger: AiTaskLedger): NormalizedVideoTask {
    if (!ledger.aiTaskId && !ledger.upstreamTaskId) return task;
    return {
        ...task,
        aiTaskId: ledger.aiTaskId,
        upstreamTaskId: ledger.upstreamTaskId || task.id,
        aiTaskStatus: ledger.aiTaskStatus || task.status,
        aiTaskCredits: ledger.aiTaskCredits,
        creditLogId: ledger.creditLogId,
        creditsRefunded: ledger.creditsRefunded,
        refundedAt: ledger.refundedAt,
        finishedAt: ledger.finishedAt,
    };
}

function preserveVideoTaskLedger(task: NormalizedVideoTask, previous: NormalizedVideoTask): NormalizedVideoTask {
    if (task.aiTaskId || task.upstreamTaskId) return task;
    return {
        ...task,
        aiTaskId: previous.aiTaskId,
        upstreamTaskId: previous.upstreamTaskId,
        aiTaskStatus: previous.aiTaskStatus || task.status,
        aiTaskCredits: previous.aiTaskCredits,
        creditLogId: previous.creditLogId,
        creditsRefunded: previous.creditsRefunded,
        refundedAt: previous.refundedAt,
        finishedAt: previous.finishedAt,
    };
}

function isTransientVideoRequestError(error: unknown) {
    if (!axios.isAxiosError(error)) return false;
    if (!error.response) return true;
    return [408, 429, 500, 502, 503, 504].includes(error.response.status || 0);
}

export async function buildVideoPayload(config: AiConfig, prompt: string, references: NormalizedVideoReferences, model: string) {
    if (config.videoProtocol === "volcengine-ark") {
        return buildSeedanceVideoPayload(config, prompt, references);
    }
    if (config.videoProtocol === "jimeng-cli") {
        return buildDreaminaVideoRequest(config, prompt, references, model);
    }
    if (config.videoProtocol === "xinglian-cloud") {
        return buildXinglianVideoRequest(config, prompt, references, model);
    }
    if (!references.images.length && !references.videos.length && !references.audios.length) {
        const seed = normalizeSeedanceSeed(config.videoSeed);
        return {
            model,
            prompt,
            seconds: normalizeVideoSeconds(config.videoSeconds),
            duration: normalizeVideoSeconds(config.videoSeconds),
            ratio: normalizeSeedanceRatio(config.size),
            size: normalizeVideoSize(config.size) || undefined,
            resolution: normalizeSeedanceResolution(config.vquality),
            resolution_name: normalizeVideoResolution(config.vquality),
            generate_audio: config.videoGenerateAudio === "true",
            watermark: config.videoWatermark === "true",
            ...(seed === undefined ? {} : { seed }),
        };
    }
    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    body.append("duration", normalizeVideoSeconds(config.videoSeconds));
    body.append("ratio", normalizeSeedanceRatio(config.size));
    body.append("resolution", normalizeSeedanceResolution(config.vquality));
    body.append("generate_audio", String(config.videoGenerateAudio === "true"));
    body.append("watermark", String(config.videoWatermark === "true"));
    const seed = normalizeSeedanceSeed(config.videoSeed);
    if (seed !== undefined) body.append("seed", String(seed));
    const files = await Promise.all(references.images.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file, index) => {
        body.append("input_reference[]", file);
        body.append("input_reference_role[]", references.images[index]?.seedanceRole || "reference_image");
    });
    return body;
}

async function buildDreaminaVideoRequest(config: AiConfig, prompt: string, references: NormalizedVideoReferences, model: string) {
    const [images, videos, audios] = await Promise.all([
        Promise.all(
            references.images.map(async (image, index) => ({
                file: await dreaminaImageFile(image),
                role: image.seedanceRole || defaultSeedanceImageRole(index, config.videoReferenceImageMode),
            })),
        ),
        Promise.all(references.videos.map((video) => dreaminaMediaFile(video, "video"))),
        Promise.all(references.audios.map((audio) => dreaminaMediaFile(audio, "audio"))),
    ]);
    return buildDreaminaVideoPayload({
        model,
        prompt,
        duration: String(Math.max(4, Math.min(model === "seedance2.5" ? 30 : 15, Number(config.videoSeconds) || 6))),
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeDreaminaRequestedResolution(config.vquality),
        mode: config.videoReferenceMode,
        images,
        videos,
        audios,
    });
}

function normalizeDreaminaRequestedResolution(value: string) {
    const normalized = String(value || "").toLowerCase().replace(/p$/, "");
    if (normalized === "4k" || Number(normalized) >= 2160) return "4k";
    if (Number(normalized) >= 1080) return "1080p";
    if (Number(normalized) > 0 && Number(normalized) <= 480) return "480p";
    return "720p";
}

async function dreaminaImageFile(image: ReferenceImage) {
    try {
        const dataUrl = await imageToDataUrl(image);
        if (!dataUrl?.startsWith("data:")) throw new Error("empty image");
        return dataUrlToFile({ ...image, dataUrl });
    } catch {
        throw new Error(`即梦 CLI 无法读取图片“${image.name || "未命名图片"}”，请先导入我的素材后重试`);
    }
}

async function dreaminaMediaFile(reference: ReferenceVideo | ReferenceAudio, kind: "video" | "audio") {
    try {
        const url = reference.url || (reference.storageKey ? await resolveMediaUrl(reference.storageKey, "") : "");
        if (!url) throw new Error("missing url");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const fallbackType = kind === "video" ? "video/mp4" : "audio/mpeg";
        return new File([blob], reference.name || (kind === "video" ? "reference.mp4" : "reference.mp3"), { type: blob.type || reference.type || fallbackType });
    } catch {
        throw new Error(`即梦 CLI 无法读取${kind === "video" ? "视频" : "音频"}“${reference.name || "未命名素材"}”，请先导入我的素材后重试`);
    }
}

async function buildXinglianVideoRequest(config: AiConfig, prompt: string, references: NormalizedVideoReferences, model: string) {
    const [images, videos, audios] = await Promise.all([xinglianReferenceURLs(references.images), xinglianReferenceURLs(references.videos), xinglianReferenceURLs(references.audios)]);
    return buildXinglianVideoPayload({
        model,
        prompt,
        duration: normalizeVideoSeconds(config.videoSeconds),
        ratio: normalizeSeedanceRatio(config.size),
        generateAudio: config.videoGenerateAudio === "true",
        images,
        videos,
        audios,
    });
}

async function xinglianReferenceURLs(references: Array<{ url?: string; storageKey?: string }>) {
    return Promise.all(
        references.map(async (reference) => {
            const url = reference.url || (reference.storageKey ? await resolveMediaUrl(reference.storageKey, "") : "");
            if (!url.startsWith("https://")) throw new Error("星链云参考素材必须先上传为 HTTPS 地址");
            return url;
        }),
    );
}

export type NormalizedVideoReferences = {
    images: ReferenceImage[];
    videos: ReferenceVideo[];
    audios: ReferenceAudio[];
    inputs: VideoGenerationReferenceInput[];
};

function normalizeVideoGenerationReferences(references: VideoGenerationReferences): NormalizedVideoReferences {
    if (Array.isArray(references)) {
        return {
            images: references,
            videos: [],
            audios: [],
            inputs: references.map((image) => ({ type: "image", nodeId: image.id, image })),
        };
    }
    const images = references.images || [];
    const videos = references.videos || [];
    const audios = references.audios || [];
    return {
        images,
        videos,
        audios,
        inputs: references.inputs?.length
            ? references.inputs
            : [
                  ...images.map((image) => ({ type: "image" as const, nodeId: image.id, image })),
                  ...videos.map((video) => ({ type: "video" as const, nodeId: video.id, video })),
                  ...audios.map((audio) => ({ type: "audio" as const, nodeId: audio.id, audio })),
              ],
    };
}

async function buildSeedanceVideoPayload(config: AiConfig, prompt: string, references: NormalizedVideoReferences) {
    if (references.inputs.length) {
        const orderedReferences = (await Promise.all(references.inputs.map(seedanceOrderedReferenceInput))).filter((item): item is SeedanceOrderedReferenceInput => Boolean(item));
        return buildSeedanceVideoTaskPayload(config, prompt, orderedReferences);
    }
    const imageUrls = (await Promise.all(references.images.map(seedanceImageReferenceInput))).filter((image): image is SeedanceImageReferenceInput => Boolean(image));
    const videoUrls = (await Promise.all(references.videos.map(videoToDataUrl))).filter((url): url is string => Boolean(url));
    const audioUrls = (await Promise.all(references.audios.map(audioToDataUrl))).filter((url): url is string => Boolean(url));
    return buildSeedanceVideoTaskPayload(config, prompt, imageUrls, videoUrls, audioUrls);
}

async function seedanceImageReferenceInput(image: ReferenceImage): Promise<SeedanceImageReferenceInput | null> {
    const assetUri = seedanceAssetURIFromImageReference(image);
    const url = assetUri || (await imageToDataUrl(image));
    return url ? { url, role: image.seedanceRole || "reference_image" } : null;
}

async function seedanceOrderedReferenceInput(input: VideoGenerationReferenceInput): Promise<SeedanceOrderedReferenceInput | null> {
    if (input.type === "image") {
        const image = await seedanceImageReferenceInput(input.image);
        return image && typeof image !== "string" ? { type: "image", url: image.url, role: image.role } : null;
    }
    if (input.type === "video") {
        const url = await videoToDataUrl(input.video);
        return url ? { type: "video", url } : null;
    }
    const url = await audioToDataUrl(input.audio);
    return url ? { type: "audio", url } : null;
}

async function videoToDataUrl(video: ReferenceVideo) {
    const assetUri = seedanceAssetURIFromVideoReference(video);
    if (assetUri) return assetUri;
    const url = video.url || (await resolveMediaUrl(video.storageKey, ""));
    if (!url || isRemoteOrInlineMediaUrl(url)) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

async function audioToDataUrl(audio: ReferenceAudio) {
    if (audio.assetUri) return audio.assetUri;
    const url = audio.url || (await resolveMediaUrl(audio.storageKey, ""));
    if (!url || isRemoteOrInlineMediaUrl(url)) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取媒体失败"));
        reader.readAsDataURL(blob);
    });
}

async function fetchVideoContent(config: AiConfig, model: string, task: NormalizedVideoTask) {
    return fetchVideoContentDirect(config, model, task.id);
}

async function fetchVideoContentDirect(config: AiConfig, model: string, taskId: string) {
    const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${taskId}/content`), {
        headers: aiHeaders(config),
        params: { model },
        responseType: "blob",
        timeout: AI_VIDEO_CONTENT_TIMEOUT_MS,
    });
    return content.data;
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
