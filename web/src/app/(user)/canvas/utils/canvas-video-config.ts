import { resolveEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { AdminPublicSettings } from "@/services/api/admin";
import { normalizeSeedanceImageRoleMode } from "../../../../services/api/video-reference.ts";
import type { CanvasNodeMetadata } from "../types";

export type CanvasVideoProvider = AiConfig["videoProtocol"];
type CanvasVideoDefaultKey =
    | "channelMode"
    | "videoProtocol"
    | "videoModel"
    | "seedanceModel"
    | "seedanceEndpointId"
    | "size"
    | "videoSeconds"
    | "vquality"
    | "videoGenerateAudio"
    | "videoWatermark"
    | "videoSeed"
    | "videoPromptReviewEnabled"
    | "returnLastFrame"
    | "videoReferenceImageMode";

export function buildCanvasVideoConfig(config: AiConfig, metadata?: CanvasNodeMetadata): AiConfig {
    const channelMode = metadata?.channelMode || config.channelMode;
    const provider = resolveCanvasVideoProvider({ ...config, channelMode }, metadata);
    const model = resolveCanvasVideoModel({ ...config, channelMode }, provider, metadata);
    const metadataDuration = metadata?.taskId ? "" : metadata?.duration;
    const seconds = normalizeCanvasVideoSeconds(metadata?.seconds || metadataDuration || config.videoSeconds, provider);
    return {
        ...config,
        channelMode,
        videoProtocol: provider,
        model,
        videoModel: provider === "openai" ? model : config.videoModel,
        seedanceModel: provider === "volcengine-ark" ? model : config.seedanceModel,
        size: metadata?.size || config.size,
        videoSeconds: seconds,
        vquality: metadata?.vquality || config.vquality,
        videoGenerateAudio: metadata?.generateAudio || config.videoGenerateAudio || "true",
        videoWatermark: metadata?.watermark || config.videoWatermark,
        videoSeed: metadata?.seed || config.videoSeed,
        videoPromptReviewEnabled: metadata?.videoPromptReviewEnabled || config.videoPromptReviewEnabled || "true",
        returnLastFrame: metadata?.returnLastFrame || config.returnLastFrame,
        videoTaskMode: provider === "volcengine-ark" ? metadata?.videoTaskMode || config.videoTaskMode || "generate" : "generate",
        videoEditType: metadata?.videoEditType || config.videoEditType || "replace",
        videoExtendDirection: metadata?.videoExtendDirection || config.videoExtendDirection || "forward",
        videoReferenceImageMode: normalizeSeedanceImageRoleMode(metadata?.videoReferenceImageMode || config.videoReferenceImageMode),
    };
}

export function buildCanvasVideoProviderPatch(config: AiConfig, provider: CanvasVideoProvider): Pick<CanvasNodeMetadata, "provider" | "model"> {
    const nextProvider = config.channelMode === "local" ? "openai" : provider;
    return {
        provider: nextProvider,
        model: resolveCanvasVideoModel(config, nextProvider),
    };
}

export function resolveCanvasVideoChannelConfig(localConfig: AiConfig, effectiveConfig: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null | undefined, channelMode?: AiConfig["channelMode"]) {
    if (channelMode === "local") return { ...localConfig, channelMode: "local" as const, videoProtocol: "openai" as const };
    if (channelMode === "remote") return resolveEffectiveConfig({ ...localConfig, channelMode: "remote" }, modelChannel || null);
    return effectiveConfig.channelMode === "local" ? localConfig : effectiveConfig;
}

export function buildCanvasVideoChannelPatch(config: AiConfig): Pick<CanvasNodeMetadata, "channelMode" | "provider" | "model"> {
    const provider = resolveCanvasVideoProvider(config);
    return {
        channelMode: config.channelMode,
        provider,
        model: resolveCanvasVideoModel(config, provider),
    };
}

export function buildCanvasVideoModePatch(config: AiConfig): Partial<CanvasNodeMetadata> {
    const provider = resolveCanvasVideoProvider(config);
    const seconds = normalizeCanvasVideoSeconds(config.videoSeconds, provider);
    return {
        generationMode: "video",
        channelMode: config.channelMode,
        provider,
        model: resolveCanvasVideoModel(config, provider),
        size: config.size,
        seconds,
        duration: seconds,
        vquality: config.vquality,
        generateAudio: config.videoGenerateAudio || "true",
        watermark: config.videoWatermark,
        seed: config.videoSeed,
        videoPromptReviewEnabled: config.videoPromptReviewEnabled || "true",
        returnLastFrame: config.returnLastFrame,
        videoTaskMode: "generate",
        videoEditType: config.videoEditType || "replace",
        videoExtendDirection: config.videoExtendDirection || "forward",
        videoReferenceImageMode: normalizeSeedanceImageRoleMode(config.videoReferenceImageMode),
    };
}

export function buildCanvasVideoDefaultsPatch(config: AiConfig, metadata: Partial<CanvasNodeMetadata>) {
    const channelMode = metadata.channelMode || config.channelMode;
    const provider = channelMode === "local" ? "openai" : metadata.provider || config.videoProtocol || "openai";
    const patch: Partial<Pick<AiConfig, CanvasVideoDefaultKey>> = {};
    if (metadata.channelMode) patch.channelMode = metadata.channelMode;
    if (metadata.provider && channelMode !== "local") patch.videoProtocol = metadata.provider;
    if (metadata.model) {
        if (provider === "volcengine-ark") {
            if (!isSeedanceEndpointModel(metadata.model)) patch.seedanceModel = metadata.model;
        } else {
            if (channelMode !== "remote" || isVideoModelName(metadata.model)) patch.videoModel = metadata.model;
        }
    }
    if (metadata.size) patch.size = metadata.size;
    if (metadata.seconds || metadata.duration) patch.videoSeconds = normalizeCanvasVideoSeconds(metadata.seconds || metadata.duration || "", provider);
    if (metadata.vquality) patch.vquality = metadata.vquality;
    if (metadata.generateAudio) patch.videoGenerateAudio = metadata.generateAudio;
    if (metadata.watermark) patch.videoWatermark = metadata.watermark;
    if (metadata.seed !== undefined) patch.videoSeed = metadata.seed;
    if (metadata.videoPromptReviewEnabled) patch.videoPromptReviewEnabled = metadata.videoPromptReviewEnabled;
    if (metadata.returnLastFrame) patch.returnLastFrame = metadata.returnLastFrame;
    if (metadata.videoReferenceImageMode) patch.videoReferenceImageMode = normalizeSeedanceImageRoleMode(metadata.videoReferenceImageMode);
    return patch;
}

function resolveCanvasVideoProvider(config: AiConfig, metadata?: CanvasNodeMetadata): CanvasVideoProvider {
    if (config.channelMode === "local") return "openai";
    const metadataModel = metadata?.model?.trim() || "";
    if (metadataModel && !isSeedanceEndpointModel(metadataModel) && !isVideoModelName(metadataModel)) return config.videoProtocol || "openai";
    return metadata?.provider || config.videoProtocol || "openai";
}

function resolveCanvasVideoModel(config: AiConfig, provider: CanvasVideoProvider, metadata?: CanvasNodeMetadata) {
    const metadataModel = metadata?.model?.trim() || "";
    if (metadataModel && !(provider === "volcengine-ark" && isSeedanceEndpointModel(metadataModel)) && (config.channelMode !== "remote" || isVideoModelName(metadataModel))) return metadataModel;
    return (provider === "volcengine-ark" ? config.seedanceModel : config.videoModel) || config.model;
}

function isSeedanceEndpointModel(model?: string) {
    return model?.trim().toLowerCase().startsWith("ep-") || false;
}

function isVideoModelName(model?: string) {
    const name = model?.trim().toLowerCase() || "";
    return ["seedance", "video", "veo", "sora", "kling", "hailuo", "runway", "wan"].some((keyword) => name.includes(keyword));
}

function normalizeCanvasVideoSeconds(value: string, provider: CanvasVideoProvider) {
    const fallback = provider === "volcengine-ark" ? 5 : 6;
    const seconds = Math.floor(Number(value) || fallback);
    const min = provider === "volcengine-ark" ? 4 : 1;
    const max = provider === "volcengine-ark" ? 15 : 20;
    return String(Math.max(min, Math.min(max, seconds)));
}
