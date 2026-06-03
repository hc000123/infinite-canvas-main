import { useCallback, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from "react";

import type { CanvasNodeData, ContextMenuState, Position, SelectionBox } from "../types";

type UseCanvasSelectionBoxOptions = {
    nodesRef: RefObject<CanvasNodeData[]>;
    selectedNodeIdsRef: RefObject<Set<string>>;
    pendingConnectionCreateRef: RefObject<unknown>;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    isNodeHidden: (node: CanvasNodeData, nodes: CanvasNodeData[]) => boolean;
    cancelPendingConnectionCreate: () => void;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

export function useCanvasSelectionBox({ nodesRef, selectedNodeIdsRef, pendingConnectionCreateRef, screenToCanvas, isNodeHidden, cancelPendingConnectionCreate, setSelectedNodeIds, setSelectedConnectionId, setContextMenu }: UseCanvasSelectionBoxOptions) {
    const selectionBoxRef = useRef<SelectionBox | null>(null);
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

    const clearSelectionBox = useCallback(() => {
        selectionBoxRef.current = null;
        setSelectionBox(null);
    }, []);

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setContextMenu(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;

            if (!event.ctrlKey && !event.metaKey) {
                clearSelectionBox();
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, clearSelectionBox, pendingConnectionCreateRef, screenToCanvas, selectedNodeIdsRef, setContextMenu, setSelectedConnectionId, setSelectedNodeIds],
    );

    const moveSelectionBox = useCallback(
        (event: PointerEvent) => {
            const currentSelection = selectionBoxRef.current;
            if (!currentSelection) return;

            if (event.buttons === 0) {
                clearSelectionBox();
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .filter((node) => !isNodeHidden(node, nodesRef.current))
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;
                    if (intersects) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            setSelectedNodeIds(nextSelected);
        },
        [clearSelectionBox, isNodeHidden, nodesRef, screenToCanvas, setSelectedNodeIds],
    );

    return { selectionBox, handleCanvasMouseDown, moveSelectionBox, clearSelectionBox };
}
