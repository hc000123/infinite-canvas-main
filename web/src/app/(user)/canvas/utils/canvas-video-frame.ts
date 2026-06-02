import { nanoid } from "nanoid";

import type { UploadedImage } from "@/services/image-storage";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "../types.ts";
import { fitNodeSize } from "./canvas-node-size.ts";

const FRAME_NODE_SIZE = { width: 340, height: 240 };

export function buildCapturedVideoFrameNode({ videoNode, image, imageMetadata, capturedTime, capturedAt }: { videoNode: CanvasNodeData; image: UploadedImage; imageMetadata: CanvasNodeMetadata; capturedTime: number; capturedAt: string }): {
    frameNode: CanvasNodeData;
    connection: CanvasConnection;
} {
    const frameNodeId = nanoid();
    const imageSize = fitNodeSize(image.width, image.height, FRAME_NODE_SIZE.width, FRAME_NODE_SIZE.height);
    return {
        frameNode: {
            id: frameNodeId,
            type: "image" as CanvasNodeData["type"],
            title: "当前帧",
            position: {
                x: videoNode.position.x + videoNode.width + 72,
                y: videoNode.position.y + videoNode.height / 2 - imageSize.height / 2,
            },
            width: imageSize.width,
            height: imageSize.height,
            metadata: {
                ...imageMetadata,
                prompt: "视频当前帧",
                sourceVideoNodeId: videoNode.id,
                capturedFrameSourceVideoNodeId: videoNode.id,
                capturedFrameTime: roundFrameTime(capturedTime),
                capturedFrameAt: capturedAt,
                capturedFrameSource: "current_frame",
            },
        },
        connection: { id: nanoid(), fromNodeId: videoNode.id, toNodeId: frameNodeId },
    };
}

function roundFrameTime(value: number) {
    return Math.max(0, Math.round(value * 1000) / 1000);
}
