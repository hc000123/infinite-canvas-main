import { useCanvasNodeReviewActions } from "./use-canvas-node-review-actions";
import { useCanvasVideoFrameNormalization } from "./use-canvas-video-frame-normalization";

type NodeReviewOptions = Parameters<typeof useCanvasNodeReviewActions>[0];
type VideoFrameNormalizationOptions = Parameters<typeof useCanvasVideoFrameNormalization>[0];

type UseCanvasNodeMediaQualityActionsOptions = NodeReviewOptions & {
    toImageMetadata: VideoFrameNormalizationOptions["toImageMetadata"];
};

export function useCanvasNodeMediaQualityActions({
    addAssetOnce,
    assets,
    message,
    nodes,
    nodesRef,
    setNodes,
    toImageMetadata,
    token,
    updateAsset,
    volcengineAssetEnabled,
}: UseCanvasNodeMediaQualityActionsOptions) {
    const { submittingReviewNodeId, refreshingReviewNodeId, submitNodeVolcengineReview, refreshNodeVolcengineReview } = useCanvasNodeReviewActions({
        token,
        message,
        nodes,
        nodesRef,
        setNodes,
        assets,
        addAssetOnce,
        updateAsset,
        volcengineAssetEnabled,
    });
    const { normalizeVideoFrameReferences } = useCanvasVideoFrameNormalization({
        message,
        setNodes,
        toImageMetadata,
    });

    return {
        normalizeVideoFrameReferences,
        refreshingReviewNodeId,
        refreshNodeVolcengineReview,
        submittingReviewNodeId,
        submitNodeVolcengineReview,
    };
}
