import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { CanvasNodeData, ContextMenuState } from "../types";
import { shouldBlockCanvasShortcut } from "../utils/canvas-shortcuts";

type UseCanvasKeyboardShortcutsOptions = {
    containerRef: RefObject<HTMLDivElement | null>;
    nodesRef: RefObject<CanvasNodeData[]>;
    selectedNodeIdsRef: RefObject<Set<string>>;
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
    deleteSelection: () => void;
};

export function useCanvasKeyboardShortcuts({
    containerRef,
    nodesRef,
    selectedNodeIdsRef,
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
    deleteSelection,
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
                event.preventDefault();
                deleteSelection();
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
        deleteSelection,
        nodesRef,
        pasteCopiedNodes,
        pasteSystemClipboard,
        redoCanvas,
        selectedNodeIdsRef,
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

    const visibleOverlay = Array.from(document.querySelectorAll<HTMLElement>(".ant-modal-root .ant-modal, .ant-drawer-content-wrapper")).some((overlay) => overlay.getClientRects().length > 0 && overlay.getAttribute("aria-hidden") !== "true");
    return shouldBlockCanvasShortcut({
        canvasHasFocus,
        targetIsEditable: Boolean(element?.closest("input, textarea, select, button, a, [contenteditable='true'], [role='textbox'], [data-canvas-shortcut-scope='ignore']")),
        targetIsInOverlay: Boolean(element?.closest(".ant-modal, .ant-drawer, .ant-dropdown, .ant-popover, .ant-picker-dropdown, .ant-select-dropdown")),
        hasVisibleOverlay: visibleOverlay,
        hasTextSelection: Boolean(window.getSelection()?.toString().trim()),
        isCopyShortcut: (event.metaKey || event.ctrlKey) && key === "c",
    });
}
