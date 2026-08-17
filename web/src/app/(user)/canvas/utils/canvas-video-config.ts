import type { AiConfig } from "../../../../stores/use-config-store.ts";
import { protocolForModel, resolveGenerationModel } from "../../../../lib/ai-model-catalog.ts";
import { normalizeDreaminaVideoSettings, resolveDreaminaVideoCapability } from "../../../../lib/dreamina-video-capabilities.ts";
import type { AdminPublicSettings } from "../../../../services/api/admin.ts";
import { inferVideoReferenceMode, normalizeSeedanceImageRoleMode, normalizeVideoReferenceMode } from "../../../../services/api/video-reference.ts";
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
    | "videoReferenceImageMode"
    | "videoReferenceMode";

export function buildCanvasVideoConfig(config: AiConfig, metadata?: CanvasNodeMetadata): AiConfig {
    const channelMode = "remote";
    const model = resolveGenerationModel({ config, capability: "video", nodeModel: metadata?.model });
    const provider = protocolForModel(config, model);
    const metadataDuration = metadata?.taskId ? "" : metadata?.duration;
    const seconds = normalizeCanvasVideoSeconds(metadata?.seconds || metadataDuration || config.videoSeconds, provider, model);
    return {
        ...config,
        channelMode,
        videoProtocol: provider,
        model,
        videoModel: model,
        seedanceModel: provider === "volcengine-ark" ? model : config.seedanceModel,
        seedanceEndpointId: "",
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
        videoReferenceMode: resolveCanvasVideoReferenceMode(config, metadata, provider),
        videoTransitionPrompts: metadata?.videoTransitionPrompts || [],
    };
}

export function resolveCanvasVideoChannelConfig(_localConfig: AiConfig, effectiveConfig: AiConfig, _modelChannel: AdminPublicSettings["modelChannel"] | null | undefined, _channelMode?: AiConfig["channelMode"]): AiConfig {
    return { ...effectiveConfig, channelMode: "remote" };
}

export function buildCanvasVideoModePatch(config: AiConfig): Partial<CanvasNodeMetadata> {
    const model = resolveGenerationModel({ config, capability: "video" });
    const provider = protocolForModel(config, model);
    const seconds = normalizeCanvasVideoSeconds(config.videoSeconds, provider, model);
    return {
        generationMode: "video",
        channelMode: "remote",
        model,
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
        videoReferenceMode: normalizeVideoReferenceMode(config.videoReferenceMode),
    };
}

export function buildCanvasVideoModelPatch(config: AiConfig, model: string): Partial<CanvasNodeMetadata> {
    const provider = protocolForModel(config, model);
    const mode = normalizeVideoReferenceMode(config.videoReferenceMode);
    const capabilityMode = mode === "auto" ? "text2video" : mode;
    const currentModel = resolveGenerationModel({ config, capability: "video" });
    const currentCapability = resolveDreaminaVideoCapability({ protocol: protocolForModel(config, currentModel), model: currentModel, mode: capabilityMode });
    const nextCapability = resolveDreaminaVideoCapability({ protocol: provider, model, mode: capabilityMode });
    const seconds = currentCapability && nextCapability && Number(config.videoSeconds) === currentCapability.duration.max && nextCapability.duration.max > currentCapability.duration.max
        ? String(nextCapability.duration.max)
        : config.videoSeconds;
    const normalized = normalizeDreaminaVideoSettings({
        protocol: provider,
        model,
        mode: capabilityMode,
        seconds,
        resolution: config.vquality,
    });
    return {
        model,
        provider,
        seconds: normalized.seconds,
        duration: normalized.seconds,
        vquality: normalized.resolution,
    };
}

export function buildCanvasVideoDefaultsPatch(config: AiConfig, metadata: Partial<CanvasNodeMetadata>) {
    const model = resolveGenerationModel({ config, capability: "video", nodeModel: metadata.model });
    const provider = protocolForModel(config, model);
    const patch: Partial<Pick<AiConfig, CanvasVideoDefaultKey>> = {};
    if (metadata.channelMode) patch.channelMode = "remote";
    if (metadata.model && model) {
        patch.videoProtocol = provider;
        patch.videoModel = model;
        patch.seedanceEndpointId = "";
        if (provider === "volcengine-ark") patch.seedanceModel = model;
    }
    if (metadata.size) patch.size = metadata.size;
    if (metadata.seconds || metadata.duration) patch.videoSeconds = normalizeCanvasVideoSeconds(metadata.seconds || metadata.duration || "", provider, model);
    if (metadata.vquality) patch.vquality = metadata.vquality;
    if (metadata.generateAudio) patch.videoGenerateAudio = metadata.generateAudio;
    if (metadata.watermark) patch.videoWatermark = metadata.watermark;
    if (metadata.seed !== undefined) patch.videoSeed = metadata.seed;
    if (metadata.videoPromptReviewEnabled) patch.videoPromptReviewEnabled = metadata.videoPromptReviewEnabled;
    if (metadata.returnLastFrame) patch.returnLastFrame = metadata.returnLastFrame;
    if (metadata.videoReferenceImageMode) patch.videoReferenceImageMode = normalizeSeedanceImageRoleMode(metadata.videoReferenceImageMode);
    if (metadata.videoReferenceMode) patch.videoReferenceMode = normalizeVideoReferenceMode(metadata.videoReferenceMode);
    return patch;
}

function resolveCanvasVideoReferenceMode(config: AiConfig, metadata: CanvasNodeMetadata | undefined, provider: CanvasVideoProvider) {
    const explicit = normalizeVideoReferenceMode(metadata?.videoReferenceMode);
    if (explicit !== "auto") return explicit;
    if (provider !== "jimeng-cli" || !metadata || metadata.videoReferenceMode === "auto") return normalizeVideoReferenceMode(config.videoReferenceMode);
    const savedReferenceCount = (metadata.references?.length || 0) + (metadata.videoReferences?.length || 0) + (metadata.audioReferences?.length || 0);
    if (!savedReferenceCount) return normalizeVideoReferenceMode(config.videoReferenceMode);
    return inferVideoReferenceMode({
        imageCount: metadata.references?.length || 0,
        videoCount: metadata.videoReferences?.length || 0,
        audioCount: metadata.audioReferences?.length || 0,
        imageRoleMode: metadata.videoReferenceImageMode,
    });
}

function normalizeCanvasVideoSeconds(value: string, provider: CanvasVideoProvider, model: string) {
    const fallback = 6;
    const seconds = Math.floor(Number(value) || fallback);
    const capability = resolveDreaminaVideoCapability({ protocol: provider, model, mode: "text2video" });
    const min = capability?.duration.min ?? (isSeedanceDurationProtocol(provider) ? 4 : 1);
    const max = capability?.duration.max ?? (isSeedanceDurationProtocol(provider) ? 15 : 20);
    return String(Math.max(min, Math.min(max, seconds)));
}

function isSeedanceDurationProtocol(provider: CanvasVideoProvider) {
    return provider === "volcengine-ark" || provider === "jimeng-cli" || provider === "xinglian-cloud" || provider === "minimax";
}
