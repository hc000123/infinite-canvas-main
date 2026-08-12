"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";

import { CanvasNodeType } from "../types";

type CanvasToolbarActionsOptions = {
    createNode: (type: CanvasNodeType) => void;
    handleUploadRequest: () => void;
    deleteSelection: () => void;
    deselectCanvas: () => void;
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
};

export function useCanvasToolbarActions({ createNode, handleUploadRequest, deleteSelection, deselectCanvas, setClearConfirmOpen }: CanvasToolbarActionsOptions) {
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
        }),
        [createNode, deleteSelection, deselectCanvas, handleUploadRequest, setClearConfirmOpen],
    );
}
