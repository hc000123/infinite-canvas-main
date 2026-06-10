import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "../types.ts";
import { buildCanvasVideoConfig } from "./canvas-video-config.ts";

export function buildGenerationConfig(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasGenerationMode, defaults: AiConfig): AiConfig {
    const defaultModel = mode === "image" ? config.imageModel : mode === "video" ? config.videoModel : config.textModel;
    if (mode === "video") {
        return {
            ...buildCanvasVideoConfig(config, videoGenerationMetadata(node)),
            count: String(node?.metadata?.count || config.count || defaults.count),
        };
    }
    return {
        ...config,
        model: node?.metadata?.model || defaultModel || config.model || defaults.model,
        quality: node?.metadata?.quality || config.quality || defaults.quality,
        size: node?.metadata?.size || config.size || defaults.size,
        videoSeconds: node?.metadata?.seconds || config.videoSeconds || defaults.videoSeconds,
        vquality: node?.metadata?.vquality || config.vquality || defaults.vquality,
        videoGenerateAudio: node?.metadata?.generateAudio || config.videoGenerateAudio || defaults.videoGenerateAudio,
        videoWatermark: node?.metadata?.watermark || config.videoWatermark || defaults.videoWatermark,
        videoSeed: node?.metadata?.seed || config.videoSeed || defaults.videoSeed,
        count: String(node?.metadata?.count || (mode === "image" ? 3 : config.count) || defaults.count),
    };
}

function videoGenerationMetadata(node: CanvasNodeData | undefined): CanvasNodeMetadata | undefined {
    if (!node?.metadata) return undefined;
    if (node.type === "config" || node.type === "video") return node.metadata;
    return {
        ...node.metadata,
        duration: node.metadata.seconds ? node.metadata.duration : undefined,
    };
}

export function buildRetryGenerationConfig({
    config,
    sourceNode,
    targetNode,
    savedImageMetadata,
    defaults,
}: {
    config: AiConfig;
    sourceNode: CanvasNodeData;
    targetNode: CanvasNodeData;
    savedImageMetadata?: CanvasNodeMetadata;
    defaults: AiConfig;
}): AiConfig {
    if (savedImageMetadata?.generationType) {
        return {
            ...config,
            model: savedImageMetadata.model || config.imageModel || config.model,
            quality: savedImageMetadata.quality || config.quality,
            size: savedImageMetadata.size || config.size,
            count: "1",
        };
    }
    return {
        ...buildGenerationConfig(config, sourceNode, targetNode.type === "text" ? "text" : targetNode.type === "video" ? "video" : "image", defaults),
        count: "1",
    };
}
