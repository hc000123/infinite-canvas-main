import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { Asset, AssetWriteInput } from "@/stores/use-asset-store";
import { updateAssetReferenceToLatest } from "../../assets/asset-version-references";
import type { CanvasNodeData } from "../types";
import { canvasAssetReferenceMetadata } from "../utils/canvas-asset-reference";
import { canvasNodeToAsset } from "../utils/canvas-assets";
import { canvasAssetTypeLabel } from "../utils/canvas-page-helpers";

type CanvasNodeAssetMessage = {
    error: (text: string) => void;
    success: (text: string) => void;
    warning: (text: string) => void;
};

export function useCanvasNodeAssetActions({
    addAssetOnce,
    assetById,
    message,
    setNodes,
}: {
    addAssetOnce: (asset: AssetWriteInput, options?: { blob?: Blob }) => Promise<string>;
    assetById: Map<string, Asset>;
    message: CanvasNodeAssetMessage;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
}) {
    const addCanvasNodeToAssets = useCallback(
        async (node: CanvasNodeData) => {
            const asset = canvasNodeToAsset(node);
            if (!asset) return false;
            const assetId = await addAssetOnce(asset);
            if (assetId && node.metadata?.sourceAssetId !== assetId) {
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...canvasAssetReferenceMetadata({ sourceAssetId: assetId }) } } : item)));
            }
            return assetId;
        },
        [addAssetOnce, setNodes],
    );

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (!(await addCanvasNodeToAssets(node))) return message.error(`没有可保存的${canvasAssetTypeLabel(node.type)}`);
            message.success("已加入我的素材");
        },
        [addCanvasNodeToAssets, message],
    );

    const updateCanvasNodeAssetReference = useCallback(
        (node: CanvasNodeData) => {
            const assetId = node.metadata?.sourceAssetId;
            const asset = assetId ? assetById.get(assetId) : undefined;
            if (!asset || !node.metadata?.assetVersion) return message.warning("没有可更新的素材引用");
            const nextVersion = updateAssetReferenceToLatest(node.metadata.assetVersion, asset);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...canvasAssetReferenceMetadata({ sourceAssetId: assetId, assetVersion: nextVersion }) } } : item)));
            message.success("已更新当前节点的素材引用版本");
        },
        [assetById, message, setNodes],
    );

    return { addCanvasNodeToAssets, saveNodeAsset, updateCanvasNodeAssetReference };
}
