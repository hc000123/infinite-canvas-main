"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";

import type { AssetPickerTab } from "../components/asset-picker-modal";
import { CanvasNodeType } from "../types";

type CanvasToolbarActionsOptions = {
    createNode: (type: CanvasNodeType) => void;
    handleUploadRequest: () => void;
    deleteNodes: (nodeIds: Set<string>) => void;
    deselectCanvas: () => void;
    selectedNodeIds: Set<string>;
    currentProject?: { projectId?: string; episodeId?: string } | null;
    router: { push: (href: string) => void };
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setAssetPickerTab: Dispatch<SetStateAction<AssetPickerTab>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
};

export function useCanvasToolbarActions({
    createNode,
    handleUploadRequest,
    deleteNodes,
    deselectCanvas,
    selectedNodeIds,
    currentProject,
    router,
    setClearConfirmOpen,
    setAssetPickerTab,
    setAssetPickerOpen,
}: CanvasToolbarActionsOptions) {
    return useMemo(
        () => ({
            onAddText: () => createNode(CanvasNodeType.Text),
            onAddImage: () => createNode(CanvasNodeType.Image),
            onAddVideo: () => createNode(CanvasNodeType.Video),
            onAddAudio: () => createNode(CanvasNodeType.Audio),
            onAddConfig: () => createNode(CanvasNodeType.Config),
            onUpload: () => handleUploadRequest(),
            onDelete: () => deleteNodes(new Set(selectedNodeIds)),
            onClear: () => setClearConfirmOpen(true),
            onDeselect: deselectCanvas,
            onOpenAssets: () => {
                setAssetPickerTab("my-assets");
                setAssetPickerOpen(true);
            },
            onOpenEpisodeWorkbench: () => {
                if (currentProject?.projectId && currentProject.episodeId) {
                    router.push(`/projects/${currentProject.projectId}/episodes/${currentProject.episodeId}/workbench`);
                    return;
                }
                if (currentProject?.projectId) {
                    router.push(`/projects/${currentProject.projectId}`);
                    return;
                }
                router.push("/projects");
            },
        }),
        [createNode, currentProject, deleteNodes, deselectCanvas, handleUploadRequest, router, selectedNodeIds, setAssetPickerOpen, setAssetPickerTab, setClearConfirmOpen],
    );
}
