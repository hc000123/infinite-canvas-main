import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import type { UploadedImage } from "@/services/image-storage";
import { activeVolcengineAssetURI } from "@/services/volcengine-asset-metadata";
import type { AssetWriteInput } from "@/stores/use-asset-store";
import type { ReferenceImage } from "@/types/image";

import { buildGeneratedImageAsset } from "../utils/canvas-generated-asset";
import { canvasEpisodeMetadata, type CanvasEpisodeContext } from "../utils/canvas-episode-context";
import type { CanvasProjectPreset } from "../utils/canvas-project-preset";
import { buildImageGenerationMetadata } from "../utils/canvas-generation-metadata";
import { createImageGenerationNodes } from "../utils/canvas-generation-nodes";
import { runCanvasImageGeneration } from "../utils/canvas-generation-runner";
import { aiTaskLedgerNodeMetadata, buildCanvasAiTaskTrace } from "../utils/canvas-ai-task-trace";
import { fitNodeSize } from "../utils/canvas-node-size";
import { applyGeneratedImageToNodes, applyImageGenerationFinalStatus, applyImageGenerationStartNodes, applyImageTargetError } from "../utils/canvas-node-status";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "../types";

type UseCanvasImageGenerationActionsOptions = {
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    showError: (message: string) => void;
    toImageMetadata: (image: UploadedImage) => CanvasNodeMetadata;
    projectId: string;
    canvasId: string;
    projectTitle: string;
    projectPreset?: CanvasProjectPreset;
    episodeContext?: CanvasEpisodeContext;
    archiveGeneratedAsset: (asset: AssetWriteInput) => Promise<string | void>;
};

type GenerateImageNodeInput = {
    nodeId: string;
    sourceNode?: CanvasNodeData;
    prompt: string;
    effectivePrompt: string;
    generationConfig: AiConfig;
    contextReferenceImages: ReferenceImage[];
};

export function useCanvasImageGenerationActions({
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    showError,
    toImageMetadata,
    projectId,
    canvasId,
    projectTitle,
    projectPreset,
    episodeContext,
    archiveGeneratedAsset,
}: UseCanvasImageGenerationActionsOptions) {
    const generateImageNode = useCallback(
        async ({ nodeId, sourceNode, prompt, effectivePrompt, generationConfig, contextReferenceImages }: GenerateImageNodeInput) => {
            const createdAt = new Date().toISOString();
            const count = imageGenerationCount(generationConfig.count);
            const isImageNode = sourceNode?.type === "image";
            const sourceReference =
                isImageNode && sourceNode?.metadata?.content
                    ? [
                          {
                              id: sourceNode.id,
                              name: `${sourceNode.title || sourceNode.id}.png`,
                              type: sourceNode.metadata.mimeType || "image/png",
                              dataUrl: sourceNode.metadata.content,
                              storageKey: sourceNode.metadata.storageKey,
                              assetUri: activeVolcengineAssetURI(sourceNode.metadata.volcengineAsset),
                          },
                      ]
                    : [];
            const referenceImages = sourceReference.length ? sourceReference : contextReferenceImages;
            const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
            const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
            const { isConfigNode, isEmptyImageNode, parentConfig, imageConfig, rootId, targetIds, pendingChildIds, rootNode, childNodes, connections } = createImageGenerationNodes({
                nodeId,
                sourceNode,
                prompt: effectivePrompt,
                count,
                metadata: { ...generationMetadata, ...canvasEpisodeMetadata(episodeContext), batchUsesReferenceImages: referenceImages.length > 0 },
            });

            setNodes((prev) =>
                applyImageGenerationStartNodes({
                    nodes: prev,
                    nodeId,
                    prompt,
                    isConfigNode,
                    isEmptyImageNode,
                    isImageNode,
                    parentConfig,
                    rootNode,
                    childNodes,
                }),
            );
            setConnections((prev) => [...prev, ...connections]);
            setSelectedNodeIds(new Set([nodeId]));
            setSelectedConnectionId(null);
            setDialogNodeId(nodeId);

            let hasSuccess = false;
            let hasFailure = false;
            await Promise.all(
                targetIds.map(async (targetId) => {
                    try {
                        const trace = buildCanvasAiTaskTrace({ projectId, canvasId, nodeId: targetId, metadata: targetNodeMetadata(targetId, rootNode, childNodes) });
                        const uploaded = await runCanvasImageGeneration({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages, trace);
                        const imageSize = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                        const metadata = { ...toImageMetadata(uploaded), ...aiTaskLedgerNodeMetadata(uploaded.aiTask) };
                        setNodes((prev) => applyGeneratedImageToNodes({ nodes: prev, rootId, targetId, imageSize, imageMetadata: metadata }));
                        const targetNode = [rootNode, ...childNodes].find((node) => node.id === targetId) || rootNode;
                        const asset = buildGeneratedImageAsset(
                            {
                                ...targetNode,
                                width: imageSize.width,
                                height: imageSize.height,
                                metadata: { ...targetNode.metadata, ...metadata },
                            },
                            { projectId, projectTitle, projectPreset, episodeContext, prompt, effectivePrompt, config: generationConfig, createdAt },
                        );
                        if (asset) void archiveGeneratedAsset(asset).catch(() => undefined);
                        hasSuccess = true;
                        if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: "success", errorDetails: undefined } } : node)));
                        return true;
                    } catch (error) {
                        const errorDetails = error instanceof Error ? error.message : "生成失败";
                        hasFailure = true;
                        setNodes((prev) => applyImageTargetError(prev, targetId, errorDetails));
                        return false;
                    }
                }),
            );
            if (hasFailure) showError(hasSuccess ? "部分图片生成失败" : "全部图片生成失败");
            setNodes((prev) => applyImageGenerationFinalStatus({ nodes: prev, nodeId, rootId, isConfigNode, isEmptyImageNode, hasSuccess }));
            return { pendingChildIds };
        },
        [archiveGeneratedAsset, canvasId, episodeContext, projectId, projectPreset, projectTitle, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, showError, toImageMetadata],
    );

    return { generateImageNode };
}

function targetNodeMetadata(targetId: string, rootNode: CanvasNodeData, childNodes: CanvasNodeData[]) {
    return (targetId === rootNode.id ? rootNode : childNodes.find((node) => node.id === targetId))?.metadata;
}

function imageGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}
