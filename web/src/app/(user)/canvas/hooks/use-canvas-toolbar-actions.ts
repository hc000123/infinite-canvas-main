"use client";

import { useMemo } from "react";

import { CanvasNodeType } from "../types";

type CanvasToolbarActionsOptions = {
    createNode: (type: CanvasNodeType) => void;
    handleUploadRequest: () => void;
    deleteSelection: () => void;
    deselectCanvas: () => void;
};

export function useCanvasToolbarActions({ createNode, handleUploadRequest, deleteSelection, deselectCanvas }: CanvasToolbarActionsOptions) {
    return useMemo(
        () => ({
            onAddText: () => createNode(CanvasNodeType.Text),
            onAddImage: () => createNode(CanvasNodeType.Image),
            onAddVideo: () => createNode(CanvasNodeType.Video),
            onAddAudio: () => createNode(CanvasNodeType.Audio),
            onAddConfig: () => createNode(CanvasNodeType.Config),
            onUpload: () => handleUploadRequest(),
            onDelete: deleteSelection,
            onDeselect: deselectCanvas,
        }),
        [createNode, deleteSelection, deselectCanvas, handleUploadRequest],
    );
}
