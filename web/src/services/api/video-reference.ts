import { normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, normalizeSeedanceSeed } from "./video-normalizers.ts";

export type SeedanceImageRole = "reference_image" | "first_frame" | "last_frame";
export type SeedanceImageRoleMode = "reference" | "first_frame" | "first_last_frame" | "continue";
export type SeedanceVideoRole = "reference_video" | "source_video";
export type SeedanceVideoTaskMode = "generate" | "edit" | "extend";
export type SeedanceVideoEditType = "replace" | "add" | "remove" | "inpaint";
export type SeedanceVideoExtendDirection = "forward" | "backward";
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
};

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
    return prompt.replace(/(图片|视频|音频)\s*((?:[1-9]|1[0-2]))(?!\d)/g, "$1 $2");
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

export function defaultSeedanceImageRole(index: number, mode?: string): SeedanceImageRole {
    const imageIndex = Math.max(0, Math.floor(index) || 0);
    const roleMode = normalizeSeedanceImageRoleMode(mode);
    if ((roleMode === "first_frame" || roleMode === "continue") && imageIndex === 0) return "first_frame";
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

export function buildSeedanceContent(prompt: string, imageUrls: SeedanceReferenceInput[], videoUrls: string[] = [], audioUrls: string[] = []): SeedanceContentItem[] {
    if (imageUrls.some(isOrderedSeedanceReference)) {
        return [
            { type: "text", text: normalizeSeedancePromptReferenceMentions(prompt) },
            ...normalizeOrderedSeedanceReferences([...imageUrls, ...videoUrls.map((url) => ({ type: "video" as const, url })), ...audioUrls.map((url) => ({ type: "audio" as const, url }))]).map(seedanceContentItemFromReference),
        ];
    }
    const images = imageUrls
        .map(normalizeSeedanceImageReference)
        .filter((image): image is { url: string; role: SeedanceImageRole } => Boolean(image))
        .slice(0, 9);
    const videos = videoUrls
        .filter(Boolean)
        .slice(0, Math.max(0, 12 - images.length))
        .slice(0, 3);
    const audios = audioUrls
        .filter(Boolean)
        .slice(0, Math.max(0, 12 - images.length - videos.length))
        .slice(0, 3);
    return [
        { type: "text", text: normalizeSeedancePromptReferenceMentions(prompt) },
        ...images.map((image) => ({ type: "image_url" as const, image_url: { url: image.url }, role: image.role })),
        ...videos.map((url) => ({ type: "video_url" as const, video_url: { url }, role: "reference_video" as const })),
        ...audios.map((url) => ({ type: "audio_url" as const, audio_url: { url }, role: "reference_audio" as const })),
    ];
}

export function buildSeedanceVideoTaskPayload(config: SeedanceVideoTaskConfig, prompt: string, imageUrls: SeedanceReferenceInput[], videoUrls: string[] = [], audioUrls: string[] = []) {
    const taskMode = normalizeSeedanceVideoTaskMode(config.videoTaskMode);
    const payload: Record<string, unknown> = {
        model: resolveSeedanceRequestModel(config),
        content: taskMode === "generate" ? buildSeedanceContent(prompt, imageUrls, videoUrls, audioUrls) : buildSeedanceDerivedContent(prompt, imageUrls, videoUrls, audioUrls),
        duration: normalizeSeedanceDuration(config.videoSeconds || ""),
        ratio: normalizeSeedanceRatio(config.size || ""),
        resolution: normalizeSeedanceResolution(config.vquality || ""),
        generate_audio: config.videoGenerateAudio === "true",
        watermark: config.videoWatermark === "true",
        return_last_frame: config.returnLastFrame === "true",
    };
    if (taskMode !== "generate") payload.task_mode = taskMode;
    if (taskMode === "edit") payload.edit_type = normalizeSeedanceVideoEditType(config.videoEditType);
    if (taskMode === "extend") payload.extend_direction = normalizeSeedanceVideoExtendDirection(config.videoExtendDirection);
    const seed = normalizeSeedanceSeed(config.videoSeed || "");
    if (seed !== undefined) payload.seed = seed;
    return payload;
}

function resolveSeedanceRequestModel(config: SeedanceVideoTaskConfig) {
    return (config.seedanceEndpointId || config.model || config.seedanceModel || config.videoModel || "").trim();
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

function normalizeOrderedSeedanceReferences(inputs: SeedanceReferenceInput[]) {
    const counts: Record<SeedanceReferenceKind, number> = { image: 0, video: 0, audio: 0 };
    const limits: Record<SeedanceReferenceKind, number> = { image: 9, video: 3, audio: 3 };
    const references: SeedanceOrderedReferenceInput[] = [];
    for (const input of inputs) {
        if (references.length >= 12) break;
        const reference = normalizeOrderedSeedanceReference(input);
        if (!reference || counts[reference.type] >= limits[reference.type]) continue;
        counts[reference.type] += 1;
        references.push(reference);
    }
    return references;
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

function buildSeedanceDerivedContent(prompt: string, imageUrls: SeedanceReferenceInput[], videoUrls: string[], audioUrls: string[]): SeedanceContentItem[] {
    const orderedInputs = imageUrls.some(isOrderedSeedanceReference)
        ? normalizeOrderedSeedanceReferences([...imageUrls, ...videoUrls.map((url) => ({ type: "video" as const, url })), ...audioUrls.map((url) => ({ type: "audio" as const, url }))])
        : [
              ...videoUrls.filter(Boolean).map((url) => ({ type: "video" as const, url })),
              ...imageUrls
                  .map(normalizeSeedanceImageReference)
                  .filter((image): image is { url: string; role: SeedanceImageRole } => Boolean(image))
                  .map((image) => ({ type: "image" as const, url: image.url, role: image.role })),
              ...audioUrls.filter(Boolean).map((url) => ({ type: "audio" as const, url })),
          ];
    let sourceVideoSelected = false;
    return [
        { type: "text", text: normalizeSeedancePromptReferenceMentions(prompt) },
        ...orderedInputs.flatMap((reference): SeedanceContentItem[] => {
            if (reference.type === "video" && !sourceVideoSelected) {
                sourceVideoSelected = true;
                return [{ type: "video_url", video_url: { url: reference.url }, role: "source_video" }];
            }
            return [seedanceContentItemFromReference(reference)];
        }),
    ];
}

function normalizeSeedanceVideoTaskMode(mode?: string): SeedanceVideoTaskMode {
    return mode === "edit" || mode === "extend" ? mode : "generate";
}

function normalizeSeedanceVideoEditType(type?: string): SeedanceVideoEditType {
    return type === "add" || type === "remove" || type === "inpaint" ? type : "replace";
}

function normalizeSeedanceVideoExtendDirection(direction?: string): SeedanceVideoExtendDirection {
    return direction === "backward" ? "backward" : "forward";
}
