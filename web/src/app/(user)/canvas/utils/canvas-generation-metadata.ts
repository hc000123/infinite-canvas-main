import type { NormalizedVideoTask, VideoGenerationReferenceInput } from "@/services/api/video";
import { defaultSeedanceImageRole, normalizeSeedanceImageRole, type SeedanceImageRoleMode } from "../../../../services/api/video-reference.ts";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceAudio } from "@/types/audio";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/video";
import type { CanvasImageGenerationType, CanvasNodeData, CanvasNodeMetadata, CanvasVideoActionType } from "../types.ts";

type VideoReferenceInputLike = {
    type: "text" | "image" | "video" | "audio";
    nodeId?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
};

type VideoRelationInput = {
    actionType?: CanvasVideoActionType;
    sourceVideoNodeId?: string;
};

export function buildImageGenerationMetadata(type: CanvasImageGenerationType, config: AiConfig, count: number, references: ReferenceImage[]): CanvasNodeMetadata {
    return {
        generationType: type,
        model: config.model,
        size: config.size,
        quality: config.quality,
        count,
        references: references.map(referenceUrl).filter((url): url is string => Boolean(url)),
    };
}

export function buildRetryImageGenerationMetadata(savedImageMetadata: CanvasNodeMetadata | undefined, generationConfig: AiConfig, useReferenceImages: boolean, retryReferenceImages: ReferenceImage[] | null | undefined): CanvasNodeMetadata {
    return savedImageMetadata?.generationType
        ? {
              generationType: savedImageMetadata.generationType,
              model: generationConfig.model,
              size: generationConfig.size,
              quality: generationConfig.quality,
              count: savedImageMetadata.count || 1,
              references: savedImageMetadata.references,
          }
        : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryReferenceImages || []);
}

export function buildVideoGenerationMetadata(config: AiConfig, references: { images: ReferenceImage[]; videos: ReferenceVideo[]; audios?: ReferenceAudio[]; inputs?: VideoGenerationReferenceInput[] }, relation?: VideoRelationInput): CanvasNodeMetadata {
    return {
        model: config.model,
        provider: config.videoProtocol,
        size: config.size,
        seconds: config.videoSeconds,
        vquality: config.vquality,
        duration: config.videoSeconds,
        ratio: config.size,
        resolution: config.vquality,
        generateAudio: config.videoGenerateAudio,
        watermark: config.videoWatermark,
        seed: config.videoSeed?.trim() || undefined,
        returnLastFrame: config.videoProtocol === "volcengine-ark" ? config.returnLastFrame : undefined,
        videoTaskMode: config.videoTaskMode || "generate",
        videoEditType: config.videoEditType || "replace",
        videoExtendDirection: config.videoExtendDirection || "forward",
        videoReferenceImageMode: config.videoReferenceImageMode,
        references: references.images.map(referenceUrl).filter((url): url is string => Boolean(url)),
        referenceRoles: references.images.map((image, index) => ({ nodeId: image.id, kind: "image" as const, role: image.seedanceRole || defaultSeedanceImageRole(index, config.videoReferenceImageMode), index: index + 1 })),
        videoReferences: references.videos.map(referenceVideoUrl).filter((url): url is string => Boolean(url)),
        audioReferences: (references.audios || []).map(referenceAudioUrl).filter((url): url is string => Boolean(url)),
        referenceOrder: references.inputs?.map((input) => ({ nodeId: input.nodeId, kind: input.type, index: mediaReferenceIndex(input, references) + 1 })),
        ...videoRelationMetadata(relation),
    };
}

export function videoTaskMetadata(task: NormalizedVideoTask): CanvasNodeMetadata {
    return compactMetadata({
        taskId: task.id,
        taskStatus: task.status,
        rawTaskStatus: task.rawStatus,
        videoUrl: task.videoUrl,
        lastFrameUrl: task.lastFrameUrl,
        taskCreatedAt: task.createdAt,
        taskUpdatedAt: task.updatedAt,
        executionExpiresAfter: task.executionExpiresAfter,
        videoUrlExpiresAt: task.videoUrlExpiresAt,
        seed: task.seed === undefined ? undefined : String(task.seed),
        resolution: task.resolution,
        ratio: task.ratio,
        duration: task.duration === undefined ? undefined : String(task.duration),
        generateAudio: task.generateAudio === undefined ? undefined : String(task.generateAudio),
        watermark: task.watermark === undefined ? undefined : String(task.watermark),
        aiTaskId: task.aiTaskId,
        upstreamTaskId: task.upstreamTaskId || task.id,
        aiTaskStatus: task.aiTaskStatus || task.status,
        aiTaskCredits: task.aiTaskCredits,
        creditLogId: task.creditLogId,
        creditsRefunded: task.creditsRefunded,
        refundedAt: task.refundedAt,
        finishedAt: task.finishedAt,
    });
}

export function buildVideoReferenceInput(images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[] = [], inputs?: VideoReferenceInputLike[], mode?: SeedanceImageRoleMode) {
    const imageReferences = images.map((image, index) => ({ ...image, seedanceRole: image.seedanceRole || defaultSeedanceImageRole(index, mode) }));
    const imageById = new Map(imageReferences.map((image) => [image.id, image]));
    return {
        images: imageReferences,
        videos,
        audios,
        inputs:
            inputs?.flatMap((input): VideoGenerationReferenceInput[] => {
                if (input.type === "image" && input.image) return [{ type: "image", nodeId: input.nodeId, image: imageById.get(input.image.id) || input.image }];
                if (input.type === "video" && input.video) return [{ type: "video", nodeId: input.nodeId, video: input.video }];
                if (input.type === "audio" && input.audio) return [{ type: "audio", nodeId: input.nodeId, audio: input.audio }];
                return [];
            }) || directVideoReferenceInputs(imageReferences, videos, audios),
    };
}

export function resolveVideoGenerationRelation(
    config: Pick<AiConfig, "videoTaskMode" | "videoProtocol">,
    sourceNode: CanvasNodeData | undefined,
    references: { videos?: ReferenceVideo[]; inputs?: VideoGenerationReferenceInput[] },
): VideoRelationInput | undefined {
    const sourceVideoNodeId = sourceNode?.type === "video" && sourceNode.metadata?.content ? sourceNode.id : references.inputs?.find((input) => input.type === "video" && input.nodeId)?.nodeId || references.videos?.[0]?.id;
    if (config.videoProtocol === "volcengine-ark" && (config.videoTaskMode === "edit" || config.videoTaskMode === "extend") && sourceVideoNodeId) return { actionType: config.videoTaskMode, sourceVideoNodeId };
    if (sourceNode?.type === "video" && sourceNode.metadata?.content) return { actionType: "variant", sourceVideoNodeId: sourceNode.id };
    return undefined;
}

export function directVideoReferenceInputs(images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]): VideoGenerationReferenceInput[] {
    return [...images.map((image) => ({ type: "image" as const, nodeId: image.id, image })), ...videos.map((video) => ({ type: "video" as const, nodeId: video.id, video })), ...audios.map((audio) => ({ type: "audio" as const, nodeId: audio.id, audio }))];
}

export function storedReferenceImageRole(metadata: CanvasNodeMetadata, index: number) {
    return normalizeSeedanceImageRole(metadata.referenceRoles?.find((item) => item.kind === "image" && item.index === index + 1)?.role) || defaultSeedanceImageRole(index, metadata.videoReferenceImageMode);
}

function referenceUrl(image: ReferenceImage) {
    return image.assetUri || image.storageKey || image.url || (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined);
}

function referenceVideoUrl(video: ReferenceVideo) {
    return video.storageKey || (!video.url.startsWith("blob:") ? video.url : undefined);
}

function referenceAudioUrl(audio: ReferenceAudio) {
    return audio.storageKey || (!audio.url.startsWith("blob:") ? audio.url : undefined);
}

function mediaReferenceIndex(input: VideoGenerationReferenceInput, references: { images: ReferenceImage[]; videos: ReferenceVideo[]; audios?: ReferenceAudio[] }) {
    const list = input.type === "image" ? references.images : input.type === "video" ? references.videos : references.audios || [];
    const id = input.type === "image" ? input.image.id : input.type === "video" ? input.video.id : input.audio.id;
    return Math.max(
        0,
        list.findIndex((item) => item.id === id),
    );
}

function videoRelationMetadata(relation?: VideoRelationInput): CanvasNodeMetadata {
    if (!relation?.actionType) return { actionType: "generate", videoActionType: "generate" };
    if (relation.actionType === "variant") {
        return {
            actionType: "variant",
            videoActionType: "variant",
            relationType: "variant",
            sourceVideoNodeId: relation.sourceVideoNodeId,
            variantOfNodeId: relation.sourceVideoNodeId,
        };
    }
    if (relation.actionType === "continue") {
        return {
            actionType: "continue",
            videoActionType: "continue",
            relationType: "continuation",
            sourceVideoNodeId: relation.sourceVideoNodeId,
            continuationOfNodeId: relation.sourceVideoNodeId,
        };
    }
    if (relation.actionType === "edit" || relation.actionType === "extend") {
        return {
            actionType: relation.actionType,
            videoActionType: relation.actionType,
            relationType: "derivative",
            sourceVideoNodeId: relation.sourceVideoNodeId,
        };
    }
    return {
        actionType: relation.actionType,
        videoActionType: relation.actionType,
        sourceVideoNodeId: relation.sourceVideoNodeId,
    };
}

function compactMetadata(metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== "")) as CanvasNodeMetadata;
}
