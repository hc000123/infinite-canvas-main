import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import { AI_VIDEO_POLL_INTERVAL_MS } from "@/services/api/ai-provider";
import { fetchVideoTaskContent, refreshVideoTask } from "@/services/api/video";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { defaultConfig, type AiConfig } from "@/stores/use-config-store";

import { NODE_DEFAULT_SIZE, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../constants";
import { buildGenerationConfig } from "../utils/canvas-generation-config";
import { videoTaskMetadata } from "../utils/canvas-generation-metadata";
import { fitNodeSize } from "../utils/canvas-node-size";
import { recoverableVideoTaskNodes, recoveredVideoTaskNodeStatus } from "../utils/canvas-video-task-recovery";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../types";

const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;

type UseCanvasVideoTaskRecoveryOptions = {
    projectLoaded: boolean;
    nodesRef: RefObject<CanvasNodeData[]>;
    recoveringVideoTaskIdsRef: RefObject<Set<string>>;
    canvasAiConfig: AiConfig;
    cacheUploadedCanvasMedia: (file: UploadedFile, filename: string) => Promise<Partial<CanvasNodeMetadata>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    toVideoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
    archiveRecoveredVideoNode: (node: CanvasNodeData, generationConfig: AiConfig, prompt?: string) => Promise<string | void | undefined>;
};

export function useCanvasVideoTaskRecovery({ projectLoaded, nodesRef, recoveringVideoTaskIdsRef, canvasAiConfig, cacheUploadedCanvasMedia, setNodes, toVideoMetadata, archiveRecoveredVideoNode }: UseCanvasVideoTaskRecoveryOptions) {
    useEffect(() => {
        if (!projectLoaded) return;
        const recoveryTaskIds = new Set(
            recoverableVideoTaskNodes(nodesRef.current)
                .map((node) => node.metadata?.taskId)
                .filter((taskId): taskId is string => Boolean(taskId)),
        );

        const recoverNodes = () => {
            recoverableVideoTaskNodes(nodesRef.current).forEach((node) => {
                const taskId = node.metadata?.taskId;
                if (!taskId || recoveringVideoTaskIdsRef.current.has(taskId)) return;
                if (node.metadata?.status === "error" || node.metadata?.errorDetails) recoveryTaskIds.add(taskId);
                if (!recoveryTaskIds.has(taskId)) return;
                recoveringVideoTaskIdsRef.current.add(taskId);
                void recoverVideoTaskNode({
                    node,
                    canvasAiConfig,
                    cacheUploadedCanvasMedia,
                    setNodes,
                    toVideoMetadata,
                    archiveRecoveredVideoNode,
                }).finally(() => {
                    recoveringVideoTaskIdsRef.current.delete(taskId);
                });
            });
        };

        recoverNodes();
        const timer = window.setInterval(recoverNodes, AI_VIDEO_POLL_INTERVAL_MS);
        window.addEventListener("online", recoverNodes);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("online", recoverNodes);
        };
    }, [archiveRecoveredVideoNode, cacheUploadedCanvasMedia, canvasAiConfig, nodesRef, projectLoaded, recoveringVideoTaskIdsRef, setNodes, toVideoMetadata]);
}

async function recoverVideoTaskNode({
    node,
    canvasAiConfig,
    cacheUploadedCanvasMedia,
    setNodes,
    toVideoMetadata,
    archiveRecoveredVideoNode,
}: {
    node: CanvasNodeData;
    canvasAiConfig: AiConfig;
    cacheUploadedCanvasMedia: (file: UploadedFile, filename: string) => Promise<Partial<CanvasNodeMetadata>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    toVideoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
    archiveRecoveredVideoNode: (node: CanvasNodeData, generationConfig: AiConfig, prompt?: string) => Promise<string | void | undefined>;
}) {
    try {
        const generationConfig = buildGenerationConfig(canvasAiConfig, node, "video", defaultConfig);
        const task = await refreshVideoTask(generationConfig, node.metadata?.taskId || "");
        const nextStatus = recoveredVideoTaskNodeStatus(task.status);
        if (nextStatus !== "success") {
            setNodes((prev) =>
                prev.map((item) =>
                    item.id === node.id
                        ? {
                              ...item,
                              metadata: {
                                  ...item.metadata,
                                  ...videoTaskMetadata(task),
                                  status: nextStatus,
                                  errorDetails: nextStatus === "error" ? task.errorMessage || "视频生成失败" : task.errorMessage,
                              },
                          }
                        : item,
                ),
            );
            return;
        }

        const video = await uploadMediaFile(await fetchVideoTaskContent(generationConfig, task), "video");
        const cachedVideo = await cacheUploadedCanvasMedia(video, `${node.id}.mp4`);
        const videoSize = fitNodeSize(video.width || node.width || NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, video.height || node.height || NODE_DEFAULT_SIZE[CanvasNodeType.Video].height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        const completedVideoNode: CanvasNodeData = {
            ...node,
            width: videoSize.width,
            height: videoSize.height,
            position: { x: node.position.x + node.width / 2 - videoSize.width / 2, y: node.position.y + node.height / 2 - videoSize.height / 2 },
            metadata: {
                ...node.metadata,
                ...toVideoMetadata(video),
                ...cachedVideo,
                ...videoTaskMetadata(task),
                status: NODE_STATUS_SUCCESS,
                taskStatus: "succeeded",
                errorDetails: undefined,
            },
        };
        setNodes((prev) =>
            prev.map((item) =>
                item.id === node.id
                    ? {
                          ...completedVideoNode,
                          position: { x: item.position.x + item.width / 2 - videoSize.width / 2, y: item.position.y + item.height / 2 - videoSize.height / 2 },
                          metadata: { ...item.metadata, ...completedVideoNode.metadata },
                      }
                    : item,
            ),
        );
        await archiveRecoveredVideoNode(completedVideoNode, generationConfig, completedVideoNode.metadata?.prompt || "").catch(() => undefined);
    } catch (error) {
        setNodes((prev) =>
            prev.map((item) =>
                item.id === node.id
                    ? {
                          ...item,
                          metadata: {
                              ...item.metadata,
                              status: NODE_STATUS_LOADING,
                              errorDetails: error instanceof Error ? error.message : "恢复视频任务失败",
                          },
                      }
                    : item,
            ),
        );
    }
}
