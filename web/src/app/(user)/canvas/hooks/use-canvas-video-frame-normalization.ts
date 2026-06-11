import { useCallback, type Dispatch, type SetStateAction } from "react";

import { uploadImage, type UploadedImage } from "@/services/image-storage";
import type { CanvasNodeData, CanvasNodeMetadata } from "../types";
import { cropImageToResolution } from "../utils/canvas-image-data";
import { fitNodeSize } from "../utils/canvas-node-size";

type CanvasVideoFrameMessage = {
    error: (text: string) => void;
    success: (text: string) => void;
    warning: (text: string) => void;
};

export function useCanvasVideoFrameNormalization({
    message,
    setNodes,
    toImageMetadata,
}: {
    message: CanvasVideoFrameMessage;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    toImageMetadata: (image: UploadedImage) => CanvasNodeMetadata;
}) {
    const normalizeVideoFrameReferences = useCallback(
        async (_videoNode: CanvasNodeData, firstNode: CanvasNodeData, lastNode: CanvasNodeData) => {
            const firstContent = firstNode.metadata?.content;
            const lastContent = lastNode.metadata?.content;
            const targetWidth = Math.round(firstNode.metadata?.naturalWidth || firstNode.width);
            const targetHeight = Math.round(firstNode.metadata?.naturalHeight || firstNode.height);
            if (!firstContent || !lastContent || !targetWidth || !targetHeight) {
                message.warning("首尾帧缺少可裁切的图片内容");
                return;
            }
            try {
                const [firstDataUrl, lastDataUrl] = await Promise.all([cropImageToResolution(firstContent, targetWidth, targetHeight), cropImageToResolution(lastContent, targetWidth, targetHeight)]);
                const [firstImage, lastImage] = await Promise.all([uploadImage(await (await fetch(firstDataUrl)).blob()), uploadImage(await (await fetch(lastDataUrl)).blob())]);
                const firstSize = fitNodeSize(firstImage.width, firstImage.height);
                const lastSize = fitNodeSize(lastImage.width, lastImage.height);
                setNodes((prev) =>
                    prev.map((node) => {
                        if (node.id === firstNode.id) return { ...node, width: firstSize.width, height: firstSize.height, metadata: { ...node.metadata, ...toImageMetadata(firstImage), status: "success", errorDetails: undefined, sourceAssetId: undefined, assetVersion: undefined, assetReferenceMode: undefined, volcengineAsset: undefined } };
                        if (node.id === lastNode.id) return { ...node, width: lastSize.width, height: lastSize.height, metadata: { ...node.metadata, ...toImageMetadata(lastImage), status: "success", errorDetails: undefined, sourceAssetId: undefined, assetVersion: undefined, assetReferenceMode: undefined, volcengineAsset: undefined } };
                        return node;
                    }),
                );
                message.success(`已将首尾帧统一裁切为 ${targetWidth} x ${targetHeight}`);
            } catch (error) {
                message.error(error instanceof Error ? `首尾帧统一裁切失败：${error.message}` : "首尾帧统一裁切失败");
            }
        },
        [message, setNodes, toImageMetadata],
    );

    return { normalizeVideoFrameReferences };
}
