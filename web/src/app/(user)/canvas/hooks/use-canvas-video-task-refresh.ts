import { useCallback, type Dispatch, type SetStateAction } from "react";

import { fetchVideoTaskContent, refreshVideoTask } from "@/services/api/video";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { defaultConfig, type AiConfig } from "@/stores/use-config-store";

import { NODE_DEFAULT_SIZE, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../constants";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../types";
import { buildGenerationConfig } from "../utils/canvas-generation-config";
import { videoTaskMetadata } from "../utils/canvas-generation-metadata";
import { fitNodeSize } from "../utils/canvas-node-size";

type CanvasVideoTaskRefreshMessage = {
    error: (text: string) => void;
    success: (text: string) => void;
    warning: (text: string) => void;
};

export function useCanvasVideoTaskRefresh({
    archiveGeneratedVideoNode,
    cacheUploadedCanvasMedia,
    canvasAiConfig,
    message,
    setNodes,
    toVideoMetadata,
}: {
    archiveGeneratedVideoNode: (node: CanvasNodeData, generationConfig: AiConfig, prompt?: string) => Promise<string | void | undefined>;
    cacheUploadedCanvasMedia: (file: UploadedFile, filename: string) => Promise<Partial<CanvasNodeMetadata>>;
    canvasAiConfig: AiConfig;
    message: CanvasVideoTaskRefreshMessage;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    toVideoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
}) {
    const handleRefreshVideoTask = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Video || !node.metadata?.taskId) {
                message.warning("没有可刷新的视频任务");
                return;
            }
            try {
                const generationConfig = buildGenerationConfig(canvasAiConfig, node, "video", defaultConfig);
                const task = await refreshVideoTask(generationConfig, node.metadata.taskId);
                if (task.status === "succeeded") {
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
                            status: "success",
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
                    await archiveGeneratedVideoNode(completedVideoNode, generationConfig, completedVideoNode.metadata?.prompt || "");
                    message.success("视频已回填");
                    return;
                }
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...videoTaskMetadata(task), errorDetails: task.errorMessage } } : item)));
                message.success(`任务状态：${task.status}`);
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "刷新任务失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, errorDetails } } : item)));
            }
        },
        [archiveGeneratedVideoNode, cacheUploadedCanvasMedia, canvasAiConfig, message, setNodes, toVideoMetadata],
    );

    return { handleRefreshVideoTask };
}
