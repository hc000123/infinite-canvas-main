import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import type { AssetWriteInput } from "@/stores/use-asset-store";
import { isRecoverableVideoTaskError } from "@/services/api/video";
import type { UploadedFile } from "@/services/file-storage";

import { NODE_DEFAULT_SIZE, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../constants";
import { buildGeneratedVideoAsset } from "../utils/canvas-generated-asset";
import { canvasEpisodeMetadata, type CanvasEpisodeContext } from "../utils/canvas-episode-context";
import type { CanvasProjectPreset } from "../utils/canvas-project-preset";
import { buildVideoGenerationMetadata, videoTaskMetadata } from "../utils/canvas-generation-metadata";
import { createVideoGenerationNode } from "../utils/canvas-generation-nodes";
import { runCanvasVideoGeneration } from "../utils/canvas-generation-runner";
import { buildCanvasAiTaskTrace } from "../utils/canvas-ai-task-trace";
import { appendSeedanceMediaReviewDiagnostic } from "../utils/canvas-volcengine-review-diagnostics";
import { fitNodeSize, nodeSizeFromRatio } from "../utils/canvas-node-size";
import { buildCompletedVideoNode } from "../utils/canvas-node-status";
import type { VideoGenerationPlan } from "../utils/canvas-video-generation-plan";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

const NODE_STATUS_ERROR = "error" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;

type UseCanvasVideoGenerationActionsOptions = {
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    cacheUploadedCanvasMedia: (file: UploadedFile, filename: string) => Promise<Partial<CanvasNodeMetadata>>;
    showWarning: (message: string) => void;
    toVideoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
    projectId: string;
    canvasId: string;
    projectTitle: string;
    projectPreset?: CanvasProjectPreset;
    episodeContext?: CanvasEpisodeContext;
    archiveGeneratedAsset: (asset: AssetWriteInput) => Promise<string | void>;
};

type GenerateVideoNodeInput = {
    nodeId: string;
    sourceNode?: CanvasNodeData;
    effectivePrompt: string;
    generationConfig: AiConfig;
    videoPlan: VideoGenerationPlan;
    setPendingChildIds: (ids: string[]) => void;
};

export function useCanvasVideoGenerationActions({
    setNodes,
    setConnections,
    cacheUploadedCanvasMedia,
    showWarning,
    toVideoMetadata,
    projectId,
    canvasId,
    projectTitle,
    projectPreset,
    episodeContext,
    archiveGeneratedAsset,
}: UseCanvasVideoGenerationActionsOptions) {
    const generateVideoNode = useCallback(
        async ({ nodeId, sourceNode, effectivePrompt, generationConfig, videoPlan, setPendingChildIds }: GenerateVideoNodeInput) => {
            if (videoPlan.sourceVideoRequiredError) {
                const errorDetails = videoPlan.sourceVideoRequiredError;
                const failedAt = Date.now();
                showWarning(errorDetails);
                setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails, taskUpdatedAt: failedAt } } : node)));
                return { pendingChildIds: [], ok: false, errorDetails };
            }
            if (videoPlan.imageReviewRequiredError) {
                const errorDetails = videoPlan.imageReviewRequiredError;
                const failedAt = Date.now();
                showWarning(errorDetails);
                setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails, taskUpdatedAt: failedAt } } : node)));
                return { pendingChildIds: [], ok: false, errorDetails };
            }

            const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
            const generationStartedAt = Date.now();
            const createdAt = new Date(generationStartedAt).toISOString();
            const generationMetadata = {
                ...buildVideoGenerationMetadata(generationConfig, videoPlan.references, videoPlan.relation),
                ...canvasEpisodeMetadata(episodeContext),
                storyboardGroupId: sourceNode?.metadata?.storyboardGroupId,
                storyboardShotId: sourceNode?.metadata?.storyboardShotId,
                shotGroupId: sourceNode?.metadata?.shotGroupId,
                shotIds: sourceNode?.metadata?.shotIds,
                storyboardShotGroupId: sourceNode?.metadata?.storyboardShotGroupId,
                storyboardTableShotIds: sourceNode?.metadata?.storyboardTableShotIds,
            };
            const { videoId, videoNode, isEmptyVideoNode, connection } = createVideoGenerationNode({
                nodeId,
                sourceNode,
                prompt: effectivePrompt,
                spec,
                metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, generationStartedAt, ...generationMetadata },
            });
            useStoryboardStore.getState().markShotGenerating({ storyboardShotId: generationMetadata.storyboardShotId, nodeId: videoId });
            useStoryboardStore.getState().markShotGroupGenerating({ shotGroupId: generationMetadata.shotGroupId, taskId: undefined });
            setPendingChildIds([videoId]);
            setNodes((prev) =>
                isEmptyVideoNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode],
            );
            if (connection) setConnections((prev) => [...prev, connection]);

            try {
                const trace = buildCanvasAiTaskTrace({ projectId, canvasId, nodeId: videoId, metadata: generationMetadata });
                const { video, completedTask } = await runCanvasVideoGeneration(
                    generationConfig,
                    effectivePrompt,
                    videoPlan.references,
                    (task) => {
                        useStoryboardStore.getState().markShotGenerating({ storyboardShotId: generationMetadata.storyboardShotId, nodeId: videoId, taskId: task.id });
                        useStoryboardStore.getState().markShotGroupGenerating({ shotGroupId: generationMetadata.shotGroupId, taskId: task.id });
                        setNodes((prev) => prev.map((node) => (node.id === videoId ? { ...node, metadata: { ...node.metadata, ...videoTaskMetadata(task), errorDetails: task.errorMessage } } : node)));
                    },
                    trace,
                );
                const cachedVideo = await cacheUploadedCanvasMedia(video, `${videoId}.mp4`);
                const videoSize = fitNodeSize(video.width || spec.width, video.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const finalVideoNode = buildCompletedVideoNode({
                    videoNode,
                    videoSize,
                    videoMetadata: toVideoMetadata(video),
                    cachedVideoMetadata: cachedVideo,
                    taskMetadata: completedTask ? videoTaskMetadata(completedTask) : undefined,
                    generationMetadata,
                    prompt: effectivePrompt,
                });
                setNodes((prev) => prev.map((node) => (node.id === videoId ? finalVideoNode : node)));
                const asset = buildGeneratedVideoAsset(finalVideoNode, { projectId, projectTitle, projectPreset, episodeContext, prompt: effectivePrompt, effectivePrompt, config: generationConfig, createdAt });
                const assetId = asset ? await archiveGeneratedAsset(asset).catch(() => undefined) : undefined;
                useStoryboardStore.getState().markShotSucceeded({ storyboardShotId: generationMetadata.storyboardShotId, assetId: typeof assetId === "string" ? assetId : undefined, nodeId: videoId, taskId: finalVideoNode.metadata?.taskId });
                useStoryboardStore.getState().markShotGroupSucceeded({ shotGroupId: generationMetadata.shotGroupId, assetId: typeof assetId === "string" ? assetId : undefined, taskId: finalVideoNode.metadata?.taskId });
                return { pendingChildIds: [videoId], ok: true, taskId: finalVideoNode.metadata?.taskId, resultAssetId: typeof assetId === "string" ? assetId : undefined };
            } catch (error) {
                const errorMessage = appendSeedanceMediaReviewDiagnostic(error instanceof Error ? error.message : "视频生成失败", videoPlan.references.images, videoPlan.references.videos);
                if (isRecoverableVideoTaskError(error)) {
                    showWarning(errorMessage);
                    useStoryboardStore.getState().markShotGroupGenerating({ shotGroupId: generationMetadata.shotGroupId, taskId: error.task.id });
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === videoId
                                ? {
                                      ...node,
                                      metadata: {
                                          ...node.metadata,
                                          ...videoTaskMetadata(error.task),
                                          status: NODE_STATUS_LOADING,
                                          errorDetails: errorMessage,
                                      },
                                  }
                                : node,
                        ),
                    );
                    return { pendingChildIds: [videoId], ok: false, recoverable: true, taskId: error.task.id, errorDetails: errorMessage };
                }
                const latestTaskId = useStoryboardStore.getState().shots.find((shot) => shot.id === generationMetadata.storyboardShotId)?.lastTaskId;
                useStoryboardStore.getState().markShotFailed({ storyboardShotId: generationMetadata.storyboardShotId, nodeId: videoId, taskId: latestTaskId, errorMessage });
                useStoryboardStore.getState().markShotGroupFailed({ shotGroupId: generationMetadata.shotGroupId, taskId: latestTaskId, errorMessage });
                if (connection) {
                    setConnections((prev) => prev.filter((item) => item.id !== connection.id));
                }
                throw new Error(errorMessage);
            }
        },
        [archiveGeneratedAsset, cacheUploadedCanvasMedia, canvasId, episodeContext, projectId, projectPreset, projectTitle, setConnections, setNodes, showWarning, toVideoMetadata],
    );

    return { generateVideoNode };
}
