import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import type { AssetWriteInput } from "@/stores/use-asset-store";
import type { UploadedFile } from "@/services/file-storage";

import { NODE_DEFAULT_SIZE } from "../constants";
import { buildGeneratedVideoAsset } from "../utils/canvas-generated-asset";
import type { CanvasProjectPreset } from "../utils/canvas-project-preset";
import { buildVideoGenerationMetadata, videoTaskMetadata } from "../utils/canvas-generation-metadata";
import { createVideoGenerationNode } from "../utils/canvas-generation-nodes";
import { runCanvasVideoGeneration } from "../utils/canvas-generation-runner";
import { fitNodeSize, nodeSizeFromRatio } from "../utils/canvas-node-size";
import { buildCompletedVideoNode } from "../utils/canvas-node-status";
import type { VideoGenerationPlan } from "../utils/canvas-video-generation-plan";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
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
    projectTitle: string;
    projectPreset?: CanvasProjectPreset;
    archiveGeneratedAsset: (asset: AssetWriteInput) => Promise<void>;
};

type GenerateVideoNodeInput = {
    nodeId: string;
    sourceNode?: CanvasNodeData;
    effectivePrompt: string;
    generationConfig: AiConfig;
    videoPlan: VideoGenerationPlan;
    setPendingChildIds: (ids: string[]) => void;
};

export function useCanvasVideoGenerationActions({ setNodes, setConnections, cacheUploadedCanvasMedia, showWarning, toVideoMetadata, projectId, projectTitle, projectPreset, archiveGeneratedAsset }: UseCanvasVideoGenerationActionsOptions) {
    const generateVideoNode = useCallback(
        async ({ nodeId, sourceNode, effectivePrompt, generationConfig, videoPlan, setPendingChildIds }: GenerateVideoNodeInput) => {
            if (videoPlan.sourceVideoRequiredError) {
                const errorDetails = videoPlan.sourceVideoRequiredError;
                showWarning(errorDetails);
                setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                return { pendingChildIds: [] };
            }

            const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
            const generationStartedAt = Date.now();
            const createdAt = new Date(generationStartedAt).toISOString();
            const generationMetadata = buildVideoGenerationMetadata(generationConfig, videoPlan.references, videoPlan.relation);
            const { videoId, videoNode, isEmptyVideoNode, connection } = createVideoGenerationNode({
                nodeId,
                sourceNode,
                prompt: effectivePrompt,
                spec,
                metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, generationStartedAt, ...generationMetadata },
            });
            setPendingChildIds([videoId]);
            setNodes((prev) =>
                isEmptyVideoNode ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode } : node)) : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode],
            );
            if (connection) setConnections((prev) => [...prev, connection]);

            const { video, completedTask } = await runCanvasVideoGeneration(generationConfig, effectivePrompt, videoPlan.references, (task) => {
                setNodes((prev) => prev.map((node) => (node.id === videoId ? { ...node, metadata: { ...node.metadata, ...videoTaskMetadata(task), errorDetails: task.errorMessage } } : node)));
            });
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
            const asset = buildGeneratedVideoAsset(finalVideoNode, { projectId, projectTitle, projectPreset, prompt: effectivePrompt, effectivePrompt, config: generationConfig, createdAt });
            if (asset) void archiveGeneratedAsset(asset).catch(() => undefined);
            return { pendingChildIds: [videoId] };
        },
        [archiveGeneratedAsset, cacheUploadedCanvasMedia, projectId, projectPreset, projectTitle, setConnections, setNodes, showWarning, toVideoMetadata],
    );

    return { generateVideoNode };
}
