"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { isRecoverableVideoTaskError } from "@/services/api/video";
import type { UploadedFile } from "@/services/file-storage";
import type { UploadedImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { defaultConfig } from "@/stores/use-config-store";
import type { AssetWriteInput } from "@/stores/use-asset-store";

import { NODE_DEFAULT_SIZE, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../constants";
import { buildNodeGenerationContext, hydrateNodeGenerationContext, type NodeGenerationContext } from "../components/canvas-node-generation";
import { buildRetryGenerationConfig } from "../utils/canvas-generation-config";
import { buildRetryImageGenerationMetadata, buildVideoGenerationMetadata, buildVideoReferenceInput, videoTaskMetadata } from "../utils/canvas-generation-metadata";
import { findRetrySourceNode, resolveMetadataReferences, resolveStoredAudioReferences, resolveStoredImageReferences, resolveStoredVideoReferences, sourceNodeReferenceImages, storedVideoReferenceInputs } from "../utils/canvas-generation-references";
import { runCanvasImageGeneration, runCanvasVideoGeneration } from "../utils/canvas-generation-runner";
import { buildGeneratedVideoAsset } from "../utils/canvas-generated-asset";
import { aiTaskLedgerNodeMetadata, buildCanvasAiTaskTraceFromNode } from "../utils/canvas-ai-task-trace";
import type { CanvasEpisodeContext } from "../utils/canvas-episode-context";
import type { CanvasProjectPreset } from "../utils/canvas-project-preset";
import { fitNodeSize } from "../utils/canvas-node-size";
import { applyCompletedVideoNodeToNodes, buildCompletedImageNode, buildCompletedVideoNode } from "../utils/canvas-node-status";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

const NODE_STATUS_ERROR = "error" as const;
const NODE_STATUS_LOADING = "loading" as const;

type CanvasActionMessage = {
    error: (content: string) => void;
    warning: (content: string) => void;
};

type UseCanvasGenerationRetryActionsOptions = {
    canvasAiConfig: AiConfig;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (open: boolean) => void;
    message: CanvasActionMessage;
    retryTextNode: (input: { node: CanvasNodeData; prompt: string; generationConfig: AiConfig; generationContext: NodeGenerationContext }) => Promise<void>;
    cacheUploadedCanvasMedia: (file: UploadedFile, filename: string) => Promise<Partial<CanvasNodeMetadata>>;
    videoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
    imageMetadata: (image: UploadedImage) => CanvasNodeMetadata;
    workspaceProjectId: string;
    workspaceProjectTitle: string;
    projectPreset?: CanvasProjectPreset;
    canvasEpisodeContext?: CanvasEpisodeContext;
    canvasId: string;
    archiveGeneratedAsset: (asset: AssetWriteInput) => Promise<string | void>;
};

export function useCanvasGenerationRetryActions({
    canvasAiConfig,
    nodesRef,
    connectionsRef,
    setNodes,
    setRunningNodeId,
    isAiConfigReady,
    openConfigDialog,
    message,
    retryTextNode,
    cacheUploadedCanvasMedia,
    videoMetadata,
    imageMetadata,
    workspaceProjectId,
    workspaceProjectTitle,
    projectPreset,
    canvasEpisodeContext,
    canvasId,
    archiveGeneratedAsset,
}: UseCanvasGenerationRetryActionsOptions) {
    const handleRetryNode = useCallback(
        async (node: CanvasNodeData) => {
            const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current) || node;
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig = buildRetryGenerationConfig({ config: canvasAiConfig, sourceNode, targetNode: node, savedImageMetadata, defaults: defaultConfig });
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            const prompt = (savedImageMetadata?.prompt || context?.prompt || "").trim();
            if (!prompt) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            const savedVideoImages = node.type === CanvasNodeType.Video ? await resolveStoredImageReferences(node.metadata || {}) : undefined;
            const savedVideoVideos = node.type === CanvasNodeType.Video ? await resolveStoredVideoReferences(node.metadata || {}) : undefined;
            const savedVideoAudios = node.type === CanvasNodeType.Video ? await resolveStoredAudioReferences(node.metadata || {}) : undefined;
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            if (savedVideoImages === null) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            if (savedVideoVideos === null) {
                message.error("参考视频已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考视频已丢失，无法继续重试" } } : item)));
                return;
            }
            if (savedVideoAudios === null) {
                message.error("参考音频已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考音频已丢失，无法继续重试" } } : item)));
                return;
            }

            setRunningNodeId(node.id);
            const generationStartedAt = node.type === CanvasNodeType.Video ? Date.now() : undefined;
            setNodes((prev) =>
                prev.map((item) =>
                    item.id === node.id
                        ? {
                              ...item,
                              metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined, ...(generationStartedAt ? { generationStartedAt, taskStatus: undefined, rawTaskStatus: undefined } : {}) },
                          }
                        : item,
                ),
            );
            if (node.type === CanvasNodeType.Video) {
                useStoryboardStore.getState().markShotGenerating({ storyboardShotId: node.metadata?.storyboardShotId, nodeId: node.id, taskId: node.metadata?.taskId });
                useStoryboardStore.getState().markShotGroupGenerating({ shotGroupId: node.metadata?.shotGroupId, taskId: node.metadata?.taskId });
            }

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    await retryTextNode({ node, prompt, generationConfig, generationContext: context });
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    const videoReferences = buildVideoReferenceInput(
                        savedVideoImages ?? context?.referenceImages ?? [],
                        savedVideoVideos ?? context?.referenceVideos ?? [],
                        savedVideoAudios ?? context?.referenceAudios ?? [],
                        storedVideoReferenceInputs(node.metadata || {}, savedVideoImages || [], savedVideoVideos || [], savedVideoAudios || []) || context?.referenceInputs,
                        generationConfig.videoReferenceImageMode,
                    );
                    const trace = buildCanvasAiTaskTraceFromNode({ projectId: workspaceProjectId, canvasId, node });
                    const { video, completedTask } = await runCanvasVideoGeneration(
                        generationConfig,
                        prompt,
                        videoReferences,
                        (task) => {
                            useStoryboardStore.getState().markShotGenerating({ storyboardShotId: node.metadata?.storyboardShotId, nodeId: node.id, taskId: task.id });
                            useStoryboardStore.getState().markShotGroupGenerating({ shotGroupId: node.metadata?.shotGroupId, taskId: task.id });
                            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...videoTaskMetadata(task), errorDetails: task.errorMessage } } : item)));
                        },
                        trace,
                    );
                    const cachedVideo = await cacheUploadedCanvasMedia(video, `${node.id}.mp4`);
                    const videoSize = fitNodeSize(video.width || node.width, video.height || node.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    const latestVideoNode = nodesRef.current.find((item) => item.id === node.id) || node;
                    const finalVideoNode = buildCompletedVideoNode({
                        videoNode: latestVideoNode,
                        videoSize,
                        videoMetadata: videoMetadata(video),
                        cachedVideoMetadata: cachedVideo,
                        taskMetadata: completedTask ? videoTaskMetadata(completedTask) : undefined,
                        generationMetadata: {
                            ...buildVideoGenerationMetadata(generationConfig, videoReferences),
                            storyboardGroupId: latestVideoNode.metadata?.storyboardGroupId,
                            storyboardShotId: latestVideoNode.metadata?.storyboardShotId,
                            shotGroupId: latestVideoNode.metadata?.shotGroupId,
                            shotIds: latestVideoNode.metadata?.shotIds,
                            storyboardShotGroupId: latestVideoNode.metadata?.storyboardShotGroupId,
                            storyboardTableShotIds: latestVideoNode.metadata?.storyboardTableShotIds,
                            productionPackageId: latestVideoNode.metadata?.productionPackageId || latestVideoNode.metadata?.shotGroupId || latestVideoNode.metadata?.storyboardShotGroupId,
                            productionPackageLabel: latestVideoNode.metadata?.productionPackageLabel,
                            productionPackageTitle: latestVideoNode.metadata?.productionPackageTitle,
                            productionVideoVersionId: latestVideoNode.metadata?.productionVideoVersionId,
                            productionVideoVersionNumber: latestVideoNode.metadata?.productionVideoVersionNumber,
                            productionVideoVersionCreatedAt: latestVideoNode.metadata?.productionVideoVersionCreatedAt || new Date().toISOString(),
                        },
                        prompt,
                    });
                    setNodes((prev) => applyCompletedVideoNodeToNodes(prev, finalVideoNode));
                    if (finalVideoNode) {
                        const asset = buildGeneratedVideoAsset(finalVideoNode, {
                            projectId: workspaceProjectId,
                            projectTitle: workspaceProjectTitle,
                            projectPreset,
                            episodeContext: canvasEpisodeContext,
                            prompt,
                            effectivePrompt: prompt,
                            config: generationConfig,
                            createdAt: new Date().toISOString(),
                        });
                        const assetId = asset ? await archiveGeneratedAsset(asset).catch(() => undefined) : undefined;
                        if (typeof assetId === "string") {
                            setNodes((prev) => prev.map((item) => (item.id === finalVideoNode.id ? { ...item, metadata: { ...item.metadata, sourceAssetId: assetId } } : item)));
                        }
                        useStoryboardStore.getState().markShotSucceeded({ storyboardShotId: finalVideoNode.metadata?.storyboardShotId, assetId: typeof assetId === "string" ? assetId : undefined, nodeId: node.id, taskId: finalVideoNode.metadata?.taskId });
                        useStoryboardStore.getState().markShotGroupSucceeded({ shotGroupId: finalVideoNode.metadata?.shotGroupId, assetId: typeof assetId === "string" ? assetId : undefined, taskId: finalVideoNode.metadata?.taskId });
                    }
                    return;
                }

                const imageReferences = retryReferenceImages || [];
                const uploadedImage = await runCanvasImageGeneration(generationConfig, prompt, imageReferences, buildCanvasAiTaskTraceFromNode({ projectId: workspaceProjectId, canvasId, node }));
                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const imageSize = fitNodeSize(uploadedImage.width, uploadedImage.height, imageConfig.width, imageConfig.height);
                const generationMetadata = buildRetryImageGenerationMetadata(savedImageMetadata, generationConfig, useReferenceImages, retryReferenceImages);
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? buildCompletedImageNode({
                                  imageNode: item,
                                  imageSize,
                                  imageMetadata: { ...imageMetadata(uploadedImage), ...aiTaskLedgerNodeMetadata(uploadedImage.aiTask) },
                                  generationMetadata,
                                  prompt,
                              })
                            : item,
                    ),
                );
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                const failedAt = Date.now();
                if (node.type === CanvasNodeType.Video && isRecoverableVideoTaskError(error)) {
                    message.warning(errorDetails);
                    useStoryboardStore.getState().markShotGenerating({ storyboardShotId: node.metadata?.storyboardShotId, nodeId: node.id, taskId: error.task.id });
                    useStoryboardStore.getState().markShotGroupGenerating({ shotGroupId: node.metadata?.shotGroupId, taskId: error.task.id });
                    setNodes((prev) =>
                        prev.map((item) =>
                            item.id === node.id
                                ? {
                                      ...item,
                                      metadata: {
                                          ...item.metadata,
                                          ...videoTaskMetadata(error.task),
                                          status: NODE_STATUS_LOADING,
                                          errorDetails,
                                          taskUpdatedAt: failedAt,
                                      },
                                  }
                                : item,
                        ),
                    );
                    return;
                }
                message.error(errorDetails);
                if (node.type === CanvasNodeType.Video) {
                    useStoryboardStore.getState().markShotFailed({ storyboardShotId: node.metadata?.storyboardShotId, nodeId: node.id, taskId: node.metadata?.taskId, errorMessage: errorDetails });
                    useStoryboardStore.getState().markShotGroupFailed({ shotGroupId: node.metadata?.shotGroupId, taskId: node.metadata?.taskId, errorMessage: errorDetails });
                }
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails, ...(item.type === CanvasNodeType.Video ? { taskUpdatedAt: failedAt } : {}) } } : item)));
            } finally {
                setRunningNodeId(null);
            }
        },
        [archiveGeneratedAsset, cacheUploadedCanvasMedia, canvasAiConfig, canvasEpisodeContext, canvasId, connectionsRef, imageMetadata, isAiConfigReady, message, nodesRef, openConfigDialog, projectPreset, retryTextNode, setNodes, setRunningNodeId, videoMetadata, workspaceProjectId, workspaceProjectTitle],
    );

    return { handleRetryNode };
}
