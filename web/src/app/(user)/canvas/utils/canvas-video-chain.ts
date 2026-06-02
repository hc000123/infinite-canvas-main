import { nanoid } from "nanoid";

import type { UploadedImage } from "@/services/image-storage";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "../types.ts";
import { fitNodeSize, nodeSizeFromRatio } from "./canvas-node-size.ts";

type ContinuousVideoChainConfig = {
    model: string;
    size: string;
    videoProtocol: "openai" | "volcengine-ark";
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoSeed?: string;
    returnLastFrame?: string;
};

const CONTINUOUS_CHAIN_IMAGE_SIZE = { width: 340, height: 240 };
const CONTINUOUS_CHAIN_VIDEO_SIZE = { width: 420, height: 236 };

export function buildContinuousVideoChain({ videoNode, lastFrameImage, lastFrameMetadata, config }: { videoNode: CanvasNodeData; lastFrameImage: UploadedImage; lastFrameMetadata: CanvasNodeMetadata; config: ContinuousVideoChainConfig }): {
    lastFrameNode: CanvasNodeData;
    nextVideoNode: CanvasNodeData;
    connections: CanvasConnection[];
} {
    const gap = 72;
    const imageSpec = CONTINUOUS_CHAIN_IMAGE_SIZE;
    const videoSpec = nodeSizeFromRatio(config.size, CONTINUOUS_CHAIN_VIDEO_SIZE.width, CONTINUOUS_CHAIN_VIDEO_SIZE.height) || CONTINUOUS_CHAIN_VIDEO_SIZE;
    const imageSize = fitNodeSize(lastFrameImage.width, lastFrameImage.height, imageSpec.width, imageSpec.height);
    const lastFrameNodeId = nanoid();
    const nextVideoNodeId = nanoid();
    const lastFrameNode: CanvasNodeData = {
        id: lastFrameNodeId,
        type: "image" as CanvasNodeData["type"],
        title: "上一段尾帧",
        position: {
            x: videoNode.position.x + videoNode.width + gap,
            y: videoNode.position.y + videoNode.height / 2 - imageSize.height / 2,
        },
        width: imageSize.width,
        height: imageSize.height,
        metadata: { ...lastFrameMetadata, prompt: "Seedance return_last_frame" },
    };
    const nextVideoNode: CanvasNodeData = {
        id: nextVideoNodeId,
        type: "video" as CanvasNodeData["type"],
        title: "下一段视频",
        position: {
            x: lastFrameNode.position.x + imageSize.width + gap,
            y: lastFrameNode.position.y + imageSize.height / 2 - videoSpec.height / 2,
        },
        width: videoSpec.width,
        height: videoSpec.height,
        metadata: {
            status: "idle",
            generationMode: "video",
            provider: config.videoProtocol,
            model: config.model,
            size: config.size,
            seconds: config.videoSeconds,
            vquality: config.vquality,
            duration: config.videoSeconds,
            ratio: config.size,
            resolution: config.vquality,
            generateAudio: config.videoGenerateAudio,
            watermark: config.videoWatermark,
            seed: config.videoSeed?.trim() || undefined,
            returnLastFrame: config.returnLastFrame,
            videoReferenceImageMode: "continue",
            actionType: "continue",
            videoActionType: "continue",
            relationType: "continuation",
            sourceVideoNodeId: videoNode.id,
            continuationOfNodeId: videoNode.id,
            referenceRoles: [{ nodeId: lastFrameNodeId, kind: "image", role: "first_frame", index: 1 }],
        },
    };
    return {
        lastFrameNode,
        nextVideoNode,
        connections: [
            { id: nanoid(), fromNodeId: videoNode.id, toNodeId: lastFrameNodeId },
            { id: nanoid(), fromNodeId: lastFrameNodeId, toNodeId: nextVideoNodeId },
        ],
    };
}
