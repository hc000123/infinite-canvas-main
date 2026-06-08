"use client";

import { useCallback, type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from "react";

import type { AiConfig } from "@/stores/use-config-store";
import { collectBatchAwareDeletedNodeIds, removeDeletedNodesFromBatches } from "../utils/canvas-batch-nodes";
import { placeCanvasNodeAwayFromNodes, resolveRightwardNodePosition } from "../utils/canvas-node-placement";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type ContextMenuState, type Position } from "../types";

type UseCanvasNodeCrudActionsOptions = {
    canvasAiConfig: AiConfig;
    canvasId: string;
    chatSessions: CanvasAssistantSession[];
    nodesRef: RefObject<CanvasNodeData[]>;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    getAppendNodeCenter: (type: CanvasNodeType) => Position;
    createCanvasNode: (type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata) => CanvasNodeData;
    cleanupCanvasFiles: (extra?: unknown) => void;
    clearSelectionBox: () => void;
    cancelPendingConnectionCreate: () => void;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setNodeCreateMenuPosition: Dispatch<SetStateAction<Position | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setEditingNodeId: Dispatch<SetStateAction<string | null>>;
    setInfoNodeId: Dispatch<SetStateAction<string | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setAngleNodeId: Dispatch<SetStateAction<string | null>>;
    setPreviewNodeId: Dispatch<SetStateAction<string | null>>;
    setRunningNodeId: Dispatch<SetStateAction<string | null>>;
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setEditRequestNonce: Dispatch<SetStateAction<number>>;
};

export function useCanvasNodeCrudActions({
    canvasAiConfig,
    canvasId,
    chatSessions,
    nodesRef,
    screenToCanvas,
    getAppendNodeCenter,
    createCanvasNode,
    cleanupCanvasFiles,
    clearSelectionBox,
    cancelPendingConnectionCreate,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
    setNodeCreateMenuPosition,
    setHoveredNodeId,
    setToolbarNodeId,
    setDialogNodeId,
    setEditingNodeId,
    setInfoNodeId,
    setCropNodeId,
    setAngleNodeId,
    setPreviewNodeId,
    setRunningNodeId,
    setClearConfirmOpen,
    setEditRequestNonce,
}: UseCanvasNodeCrudActionsOptions) {
    const createNode = useCallback(
        (type: CanvasNodeType, position?: Position) => {
            const targetPosition = position || getAppendNodeCenter(type);
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: canvasAiConfig.imageModel || canvasAiConfig.model,
                          size: canvasAiConfig.size,
                          count: 3,
                      }
                    : undefined;
            const draftNode = createCanvasNode(type, targetPosition, configMetadata);
            const newNode = position
                ? placeCanvasNodeAwayFromNodes(draftNode, nodesRef.current)
                : {
                      ...draftNode,
                      position: resolveRightwardNodePosition(nodesRef.current, draftNode.position, { width: draftNode.width, height: draftNode.height }),
                  };

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            setNodeCreateMenuPosition(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);
        },
        [canvasAiConfig.imageModel, canvasAiConfig.model, canvasAiConfig.size, createCanvasNode, getAppendNodeCenter, nodesRef, setDialogNodeId, setNodeCreateMenuPosition, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const openNodeCreateMenuAtCanvasPoint = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setNodeCreateMenuPosition(screenToCanvas(event.clientX, event.clientY));
            setContextMenu(null);
        },
        [screenToCanvas, setContextMenu, setNodeCreateMenuPosition],
    );

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const allIds = collectBatchAwareDeletedNodeIds(nodesRef.current, ids);
            setNodes((prev) => removeDeletedNodesFromBatches(prev, allIds));
            setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setEditingNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setContextMenu((current) => (current && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId: canvasId, nodes: nodesRef.current.filter((node) => !allIds.has(node.id)), chatSessions });
        },
        [canvasId, chatSessions, cleanupCanvasFiles, nodesRef, setAngleNodeId, setConnections, setContextMenu, setCropNodeId, setDialogNodeId, setEditingNodeId, setHoveredNodeId, setInfoNodeId, setNodes, setPreviewNodeId, setRunningNodeId, setSelectedConnectionId, setSelectedNodeIds, setToolbarNodeId],
    );

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        setNodeCreateMenuPosition(null);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        clearSelectionBox();
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
    }, [cancelPendingConnectionCreate, clearSelectionBox, setContextMenu, setDialogNodeId, setEditingNodeId, setHoveredNodeId, setNodeCreateMenuPosition, setSelectedConnectionId, setSelectedNodeIds, setToolbarNodeId]);

    const clearCanvas = useCallback(() => {
        setNodes([]);
        setConnections([]);
        setInfoNodeId(null);
        setCropNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId: canvasId, nodes: [], chatSessions: [] });
    }, [canvasId, chatSessions, cleanupCanvasFiles, deselectCanvas, setAngleNodeId, setClearConfirmOpen, setConnections, setCropNodeId, setInfoNodeId, setNodes, setPreviewNodeId, setRunningNodeId]);

    const duplicateNode = useCallback(
        (nodeId: string) => {
            const source = nodesRef.current.find((node) => node.id === nodeId);
            if (!source) return;

            const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const next: CanvasNodeData = placeCanvasNodeAwayFromNodes(
                {
                    ...source,
                    id,
                    title: `${source.title} Copy`,
                    position: { x: source.position.x + 36, y: source.position.y + 36 },
                },
                nodesRef.current,
            );

            setNodes((prev) => [...prev, next]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [nodesRef, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    const handleNodeResize = useCallback(
        (nodeId: string, width: number, height: number, position?: Position) => {
            setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, width, height, position: position || node.position } : node)));
        },
        [setNodes],
    );

    const toggleNodeFreeResize = useCallback(
        (nodeId: string) => {
            setNodes((prev) =>
                prev.map((node) => {
                    if (node.id !== nodeId) return node;
                    const freeResize = !node.metadata?.freeResize;
                    if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                    const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                    const height = node.width / ratio;
                    return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
                }),
            );
        },
        [setNodes],
    );

    const handleNodeContentChange = useCallback(
        (nodeId: string, content: string) => {
            setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
        },
        [setNodes],
    );

    const openTextEditor = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Text) return;
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(node.id);
            setEditingNodeId(node.id);
            setEditRequestNonce((value) => value + 1);
        },
        [setDialogNodeId, setEditRequestNonce, setEditingNodeId, setSelectedConnectionId, setSelectedNodeIds],
    );

    const handleNodePromptChange = useCallback(
        (nodeId: string, prompt: string) => {
            setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
        },
        [setNodes],
    );

    return {
        createNode,
        openNodeCreateMenuAtCanvasPoint,
        deleteNodes,
        deselectCanvas,
        clearCanvas,
        duplicateNode,
        handleNodeResize,
        toggleNodeFreeResize,
        handleNodeContentChange,
        handleNodePromptChange,
        openTextEditor,
    };
}
