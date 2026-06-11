import type { UploadedFile } from "@/services/file-storage";
import type { UploadedImage } from "@/services/image-storage";

import { NODE_DEFAULT_SIZE, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../constants.ts";
import type { CanvasNodeData, CanvasNodeMetadata, Position } from "../types.ts";
import { fitNodeSize } from "./canvas-node-size.ts";

type UploadedNodeInput<T> = {
    id: string;
    title: string;
    center: Position;
    file: T;
    metadata: CanvasNodeMetadata;
    forcedSize?: { width: number; height: number };
};

type ReplaceUploadedNodeInput<T> = {
    currentNode: CanvasNodeData;
    title: string;
    file: T;
    metadata: CanvasNodeMetadata;
};

export function buildUploadedImageFileNode({ id, title, center, file, metadata, forcedSize }: UploadedNodeInput<UploadedImage>): CanvasNodeData {
    const size = forcedSize || fitNodeSize(file.width, file.height);
    return {
        id,
        type: "image" as CanvasNodeData["type"],
        title,
        position: centeredPosition(center, size),
        width: size.width,
        height: size.height,
        metadata,
    };
}

export function buildUploadedVideoFileNode({ id, title, center, file, metadata, forcedSize }: UploadedNodeInput<UploadedFile>): CanvasNodeData {
    const size = forcedSize || videoNodeSize(file);
    return {
        id,
        type: "video" as CanvasNodeData["type"],
        title,
        position: centeredPosition(center, size),
        width: size.width,
        height: size.height,
        metadata,
    };
}

export function buildUploadedAudioFileNode({ id, title, center, metadata }: UploadedNodeInput<UploadedFile>): CanvasNodeData {
    const spec = NODE_DEFAULT_SIZE.audio;
    return {
        id,
        type: "audio" as CanvasNodeData["type"],
        title,
        position: centeredPosition(center, spec),
        width: spec.width,
        height: spec.height,
        metadata,
    };
}

export function replaceNodeWithUploadedImageFile({ currentNode, title, file, metadata }: ReplaceUploadedNodeInput<UploadedImage>): CanvasNodeData {
    const size = fitNodeSize(file.width, file.height);
    return {
        ...currentNode,
        type: "image" as CanvasNodeData["type"],
        title,
        width: size.width,
        height: size.height,
        metadata: {
            ...currentNode.metadata,
            ...metadata,
            errorDetails: undefined,
            freeResize: false,
            isBatchRoot: undefined,
            batchRootId: undefined,
            batchChildIds: undefined,
            batchUsesReferenceImages: undefined,
            generationType: undefined,
            model: undefined,
            size: undefined,
            quality: undefined,
            count: undefined,
            references: undefined,
            primaryImageId: undefined,
            imageBatchExpanded: undefined,
            sourceAssetId: undefined,
            assetVersion: undefined,
            assetReferenceMode: undefined,
            volcengineAsset: undefined,
        },
    };
}

export function replaceNodeWithUploadedVideoFile({ currentNode, title, file, metadata }: ReplaceUploadedNodeInput<UploadedFile>): CanvasNodeData {
    const size = videoNodeSize(file);
    return {
        ...currentNode,
        type: "video" as CanvasNodeData["type"],
        title,
        position: centeredPosition(nodeCenter(currentNode), size),
        width: size.width,
        height: size.height,
        metadata: clearReplacedMediaMetadata({ ...currentNode.metadata, ...metadata, errorDetails: undefined }),
    };
}

export function replaceNodeWithUploadedAudioFile({ currentNode, title, metadata }: ReplaceUploadedNodeInput<UploadedFile>): CanvasNodeData {
    const spec = NODE_DEFAULT_SIZE.audio;
    return {
        ...currentNode,
        type: "audio" as CanvasNodeData["type"],
        title,
        position: centeredPosition(nodeCenter(currentNode), spec),
        width: spec.width,
        height: spec.height,
        metadata: clearReplacedMediaMetadata({ ...currentNode.metadata, ...metadata, errorDetails: undefined }),
    };
}

function clearReplacedMediaMetadata(metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        ...metadata,
        sourceAssetId: undefined,
        assetVersion: undefined,
        assetReferenceMode: undefined,
        volcengineAsset: undefined,
    };
}

function videoNodeSize(file: Pick<UploadedFile, "width" | "height">) {
    return fitNodeSize(file.width || 1280, file.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
}

function nodeCenter(node: CanvasNodeData): Position {
    return { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
}

function centeredPosition(center: Position, size: { width: number; height: number }): Position {
    return { x: center.x - size.width / 2, y: center.y - size.height / 2 };
}
