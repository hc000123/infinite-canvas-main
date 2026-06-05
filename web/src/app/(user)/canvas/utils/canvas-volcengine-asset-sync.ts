import type { Asset, VolcengineAssetMetadata } from "@/stores/use-asset-store";
import type { CanvasNodeData } from "../types.ts";

export function syncCanvasVolcengineAssetsFromLibrary(nodes: CanvasNodeData[], assets: Asset[]) {
    let changed = false;
    const nextNodes = nodes.map((node) => {
        const assetMetadata = findCanvasNodeVolcengineAsset(node, assets);
        if (!assetMetadata || !shouldUseAssetVolcengineMetadata(node.metadata?.volcengineAsset, assetMetadata)) return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, volcengineAsset: assetMetadata } };
    });
    return { nodes: changed ? nextNodes : nodes, changed };
}

export function findCanvasNodeVolcengineAsset(node: CanvasNodeData, assets: Asset[]): VolcengineAssetMetadata | undefined {
    if (node.type !== "image" && node.type !== "video") return undefined;
    const sourceAssetId = node.metadata?.sourceAssetId;
    const storageKey = node.metadata?.storageKey;
    const matched = assets.find((asset) => {
        if (asset.kind !== node.type) return false;
        if (sourceAssetId && asset.id === sourceAssetId) return true;
        if (storageKey && assetStorageKey(asset) === storageKey) return true;
        return assetMetadataRefsNode(asset, node.id);
    });
    return matched?.metadata?.volcengineAsset;
}

export function shouldUseAssetVolcengineMetadata(current: VolcengineAssetMetadata | undefined, incoming: VolcengineAssetMetadata | undefined) {
    if (!incoming?.assetId?.trim()) return false;
    if (!current?.assetId?.trim()) return true;
    if (incoming.status === "Active" && current.status !== "Active") return true;
    if (current.status === "Active" && incoming.status !== "Active") return false;
    if (incoming.assetId !== current.assetId) return false;
    return timestampMs(incoming.updatedAt) > timestampMs(current.updatedAt);
}

function assetMetadataRefsNode(asset: Asset, nodeId: string) {
    const metadata = asset.metadata || {};
    if (metadata.nodeId === nodeId) return true;
    return Array.isArray(metadata.sourceRefs) && metadata.sourceRefs.includes(nodeId);
}

function assetStorageKey(asset: Asset) {
    if (asset.kind === "image" || asset.kind === "video") return asset.data.storageKey;
    return "";
}

function timestampMs(value?: string) {
    const timestamp = value ? Date.parse(value) : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
}
