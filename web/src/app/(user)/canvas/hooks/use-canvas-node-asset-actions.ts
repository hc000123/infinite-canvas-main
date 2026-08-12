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
    ensureProjectFolder,
    message,
    setNodes,
    workspaceProjectId,
    workspaceProjectTitle,
}: {
    addAssetOnce: (asset: AssetWriteInput, options?: { blob?: Blob }) => Promise<string>;
    assetById: Map<string, Asset>;
    ensureProjectFolder: (projectId: string, name: string) => string;
    message: CanvasNodeAssetMessage;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    workspaceProjectId: string;
    workspaceProjectTitle: string;
}) {
    const addCanvasNodeToAssets = useCallback(
        async (node: CanvasNodeData) => {
            const asset = canvasNodeToAsset(node);
            if (!asset) return false;
            const folderId = ensureProjectFolder(workspaceProjectId, workspaceProjectTitle);
            const assetId = await addAssetOnce({ ...asset, folderId: asset.folderId || folderId } as AssetWriteInput);
            if (assetId) {
                const storedAsset = assetById.get(assetId);
                const volcengineAsset = storedAsset?.kind === node.type ? storedAsset.metadata?.volcengineAsset : undefined;
                if (node.metadata?.sourceAssetId !== assetId || (volcengineAsset?.assetId && node.metadata?.volcengineAsset?.assetId !== volcengineAsset.assetId)) {
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...canvasAssetReferenceMetadata({ sourceAssetId: assetId }), ...(volcengineAsset ? { volcengineAsset } : {}) } } : item)));
                }
            }
            return assetId;
        },
        [addAssetOnce, assetById, ensureProjectFolder, setNodes, workspaceProjectId, workspaceProjectTitle],
    );

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (!(await addCanvasNodeToAssets(node))) return message.error(`没有可保存的${canvasAssetTypeLabel(node.type)}`);
            message.success("已加入资产");
        },
        [addCanvasNodeToAssets, message],
    );

    const updateCanvasNodeAssetReference = useCallback(
        (node: CanvasNodeData) => {
            const assetId = node.metadata?.sourceAssetId;
            const asset = assetId ? assetById.get(assetId) : undefined;
            if (!asset || !node.metadata?.assetVersion) return message.warning("没有可更新的资产引用");
            const nextVersion = updateAssetReferenceToLatest(node.metadata.assetVersion, asset);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...canvasAssetReferenceMetadata({ sourceAssetId: assetId, assetVersion: nextVersion }) } } : item)));
            message.success("已更新当前节点的资产引用版本");
        },
        [assetById, message, setNodes],
    );

    return { addCanvasNodeToAssets, saveNodeAsset, updateCanvasNodeAssetReference };
}
