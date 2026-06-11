import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { CanvasConnection, CanvasNodeData, ContextMenuState } from "../types";

type UseCanvasKeyboardShortcutsOptions = {
    containerRef: RefObject<HTMLDivElement | null>;
    nodesRef: RefObject<CanvasNodeData[]>;
    selectedNodeIdsRef: RefObject<Set<string>>;
    selectedConnectionId: string | null;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    clearSelectionBox: () => void;
    closeCanvasOverlays: () => void;
    undoCanvas: () => void;
    redoCanvas: () => void;
    copySelectedNodes: () => void;
    pasteCopiedNodes: () => boolean;
    pasteSystemClipboard: () => Promise<void>;
    deleteNodes: (ids: Set<string>) => void;
};

export function useCanvasKeyboardShortcuts({
    containerRef,
    nodesRef,
    selectedNodeIdsRef,
    selectedConnectionId,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
    clearSelectionBox,
    closeCanvasOverlays,
    undoCanvas,
    redoCanvas,
    copySelectedNodes,
    pasteCopiedNodes,
    pasteSystemClipboard,
    deleteNodes,
}: UseCanvasKeyboardShortcutsOptions) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (shouldIgnoreCanvasShortcut(event, containerRef.current)) return;

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
                closeCanvasOverlays();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        clearSelectionBox,
        closeCanvasOverlays,
        containerRef,
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
        setSelectedConnectionId,
        setSelectedNodeIds,
        undoCanvas,
    ]);
}

function shouldIgnoreCanvasShortcut(event: KeyboardEvent, canvasRoot: HTMLElement | null) {
    const target = event.target instanceof Element ? event.target : null;
    const activeElement = document.activeElement instanceof Element ? document.activeElement : null;
    const element = target || activeElement;
    const key = event.key.toLowerCase();
    const canvasHasFocus = Boolean(canvasRoot && activeElement && (activeElement === canvasRoot || canvasRoot.contains(activeElement)));

    if (element?.closest("input, textarea, select, button, a, [contenteditable='true'], [role='textbox'], [data-canvas-shortcut-scope='ignore']")) return true;
    if (element?.closest(".ant-modal, .ant-drawer, .ant-dropdown, .ant-popover, .ant-picker-dropdown, .ant-select-dropdown")) return true;
    if (document.querySelector(".ant-modal-root .ant-modal, .ant-drawer-content-wrapper")) return true;
    if (!canvasHasFocus) return true;
    if ((event.metaKey || event.ctrlKey) && key === "c" && window.getSelection()?.toString().trim()) return true;
    return false;
}
