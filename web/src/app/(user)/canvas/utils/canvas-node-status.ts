import type { CanvasNodeData, CanvasNodeMetadata } from "../types.ts";

const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;

export function applyImageGenerationStartNodes({
    nodes,
    nodeId,
    prompt,
    isConfigNode,
    isEmptyImageNode,
    isImageNode,
    parentConfig,
    rootNode,
    childNodes,
}: {
    nodes: CanvasNodeData[];
    nodeId: string;
    prompt: string;
    isConfigNode: boolean;
    isEmptyImageNode: boolean;
    isImageNode: boolean;
    parentConfig: { width: number; height: number };
    rootNode: CanvasNodeData;
    childNodes: CanvasNodeData[];
}) {
    return [
        ...nodes.map((node) =>
            node.id === nodeId
                ? isConfigNode
                    ? {
                          ...node,
                          metadata: { ...node.metadata, prompt, status: "loading" as const, errorDetails: undefined },
                      }
                    : isEmptyImageNode
                      ? {
                            ...node,
                            position: rootNode.position,
                            width: rootNode.width,
                            height: rootNode.height,
                            title: rootNode.title,
                            metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
                        }
                      : isImageNode
                        ? {
                              ...node,
                              metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
                          }
                        : {
                              ...node,
                              type: "text" as CanvasNodeData["type"],
                              title: prompt.slice(0, 32) || "Prompt",
                              width: parentConfig.width,
                              height: parentConfig.height,
                              metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
                          }
                : node,
        ),
        ...(isEmptyImageNode ? [] : [rootNode]),
        ...childNodes,
    ];
}

export function applyGeneratedImageToNodes({ nodes, rootId, targetId, imageSize, imageMetadata }: { nodes: CanvasNodeData[]; rootId: string; targetId: string; imageSize: { width: number; height: number }; imageMetadata: CanvasNodeMetadata }) {
    const root = nodes.find((node) => node.id === rootId);
    return nodes.map((node) => {
        if (node.id !== targetId && node.id !== rootId) return node;
        const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
        if (node.id === rootId && (targetId === rootId || !root?.metadata?.primaryImageId))
            return {
                ...node,
                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                width: imageSize.width,
                height: imageSize.height,
                metadata: { ...node.metadata, ...imageMetadata, primaryImageId: targetId },
            };
        if (node.id === targetId)
            return {
                ...node,
                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                width: imageSize.width,
                height: imageSize.height,
                metadata: { ...node.metadata, ...imageMetadata },
            };
        return node;
    });
}

export function applyImageTargetError(nodes: CanvasNodeData[], targetId: string, errorDetails: string) {
    return nodes.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node));
}

export function applyImageGenerationFinalStatus({ nodes, nodeId, rootId, isConfigNode, isEmptyImageNode, hasSuccess }: { nodes: CanvasNodeData[]; nodeId: string; rootId: string; isConfigNode: boolean; isEmptyImageNode: boolean; hasSuccess: boolean }) {
    return nodes.map((node) =>
        node.id === nodeId && isConfigNode
            ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } }
            : node.id === nodeId && isEmptyImageNode
              ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } }
              : node.id === rootId && !hasSuccess
                ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "全部图片生成失败" } }
                : node,
    );
}

export function buildCompletedVideoNode({
    videoNode,
    videoSize,
    videoMetadata,
    cachedVideoMetadata,
    taskMetadata,
    generationMetadata,
    prompt,
}: {
    videoNode: CanvasNodeData;
    videoSize: { width: number; height: number };
    videoMetadata: CanvasNodeMetadata;
    cachedVideoMetadata: Partial<CanvasNodeMetadata>;
    taskMetadata?: CanvasNodeMetadata;
    generationMetadata: CanvasNodeMetadata;
    prompt: string;
}): CanvasNodeData {
    return {
        ...videoNode,
        width: videoSize.width,
        height: videoSize.height,
        position: { x: videoNode.position.x + videoNode.width / 2 - videoSize.width / 2, y: videoNode.position.y + videoNode.height / 2 - videoSize.height / 2 },
        metadata: {
            ...videoNode.metadata,
            ...videoMetadata,
            ...cachedVideoMetadata,
            ...(taskMetadata || {}),
            prompt,
            ...generationMetadata,
            taskStatus: "succeeded",
            errorDetails: undefined,
        },
    };
}
