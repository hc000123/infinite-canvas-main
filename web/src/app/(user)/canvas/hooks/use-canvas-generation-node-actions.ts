import { useCanvasImageGenerationActions } from "./use-canvas-image-generation-actions";
import { useCanvasTextGenerationActions } from "./use-canvas-text-generation-actions";
import { useCanvasVideoGenerationActions } from "./use-canvas-video-generation-actions";

type ImageGenerationOptions = Parameters<typeof useCanvasImageGenerationActions>[0];
type VideoGenerationOptions = Parameters<typeof useCanvasVideoGenerationActions>[0];

type UseCanvasGenerationNodeActionsOptions = {
    archiveGeneratedAsset: ImageGenerationOptions["archiveGeneratedAsset"];
    cacheUploadedCanvasMedia: VideoGenerationOptions["cacheUploadedCanvasMedia"];
    canvasId: ImageGenerationOptions["canvasId"];
    canvasTitle: ImageGenerationOptions["canvasTitle"];
    episodeContext: ImageGenerationOptions["episodeContext"];
    getNodes: VideoGenerationOptions["getNodes"];
    prepareGeneratedAssetNode: ImageGenerationOptions["prepareGeneratedAssetNode"];
    projectId: ImageGenerationOptions["projectId"];
    projectPreset: ImageGenerationOptions["projectPreset"];
    projectTitle: ImageGenerationOptions["projectTitle"];
    setConnections: ImageGenerationOptions["setConnections"];
    setDialogNodeId: ImageGenerationOptions["setDialogNodeId"];
    setNodes: ImageGenerationOptions["setNodes"];
    setSelectedConnectionId: ImageGenerationOptions["setSelectedConnectionId"];
    setSelectedNodeIds: ImageGenerationOptions["setSelectedNodeIds"];
    showImageError: ImageGenerationOptions["showError"];
    showVideoWarning: VideoGenerationOptions["showWarning"];
    toImageMetadata: ImageGenerationOptions["toImageMetadata"];
    toVideoMetadata: VideoGenerationOptions["toVideoMetadata"];
};

export function useCanvasGenerationNodeActions({
    archiveGeneratedAsset,
    cacheUploadedCanvasMedia,
    canvasId,
    canvasTitle,
    episodeContext,
    getNodes,
    prepareGeneratedAssetNode,
    projectId,
    projectPreset,
    projectTitle,
    setConnections,
    setDialogNodeId,
    setNodes,
    setSelectedConnectionId,
    setSelectedNodeIds,
    showImageError,
    showVideoWarning,
    toImageMetadata,
    toVideoMetadata,
}: UseCanvasGenerationNodeActionsOptions) {
    const { generateImageNode } = useCanvasImageGenerationActions({
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        showError: showImageError,
        toImageMetadata,
        projectId,
        canvasId,
        canvasTitle,
        prepareGeneratedAssetNode,
        projectTitle,
        projectPreset,
        episodeContext,
        archiveGeneratedAsset,
    });
    const { generateTextNode, retryTextNode } = useCanvasTextGenerationActions({
        setNodes,
        setConnections,
    });
    const { generateVideoNode } = useCanvasVideoGenerationActions({
        setNodes,
        setConnections,
        getNodes,
        cacheUploadedCanvasMedia,
        showWarning: showVideoWarning,
        toVideoMetadata,
        projectId,
        canvasId,
        canvasTitle,
        prepareGeneratedAssetNode,
        projectTitle,
        projectPreset,
        episodeContext,
        archiveGeneratedAsset,
    });

    return { generateImageNode, generateTextNode, generateVideoNode, retryTextNode };
}
