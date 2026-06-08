"use client";

import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import { nanoid } from "nanoid";

import { requestEdit } from "@/services/api/image";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { useLocalAiTaskLogStore } from "@/stores/use-local-ai-task-log-store";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "../constants";
import { buildGenerationConfig } from "../utils/canvas-generation-config";
import { buildImageGenerationMetadata } from "../utils/canvas-generation-metadata";
import type { CanvasEpisodeContext } from "../utils/canvas-episode-context";
import { buildAngleImageNode, buildAnglePrompt, buildAngleReferenceImage, buildCroppedImageNode, type CanvasImageAngleParams, type CanvasImageCropRect } from "../utils/canvas-image-derivatives";
import { cropDataUrl } from "../utils/canvas-image-data";
import { fitNodeSize } from "../utils/canvas-node-size";
import { placeCanvasNodeAwayFromNodes } from "../utils/canvas-node-placement";
import { buildCompletedImageNode } from "../utils/canvas-node-status";
import { buildContinuousVideoChain } from "../utils/canvas-video-chain";
import { buildCapturedVideoFrameNode } from "../utils/canvas-video-frame";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../types";

const NODE_STATUS_ERROR = "error" as const;
const NODE_STATUS_SUCCESS = "success" as const;

type CanvasMessage = {
    success: (content: string) => void;
    warning: (content: string) => void;
    error: (content: string) => void;
};

type UseCanvasNodeDerivativeActionsOptions = {
    nodesRef: RefObject<CanvasNodeData[]>;
    connectionsRef: RefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setAngleNodeId: Dispatch<SetStateAction<string | null>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    canvasAiConfig: AiConfig;
    defaultConfig: AiConfig;
    openConfigDialog: (open?: boolean) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    canvasId: string;
    workspaceProjectId: string;
    canvasEpisodeContext: CanvasEpisodeContext | null | undefined;
    message: CanvasMessage;
    createNode: (type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata) => CanvasNodeData;
    imageMetadata: (image: UploadedImage) => CanvasNodeMetadata;
};

export function useCanvasNodeDerivativeActions({
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    setCropNodeId,
    setAngleNodeId,
    setRunningNodeId,
    canvasAiConfig,
    defaultConfig,
    openConfigDialog,
    isAiConfigReady,
    canvasId,
    workspaceProjectId,
    canvasEpisodeContext,
    message,
    createNode,
    imageMetadata,
}: UseCanvasNodeDerivativeActionsOptions) {
    const cropImageNode = useCallback(
        async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
            if (!node.metadata?.content) return;
            const cropped = await cropDataUrl(node.metadata.content, crop);
            const image = await uploadImage(cropped);
            const childId = nanoid();
            const child = buildCroppedImageNode({
                sourceNode: node,
                childId,
                imageSize: image,
                imageMetadata: imageMetadata(image),
            });
            setNodes((prev) => [...prev, child]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            setCropNodeId(null);
        },
        [imageMetadata, setConnections, setCropNodeId, setDialogNodeId, setNodes, setSelectedNodeIds],
    );

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(canvasAiConfig, node, "image", defaultConfig), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const referenceImage = buildAngleReferenceImage(node);
            if (!referenceImage) return;
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [referenceImage]);
            const child = buildAngleImageNode({
                sourceNode: node,
                childId,
                params,
                imageSpec: imageConfig,
                generationMetadata,
            });
            const prompt = child.metadata?.prompt || buildAnglePrompt(params);
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [...prev, child]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            try {
                const image = await requestEdit(generationConfig, prompt, [referenceImage], undefined, {
                    projectId: workspaceProjectId,
                    canvasId,
                    episodeId: canvasEpisodeContext?.episodeId,
                    sourceType: "image_generation",
                    sourceId: childId,
                    inputSummary: summarizeLocalImageInput(prompt, 1),
                }).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                if (image.localAiTaskId) updateLocalImageResultSize(image.localAiTaskId, uploaded.width, uploaded.height);
                const size = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? buildCompletedImageNode({ imageNode: item, imageSize: size, imageMetadata: imageMetadata(uploaded), generationMetadata, prompt }) : item)));
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                setRunningNodeId(null);
            }
        },
        [canvasAiConfig, canvasEpisodeContext, canvasId, defaultConfig, imageMetadata, isAiConfigReady, openConfigDialog, setAngleNodeId, setConnections, setDialogNodeId, setNodes, setRunningNodeId, setSelectedNodeIds, workspaceProjectId],
    );

    const handleContinueVideoNode = useCallback(
        async (videoNode: CanvasNodeData) => {
            const lastFrameUrl = videoNode.metadata?.lastFrameUrl;
            if (videoNode.type !== CanvasNodeType.Video || !lastFrameUrl) {
                message.warning("没有可续写的尾帧");
                return;
            }
            try {
                const lastFrameBlob = await fetchCanvasImageBlob(lastFrameUrl);
                if (!lastFrameBlob) {
                    message.warning("没有可续写的尾帧");
                    return;
                }
                const generationConfig = buildGenerationConfig(canvasAiConfig, videoNode, "video", defaultConfig);
                const lastFrameImage = await uploadImage(lastFrameBlob);
                const chain = buildContinuousVideoChain({ videoNode, lastFrameImage, lastFrameMetadata: imageMetadata(lastFrameImage), config: generationConfig });
                setNodes((prev) => [...prev.map((node) => (node.id === videoNode.id ? { ...node, metadata: { ...node.metadata, lastFrameStorageKey: lastFrameImage.storageKey } } : node)), chain.lastFrameNode, chain.nextVideoNode]);
                setConnections((prev) => [...prev, ...chain.connections]);
                setSelectedNodeIds(new Set([chain.nextVideoNode.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(chain.nextVideoNode.id);
            } catch (error) {
                message.warning(error instanceof Error ? `连续视频节点创建失败：${error.message}` : "连续视频节点创建失败");
            }
        },
        [canvasAiConfig, defaultConfig, imageMetadata, message, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const captureVideoCurrentFrame = useCallback(
        async (videoNode: CanvasNodeData) => {
            if (videoNode.type !== CanvasNodeType.Video || !videoNode.metadata?.content) {
                message.warning("没有可截取的视频");
                return;
            }
            try {
                const video = findVideoElement(videoNode.id);
                if (!video) throw new Error("没有找到视频播放器，请先打开或刷新该视频节点");
                const frame = await captureVideoElementFrame(video);
                const uploaded = await uploadImage(frame.blob);
                const { frameNode, connection } = buildCapturedVideoFrameNode({
                    videoNode,
                    image: uploaded,
                    imageMetadata: imageMetadata(uploaded),
                    capturedTime: frame.currentTime,
                    capturedAt: new Date().toISOString(),
                });
                setNodes((prev) => [...prev, frameNode]);
                setConnections((prev) => [...prev, connection]);
                setSelectedNodeIds(new Set([frameNode.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(frameNode.id);
                message.success(`已截取当前帧：${formatVideoFrameTime(frame.currentTime)}`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "截取当前帧失败");
            }
        },
        [imageMetadata, message, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = placeCanvasNodeAwayFromNodes(
                createNode(
                    CanvasNodeType.Config,
                    {
                        x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                        y: sourceNode.position.y + sourceNode.height / 2,
                    },
                    {
                        prompt: "",
                        model: canvasAiConfig.imageModel || canvasAiConfig.model,
                        size: canvasAiConfig.size,
                        count: 3,
                    },
                ),
                nodesRef.current,
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [canvasAiConfig.imageModel, canvasAiConfig.model, canvasAiConfig.size, connectionsRef, createNode, message, nodesRef, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    return {
        cropImageNode,
        generateAngleNode,
        handleContinueVideoNode,
        captureVideoCurrentFrame,
        generateImageFromTextNode,
    };
}

async function fetchCanvasImageBlob(url: string) {
    if (!url) return null;
    const response = await fetch(url);
    return response.blob();
}

function findVideoElement(nodeId: string) {
    const selector = `[data-node-id="${cssEscape(nodeId)}"] video`;
    return document.querySelector<HTMLVideoElement>(selector);
}

async function captureVideoElementFrame(video: HTMLVideoElement): Promise<{ blob: Blob; currentTime: number }> {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
        throw new Error("视频尚未加载到可截取画面，请等待画面出现后再试");
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法创建截图画布");
    const currentTime = video.currentTime;
    try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (error) {
        throw new Error(error instanceof DOMException && error.name === "SecurityError" ? "视频来源跨域，当前画布无法截取该帧" : "无法绘制当前视频帧");
    }
    const blob = await canvasToPngBlob(canvas);
    return { blob, currentTime };
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
        try {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("无法导出当前视频帧，可能是跨域视频污染了画布"));
            }, "image/png");
        } catch (error) {
            reject(error instanceof DOMException && error.name === "SecurityError" ? new Error("视频来源跨域，当前画布无法截取该帧") : error);
        }
    });
}

function cssEscape(value: string) {
    return typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function formatVideoFrameTime(value: number) {
    return `${Math.max(0, Math.round(value * 1000) / 1000)}s`;
}

function updateLocalImageResultSize(localAiTaskId: string, width: number, height: number) {
    const resultImageSize = `${width}x${height}`;
    useLocalAiTaskLogStore.getState().updateTask(localAiTaskId, {
        resultImageSize,
        outputSummary: `图片已生成，返回尺寸 ${resultImageSize}`,
    });
}

function summarizeLocalImageInput(prompt: string, referenceCount: number) {
    const text = prompt.replace(/\s+/g, " ").trim();
    const summary = text.length > 160 ? `${text.slice(0, 160)}...` : text;
    return referenceCount ? `${summary || "生图提示词为空"}；参考图 ${referenceCount} 张` : summary || "生图提示词为空";
}
