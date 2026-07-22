"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";

import type { AssetPickerTab } from "../components/asset-picker-modal";
import { CanvasNodeType } from "../types";

type CanvasToolbarActionsOptions = {
    createNode: (type: CanvasNodeType) => void;
    handleUploadRequest: () => void;
    deleteSelection: () => void;
    deselectCanvas: () => void;
    openEpisodeWorkbench: () => void;
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
    setAssetPickerTab: Dispatch<SetStateAction<AssetPickerTab>>;
    setAssetPickerOpen: Dispatch<SetStateAction<boolean>>;
};

export function useCanvasToolbarActions({ createNode, handleUploadRequest, deleteSelection, deselectCanvas, openEpisodeWorkbench, setClearConfirmOpen, setAssetPickerTab, setAssetPickerOpen }: CanvasToolbarActionsOptions) {
    return useMemo(
        () => ({
            onAddText: () => createNode(CanvasNodeType.Text),
            onAddImage: () => createNode(CanvasNodeType.Image),
            onAddVideo: () => createNode(CanvasNodeType.Video),
            onAddAudio: () => createNode(CanvasNodeType.Audio),
            onAddConfig: () => createNode(CanvasNodeType.Config),
            onUpload: () => handleUploadRequest(),
            onDelete: deleteSelection,
            onClear: () => setClearConfirmOpen(true),
            onDeselect: deselectCanvas,
            onOpenAssets: () => {
                setAssetPickerTab("my-assets");
                setAssetPickerOpen(true);
            },
            onOpenEpisodeWorkbench: openEpisodeWorkbench,
        }),
        [createNode, deleteSelection, deselectCanvas, handleUploadRequest, openEpisodeWorkbench, setAssetPickerOpen, setAssetPickerTab, setClearConfirmOpen],
    );
}
