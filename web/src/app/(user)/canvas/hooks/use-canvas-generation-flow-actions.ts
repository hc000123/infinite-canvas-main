"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { Asset } from "@/stores/use-asset-store";
import { defaultConfig, type AiConfig } from "@/stores/use-config-store";

import { buildNodeGenerationContext, hydrateNodeGenerationContext } from "../components/canvas-node-generation";
import type { CanvasNodeGenerationMode } from "../components/canvas-node-prompt-panel";
import { buildGenerationConfig } from "../utils/canvas-generation-config";
import { directVideoReferenceInputs } from "../utils/canvas-generation-metadata";
import { syncCanvasVolcengineAssetsFromLibrary } from "../utils/canvas-volcengine-asset-sync";
import { reviewVideoPromptBeforeGeneration, shouldRunVideoPromptReview, type PromptReviewResult } from "../utils/canvas-prompt-review";
import { buildVideoGenerationPlan, shouldCreateVideoVariant } from "../utils/canvas-video-generation-plan";
import { resolveStoredAudioReferences, resolveStoredImageReferences, resolveStoredVideoReferences, sourceNodeReferenceAudios, sourceNodeReferenceImages, sourceNodeReferenceVideos, storedVideoReferenceInputs } from "../utils/canvas-generation-references";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

const NODE_STATUS_ERROR = "error" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;

type CanvasActionMessage = {
    error: (content: string) => void;
};

export type GenerateNodeResult = void | { ok: boolean; recoverable?: boolean; taskId?: string; resultAssetId?: string; errorDetails?: string };
type GenerateVideoNodeResult = {
    pendingChildIds: string[];
    ok?: boolean;
    recoverable?: boolean;
    taskId?: string;
    resultAssetId?: string;
    errorDetails?: string;
};

type UseCanvasGenerationFlowActionsOptions = {
    assets: Asset[];
    canvasAiConfig: AiConfig;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (open: boolean) => void;
    message: CanvasActionMessage;
    generateImageNode: (input: {
        nodeId: string;
        sourceNode?: CanvasNodeData;
        prompt: string;
        effectivePrompt: string;
        generationConfig: AiConfig;
        contextReferenceImages: Awaited<ReturnType<typeof hydrateNodeGenerationContext>>["referenceImages"];
    }) => Promise<{ pendingChildIds: string[] }>;
    generateVideoNode: (input: {
        nodeId: string;
        sourceNode?: CanvasNodeData;
        sourceConnections: CanvasConnection[];
        effectivePrompt: string;
        generationConfig: AiConfig;
        videoPlan: ReturnType<typeof buildVideoGenerationPlan>;
        setPendingChildIds: (ids: string[]) => void;
    }) => Promise<GenerateVideoNodeResult>;
    generateTextNode: (input: {
        nodeId: string;
        sourceNode?: CanvasNodeData;
        prompt: string;
        effectivePrompt: string;
        generationConfig: AiConfig;
        generationContext: Awaited<ReturnType<typeof hydrateNodeGenerationContext>>;
        editingTextNode: boolean;
    }) => Promise<{ pendingChildIds: string[] }>;
    confirmVideoPromptReview: (review: PromptReviewResult) => Promise<boolean>;
};

export function useCanvasGenerationFlowActions({
    assets,
    canvasAiConfig,
    nodesRef,
    connectionsRef,
    setNodes,
    setRunningNodeId,
    isAiConfigReady,
    openConfigDialog,
    message,
    generateImageNode,
    generateVideoNode,
    generateTextNode,
    confirmVideoPromptReview,
}: UseCanvasGenerationFlowActionsOptions) {
    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string): Promise<GenerateNodeResult> => {
            const synced = syncCanvasVolcengineAssetsFromLibrary(nodesRef.current, assets);
            const generationNodes = synced.nodes;
            if (synced.changed) {
                nodesRef.current = generationNodes;
                setNodes(generationNodes);
            }
            const sourceNode = generationNodes.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(canvasAiConfig, sourceNode, mode, defaultConfig);
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return { ok: false, errorDetails: "AI 配置未完成" };
            }

            setRunningNodeId(nodeId);
            const nodePrompt = String(prompt || sourceNode?.metadata?.prompt || sourceNode?.metadata?.finalPrompt || "").trim();
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            const generationContext = await hydrateNodeGenerationContext(
                buildNodeGenerationContext(nodeId, generationNodes, connectionsRef.current, editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${nodePrompt}` : nodePrompt),
            );
            const effectivePrompt = generationContext.prompt.trim();
            const isCompletedVideoSource = sourceNode?.type === CanvasNodeType.Video && Boolean(sourceNode.metadata?.content);
            const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode && !isCompletedVideoSource;
            if (!effectivePrompt && mode === "text") {
                setRunningNodeId(null);
                return { ok: false, errorDetails: "提示词为空" };
            }
            let pendingChildIds: string[] = [];
            if (markSourceStatus) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: nodePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));

            try {
                if (mode === "image") {
                    const imageResult = await generateImageNode({
                        nodeId,
                        sourceNode,
                        prompt: nodePrompt,
                        effectivePrompt,
                        generationConfig,
                        contextReferenceImages: generationContext.referenceImages,
                    });
                    pendingChildIds = imageResult.pendingChildIds;
                    return;
                }

                if (mode === "video") {
                    const isVideoVariantGeneration = shouldCreateVideoVariant(generationConfig, sourceNode);
                    const storedVariantImages = isVideoVariantGeneration ? await resolveStoredImageReferences(sourceNode?.metadata || {}) : undefined;
                    const storedVariantVideos = isVideoVariantGeneration ? await resolveStoredVideoReferences(sourceNode?.metadata || {}) : undefined;
                    const storedVariantAudios = isVideoVariantGeneration ? await resolveStoredAudioReferences(sourceNode?.metadata || {}) : undefined;
                    if (storedVariantImages === null) throw new Error("参考图片已丢失，无法继续生成变体");
                    if (storedVariantVideos === null) throw new Error("参考视频已丢失，无法继续生成变体");
                    if (storedVariantAudios === null) throw new Error("参考音频已丢失，无法继续生成变体");
                    const sourceImageReferences = isVideoVariantGeneration ? storedVariantImages || [] : sourceNodeReferenceImages(sourceNode, generationConfig.videoReferenceImageMode);
                    const sourceVideoReferences = isVideoVariantGeneration ? storedVariantVideos || [] : sourceNodeReferenceVideos(sourceNode);
                    const sourceAudioReferences = isVideoVariantGeneration ? storedVariantAudios || [] : sourceNodeReferenceAudios(sourceNode);
                    const sourceReferenceInputs =
                        isVideoVariantGeneration && sourceNode
                            ? storedVideoReferenceInputs(sourceNode.metadata || {}, sourceImageReferences, sourceVideoReferences, sourceAudioReferences) || directVideoReferenceInputs(sourceImageReferences, sourceVideoReferences, sourceAudioReferences)
                            : directVideoReferenceInputs(sourceImageReferences, sourceVideoReferences, sourceAudioReferences);
                    const videoPlan = buildVideoGenerationPlan({
                        config: generationConfig,
                        sourceNode,
                        sourceReferences: { images: sourceImageReferences, videos: sourceVideoReferences, audios: sourceAudioReferences, inputs: sourceReferenceInputs },
                        contextReferences: { images: generationContext.referenceImages, videos: generationContext.referenceVideos, audios: generationContext.referenceAudios, inputs: generationContext.referenceInputs },
                        storedVariantReferences: { images: storedVariantImages || [], videos: storedVariantVideos || [], audios: storedVariantAudios || [], inputs: sourceReferenceInputs },
                    });
                    const videoEffectivePrompt = withFrameReferencePrompt(effectivePrompt, videoPlan.references.images);
                    if (shouldRunVideoPromptReview(generationConfig)) {
                        const review = reviewVideoPromptBeforeGeneration({
                            prompt: videoEffectivePrompt,
                            seconds: generationConfig.videoSeconds,
                            taskMode: generationConfig.videoTaskMode,
                            referenceImageMode: generationConfig.videoReferenceImageMode,
                            imageReferenceCount: videoPlan.references.images.length,
                            videoReferenceCount: videoPlan.references.videos.length,
                            audioReferenceCount: videoPlan.references.audios.length,
                        });
                        if (review.level !== "pass" && !(await confirmVideoPromptReview(review))) {
                            if (markSourceStatus && sourceNode) {
                                setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: sourceNode.metadata } : node)));
                            }
                            return { ok: false, errorDetails: "已取消生成，等待修改提示词" };
                        }
                    }
                    const videoResult = await generateVideoNode({
                        nodeId,
                        sourceNode,
                        sourceConnections: connectionsRef.current.filter((connection) => connection.toNodeId === nodeId),
                        effectivePrompt: videoEffectivePrompt,
                        generationConfig,
                        videoPlan,
                        setPendingChildIds: (ids) => {
                            pendingChildIds = ids;
                        },
                    });
                    pendingChildIds = videoResult.pendingChildIds;
                    if ("recoverable" in videoResult && videoResult.recoverable) return { ok: false, recoverable: true, taskId: videoResult.taskId, errorDetails: videoResult.errorDetails };
                    return videoResult.ok === false ? { ok: false, errorDetails: videoResult.errorDetails } : { ok: true, taskId: videoResult.taskId, resultAssetId: videoResult.resultAssetId };
                }

                const textResult = await generateTextNode({
                    nodeId,
                    sourceNode,
                    prompt: nodePrompt,
                    effectivePrompt,
                    generationConfig,
                    generationContext,
                    editingTextNode,
                });
                pendingChildIds = textResult.pendingChildIds;
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                const failedAt = Date.now();
                if (mode === "video") {
                    const videoRecord = nodesRef.current.find((n) => n.id === nodeId || pendingChildIds.includes(n.id));
                    if (videoRecord?.metadata?.taskStatus === "succeeded" && videoRecord.metadata.videoUrl) {
                        setNodes((prev) =>
                            prev.map((node) =>
                                node.id === videoRecord.id
                                    ? {
                                          ...node,
                                          width: videoRecord.width,
                                          height: videoRecord.height,
                                          metadata: {
                                              ...node.metadata,
                                              status: NODE_STATUS_SUCCESS,
                                              errorDetails: undefined,
                                              content: videoRecord.metadata?.videoUrl,
                                              mimeType: "video/mp4",
                                          },
                                      }
                                    : node.id === nodeId && markSourceStatus
                                      ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                                      : node,
                            ),
                        );
                        setRunningNodeId(null);
                        return { ok: true };
                    }
                }
                message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((node) =>
                        node.id === nodeId || pendingChildIds.includes(node.id)
                            ? node.id === nodeId && !markSourceStatus
                                ? node
                                : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails, ...(node.type === CanvasNodeType.Video ? { taskUpdatedAt: failedAt } : {}) } }
                            : node,
                    ),
                );
                return { ok: false, errorDetails };
            } finally {
                setRunningNodeId(null);
            }
        },
        [assets, canvasAiConfig, confirmVideoPromptReview, connectionsRef, generateImageNode, generateTextNode, generateVideoNode, isAiConfigReady, message, nodesRef, openConfigDialog, setNodes, setRunningNodeId],
    );

    return { handleGenerateNode };
}

function withFrameReferencePrompt(prompt: string, images: Array<{ seedanceRole?: string }>) {
    const notes = images
        .map((image, index) => {
            if (image.seedanceRole === "first_frame") return `参考图${index + 1}作为视频首帧`;
            if (image.seedanceRole === "last_frame") return `参考图${index + 1}作为视频尾帧`;
            return "";
        })
        .filter(Boolean);
    if (!notes.length || prompt.includes("首尾帧设置：")) return prompt;
    return `${prompt}\n\n首尾帧设置：${notes.join("，")}。请严格保持首帧到尾帧的主体一致性、动作连续和画面风格一致。`;
}
