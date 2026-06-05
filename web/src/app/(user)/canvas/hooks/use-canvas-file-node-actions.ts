import { useCallback, type ChangeEvent as ReactChangeEvent, type Dispatch, type DragEvent as ReactDragEvent, type RefObject, type SetStateAction } from "react";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { uploadImage, type UploadedImage } from "@/services/image-storage";

import { NODE_DEFAULT_SIZE, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "../constants";
import { fitNodeSize } from "../utils/canvas-node-size";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "../types";

type UploadTarget = { nodeId?: string; position?: Position } | null;

type UseCanvasFileNodeActionsOptions = {
    containerRef: RefObject<HTMLDivElement | null>;
    imageInputRef: RefObject<HTMLInputElement | null>;
    uploadTargetRef: RefObject<UploadTarget>;
    nodesRef: RefObject<CanvasNodeData[]>;
    size: { width: number; height: number };
    screenToCanvas: (clientX: number, clientY: number) => Position;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    showSuccess: (text: string) => void;
    addCanvasNodeToAssets: (node: CanvasNodeData) => Promise<boolean>;
    toImageMetadata: (image: UploadedImage) => CanvasNodeMetadata;
    toVideoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
    toAudioMetadata: (audio: UploadedFile) => CanvasNodeMetadata;
};

export function useCanvasFileNodeActions({
    containerRef,
    imageInputRef,
    uploadTargetRef,
    nodesRef,
    size,
    screenToCanvas,
    setNodes,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    showSuccess,
    addCanvasNodeToAssets,
    toImageMetadata,
    toVideoMetadata,
    toAudioMetadata,
}: UseCanvasFileNodeActionsOptions) {
    const createImageFileNode = useCallback(
        async (file: File, position: Position) => {
            const image = await uploadImage(file);
            const size = fitNodeSize(image.width, image.height);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: toImageMetadata(image),
            };

            setNodes((prev) => [...prev, newNode]);
            await addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [addCanvasNodeToAssets, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, toImageMetadata],
    );

    const createVideoFileNode = useCallback(
        async (file: File, position: Position) => {
            const video = await uploadMediaFile(file, "video");
            const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
            const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode: CanvasNodeData = {
                id,
                type: CanvasNodeType.Video,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: toVideoMetadata(video),
            };
            setNodes((prev) => [...prev, newNode]);
            await addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [addCanvasNodeToAssets, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, toVideoMetadata],
    );

    const createAudioFileNode = useCallback(
        async (file: File, position: Position) => {
            const audio = await uploadMediaFile(file, "audio");
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
            const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode: CanvasNodeData = {
                id,
                type: CanvasNodeType.Audio,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: spec.width,
                height: spec.height,
                metadata: toAudioMetadata(audio),
            };
            setNodes((prev) => [...prev, newNode]);
            await addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
        },
        [addCanvasNodeToAssets, setNodes, setSelectedConnectionId, setSelectedNodeIds, toAudioMetadata],
    );

    const createFileNode = useCallback(
        (file: File, position: Position) => {
            if (file.type.startsWith("audio/")) return createAudioFileNode(file, position);
            if (file.type.startsWith("video/")) return createVideoFileNode(file, position);
            return createImageFileNode(file, position);
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode],
    );

    const handleUploadRequest = useCallback(
        (nodeId?: string, position?: Position) => {
            uploadTargetRef.current = { nodeId, position };
            imageInputRef.current?.click();
        },
        [imageInputRef, uploadTargetRef],
    );

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file || !isSupportedCanvasFile(file)) return;

            if (target?.nodeId) {
                const currentNode = nodesRef.current.find((node) => node.id === target.nodeId);
                if (!currentNode) return;

                if (file.type.startsWith("audio/")) {
                    const audio = await uploadMediaFile(file, "audio");
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const nextNode: CanvasNodeData = {
                        ...currentNode,
                        type: CanvasNodeType.Audio,
                        title: file.name,
                        position: { x: currentNode.position.x + currentNode.width / 2 - spec.width / 2, y: currentNode.position.y + currentNode.height / 2 - spec.height / 2 },
                        width: spec.width,
                        height: spec.height,
                        metadata: { ...currentNode.metadata, ...toAudioMetadata(audio), errorDetails: undefined },
                    };
                    setNodes((prev) => prev.map((node) => (node.id === target.nodeId ? nextNode : node)));
                    await addCanvasNodeToAssets(nextNode);
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(null);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }

                if (file.type.startsWith("video/")) {
                    const video = await uploadMediaFile(file, "video");
                    const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    const nextNode: CanvasNodeData = {
                        ...currentNode,
                        type: CanvasNodeType.Video,
                        title: file.name,
                        position: { x: currentNode.position.x + currentNode.width / 2 - nextSize.width / 2, y: currentNode.position.y + currentNode.height / 2 - nextSize.height / 2 },
                        width: nextSize.width,
                        height: nextSize.height,
                        metadata: { ...currentNode.metadata, ...toVideoMetadata(video), errorDetails: undefined },
                    };
                    setNodes((prev) => prev.map((node) => (node.id === target.nodeId ? nextNode : node)));
                    await addCanvasNodeToAssets(nextNode);
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }

                const image = await uploadImage(file);
                const size = fitNodeSize(image.width, image.height);
                const nextNode: CanvasNodeData = {
                    ...currentNode,
                    type: CanvasNodeType.Image,
                    title: file.name,
                    width: size.width,
                    height: size.height,
                    metadata: {
                        ...currentNode.metadata,
                        ...toImageMetadata(image),
                        errorDetails: undefined,
                        freeResize: false,
                        isBatchRoot: undefined,
                        batchRootId: undefined,
                        batchChildIds: undefined,
                        batchUsesReferenceImages: undefined,
                        generationType: undefined,
                        model: undefined,
                        size: undefined,
                        quality: undefined,
                        count: undefined,
                        references: undefined,
                        primaryImageId: undefined,
                        imageBatchExpanded: undefined,
                    },
                };
                setNodes((prev) => prev.map((node) => (node.id === target.nodeId ? nextNode : node)));
                await addCanvasNodeToAssets(nextNode);
                setSelectedNodeIds(new Set([target.nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(target.nodeId);
            } else {
                const position = target?.position || getCanvasCenterFromContainer(containerRef, size, screenToCanvas);
                void createFileNode(file, position);
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [addCanvasNodeToAssets, containerRef, createFileNode, nodesRef, screenToCanvas, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, size, toAudioMetadata, toImageMetadata, toVideoMetadata, uploadTargetRef],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const file = Array.from(event.dataTransfer.files).find(isSupportedCanvasFile);
            if (!file) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            void createFileNode(file, pos);
        },
        [createFileNode, screenToCanvas],
    );

    const pasteAssistantImage = useCallback(
        (file: File) => {
            const position = getCanvasCenterFromContainer(containerRef, size, screenToCanvas);
            void createImageFileNode(file, position);
            showSuccess("已从剪切板添加图片");
        },
        [containerRef, createImageFileNode, screenToCanvas, showSuccess, size],
    );

    return {
        createImageFileNode,
        createVideoFileNode,
        createAudioFileNode,
        handleUploadRequest,
        handleImageInputChange,
        handleDrop,
        pasteAssistantImage,
    };
}

function isSupportedCanvasFile(file: File) {
    return file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/");
}

function getCanvasCenterFromContainer(containerRef: RefObject<HTMLDivElement | null>, size: { width: number; height: number }, screenToCanvas: (clientX: number, clientY: number) => Position) {
    const rect = containerRef.current?.getBoundingClientRect();
    return screenToCanvas((rect?.left || 0) + size.width / 2, (rect?.top || 0) + size.height / 2);
}
