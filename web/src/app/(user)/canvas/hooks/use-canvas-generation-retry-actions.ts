"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { isRecoverableVideoTaskError } from "@/services/api/video";
import type { UploadedFile } from "@/services/file-storage";
import type { UploadedImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { defaultConfig } from "@/stores/use-config-store";
import type { Asset, AssetWriteInput } from "@/stores/use-asset-store";

import { NODE_DEFAULT_SIZE, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../constants";
import { buildNodeGenerationContext, buildNodeGenerationInputs, hydrateNodeGenerationContext, type NodeGenerationContext } from "../components/canvas-node-generation";
import { buildRetryGenerationConfig } from "../utils/canvas-generation-config";
import { buildRetryImageGenerationMetadata, buildVideoGenerationMetadata, videoTaskMetadata } from "../utils/canvas-generation-metadata";
import { findRetrySourceNode, resolveMetadataReferences, resolveStoredAudioReferences, resolveStoredImageReferences, resolveStoredVideoReferences, sourceNodeReferenceImages, storedVideoReferenceInputs } from "../utils/canvas-generation-references";
import { canvasNodeRetryPrompt, completeCanvasNodeRetry, failCanvasNodeRetry, startCanvasNodeRetry } from "../utils/canvas-generation-retry-state";
import { runCanvasImageGeneration, runCanvasVideoGeneration } from "../utils/canvas-generation-runner";
import { buildGeneratedImageAsset, buildGeneratedVideoAsset } from "../utils/canvas-generated-asset";
import { aiTaskLedgerNodeMetadata, buildCanvasAiTaskTraceFromNode } from "../utils/canvas-ai-task-trace";
import type { CanvasEpisodeContext } from "../utils/canvas-episode-context";
import { bindPendingCanvasMediaVersionTask, patchCurrentCanvasMediaVersion } from "../utils/canvas-media-versions";
import type { CanvasProjectPreset } from "../utils/canvas-project-preset";
import { fitNodeSize } from "../utils/canvas-node-size";
import { applyCompletedVideoNodeToNodes, buildCompletedImageNode, buildCompletedVideoNode } from "../utils/canvas-node-status";
import { buildVideoGenerationPlan } from "../utils/canvas-video-generation-plan";
import { syncCanvasVolcengineAssetsFromLibrary } from "../utils/canvas-volcengine-asset-sync";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

const NODE_STATUS_ERROR = "error" as const;
const NODE_STATUS_LOADING = "loading" as const;

type CanvasActionMessage = {
    error: (content: string) => void;
    warning: (content: string) => void;
};

type UseCanvasGenerationRetryActionsOptions = {
    assets: Asset[];
    canvasAiConfig: AiConfig;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (open: boolean) => void;
    message: CanvasActionMessage;
    retryTextNode: (input: { node: CanvasNodeData; prompt: string; generationConfig: AiConfig; generationContext: NodeGenerationContext }) => Promise<void>;
    cacheUploadedCanvasMedia: (file: UploadedFile, node: CanvasNodeData) => Promise<Partial<CanvasNodeMetadata>>;
    videoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
    imageMetadata: (image: UploadedImage) => CanvasNodeMetadata;
    workspaceProjectId: string;
    workspaceProjectTitle: string;
    canvasTitle: string;
    projectPreset?: CanvasProjectPreset;
    canvasEpisodeContext?: CanvasEpisodeContext;
    canvasId: string;
    archiveGeneratedAsset: (asset: AssetWriteInput) => Promise<string | void>;
    prepareGeneratedAssetNode: (node: CanvasNodeData) => CanvasNodeData;
};

export function useCanvasGenerationRetryActions({
    assets,
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
    canvasTitle,
    projectPreset,
    canvasEpisodeContext,
    canvasId,
    archiveGeneratedAsset,
    prepareGeneratedAssetNode,
}: UseCanvasGenerationRetryActionsOptions) {
    const handleRetryNode = useCallback(
        async (requestedNode: CanvasNodeData) => {
            const synced = syncCanvasVolcengineAssetsFromLibrary(nodesRef.current, assets);
            const retryNodes = synced.nodes;
            if (synced.changed) {
                nodesRef.current = retryNodes;
                setNodes(retryNodes);
            }
            const node = retryNodes.find((item) => item.id === requestedNode.id) || requestedNode;
            const sourceNode = findRetrySourceNode(node.id, retryNodes, connectionsRef.current) || node;
            const batchRoot = node.metadata?.batchRootId ? retryNodes.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig = buildRetryGenerationConfig({ config: canvasAiConfig, sourceNode, targetNode: node, savedImageMetadata, defaults: defaultConfig });
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const retryInputs = buildNodeGenerationInputs(sourceNode.id, retryNodes, connectionsRef.current);
            const retryPrompt = canvasNodeRetryPrompt(node, sourceNode, retryInputs);
            const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, retryNodes, connectionsRef.current, retryPrompt));
            const prompt = ((hasSavedImageMetadata ? savedImageMetadata?.prompt : context?.prompt) || retryPrompt).trim();
            if (!prompt) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            const hasCurrentVideoReferences = Boolean(node.type === CanvasNodeType.Video && context && (context.referenceImages.length || context.referenceVideos.length || context.referenceAudios.length || context.referenceInputs?.length));
            const savedVideoImages = node.type === CanvasNodeType.Video && !hasCurrentVideoReferences ? await resolveStoredImageReferences(node.metadata || {}) : undefined;
            const savedVideoVideos = node.type === CanvasNodeType.Video && !hasCurrentVideoReferences ? await resolveStoredVideoReferences(node.metadata || {}) : undefined;
            const savedVideoAudios = node.type === CanvasNodeType.Video && !hasCurrentVideoReferences ? await resolveStoredAudioReferences(node.metadata || {}) : undefined;
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
            const generationStartedAt = Date.now();
            setNodes((prev) => prev.map((item) => (item.id === node.id ? startCanvasNodeRetry(item, prompt, generationStartedAt) : item)));
            if (node.type === CanvasNodeType.Video) {
                useStoryboardStore.getState().markShotGenerating({ storyboardShotId: node.metadata?.storyboardShotId, nodeId: node.id });
                useStoryboardStore.getState().markShotGroupGenerating({ shotGroupId: node.metadata?.shotGroupId });
            }

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    await retryTextNode({ node, prompt, generationConfig, generationContext: context });
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    const videoImages = hasCurrentVideoReferences ? context?.referenceImages || [] : savedVideoImages || [];
                    const videoVideos = hasCurrentVideoReferences ? context?.referenceVideos || [] : savedVideoVideos || [];
                    const videoAudios = hasCurrentVideoReferences ? context?.referenceAudios || [] : savedVideoAudios || [];
                    const videoInputs = hasCurrentVideoReferences ? context?.referenceInputs : storedVideoReferenceInputs(node.metadata || {}, videoImages, videoVideos, videoAudios);
                    const referenceSet = { images: videoImages, videos: videoVideos, audios: videoAudios, inputs: videoInputs };
                    const videoPlan = buildVideoGenerationPlan({ config: generationConfig, sourceNode, sourceReferences: referenceSet, contextReferences: referenceSet, storedVariantReferences: referenceSet });
                    if (videoPlan.sourceVideoRequiredError) throw new Error(videoPlan.sourceVideoRequiredError);
                    if (videoPlan.imageReviewRequiredError) throw new Error(videoPlan.imageReviewRequiredError);
                    const videoReferences = videoPlan.references;
                    const trace = buildCanvasAiTaskTraceFromNode({ projectId: workspaceProjectId, canvasId, node });
                    const { video, completedTask } = await runCanvasVideoGeneration(
                        generationConfig,
                        prompt,
                        videoReferences,
                        (task) => {
                            useStoryboardStore.getState().markShotGenerating({ storyboardShotId: node.metadata?.storyboardShotId, nodeId: node.id, taskId: task.id });
                            useStoryboardStore.getState().markShotGroupGenerating({ shotGroupId: node.metadata?.shotGroupId, taskId: task.id });
                            setNodes((prev) =>
                                prev.map((item) => {
                                    if (item.id !== node.id) return item;
                                    const taskNode = bindPendingCanvasMediaVersionTask(item, prompt, new Date(generationStartedAt).toISOString(), task.id, node.metadata?.promptDraftDocument);
                                    return { ...taskNode, metadata: { ...taskNode.metadata, ...videoTaskMetadata(task), errorDetails: task.errorMessage } };
                                }),
                            );
                        },
                        trace,
                    );
                    const latestVideoNode = nodesRef.current.find((item) => item.id === node.id) || node;
                    const cachedVideo = await cacheUploadedCanvasMedia(video, latestVideoNode);
                    const videoSize = fitNodeSize(video.width || node.width, video.height || node.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    const finalVideoNode = buildCompletedVideoNode({
                        videoNode: latestVideoNode,
                        videoSize,
                        videoMetadata: videoMetadata(video),
                        cachedVideoMetadata: cachedVideo,
                        taskMetadata: completedTask ? videoTaskMetadata(completedTask) : undefined,
                        generationMetadata: {
                            ...buildVideoGenerationMetadata(generationConfig, videoReferences, videoPlan.relation),
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
                    setNodes((prev) => {
                        const retryingNode = prev.find((item) => item.id === node.id);
                        const completedNodes = applyCompletedVideoNodeToNodes(prev, finalVideoNode);
                        return retryingNode ? completedNodes.map((item) => (item.id === node.id ? completeCanvasNodeRetry(retryingNode, item) : item)) : completedNodes;
                    });
                    if (finalVideoNode) {
                        const asset = buildGeneratedVideoAsset(prepareGeneratedAssetNode(finalVideoNode), {
                            projectId: workspaceProjectId,
                            canvasId,
                            canvasTitle,
                            projectTitle: workspaceProjectTitle,
                            projectPreset,
                            episodeContext: canvasEpisodeContext,
                            prompt,
                            effectivePrompt: prompt,
                            config: generationConfig,
                            createdAt: new Date().toISOString(),
                            versionNumber: node.metadata?.content ? (node.metadata.mediaVersions?.length || 1) + 1 : 1,
                        });
                        const assetId = asset ? await archiveGeneratedAsset(asset).catch(() => undefined) : undefined;
                        if (typeof assetId === "string") {
                            setNodes((prev) => prev.map((item) => (item.id === finalVideoNode.id ? patchCurrentCanvasMediaVersion(item, { sourceAssetId: assetId }) : item)));
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
                const completedNode = buildCompletedImageNode({
                    imageNode: node,
                    imageSize,
                    imageMetadata: { ...imageMetadata(uploadedImage), ...aiTaskLedgerNodeMetadata(uploadedImage.aiTask) },
                    generationMetadata,
                    prompt,
                });
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? completeCanvasNodeRetry(
                                  item,
                                  buildCompletedImageNode({
                                      imageNode: item,
                                      imageSize,
                                      imageMetadata: { ...imageMetadata(uploadedImage), ...aiTaskLedgerNodeMetadata(uploadedImage.aiTask) },
                                      generationMetadata,
                                      prompt,
                                  }),
                              )
                            : item,
                    ),
                );
                const asset = buildGeneratedImageAsset(prepareGeneratedAssetNode(completedNode), {
                    canvasId,
                    canvasTitle,
                    projectId: workspaceProjectId,
                    projectTitle: workspaceProjectTitle,
                    projectPreset,
                    episodeContext: canvasEpisodeContext,
                    prompt,
                    effectivePrompt: prompt,
                    config: generationConfig,
                    createdAt: new Date().toISOString(),
                    versionNumber: node.metadata?.content ? (node.metadata.mediaVersions?.length || 1) + 1 : 1,
                });
                const assetId = asset ? await archiveGeneratedAsset(asset).catch(() => undefined) : undefined;
                if (typeof assetId === "string") setNodes((prev) => prev.map((item) => (item.id === node.id ? patchCurrentCanvasMediaVersion(item, { sourceAssetId: assetId }) : item)));
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
                setNodes((prev) => prev.map((item) => (item.id === node.id ? failCanvasNodeRetry(item, errorDetails, failedAt) : item)));
            } finally {
                setRunningNodeId(null);
            }
        },
        [
            archiveGeneratedAsset,
            assets,
            cacheUploadedCanvasMedia,
            canvasAiConfig,
            canvasEpisodeContext,
            canvasId,
            connectionsRef,
            imageMetadata,
            isAiConfigReady,
            message,
            nodesRef,
            openConfigDialog,
            projectPreset,
            retryTextNode,
            setNodes,
            setRunningNodeId,
            videoMetadata,
            workspaceProjectId,
            workspaceProjectTitle,
            canvasTitle,
            prepareGeneratedAssetNode,
        ],
    );

    return { handleRetryNode };
}
