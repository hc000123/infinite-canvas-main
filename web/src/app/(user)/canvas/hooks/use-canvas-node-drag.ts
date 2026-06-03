import { useCallback, useEffect, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type RefObject, type SetStateAction } from "react";

import { CanvasNodeType, type CanvasNodeData, type ContextMenuState, type ViewportTransform } from "../types";

type DraggedNodePosition = { id: string; x: number; y: number };

type UseCanvasNodeDragOptions = {
    nodesRef: RefObject<CanvasNodeData[]>;
    selectedNodeIdsRef: RefObject<Set<string>>;
    viewportRef: RefObject<ViewportTransform>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    pauseHistory: () => void;
    resumeHistory: () => void;
};

export function useCanvasNodeDrag({
    nodesRef,
    selectedNodeIdsRef,
    viewportRef,
    setNodes,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
    setHoveredNodeId,
    setToolbarNodeId,
    setDialogNodeId,
    pauseHistory,
    resumeHistory,
}: UseCanvasNodeDragOptions) {
    const rafRef = useRef<number | null>(null);
    const nodeDraggingRef = useRef(false);
    const dragRef = useRef({
        isDraggingNode: false,
        hasMoved: false,
        startX: 0,
        startY: 0,
        initialSelectedNodes: [] as DraggedNodePosition[],
    });
    const [isNodeDragging, setIsNodeDragging] = useState(false);

    const handleNodeMouseDown = useCallback(
        (event: ReactMouseEvent, nodeId: string) => {
            event.stopPropagation();
            setContextMenu(null);
            setHoveredNodeId(null);
            setToolbarNodeId(null);
            setSelectedConnectionId(null);

            const currentSelected = selectedNodeIdsRef.current;
            const currentNodes = nodesRef.current;
            const nextSelected = new Set(currentSelected);

            if (event.shiftKey || event.metaKey || event.ctrlKey) {
                if (nextSelected.has(nodeId)) {
                    nextSelected.delete(nodeId);
                } else {
                    nextSelected.add(nodeId);
                }
            } else if (!nextSelected.has(nodeId)) {
                nextSelected.clear();
                nextSelected.add(nodeId);
            }

            setSelectedNodeIds(nextSelected);
            const dragIds = new Set(nextSelected);
            currentNodes.forEach((node) => {
                if (nextSelected.has(node.id)) node.metadata?.batchChildIds?.forEach((childId) => dragIds.add(childId));
            });
            dragRef.current = {
                isDraggingNode: true,
                hasMoved: false,
                startX: event.clientX,
                startY: event.clientY,
                initialSelectedNodes: currentNodes.filter((node) => dragIds.has(node.id)).map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
            };
            pauseHistory();
            nodeDraggingRef.current = true;
            setIsNodeDragging(true);
        },
        [nodesRef, pauseHistory, selectedNodeIdsRef, setContextMenu, setHoveredNodeId, setSelectedConnectionId, setSelectedNodeIds, setToolbarNodeId],
    );

    const finishNodeDrag = useCallback(
        (clientX?: number, clientY?: number) => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            if (!dragRef.current.isDraggingNode) return;

            const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.length === 1;
            const clickedNodeId = dragRef.current.initialSelectedNodes[0]?.id;
            const currentViewport = viewportRef.current;
            const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
            const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
            const initialPositions = dragRef.current.initialSelectedNodes;

            resumeHistory();
            nodeDraggingRef.current = false;
            setIsNodeDragging(false);
            if (dragRef.current.hasMoved && clientX != null && clientY != null) {
                setNodes((prev) =>
                    prev.map((node) => {
                        const initial = initialPositions.find((item) => item.id === node.id);
                        if (!initial) return node;
                        return { ...node, position: { x: initial.x + dx, y: initial.y + dy } };
                    }),
                );
            }

            dragRef.current.isDraggingNode = false;
            dragRef.current.hasMoved = false;
            dragRef.current.initialSelectedNodes = [];
            if (wasClick && clickedNodeId) {
                const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
                if (clickedNode?.type === CanvasNodeType.Text) {
                    setDialogNodeId((current) => (current === clickedNodeId ? current : null));
                } else {
                    setDialogNodeId(clickedNodeId);
                }
            }
        },
        [nodesRef, resumeHistory, setDialogNodeId, setNodes, viewportRef],
    );

    const moveNodeDrag = useCallback(
        (event: MouseEvent) => {
            const currentViewport = viewportRef.current;
            if (!dragRef.current.isDraggingNode) return false;

            const dx = (event.clientX - dragRef.current.startX) / currentViewport.k;
            const dy = (event.clientY - dragRef.current.startY) / currentViewport.k;
            const initialPositions = dragRef.current.initialSelectedNodes;
            if (Math.abs(event.clientX - dragRef.current.startX) > 3 || Math.abs(event.clientY - dragRef.current.startY) > 3) {
                dragRef.current.hasMoved = true;
            }

            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                setNodes((prev) =>
                    prev.map((node) => {
                        const initial = initialPositions.find((item) => item.id === node.id);
                        return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                    }),
                );
                rafRef.current = null;
            });
            return true;
        },
        [setNodes, viewportRef],
    );

    useEffect(() => {
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return { isNodeDragging, nodeDraggingRef, handleNodeMouseDown, finishNodeDrag, moveNodeDrag };
}
