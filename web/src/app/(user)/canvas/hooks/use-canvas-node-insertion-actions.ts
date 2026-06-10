import { useCanvasAssistantWriteActions } from "./use-canvas-assistant-write-actions";
import { useCanvasFileNodeActions } from "./use-canvas-file-node-actions";
import { useCanvasImageBriefActions } from "./use-canvas-image-brief-actions";
import { useCanvasNodeAssetActions } from "./use-canvas-node-asset-actions";

type AssetActionOptions = Parameters<typeof useCanvasNodeAssetActions>[0];
type AssistantWriteOptions = Parameters<typeof useCanvasAssistantWriteActions>[0];
type FileNodeOptions = Parameters<typeof useCanvasFileNodeActions>[0];
type ImageBriefOptions = Parameters<typeof useCanvasImageBriefActions>[0];

type UseCanvasNodeInsertionActionsOptions = AssetActionOptions &
    AssistantWriteOptions &
    Omit<FileNodeOptions, "addCanvasNodeToAssets" | "showSuccess"> &
    ImageBriefOptions & {
        showUploadSuccess: FileNodeOptions["showSuccess"];
    };

export function useCanvasNodeInsertionActions({
    addAssetOnce,
    assetById,
    canvasAiConfig,
    connectionsRef,
    containerRef,
    getCanvasCenter,
    imageInputRef,
    message,
    nodesRef,
    screenToCanvas,
    setAssetPickerOpen,
    setConnections,
    setDialogNodeId,
    setNodes,
    setSelectedConnectionId,
    setSelectedNodeIds,
    showUploadSuccess,
    size,
    toAudioMetadata,
    toImageMetadata,
    toVideoMetadata,
    uploadTargetRef,
}: UseCanvasNodeInsertionActionsOptions) {
    const { addCanvasNodeToAssets, saveNodeAsset, updateCanvasNodeAssetReference } = useCanvasNodeAssetActions({
        addAssetOnce,
        assetById,
        message,
        setNodes,
    });
    const fileNodeActions = useCanvasFileNodeActions({
        containerRef,
        imageInputRef,
        uploadTargetRef,
        nodesRef,
        size,
        screenToCanvas,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        showSuccess: showUploadSuccess,
        addCanvasNodeToAssets,
        toImageMetadata,
        toVideoMetadata,
        toAudioMetadata,
    });
    const assistantWriteActions = useCanvasAssistantWriteActions({
        connectionsRef,
        getCanvasCenter,
        message,
        nodesRef,
        setConnections,
        setAssetPickerOpen,
        setDialogNodeId,
        setNodes,
        setSelectedConnectionId,
        setSelectedNodeIds,
    });
    const { createBriefImageConfigNode } = useCanvasImageBriefActions({
        canvasAiConfig,
        getCanvasCenter,
        nodesRef,
        setDialogNodeId,
        setNodes,
        setSelectedConnectionId,
        setSelectedNodeIds,
    });

    return {
        ...assistantWriteActions,
        ...fileNodeActions,
        createBriefImageConfigNode,
        saveNodeAsset,
        updateCanvasNodeAssetReference,
    };
}
