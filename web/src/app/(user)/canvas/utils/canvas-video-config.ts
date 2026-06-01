import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeMetadata } from "../types";

export type CanvasVideoProvider = AiConfig["videoProtocol"];

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
        videoSeconds: metadata?.seconds || config.videoSeconds,
        vquality: metadata?.vquality || config.vquality,
        videoGenerateAudio: metadata?.generateAudio || config.videoGenerateAudio,
        videoWatermark: metadata?.watermark || config.videoWatermark,
        videoSeed: metadata?.seed || config.videoSeed,
    };
}

export function buildCanvasVideoProviderPatch(config: AiConfig, provider: CanvasVideoProvider): Pick<CanvasNodeMetadata, "provider" | "model"> {
    return {
        provider,
        model: resolveCanvasVideoModel(config, provider),
    };
}

export function buildCanvasVideoModePatch(config: AiConfig): Pick<CanvasNodeMetadata, "generationMode" | "provider" | "model"> {
    const provider = config.channelMode === "local" ? resolveCanvasVideoProvider(config) : "openai";
    return {
        generationMode: "video",
        provider,
        model: config.channelMode === "local" ? resolveCanvasVideoModel(config, provider) : config.videoModel || config.model,
    };
}

function resolveCanvasVideoProvider(config: AiConfig, metadata?: CanvasNodeMetadata): CanvasVideoProvider {
    return metadata?.provider || config.videoProtocol || "openai";
}

function resolveCanvasVideoModel(config: AiConfig, provider: CanvasVideoProvider, metadata?: CanvasNodeMetadata) {
    return metadata?.model?.trim() || (provider === "volcengine-ark" ? config.seedanceModel : config.videoModel) || config.model;
}
