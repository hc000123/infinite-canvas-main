import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { CanvasConnection, CanvasNodeData, ContextMenuState } from "../types";

type UseCanvasKeyboardShortcutsOptions = {
    nodesRef: RefObject<CanvasNodeData[]>;
    selectedNodeIdsRef: RefObject<Set<string>>;
    selectedConnectionId: string | null;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setEditingNodeId: Dispatch<SetStateAction<string | null>>;
    setInfoNodeId: Dispatch<SetStateAction<string | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    clearSelectionBox: () => void;
    cancelPendingConnectionCreate: () => void;
    undoCanvas: () => void;
    redoCanvas: () => void;
    copySelectedNodes: () => void;
    pasteCopiedNodes: () => boolean;
    pasteSystemClipboard: () => Promise<void>;
    deleteNodes: (ids: Set<string>) => void;
};

export function useCanvasKeyboardShortcuts({
    nodesRef,
    selectedNodeIdsRef,
    selectedConnectionId,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
    setHoveredNodeId,
    setToolbarNodeId,
    setDialogNodeId,
    setEditingNodeId,
    setInfoNodeId,
    setCropNodeId,
    clearSelectionBox,
    cancelPendingConnectionCreate,
    undoCanvas,
    redoCanvas,
    copySelectedNodes,
    pasteCopiedNodes,
    pasteSystemClipboard,
    deleteNodes,
}: UseCanvasKeyboardShortcutsOptions) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                clearSelectionBox();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    deleteNodes(new Set(selectedNodeIdsRef.current));
                } else if (selectedConnectionId) {
                    setConnections((prev) => prev.filter((conn) => conn.id !== selectedConnectionId));
                    setSelectedConnectionId(null);
                }
            }

            if (event.key === "Escape") {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                clearSelectionBox();
                cancelPendingConnectionCreate();
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setEditingNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        cancelPendingConnectionCreate,
        clearSelectionBox,
        copySelectedNodes,
        deleteNodes,
        nodesRef,
        pasteCopiedNodes,
        pasteSystemClipboard,
        redoCanvas,
        selectedConnectionId,
        selectedNodeIdsRef,
        setConnections,
        setContextMenu,
        setCropNodeId,
        setDialogNodeId,
        setEditingNodeId,
        setHoveredNodeId,
        setInfoNodeId,
        setSelectedConnectionId,
        setSelectedNodeIds,
        setToolbarNodeId,
        undoCanvas,
    ]);
}
