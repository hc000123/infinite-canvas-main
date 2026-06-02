import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceAudio } from "@/types/audio";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/video";

import { buildVideoReferenceInput, directVideoReferenceInputs, resolveVideoGenerationRelation } from "./canvas-generation-metadata.ts";
import type { CanvasNodeData } from "../types.ts";

type VideoReferenceInputLike = Parameters<typeof buildVideoReferenceInput>[3];

export type VideoReferenceSet = {
    images: ReferenceImage[];
    videos: ReferenceVideo[];
    audios: ReferenceAudio[];
    inputs?: VideoReferenceInputLike;
};

type BuildVideoGenerationPlanInput = {
    config: Pick<AiConfig, "videoTaskMode" | "videoProtocol" | "videoReferenceImageMode">;
    sourceNode?: CanvasNodeData;
    sourceReferences: VideoReferenceSet;
    contextReferences: VideoReferenceSet;
    storedVariantReferences?: VideoReferenceSet;
};

export function shouldCreateVideoVariant(config: Pick<AiConfig, "videoTaskMode">, sourceNode?: CanvasNodeData) {
    return sourceNode?.type === "video" && Boolean(sourceNode.metadata?.content) && config.videoTaskMode !== "edit" && config.videoTaskMode !== "extend";
}

export function buildVideoGenerationPlan({ config, sourceNode, sourceReferences, contextReferences, storedVariantReferences }: BuildVideoGenerationPlanInput) {
    const isVariant = shouldCreateVideoVariant(config, sourceNode);
    const selectedReferences = isVariant ? storedVariantReferences || emptyReferences() : sourceReferences;
    const selectedInputs = selectedReferences.inputs?.length ? selectedReferences.inputs : directVideoReferenceInputs(selectedReferences.images, selectedReferences.videos, selectedReferences.audios);
    const references = selectedInputs.length
        ? buildVideoReferenceInput(selectedReferences.images, selectedReferences.videos, selectedReferences.audios, selectedInputs, config.videoReferenceImageMode)
        : buildVideoReferenceInput(contextReferences.images, contextReferences.videos, contextReferences.audios, contextReferences.inputs, config.videoReferenceImageMode);
    const relation = resolveVideoGenerationRelation(config, sourceNode, references);
    return {
        references,
        relation,
        isVariant,
        sourceVideoRequiredError: config.videoProtocol === "volcengine-ark" && (config.videoTaskMode === "edit" || config.videoTaskMode === "extend") && !relation?.sourceVideoNodeId ? "请先连接一个上游视频节点作为源视频" : "",
    };
}

function emptyReferences(): VideoReferenceSet {
    return { images: [], videos: [], audios: [] };
}
