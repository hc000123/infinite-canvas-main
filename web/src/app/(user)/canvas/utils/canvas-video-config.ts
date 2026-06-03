import type { AiConfig } from "@/stores/use-config-store";
import { normalizeSeedanceImageRoleMode } from "../../../../services/api/video-reference.ts";
import type { CanvasNodeMetadata } from "../types";

export type CanvasVideoProvider = AiConfig["videoProtocol"];
type CanvasVideoDefaultKey = "videoProtocol" | "videoModel" | "seedanceModel" | "seedanceEndpointId" | "size" | "videoSeconds" | "vquality" | "videoGenerateAudio" | "videoWatermark" | "videoSeed" | "returnLastFrame" | "videoReferenceImageMode";

export function buildCanvasVideoConfig(config: AiConfig, metadata?: CanvasNodeMetadata): AiConfig {
    const provider = resolveCanvasVideoProvider(config, metadata);
    const model = resolveCanvasVideoModel(config, provider, metadata);
    return {
        ...config,
        videoProtocol: provider,
        model,
        videoModel: provider === "openai" ? model : config.videoModel,
        seedanceModel: provider === "volcengine-ark" ? model : config.seedanceModel,
        size: metadata?.size || config.size,
        videoSeconds: normalizeCanvasVideoSeconds(metadata?.seconds || config.videoSeconds, provider),
        vquality: metadata?.vquality || config.vquality,
        videoGenerateAudio: metadata?.generateAudio || config.videoGenerateAudio,
        videoWatermark: metadata?.watermark || config.videoWatermark,
        videoSeed: metadata?.seed || config.videoSeed,
        returnLastFrame: metadata?.returnLastFrame || config.returnLastFrame,
        videoTaskMode: provider === "volcengine-ark" ? metadata?.videoTaskMode || config.videoTaskMode || "generate" : "generate",
        videoEditType: metadata?.videoEditType || config.videoEditType || "replace",
        videoExtendDirection: metadata?.videoExtendDirection || config.videoExtendDirection || "forward",
        videoReferenceImageMode: normalizeSeedanceImageRoleMode(metadata?.videoReferenceImageMode || config.videoReferenceImageMode),
    };
}

export function buildCanvasVideoProviderPatch(config: AiConfig, provider: CanvasVideoProvider): Pick<CanvasNodeMetadata, "provider" | "model"> {
    return {
        provider,
        model: resolveCanvasVideoModel(config, provider),
    };
}

export function buildCanvasVideoModePatch(config: AiConfig): Partial<CanvasNodeMetadata> {
    const provider = config.channelMode === "local" ? resolveCanvasVideoProvider(config) : "openai";
    return {
        generationMode: "video",
        provider,
        model: config.channelMode === "local" ? resolveCanvasVideoModel(config, provider) : config.videoModel || config.model,
        size: config.size,
        seconds: normalizeCanvasVideoSeconds(config.videoSeconds, provider),
        vquality: config.vquality,
        generateAudio: config.videoGenerateAudio,
        watermark: config.videoWatermark,
        seed: config.videoSeed,
        returnLastFrame: config.returnLastFrame,
        videoTaskMode: "generate",
        videoEditType: config.videoEditType || "replace",
        videoExtendDirection: config.videoExtendDirection || "forward",
        videoReferenceImageMode: normalizeSeedanceImageRoleMode(config.videoReferenceImageMode),
    };
}

export function buildCanvasVideoDefaultsPatch(config: AiConfig, metadata: Partial<CanvasNodeMetadata>) {
    const provider = metadata.provider || config.videoProtocol || "openai";
    const patch: Partial<Pick<AiConfig, CanvasVideoDefaultKey>> = {};
    if (metadata.provider) patch.videoProtocol = metadata.provider;
    if (metadata.model) {
        if (provider === "volcengine-ark") {
            if (metadata.model.toLowerCase().startsWith("ep-")) patch.seedanceEndpointId = metadata.model;
            else patch.seedanceModel = metadata.model;
        } else {
            patch.videoModel = metadata.model;
        }
    }
    if (metadata.size) patch.size = metadata.size;
    if (metadata.seconds) patch.videoSeconds = normalizeCanvasVideoSeconds(metadata.seconds, provider);
    if (metadata.vquality) patch.vquality = metadata.vquality;
    if (metadata.generateAudio) patch.videoGenerateAudio = metadata.generateAudio;
    if (metadata.watermark) patch.videoWatermark = metadata.watermark;
    if (metadata.seed !== undefined) patch.videoSeed = metadata.seed;
    if (metadata.returnLastFrame) patch.returnLastFrame = metadata.returnLastFrame;
    if (metadata.videoReferenceImageMode) patch.videoReferenceImageMode = normalizeSeedanceImageRoleMode(metadata.videoReferenceImageMode);
    return patch;
}

function resolveCanvasVideoProvider(config: AiConfig, metadata?: CanvasNodeMetadata): CanvasVideoProvider {
    return metadata?.provider || config.videoProtocol || "openai";
}

function resolveCanvasVideoModel(config: AiConfig, provider: CanvasVideoProvider, metadata?: CanvasNodeMetadata) {
    return metadata?.model?.trim() || (provider === "volcengine-ark" ? config.seedanceEndpointId || config.seedanceModel : config.videoModel) || config.model;
}

function normalizeCanvasVideoSeconds(value: string, provider: CanvasVideoProvider) {
    const fallback = provider === "volcengine-ark" ? 5 : 6;
    const seconds = Math.floor(Number(value) || fallback);
    const min = provider === "volcengine-ark" ? 4 : 1;
    const max = provider === "volcengine-ark" ? 15 : 20;
    return String(Math.max(min, Math.min(max, seconds)));
}
