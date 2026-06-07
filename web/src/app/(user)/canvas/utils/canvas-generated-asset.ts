import type { AiConfig } from "@/stores/use-config-store";
import type { AssetWriteInput } from "@/stores/use-asset-store";

import type { CanvasNodeData, CanvasNodeMetadata, CanvasVideoActionType } from "../types.ts";
import type { CanvasEpisodeContext } from "./canvas-episode-context.ts";
import { canvasProjectPresetConfig, type CanvasProjectPreset } from "./canvas-project-preset.ts";

type CanvasGeneratedAssetContext = {
    projectId: string;
    projectTitle: string;
    prompt: string;
    effectivePrompt: string;
    config: AiConfig;
    createdAt: string;
    projectPreset?: CanvasProjectPreset;
    episodeContext?: CanvasEpisodeContext;
};

export function buildGeneratedImageAsset(node: CanvasNodeData, context: CanvasGeneratedAssetContext): AssetWriteInput | null {
    if (node.type !== "image" || node.metadata?.status !== "success") return null;
    const metadata = node.metadata;
    const content = metadata.content;
    if (!content) return null;
    const dataUrl = metadata.storageKey ? "" : content;
    return {
        kind: "image",
        title: node.title || context.prompt.slice(0, 32) || "画布生成图片",
        coverUrl: content,
        tags: [],
        source: "Canvas",
        data: {
            dataUrl,
            storageKey: metadata.storageKey,
            width: metadata.naturalWidth || node.width,
            height: metadata.naturalHeight || node.height,
            bytes: metadata.bytes || dataUrlByteSize(dataUrl),
            mimeType: metadata.mimeType || "image/png",
        },
        metadata: {
            source: "canvas",
            nodeId: node.id,
            prompt: context.prompt,
            generation: buildGeneratedAssetMetadata(node, context, imageActionType(metadata), "openai"),
            sourceRefs: [node.id],
            volcengineAsset: metadata.volcengineAsset,
        },
    };
}

export function buildGeneratedVideoAsset(node: CanvasNodeData, context: CanvasGeneratedAssetContext): AssetWriteInput | null {
    if (node.type !== "video" || node.metadata?.status !== "success") return null;
    const metadata = node.metadata;
    const content = metadata.content;
    if (!content) return null;
    return {
        kind: "video",
        title: node.title || context.prompt.slice(0, 32) || "画布生成视频",
        coverUrl: "",
        tags: [],
        source: "Canvas",
        data: {
            url: content,
            storageKey: metadata.storageKey,
            width: metadata.naturalWidth || node.width,
            height: metadata.naturalHeight || node.height,
            bytes: metadata.bytes || 0,
            mimeType: metadata.mimeType || "video/mp4",
        },
        metadata: {
            source: "canvas",
            nodeId: node.id,
            prompt: context.prompt,
            generation: {
                ...buildGeneratedAssetMetadata(node, context, videoActionType(metadata)),
                ...buildGeneratedVideoStoryboardMetadata(metadata),
                taskId: metadata.taskId,
                upstreamTaskId: metadata.upstreamTaskId || metadata.taskId,
            },
            sourceRefs: [node.id],
        },
    };
}

export function buildGeneratedVideoStoryboardMetadata(metadata: CanvasNodeMetadata) {
    return {
        storyboardGroupId: metadata.storyboardGroupId || null,
        storyboardShotId: metadata.storyboardShotId || null,
        shotGroupId: metadata.shotGroupId || null,
        shotIds: metadata.shotIds || [],
    };
}

function buildGeneratedAssetMetadata(node: CanvasNodeData, context: CanvasGeneratedAssetContext, actionType: CanvasVideoActionType | "generate" | "edit", providerOverride?: string) {
    return {
        source: "canvas",
        projectId: context.projectId,
        projectTitle: context.projectTitle,
        episodeId: context.episodeContext?.episodeId || node.metadata?.episodeId,
        episodeTitle: context.episodeContext?.episodeTitle || node.metadata?.episodeTitle,
        scriptId: context.episodeContext?.scriptId || node.metadata?.scriptId,
        scriptSnapshot: context.episodeContext?.scriptSnapshot || node.metadata?.scriptSnapshot,
        assetBreakdownItemId: node.metadata?.assetBreakdownItemId,
        agentRunId: node.metadata?.agentRunId,
        agentConfigId: node.metadata?.agentConfigId,
        agentConfigVersion: node.metadata?.agentConfigVersion,
        assetBriefId: node.metadata?.assetBriefId,
        briefId: node.metadata?.briefId,
        briefKind: node.metadata?.briefKind,
        briefMode: node.metadata?.briefMode,
        briefSnapshot: node.metadata?.briefSnapshot,
        finalPrompt: node.metadata?.finalPrompt,
        referenceAssets: node.metadata?.referenceAssets || [],
        sourceType: node.metadata?.sourceType,
        sourceId: node.metadata?.sourceId,
        productionBibleItemId: node.metadata?.productionBibleItemId,
        shotGroupId: node.metadata?.shotGroupId,
        shotIds: node.metadata?.shotIds || [],
        productionPackageId: node.metadata?.productionPackageId,
        productionPackageLabel: node.metadata?.productionPackageLabel,
        productionPackageTitle: node.metadata?.productionPackageTitle,
        productionVideoVersionId: node.metadata?.productionVideoVersionId,
        productionVideoVersionNumber: node.metadata?.productionVideoVersionNumber,
        isCurrentProductionVersion: node.metadata?.isCurrentProductionVersion,
        nodeId: node.id,
        prompt: context.prompt,
        effectivePrompt: context.effectivePrompt,
        model: node.metadata?.model || context.config.model,
        provider: providerOverride || node.metadata?.provider || context.config.videoProtocol || "openai",
        actionType,
        references: buildAssetGenerationReferences(node.metadata),
        productionBibleRefs: [],
        config: buildAssetGenerationConfig(node.metadata, context.config, context.projectPreset),
        aiTaskId: node.metadata?.aiTaskId,
        upstreamTaskId: node.metadata?.upstreamTaskId || node.metadata?.taskId,
        aiTaskStatus: node.metadata?.aiTaskStatus || node.metadata?.taskStatus,
        aiTaskCredits: node.metadata?.aiTaskCredits,
        creditLogId: node.metadata?.creditLogId,
        creditsRefunded: node.metadata?.creditsRefunded,
        refundedAt: node.metadata?.refundedAt,
        finishedAt: node.metadata?.finishedAt,
        createdAt: context.createdAt,
    };
}

function buildAssetGenerationReferences(metadata: CanvasNodeMetadata | undefined) {
    return {
        images: metadata?.references || [],
        videos: metadata?.videoReferences || [],
        audios: metadata?.audioReferences || [],
        roles: metadata?.referenceRoles || [],
        order: metadata?.referenceOrder || [],
    };
}

function buildAssetGenerationConfig(metadata: CanvasNodeMetadata | undefined, config: AiConfig, projectPreset?: CanvasProjectPreset) {
    return {
        model: metadata?.model || config.model,
        provider: metadata?.provider || config.videoProtocol || "openai",
        size: metadata?.size || config.size,
        quality: metadata?.quality || config.quality,
        count: metadata?.count || config.count,
        seconds: metadata?.seconds || config.videoSeconds,
        duration: metadata?.duration || config.videoSeconds,
        ratio: metadata?.ratio || config.size,
        resolution: metadata?.resolution || config.vquality,
        generateAudio: metadata?.generateAudio || config.videoGenerateAudio,
        watermark: metadata?.watermark || config.videoWatermark,
        seed: metadata?.seed || config.videoSeed || undefined,
        videoTaskMode: metadata?.videoTaskMode || config.videoTaskMode,
        videoEditType: metadata?.videoEditType || config.videoEditType,
        videoExtendDirection: metadata?.videoExtendDirection || config.videoExtendDirection,
        videoReferenceImageMode: metadata?.videoReferenceImageMode || config.videoReferenceImageMode,
        projectPreset: canvasProjectPresetConfig(projectPreset),
    };
}

function imageActionType(metadata: CanvasNodeMetadata) {
    return metadata.generationType === "edit" ? "edit" : "generate";
}

function videoActionType(metadata: CanvasNodeMetadata): CanvasVideoActionType {
    if (metadata.videoActionType) return metadata.videoActionType;
    if (metadata.actionType) return metadata.actionType;
    if (metadata.videoTaskMode === "edit" || metadata.videoTaskMode === "extend") return metadata.videoTaskMode;
    return "generate";
}

function dataUrlByteSize(dataUrl: string) {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return dataUrl.length;
    return Math.floor((base64.length * 3) / 4);
}
