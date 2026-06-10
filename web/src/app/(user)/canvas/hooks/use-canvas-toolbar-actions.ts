"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";

import type { AssetPickerTab } from "../components/asset-picker-modal";
import { CanvasNodeType } from "../types";

type CanvasToolbarActionsOptions = {
    createNode: (type: CanvasNodeType) => void;
    handleUploadRequest: () => void;
    deleteNodes: (nodeIds: Set<string>) => void;
    deselectCanvas: () => void;
    openEpisodeWorkbench: () => void;
    selectedNodeIds: Set<string>;
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setAssetPickerTab: Dispatch<SetStateAction<AssetPickerTab>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
};

export function useCanvasToolbarActions({ createNode, handleUploadRequest, deleteNodes, deselectCanvas, openEpisodeWorkbench, selectedNodeIds, setClearConfirmOpen, setAssetPickerTab, setAssetPickerOpen }: CanvasToolbarActionsOptions) {
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
            onOpenEpisodeWorkbench: openEpisodeWorkbench,
        }),
        [createNode, deleteNodes, deselectCanvas, handleUploadRequest, openEpisodeWorkbench, selectedNodeIds, setAssetPickerOpen, setAssetPickerTab, setClearConfirmOpen],
    );
}
