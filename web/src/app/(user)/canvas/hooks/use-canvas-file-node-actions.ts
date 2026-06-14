import { useCallback, type ChangeEvent as ReactChangeEvent, type Dispatch, type DragEvent as ReactDragEvent, type RefObject, type SetStateAction } from "react";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { uploadImage, type UploadedImage } from "@/services/image-storage";

import { buildUploadedAudioFileNode, buildUploadedImageFileNode, buildUploadedVideoFileNode, replaceNodeWithUploadedAudioFile, replaceNodeWithUploadedImageFile, replaceNodeWithUploadedVideoFile } from "../utils/canvas-uploaded-file-node";
import { placeCanvasNodeAwayFromNodes } from "../utils/canvas-node-placement";
import type { CanvasNodeData, CanvasNodeMetadata, Position } from "../types";

type UploadTarget = { nodeId?: string; position?: Position } | null;
const BATCH_MEDIA_NODE_SIZE = { width: 340, height: 240 };
const BATCH_MEDIA_NODE_GAP = 24;

type UseCanvasFileNodeActionsOptions = {
    canvasId: string;
    canvasTitle: string;
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
    workspaceProjectId: string;
    workspaceProjectTitle: string;
    addCanvasNodeToAssets: (node: CanvasNodeData) => Promise<string | false>;
    toImageMetadata: (image: UploadedImage) => CanvasNodeMetadata;
    toVideoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
    toAudioMetadata: (audio: UploadedFile) => CanvasNodeMetadata;
};

export function useCanvasFileNodeActions({
    canvasId,
    canvasTitle,
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
    workspaceProjectId,
    workspaceProjectTitle,
    addCanvasNodeToAssets,
    toImageMetadata,
    toVideoMetadata,
    toAudioMetadata,
}: UseCanvasFileNodeActionsOptions) {
    const createImageFileNode = useCallback(
        async (file: File, position: Position, forcedSize?: { width: number; height: number }, importInfo?: { batchId?: string; order: number }) => {
            const image = await uploadImage(file);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode = placeCanvasNodeAwayFromNodes(
                buildUploadedImageFileNode({
                    id,
                    title: file.name,
                    center: position,
                    file: image,
                    metadata: {
                        ...toImageMetadata(image),
                        canvasSource: buildImportCanvasSource({ canvasId, canvasTitle, fileName: file.name, nodeId: id, order: importInfo?.order || 1, batchId: importInfo?.batchId, workspaceProjectId, workspaceProjectTitle }),
                    },
                    forcedSize,
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
        [addCanvasNodeToAssets, canvasId, canvasTitle, nodesRef, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, toImageMetadata, workspaceProjectId, workspaceProjectTitle],
    );

    const createVideoFileNode = useCallback(
        async (file: File, position: Position, forcedSize?: { width: number; height: number }, importInfo?: { batchId?: string; order: number }) => {
            const video = await uploadMediaFile(file, "video");
            const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode = placeCanvasNodeAwayFromNodes(
                buildUploadedVideoFileNode({
                    id,
                    title: file.name,
                    center: position,
                    file: video,
                    metadata: {
                        ...toVideoMetadata(video),
                        canvasSource: buildImportCanvasSource({ canvasId, canvasTitle, fileName: file.name, nodeId: id, order: importInfo?.order || 1, batchId: importInfo?.batchId, workspaceProjectId, workspaceProjectTitle }),
                    },
                    forcedSize,
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
        [addCanvasNodeToAssets, canvasId, canvasTitle, nodesRef, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, toVideoMetadata, workspaceProjectId, workspaceProjectTitle],
    );

    const createAudioFileNode = useCallback(
        async (file: File, position: Position, importInfo?: { batchId?: string; order: number }) => {
            const audio = await uploadMediaFile(file, "audio");
            const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newNode = placeCanvasNodeAwayFromNodes(
                buildUploadedAudioFileNode({
                    id,
                    title: file.name,
                    center: position,
                    file: audio,
                    metadata: {
                        ...toAudioMetadata(audio),
                        canvasSource: buildImportCanvasSource({ canvasId, canvasTitle, fileName: file.name, nodeId: id, order: importInfo?.order || 1, batchId: importInfo?.batchId, workspaceProjectId, workspaceProjectTitle }),
                    },
                }),
                nodesRef.current,
            );
            setNodes((prev) => [...prev, newNode]);
            await addCanvasNodeToAssets(newNode);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            return id;
        },
        [addCanvasNodeToAssets, canvasId, canvasTitle, nodesRef, setNodes, setSelectedConnectionId, setSelectedNodeIds, toAudioMetadata, workspaceProjectId, workspaceProjectTitle],
    );

    const createFileNode = useCallback(
        (file: File, position: Position, forcedSize?: { width: number; height: number }, importInfo?: { batchId?: string; order: number }) => {
            if (file.type.startsWith("audio/")) return createAudioFileNode(file, position, importInfo);
            if (file.type.startsWith("video/")) return createVideoFileNode(file, position, forcedSize, importInfo);
            return createImageFileNode(file, position, forcedSize, importInfo);
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode],
    );

    const createFileNodes = useCallback(
        async (files: File[], position: Position) => {
            const ids: string[] = [];
            const batchSize = files.length > 1 ? BATCH_MEDIA_NODE_SIZE : undefined;
            const batchId = files.length > 1 ? `import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : undefined;
            for (const [index, file] of files.entries()) {
                const id = await createFileNode(file, getBatchDropPosition(position, index, files.length, batchSize), batchSize, { batchId, order: index + 1 });
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
                    metadata: { ...toAudioMetadata(audio), canvasSource: buildImportCanvasSource({ canvasId, canvasTitle, fileName: file.name, nodeId: target.nodeId, order: 1, workspaceProjectId, workspaceProjectTitle }) },
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
                    metadata: { ...toVideoMetadata(video), canvasSource: buildImportCanvasSource({ canvasId, canvasTitle, fileName: file.name, nodeId: target.nodeId, order: 1, workspaceProjectId, workspaceProjectTitle }) },
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
                    metadata: { ...toImageMetadata(image), canvasSource: buildImportCanvasSource({ canvasId, canvasTitle, fileName: file.name, nodeId: target.nodeId, order: 1, workspaceProjectId, workspaceProjectTitle }) },
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
        [addCanvasNodeToAssets, canvasId, canvasTitle, containerRef, createFileNodes, nodesRef, screenToCanvas, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, size, toAudioMetadata, toImageMetadata, toVideoMetadata, uploadTargetRef, workspaceProjectId, workspaceProjectTitle],
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
        createFileNodes,
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

function getBatchDropPosition(position: Position, index: number, total: number, size = BATCH_MEDIA_NODE_SIZE): Position {
    const columns = total <= 2 ? total : total <= 6 ? 3 : 4;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
        x: position.x + column * (size.width + BATCH_MEDIA_NODE_GAP),
        y: position.y + row * (size.height + BATCH_MEDIA_NODE_GAP),
    };
}

function buildImportCanvasSource({
    batchId,
    canvasId,
    canvasTitle,
    fileName,
    nodeId,
    order,
    workspaceProjectId,
    workspaceProjectTitle,
}: {
    batchId?: string;
    canvasId: string;
    canvasTitle: string;
    fileName: string;
    nodeId: string;
    order: number;
    workspaceProjectId: string;
    workspaceProjectTitle: string;
}) {
    return {
        projectId: workspaceProjectId,
        projectTitle: workspaceProjectTitle,
        canvasId,
        canvasTitle,
        nodeId,
        import: { fileName, order, batchId },
    };
}
