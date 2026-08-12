"use client";

import type { Dispatch, SetStateAction } from "react";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasNodeData, ContextMenuState, ViewportTransform } from "../types";
import { CanvasCreateRail, type CanvasCreateRailActions } from "./canvas-create-rail";
import { CanvasNodeContextMenu } from "./canvas-context-menu";
import { CanvasNodeHoverToolbar, type CanvasNodeHoverToolbarActions } from "./canvas-node-hover-toolbar";
import { Minimap } from "./canvas-mini-map";
import { CanvasToolbar, type CanvasToolbarActions } from "./canvas-toolbar";
import { CanvasZoomControls } from "./canvas-zoom-controls";

type Props = {
    backgroundMode: CanvasBackgroundMode;
    canRedo: boolean;
    canUndo: boolean;
    contextMenu: ContextMenuState | null;
    deleteNodes: (nodeIds: Set<string>) => void;
    duplicateNode: (nodeId: string) => void;
    hasNewAssetVersion?: boolean;
    hideNodeToolbar: () => void;
    isMiniMapOpen: boolean;
    isNodeDragging: boolean;
    keepNodeToolbar: (nodeId: string) => void;
    nodeImageSettingsOpen: boolean;
    nodeToolActions: CanvasNodeHoverToolbarActions;
    nodes: CanvasNodeData[];
    onCreateVideoFromImages: (nodes: CanvasNodeData[]) => void;
    onRedo: () => void;
    onResetViewport: () => void;
    onSetZoomScale: (scale: number) => void;
    onToggleMiniMap: () => void;
    onUndo: () => void;
    refreshingReviewNodeId: string | null;
    selectedNodeCount: number;
    selectedNodeIds: Set<string>;
    setBackgroundMode: (mode: CanvasBackgroundMode) => void;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setShowImageInfo: (show: boolean) => void;
    setViewport: (viewport: ViewportTransform) => void;
    showImageInfo: boolean;
    size: { width: number; height: number };
    submittingReviewNodeId: string | null;
    toolbarActions: CanvasCreateRailActions & Pick<CanvasToolbarActions, "onDelete">;
    toolbarNode: CanvasNodeData | null;
    viewport: ViewportTransform;
};

export function CanvasFloatingControls({
    backgroundMode,
    canRedo,
    canUndo,
    contextMenu,
    deleteNodes,
    duplicateNode,
    hasNewAssetVersion,
    hideNodeToolbar,
    isMiniMapOpen,
    isNodeDragging,
    keepNodeToolbar,
    nodeImageSettingsOpen,
    nodeToolActions,
    nodes,
    onCreateVideoFromImages,
    onRedo,
    onResetViewport,
    onSetZoomScale,
    onToggleMiniMap,
    onUndo,
    refreshingReviewNodeId,
    selectedNodeCount,
    selectedNodeIds,
    setBackgroundMode,
    setContextMenu,
    setShowImageInfo,
    setViewport,
    showImageInfo,
    size,
    submittingReviewNodeId,
    toolbarActions,
    toolbarNode,
    viewport,
}: Props) {
    return (
        <>
            <CanvasNodeHoverToolbar
                node={isNodeDragging || nodeImageSettingsOpen ? null : toolbarNode}
                viewport={viewport}
                onKeep={keepNodeToolbar}
                onLeave={hideNodeToolbar}
                actions={nodeToolActions}
                state={{
                    hasNewAssetVersion,
                    submittingReview: toolbarNode ? submittingReviewNodeId === toolbarNode.id : false,
                    refreshingReview: toolbarNode ? refreshingReviewNodeId === toolbarNode.id : false,
                }}
            />

            <CanvasCreateRail actions={toolbarActions} />

            <CanvasToolbar
                actions={{
                    onDelete: toolbarActions.onDelete,
                    onDeselect: toolbarActions.onDeselect,
                    onUndo,
                    onRedo,
                    onBackgroundModeChange: setBackgroundMode,
                    onShowImageInfoChange: setShowImageInfo,
                }}
                state={{
                    selectedCount: selectedNodeCount,
                    canUndo,
                    canRedo,
                    backgroundMode,
                    showImageInfo,
                }}
            />

            {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

            <CanvasZoomControls scale={viewport.k} onScaleChange={onSetZoomScale} onReset={onResetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={onToggleMiniMap} />

            {contextMenu ? (
                <CanvasNodeContextMenu
                    menu={contextMenu}
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    onClose={() => setContextMenu(null)}
                    onCreateVideoFromImages={(imageNodes) => {
                        onCreateVideoFromImages(imageNodes);
                        setContextMenu(null);
                    }}
                    onDuplicate={() => {
                        duplicateNode(contextMenu.nodeId);
                        setContextMenu(null);
                    }}
                    onDelete={() => {
                        deleteNodes(new Set([contextMenu.nodeId]));
                        setContextMenu(null);
                    }}
                />
            ) : null}
        </>
    );
}
