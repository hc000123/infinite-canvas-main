"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { ContextMenuState, Position, ViewportTransform } from "../types";

type Props = {
    setAngleNodeId: Dispatch<SetStateAction<string | null>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setImageBriefOpen: Dispatch<SetStateAction<boolean>>;
    setInfoNodeId: Dispatch<SetStateAction<string | null>>;
    setIsMiniMapOpen: Dispatch<SetStateAction<boolean>>;
    setNodeCreateMenuPosition: Dispatch<SetStateAction<Position | null>>;
    setPreviewNodeId: Dispatch<SetStateAction<string | null>>;
    setScriptManagerOpen: Dispatch<SetStateAction<boolean>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setStoryboardInitialGroupId: Dispatch<SetStateAction<string>>;
    setStoryboardManagerOpen: Dispatch<SetStateAction<boolean>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
};

export function useCanvasRenderActions({
    setAngleNodeId,
    setAssetPickerOpen,
    setClearConfirmOpen,
    setContextMenu,
    setCropNodeId,
    setImageBriefOpen,
    setInfoNodeId,
    setIsMiniMapOpen,
    setNodeCreateMenuPosition,
    setPreviewNodeId,
    setScriptManagerOpen,
    setSelectedConnectionId,
    setSelectedNodeIds,
    setStoryboardInitialGroupId,
    setStoryboardManagerOpen,
    setViewport,
}: Props) {
    return {
        closeAngle: useCallback(() => setAngleNodeId(null), [setAngleNodeId]),
        closeAssetPicker: useCallback(() => setAssetPickerOpen(false), [setAssetPickerOpen]),
        closeClearConfirm: useCallback(() => setClearConfirmOpen(false), [setClearConfirmOpen]),
        closeCrop: useCallback(() => setCropNodeId(null), [setCropNodeId]),
        closeImageBrief: useCallback(() => setImageBriefOpen(false), [setImageBriefOpen]),
        closeInfo: useCallback(() => setInfoNodeId(null), [setInfoNodeId]),
        closeNodeCreateMenu: useCallback(() => setNodeCreateMenuPosition(null), [setNodeCreateMenuPosition]),
        closePreview: useCallback(() => setPreviewNodeId(null), [setPreviewNodeId]),
        closeScriptManager: useCallback(() => setScriptManagerOpen(false), [setScriptManagerOpen]),
        closeStoryboardManager: useCallback(() => setStoryboardManagerOpen(false), [setStoryboardManagerOpen]),
        openStoryboardGroup: useCallback(
            (groupId: string) => {
                setStoryboardInitialGroupId(groupId);
                setStoryboardManagerOpen(true);
            },
            [setStoryboardInitialGroupId, setStoryboardManagerOpen],
        ),
        selectConnection: useCallback(
            (connectionId: string) => {
                setSelectedConnectionId(connectionId);
                setSelectedNodeIds(new Set());
                setContextMenu(null);
            },
            [setContextMenu, setSelectedConnectionId, setSelectedNodeIds],
        ),
        toggleMiniMap: useCallback(() => setIsMiniMapOpen((value) => !value), [setIsMiniMapOpen]),
        updateViewport: useCallback(
            (next: ViewportTransform) => {
                setViewport(next);
                setContextMenu(null);
                setNodeCreateMenuPosition(null);
            },
            [setContextMenu, setNodeCreateMenuPosition, setViewport],
        ),
    };
}
