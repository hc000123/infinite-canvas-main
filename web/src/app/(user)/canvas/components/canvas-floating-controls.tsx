"use client";

import type { Dispatch, SetStateAction } from "react";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";
import type { CanvasNodeData, ContextMenuState, ViewportTransform } from "../types";
import { CanvasNodeContextMenu } from "./canvas-context-menu";
import { CanvasNodeHoverToolbar, type CanvasNodeHoverToolbarActions } from "./canvas-node-hover-toolbar";
import { Minimap } from "./canvas-mini-map";
import { CanvasStoryboardTimeline } from "./canvas-storyboard-timeline";
import { CanvasToolbar, type CanvasToolbarActions } from "./canvas-toolbar";
import { CanvasZoomControls } from "./canvas-zoom-controls";

type Props = {
    activeTimelineShotId: string;
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
    onOpenEpisodeWorkbench: () => void;
    onRedo: () => void;
    onResetViewport: () => void;
    onSelectShot: (shot: StoryboardTableShot, nodeId?: string) => void;
    onSetZoomScale: (scale: number) => void;
    onToggleMiniMap: () => void;
    onUndo: () => void;
    refreshingReviewNodeId: string | null;
    selectedNodeCount: number;
    setBackgroundMode: (mode: CanvasBackgroundMode) => void;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setShowImageInfo: (show: boolean) => void;
    setViewport: (viewport: ViewportTransform) => void;
    shotGroups: ShotGroup[];
    shots: StoryboardTableShot[];
    showImageInfo: boolean;
    size: { width: number; height: number };
    submittingReviewNodeId: string | null;
    toolbarActions: Omit<CanvasToolbarActions, "onUndo" | "onRedo" | "onBackgroundModeChange" | "onShowImageInfoChange">;
    toolbarNode: CanvasNodeData | null;
    viewport: ViewportTransform;
};

export function CanvasFloatingControls({
    activeTimelineShotId,
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
    onOpenEpisodeWorkbench,
    onRedo,
    onResetViewport,
    onSelectShot,
    onSetZoomScale,
    onToggleMiniMap,
    onUndo,
    refreshingReviewNodeId,
    selectedNodeCount,
    setBackgroundMode,
    setContextMenu,
    setShowImageInfo,
    setViewport,
    shotGroups,
    shots,
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

            <CanvasToolbar
                actions={{
                    ...toolbarActions,
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

            <CanvasStoryboardTimeline shots={shots} shotGroups={shotGroups} nodes={nodes} activeShotId={activeTimelineShotId} onOpenWorkbench={onOpenEpisodeWorkbench} onSelectShot={onSelectShot} />

            {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

            <CanvasZoomControls scale={viewport.k} onScaleChange={onSetZoomScale} onReset={onResetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={onToggleMiniMap} />

            {contextMenu ? (
                <CanvasNodeContextMenu
                    menu={contextMenu}
                    onClose={() => setContextMenu(null)}
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
