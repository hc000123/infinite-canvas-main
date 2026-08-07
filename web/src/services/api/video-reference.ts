import { isSeedance25Model, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, normalizeSeedanceSeed } from "./video-normalizers.ts";

export type SeedanceImageRole = "reference_image" | "first_frame" | "last_frame";
export type SeedanceImageRoleMode = "reference" | "first_frame" | "first_last_frame" | "continue";
export type VideoReferenceMode = "auto" | "text2video" | "image2video" | "frames2video" | "multiframe2video" | "multimodal2video";
export type SeedanceVideoRole = "reference_video" | "source_video";
export type SeedanceVideoTaskMode = "generate" | "edit" | "extend";
export type SeedanceImageReferenceInput = string | { url: string; role?: SeedanceImageRole };
export type SeedanceOrderedReferenceInput = { type: "image"; url: string; role?: SeedanceImageRole } | { type: "video"; url: string } | { type: "audio"; url: string };
export type SeedanceReferenceInput = SeedanceImageReferenceInput | SeedanceOrderedReferenceInput;

export type SeedanceContentItem =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string }; role: SeedanceImageRole }
    | { type: "video_url"; video_url: { url: string }; role: SeedanceVideoRole }
    | { type: "audio_url"; audio_url: { url: string }; role: "reference_audio" };

export type SeedanceReferenceKind = "image" | "video" | "audio";

const SEEDANCE_REFERENCE_KIND_LABELS: Record<SeedanceReferenceKind, string> = {
    image: "图片",
    video: "视频",
    audio: "音频",
};

type SeedanceVideoTaskConfig = {
    model?: string;
    seedanceModel?: string;
    seedanceEndpointId?: string;
    videoModel?: string;
    videoSeconds?: string;
    size?: string;
    vquality?: string;
    videoGenerateAudio?: string;
    videoWatermark?: string;
    videoSeed?: string;
    returnLastFrame?: string;
    videoTaskMode?: string;
    videoEditType?: string;
    videoExtendDirection?: string;
    videoReferenceImageMode?: string;
};

const SEEDANCE_REFERENCE_LIMITS = {
    "2.0": { image: 9, video: 3, audio: 3, total: 12, audioOnly: false },
    "2.5": { image: 30, video: 10, audio: 10, total: 50, audioOnly: true },
} as const;

export function seedanceReferenceLabel(kind: SeedanceReferenceKind, index: number) {
    return `${SEEDANCE_REFERENCE_KIND_LABELS[kind]} ${Math.max(1, Math.floor(index) || 1)}`;
}

export function seedanceReferenceLabelRange(kind: SeedanceReferenceKind, count: number) {
    const total = Math.max(0, Math.floor(count) || 0);
    if (!total) return "";
    const label = SEEDANCE_REFERENCE_KIND_LABELS[kind];
    return total === 1 ? `${label} 1` : `${label} 1-${total}`;
}

export function normalizeSeedancePromptReferenceMentions(prompt: string) {
    return prompt.replace(/图片\s*((?:[1-9]|[12]\d|30))(?!\d)/g, "图片 $1").replace(/(视频|音频)\s*((?:[1-9]|10))(?!\d)/g, "$1 $2");
}

export function hasSeedanceAssetIdReference(prompt: string) {
    return /asset:\/\/[^\s，。；、）)]+/i.test(prompt);
}

export function seedanceAssetURIFromImageReference(image: { assetUri?: string; url?: string; dataUrl?: string }) {
    if (image.assetUri) return image.assetUri;
    if (image.url?.startsWith("asset://")) return image.url;
    if (image.dataUrl?.startsWith("asset://")) return image.dataUrl;
    return "";
}

export function seedanceAssetURIFromVideoReference(video: { assetUri?: string; url?: string; volcenginePublicUrl?: string }) {
    if (video.assetUri) return video.assetUri;
    if (video.url?.startsWith("asset://")) return video.url;
    if (video.volcenginePublicUrl?.startsWith("http")) return video.volcenginePublicUrl;
    return "";
}

export function defaultSeedanceImageRole(index: number, mode?: string): SeedanceImageRole {
    const imageIndex = Math.max(0, Math.floor(index) || 0);
    const roleMode = normalizeSeedanceImageRoleMode(mode);
    if (roleMode === "first_frame" && imageIndex === 0) return "first_frame";
    if (roleMode === "first_last_frame" && imageIndex === 0) return "first_frame";
    if (roleMode === "first_last_frame" && imageIndex === 1) return "last_frame";
    return "reference_image";
}

export function resolveSeedanceImageRole(role: string | undefined, index: number, mode?: string): SeedanceImageRole {
    return normalizeSeedanceImageRole(role) || defaultSeedanceImageRole(index, mode);
}

export function normalizeSeedanceImageRole(role?: string): SeedanceImageRole | undefined {
    return role === "first_frame" || role === "last_frame" || role === "reference_image" ? role : undefined;
}

export function normalizeSeedanceImageRoleMode(mode?: string): SeedanceImageRoleMode {
    if (mode === "first_frame" || mode === "first_last_frame" || mode === "continue") return mode;
    return "reference";
}

export function normalizeVideoReferenceMode(mode?: string): VideoReferenceMode {
    if (mode === "text2video" || mode === "image2video" || mode === "frames2video" || mode === "multiframe2video" || mode === "multimodal2video") return mode;
    return "auto";
}

export function inferVideoReferenceMode(input: { imageCount: number; videoCount?: number; audioCount?: number; imageRoleMode?: string }): Exclude<VideoReferenceMode, "auto"> {
    if (input.videoCount || input.audioCount) return "multimodal2video";
    if (input.imageRoleMode === "continue" && input.imageCount) return "multimodal2video";
    if (input.imageRoleMode === "first_last_frame" && input.imageCount >= 2) return "frames2video";
    if (input.imageRoleMode === "first_frame" && input.imageCount) return "image2video";
    if (input.imageCount >= 2) return "multiframe2video";
    if (input.imageCount === 1) return "image2video";
    return "text2video";
}

export function buildSeedanceContent(prompt: string, imageUrls: SeedanceReferenceInput[], videoUrls: string[] = [], audioUrls: string[] = [], model?: string): SeedanceContentItem[] {
    return buildSeedanceContentItems(prompt, normalizeSeedanceReferences(imageUrls, videoUrls, audioUrls, model));
}

export function buildSeedanceVideoTaskPayload(config: SeedanceVideoTaskConfig, prompt: string, imageUrls: SeedanceReferenceInput[], videoUrls: string[] = [], audioUrls: string[] = []) {
    const taskMode = normalizeSeedanceVideoTaskMode(config.videoTaskMode);
    const model = resolveSeedanceRequestModel(config);
    const capabilityModel = resolveSeedanceCapabilityModel(config, model);
    const content =
        taskMode === "generate"
            ? buildSeedanceContent(prompt, imageUrls, videoUrls, audioUrls, capabilityModel)
            : buildSeedanceDerivedContent(prompt, imageUrls, videoUrls, audioUrls, capabilityModel);
    const imageRoleMode = content.some((item) => item.type === "image_url" && (item.role === "first_frame" || item.role === "last_frame")) ? "first_frame" : config.videoReferenceImageMode;
    const payload: Record<string, unknown> = {
        model,
        content,
        _seedance_task_mode: taskMode,
        duration: normalizeSeedanceDuration(config.videoSeconds || "", capabilityModel, taskMode),
        ratio: normalizeSeedanceRatio(config.size || "", capabilityModel, taskMode, imageRoleMode),
        resolution: normalizeSeedanceResolution(config.vquality || "", capabilityModel),
        generate_audio: config.videoGenerateAudio === "true",
        watermark: config.videoWatermark === "true",
        return_last_frame: config.returnLastFrame === "true",
    };
    if (taskMode === "edit") payload._seedance_billing_duration = normalizeSeedanceDuration(config.videoSeconds || "", capabilityModel, "generate");
    const seed = normalizeSeedanceSeed(config.videoSeed || "");
    if (seed !== undefined) payload.seed = seed;
    return payload;
}

function resolveSeedanceRequestModel(config: SeedanceVideoTaskConfig) {
    return (config.seedanceEndpointId || config.model || config.seedanceModel || config.videoModel || "").trim();
}

function resolveSeedanceCapabilityModel(config: SeedanceVideoTaskConfig, requestModel: string) {
    return (config.seedanceModel || config.model || config.videoModel || requestModel).trim();
}

function normalizeSeedanceImageReference(input: SeedanceReferenceInput) {
    if (isOrderedSeedanceReference(input) && input.type !== "image") return null;
    const url = typeof input === "string" ? input : input.url;
    if (!url) return null;
    const role = typeof input === "string" ? "reference_image" : normalizeSeedanceImageRole(input.role) || "reference_image";
    return { url, role };
}

function isOrderedSeedanceReference(input: SeedanceReferenceInput): input is SeedanceOrderedReferenceInput {
    return typeof input === "object" && "type" in input && (input.type === "image" || input.type === "video" || input.type === "audio");
}

function normalizeOrderedSeedanceReferences(inputs: SeedanceReferenceInput[], model?: string) {
    const references: SeedanceOrderedReferenceInput[] = [];
    for (const input of inputs) {
        const reference = normalizeOrderedSeedanceReference(input);
        if (reference) references.push(reference);
    }
    return validateSeedanceReferenceMix(references, model);
}

function normalizeOrderedSeedanceReference(input: SeedanceReferenceInput): SeedanceOrderedReferenceInput | null {
    if (!isOrderedSeedanceReference(input)) {
        const image = normalizeSeedanceImageReference(input);
        return image ? { type: "image", ...image } : null;
    }
    if (!input.url) return null;
    if (input.type === "image") return { type: "image", url: input.url, role: normalizeSeedanceImageRole(input.role) || "reference_image" };
    return { type: input.type, url: input.url };
}

function seedanceContentItemFromReference(reference: SeedanceOrderedReferenceInput): SeedanceContentItem {
    if (reference.type === "image") return { type: "image_url", image_url: { url: reference.url }, role: reference.role || "reference_image" };
    if (reference.type === "video") return { type: "video_url", video_url: { url: reference.url }, role: "reference_video" };
    return { type: "audio_url", audio_url: { url: reference.url }, role: "reference_audio" };
}

function buildSeedanceDerivedContent(prompt: string, imageUrls: SeedanceReferenceInput[], videoUrls: string[], audioUrls: string[], model?: string): SeedanceContentItem[] {
    return buildSeedanceContentItems(prompt, normalizeSeedanceReferences(imageUrls, videoUrls, audioUrls, model, true));
}

function normalizeSeedanceReferences(imageUrls: SeedanceReferenceInput[], videoUrls: string[], audioUrls: string[], model?: string, derived = false) {
    if (imageUrls.some(isOrderedSeedanceReference)) {
        return normalizeOrderedSeedanceReferences([...imageUrls, ...videoUrls.map((url) => ({ type: "video" as const, url })), ...audioUrls.map((url) => ({ type: "audio" as const, url }))], model);
    }
    const images = imageUrls
        .map(normalizeSeedanceImageReference)
        .filter((image): image is { url: string; role: SeedanceImageRole } => Boolean(image))
        .map((image) => ({ type: "image" as const, url: image.url, role: image.role }));
    const videos = videoUrls.filter(Boolean).map((url) => ({ type: "video" as const, url }));
    const audios = audioUrls.filter(Boolean).map((url) => ({ type: "audio" as const, url }));
    return validateSeedanceReferenceMix(derived ? [...videos, ...images, ...audios] : [...images, ...videos, ...audios], model);
}

function validateSeedanceReferenceMix(references: SeedanceOrderedReferenceInput[], model?: string) {
    validateSeedanceReferenceCounts(references, model);
    const hasAudio = references.some((reference) => reference.type === "audio");
    if (!hasAudio) return references;
    const hasVisual = references.some((reference) => reference.type === "image" || reference.type === "video");
    if (!hasVisual && !seedanceReferenceLimits(model).audioOnly) throw new Error("Seedance 2.0 不支持纯音频或文本加音频输入，请至少添加图片或视频参考");
    return references;
}

function buildSeedanceContentItems(prompt: string, references: SeedanceOrderedReferenceInput[]) {
    const text = prompt.trim();
    const content: SeedanceContentItem[] = [
        ...(text ? [{ type: "text" as const, text: normalizeSeedancePromptReferenceMentions(text) }] : []),
        ...references.map(seedanceContentItemFromReference),
    ];
    if (!content.length) throw new Error("缺少视频提示词或参考素材");
    return content;
}

function validateSeedanceReferenceCounts(references: SeedanceOrderedReferenceInput[], model?: string) {
    const limits = seedanceReferenceLimits(model);
    const version = isSeedance25Model(model) ? "2.5" : "2.0";
    const counts: Record<SeedanceReferenceKind, number> = { image: 0, video: 0, audio: 0 };
    references.forEach((reference) => (counts[reference.type] += 1));
    if (counts.image > limits.image) throw new Error(`Seedance ${version} 最多支持 ${limits.image} 张图片`);
    if (counts.video > limits.video) throw new Error(`Seedance ${version} 最多支持 ${limits.video} 个视频`);
    if (counts.audio > limits.audio) throw new Error(`Seedance ${version} 最多支持 ${limits.audio} 个音频`);
    if (references.length > limits.total) throw new Error(`Seedance ${version} 最多支持 ${limits.total} 个参考素材`);
}

function seedanceReferenceLimits(model?: string) {
    return isSeedance25Model(model) ? SEEDANCE_REFERENCE_LIMITS["2.5"] : SEEDANCE_REFERENCE_LIMITS["2.0"];
}

function normalizeSeedanceVideoTaskMode(mode?: string): SeedanceVideoTaskMode {
    return mode === "edit" || mode === "extend" ? mode : "generate";
}
