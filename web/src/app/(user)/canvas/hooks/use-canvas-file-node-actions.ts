import { useCallback, type ChangeEvent as ReactChangeEvent, type Dispatch, type DragEvent as ReactDragEvent, type RefObject, type SetStateAction } from "react";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { uploadImage, type UploadedImage } from "@/services/image-storage";

import { buildUploadedAudioFileNode, buildUploadedImageFileNode, buildUploadedVideoFileNode, replaceNodeWithUploadedAudioFile, replaceNodeWithUploadedImageFile, replaceNodeWithUploadedVideoFile } from "../utils/canvas-uploaded-file-node";
import { placeCanvasNodeAwayFromNodes } from "../utils/canvas-node-placement";
import type { CanvasNodeData, CanvasNodeMetadata, Position } from "../types";

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
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode = placeCanvasNodeAwayFromNodes(
                buildUploadedImageFileNode({
                    id,
                    title: file.name,
                    center: position,
                    file: image,
                    metadata: toImageMetadata(image),
                }),
                nodesRef.current,
            );

            setNodes((prev) => [...prev, newNode]);
            await addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
            return id;
        },
        [addCanvasNodeToAssets, nodesRef, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, toImageMetadata],
    );

    const createVideoFileNode = useCallback(
        async (file: File, position: Position) => {
            const video = await uploadMediaFile(file, "video");
            const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode = placeCanvasNodeAwayFromNodes(
                buildUploadedVideoFileNode({
                    id,
                    title: file.name,
                    center: position,
                    file: video,
                    metadata: toVideoMetadata(video),
                }),
                nodesRef.current,
            );
            setNodes((prev) => [...prev, newNode]);
            await addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
            return id;
        },
        [addCanvasNodeToAssets, nodesRef, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, toVideoMetadata],
    );

    const createAudioFileNode = useCallback(
        async (file: File, position: Position) => {
            const audio = await uploadMediaFile(file, "audio");
            const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode = placeCanvasNodeAwayFromNodes(
                buildUploadedAudioFileNode({
                    id,
                    title: file.name,
                    center: position,
                    file: audio,
                    metadata: toAudioMetadata(audio),
                }),
                nodesRef.current,
            );
            setNodes((prev) => [...prev, newNode]);
            await addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            return id;
        },
        [addCanvasNodeToAssets, nodesRef, setNodes, setSelectedConnectionId, setSelectedNodeIds, toAudioMetadata],
    );

    const createFileNode = useCallback(
        (file: File, position: Position) => {
            if (file.type.startsWith("audio/")) return createAudioFileNode(file, position);
            if (file.type.startsWith("video/")) return createVideoFileNode(file, position);
            return createImageFileNode(file, position);
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode],
    );

    const createFileNodes = useCallback(
        async (files: File[], position: Position) => {
            const ids: string[] = [];
            for (const [index, file] of files.entries()) {
                const id = await createFileNode(file, getBatchDropPosition(position, index));
                if (id) ids.push(id);
            }
            if (ids.length > 1) {
                setSelectedNodeIds(new Set(ids));
                setSelectedConnectionId(null);
                setDialogNodeId(null);
                showSuccess(`已添加 ${ids.length} 个素材到画布`);
            }
        },
        [createFileNode, setDialogNodeId, setSelectedConnectionId, setSelectedNodeIds, showSuccess],
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
            const files = Array.from(event.target.files || []).filter(isSupportedCanvasFile);
            const file = files[0];
            const target = uploadTargetRef.current;
            if (!file) return;

            if (target?.nodeId) {
                const currentNode = nodesRef.current.find((node) => node.id === target.nodeId);
                if (!currentNode) return;

                if (file.type.startsWith("audio/")) {
                    const audio = await uploadMediaFile(file, "audio");
                    const nextNode = replaceNodeWithUploadedAudioFile({
                        currentNode,
                        title: file.name,
                        file: audio,
                        metadata: toAudioMetadata(audio),
                    });
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
                    const nextNode = replaceNodeWithUploadedVideoFile({
                        currentNode,
                        title: file.name,
                        file: video,
                        metadata: toVideoMetadata(video),
                    });
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
                const nextNode = replaceNodeWithUploadedImageFile({
                    currentNode,
                    title: file.name,
                    file: image,
                    metadata: toImageMetadata(image),
                });
                setNodes((prev) => prev.map((node) => (node.id === target.nodeId ? nextNode : node)));
                await addCanvasNodeToAssets(nextNode);
                setSelectedNodeIds(new Set([target.nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(target.nodeId);
            } else {
                const position = target?.position || getCanvasCenterFromContainer(containerRef, size, screenToCanvas);
                void createFileNodes(files, position);
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [addCanvasNodeToAssets, containerRef, createFileNodes, nodesRef, screenToCanvas, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, size, toAudioMetadata, toImageMetadata, toVideoMetadata, uploadTargetRef],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const files = Array.from(event.dataTransfer.files).filter(isSupportedCanvasFile);
            if (!files.length) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            void createFileNodes(files, pos);
        },
        [createFileNodes, screenToCanvas],
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

function getBatchDropPosition(position: Position, index: number): Position {
    return {
        x: position.x + (index % 4) * 220,
        y: position.y + Math.floor(index / 4) * 160,
    };
}
