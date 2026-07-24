import { nanoid } from "nanoid";

import { NODE_DEFAULT_SIZE } from "../constants.ts";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "../types.ts";
import { ensureCanvasMediaVersions } from "./canvas-media-versions.ts";

export function createVideoGenerationNode({
    nodeId,
    sourceNode,
    prompt,
    spec,
    metadata,
    sourceConnections = [],
    referenceNodeIds = [],
    replaceExistingResult = false,
}: {
    nodeId: string;
    sourceNode?: CanvasNodeData;
    prompt: string;
    spec: { width: number; height: number };
    metadata: CanvasNodeMetadata;
    sourceConnections?: CanvasConnection[];
    referenceNodeIds?: string[];
    replaceExistingResult?: boolean;
}) {
    const isEmptyVideoNode = sourceNode?.type === "video" && !sourceNode.metadata?.content;
    const isVariantNode = metadata.relationType === "variant" || metadata.videoActionType === "variant" || metadata.actionType === "variant";
    const videoId = isEmptyVideoNode || replaceExistingResult ? nodeId : nanoid();
    const parent = sourceNode?.position || { x: 0, y: 0 };
    const versions = replaceExistingResult && sourceNode ? ensureCanvasMediaVersions(sourceNode, metadata.pendingMediaVersion?.startedAt) : undefined;
    const versionMetadata =
        replaceExistingResult && sourceNode
            ? {
                  ...sourceNode.metadata,
                  ...metadata,
                  prompt: sourceNode.metadata?.prompt,
                  promptDocument: sourceNode.metadata?.promptDocument,
                  promptDraft: sourceNode.metadata?.promptDraft ?? metadata.pendingMediaVersion?.prompt,
                  promptDraftDocument: sourceNode.metadata?.promptDraftDocument ?? metadata.pendingMediaVersion?.promptDocument,
                  mediaVersions: versions,
                  currentMediaVersionId: sourceNode.metadata?.currentMediaVersionId || versions?.at(-1)?.id,
                  taskId: metadata.taskId,
                  taskStatus: metadata.taskStatus,
                  rawTaskStatus: metadata.rawTaskStatus,
                  taskCreatedAt: metadata.taskCreatedAt,
                  taskUpdatedAt: metadata.taskUpdatedAt,
                  taskDuration: metadata.taskDuration,
                  finishedAt: metadata.finishedAt,
                  aiTaskId: metadata.aiTaskId,
                  upstreamTaskId: metadata.upstreamTaskId,
                  aiTaskStatus: metadata.aiTaskStatus,
                  errorDetails: metadata.errorDetails,
              }
            : metadata;
    const videoNode: CanvasNodeData = {
        id: videoId,
        type: "video" as CanvasNodeData["type"],
        title: replaceExistingResult && sourceNode ? sourceNode.title : prompt.slice(0, 32) || "Generated Video",
        position: isEmptyVideoNode || (replaceExistingResult && sourceNode) ? sourceNode.position : isVariantNode && sourceNode ? { x: parent.x + 48, y: parent.y + sourceNode.height + 72 } : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
        width: isEmptyVideoNode || replaceExistingResult ? sourceNode?.width || spec.width : spec.width,
        height: isEmptyVideoNode || replaceExistingResult ? sourceNode?.height || spec.height : spec.height,
        metadata: versionMetadata,
    };
    const connection: CanvasConnection | null = isEmptyVideoNode || replaceExistingResult || isVariantNode || !sourceNode ? null : { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId };
    const inheritedConnections = inheritReferenceConnections(sourceConnections, referenceNodeIds, [videoId]);
    return { videoId, videoNode, isEmptyVideoNode, connections: [...inheritedConnections, ...(connection ? [connection] : [])] };
}

export function createImageGenerationNodes({
    nodeId,
    sourceNode,
    prompt,
    count,
    metadata,
    sourceConnections = [],
    referenceNodeIds = [],
}: {
    nodeId: string;
    sourceNode?: CanvasNodeData;
    prompt: string;
    count: number;
    metadata: CanvasNodeMetadata;
    sourceConnections?: CanvasConnection[];
    referenceNodeIds?: string[];
}) {
    const isConfigNode = sourceNode?.type === "config";
    const isImageNode = sourceNode?.type === "image";
    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? "config" : isImageNode ? "image" : "text"];
    const imageConfig = NODE_DEFAULT_SIZE.image;
    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
    const rootId = isEmptyImageNode ? nodeId : nanoid();
    const childIds = count > 1 ? Array.from({ length: count }, () => nanoid()) : [];
    const targetIds = count > 1 ? childIds : [rootId];
    const pendingChildIds = isEmptyImageNode ? childIds : [rootId, ...childIds];
    const rootNode: CanvasNodeData = {
        id: rootId,
        type: "image" as CanvasNodeData["type"],
        title: "生成图片",
        position: {
            x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + 96,
            y: parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2,
        },
        width: isEmptyImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width,
        height: isEmptyImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height,
        metadata: {
            prompt,
            status: "loading",
            isBatchRoot: count > 1,
            batchChildIds: count > 1 ? childIds : undefined,
            ...metadata,
            imageBatchExpanded: count > 1 ? true : undefined,
        },
    };
    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
        id,
        type: "image" as CanvasNodeData["type"],
        title: `生成图片 ${index + 1}`,
        position: {
            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (imageConfig.width + 36),
            y: rootNode.position.y + Math.floor(index / 2) * (imageConfig.height + 36),
        },
        width: imageConfig.width,
        height: imageConfig.height,
        metadata: { prompt, status: "loading", batchRootId: count > 1 ? rootId : undefined, ...metadata },
    }));
    const connections = [
        ...(isEmptyImageNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]),
        ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId })),
        ...inheritReferenceConnections(sourceConnections, referenceNodeIds, [rootId, ...childIds]),
    ];

    return { isConfigNode, isImageNode, isEmptyImageNode, parentConfig, imageConfig, rootId, childIds, targetIds, pendingChildIds, rootNode, childNodes, connections };
}

function inheritReferenceConnections(sourceConnections: CanvasConnection[], referenceNodeIds: string[], targetNodeIds: string[]) {
    const references = new Set(referenceNodeIds);
    const keys = new Set<string>();
    return targetNodeIds.flatMap((toNodeId) =>
        sourceConnections.flatMap((connection) => {
            if (connection.toNodeId === toNodeId || !references.has(connection.fromNodeId)) return [];
            const key = `${connection.fromNodeId}:${toNodeId}:${connection.fromHandle || ""}:${connection.toHandle || ""}`;
            if (keys.has(key)) return [];
            keys.add(key);
            return [{ ...connection, id: nanoid(), toNodeId }];
        }),
    );
}

export function createTextGenerationChildNodes({ nodeId, sourceNode, prompt, textCount, editingTextNode }: { nodeId: string; sourceNode?: CanvasNodeData; prompt: string; textCount: number; editingTextNode: boolean }) {
    const isConfigNode = sourceNode?.type === "config";
    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? "config" : "text"];
    const textConfig = NODE_DEFAULT_SIZE.text;
    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
    const childIds = isConfigNode || editingTextNode ? Array.from({ length: textCount }, () => nanoid()) : [];
    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
        id,
        type: "text" as CanvasNodeData["type"],
        title: prompt.slice(0, 32) || "Generated Text",
        position: {
            x: parentPosition.x + parentConfig.width + 96,
            y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (index - (textCount - 1) / 2) * (textConfig.height + 36),
        },
        width: textConfig.width,
        height: textConfig.height,
        metadata: { prompt, status: "loading", fontSize: 14 },
    }));
    const connections = childIds.map((childId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: childId }));
    return { childIds, childNodes, connections, isConfigNode };
}
