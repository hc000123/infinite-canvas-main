import { useMemo, type Dispatch, type SetStateAction } from "react";

import type { CanvasNodeHoverToolbarActions } from "../components/canvas-node-hover-toolbar";
import type { CanvasNodeData } from "../types";

export function useCanvasNodeToolActions({
    captureVideoCurrentFrame,
    deleteNodes,
    downloadNodeMedia,
    generateImageFromTextNode,
    handleContinueVideoNode,
    handleFontSizeChange,
    handleRetryNode,
    handleUploadRequest,
    openTextEditor,
    refreshNodeVolcengineReview,
    saveNodeAsset,
    setAngleNodeId,
    setCropNodeId,
    setDialogNodeId,
    setInfoNodeId,
    setPreviewNodeId,
    submitNodeVolcengineReview,
    toggleNodeFreeResize,
    updateCanvasNodeAssetReference,
}: {
    captureVideoCurrentFrame: (node: CanvasNodeData) => Promise<void> | void;
    deleteNodes: (nodeIds: Set<string>) => void;
    downloadNodeMedia: (node: CanvasNodeData) => Promise<void> | void;
    generateImageFromTextNode: (node: CanvasNodeData) => Promise<void> | void;
    handleContinueVideoNode: (node: CanvasNodeData) => Promise<void> | void;
    handleFontSizeChange: (nodeId: string, fontSize: number) => void;
    handleRetryNode: (node: CanvasNodeData) => Promise<void> | void;
    handleUploadRequest: (nodeId?: string) => void;
    openTextEditor: (node: CanvasNodeData) => void;
    refreshNodeVolcengineReview: (node: CanvasNodeData) => Promise<void> | void;
    saveNodeAsset: (node: CanvasNodeData) => Promise<void> | void;
    setAngleNodeId: Dispatch<SetStateAction<string | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setInfoNodeId: Dispatch<SetStateAction<string | null>>;
    setPreviewNodeId: Dispatch<SetStateAction<string | null>>;
    submitNodeVolcengineReview: (node: CanvasNodeData) => Promise<void> | void;
    toggleNodeFreeResize: (nodeId: string) => void;
    updateCanvasNodeAssetReference: (node: CanvasNodeData) => void;
}) {
    return useMemo<CanvasNodeHoverToolbarActions>(
        () => ({
            onInfo: (node) => setInfoNodeId(node.id),
            onEditText: openTextEditor,
            onDecreaseFont: (node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2)),
            onIncreaseFont: (node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2)),
            onToggleDialog: (node) => setDialogNodeId((current) => (current === node.id ? null : node.id)),
            onGenerateImage: generateImageFromTextNode,
            onUpload: (node) => handleUploadRequest(node.id),
            onDownload: downloadNodeMedia,
            onSaveAsset: (node) => void saveNodeAsset(node),
            onUpdateAssetReference: updateCanvasNodeAssetReference,
            onContinueVideo: (node) => void handleContinueVideoNode(node),
            onCaptureVideoFrame: (node) => void captureVideoCurrentFrame(node),
            onReviewAsset: (node) => void submitNodeVolcengineReview(node),
            onRefreshReview: (node) => void refreshNodeVolcengineReview(node),
            onCrop: (node) => setCropNodeId(node.id),
            onAngle: (node) => setAngleNodeId(node.id),
            onViewImage: (node) => setPreviewNodeId(node.id),
            onRetry: (node) => void handleRetryNode(node),
            onToggleFreeResize: (node) => toggleNodeFreeResize(node.id),
            onDelete: (node) => deleteNodes(new Set([node.id])),
        }),
        [
            captureVideoCurrentFrame,
            deleteNodes,
            downloadNodeMedia,
            generateImageFromTextNode,
            handleContinueVideoNode,
            handleFontSizeChange,
            handleRetryNode,
            handleUploadRequest,
            openTextEditor,
            refreshNodeVolcengineReview,
            saveNodeAsset,
            setAngleNodeId,
            setCropNodeId,
            setDialogNodeId,
            setInfoNodeId,
            setPreviewNodeId,
            submitNodeVolcengineReview,
            toggleNodeFreeResize,
            updateCanvasNodeAssetReference,
        ],
    );
}
