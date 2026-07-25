import type { CanvasNodeData } from "../types.ts";

export function canvasGeneratedAssetTitle(node: CanvasNodeData, canvasTitle: string, nodes: CanvasNodeData[] = [node], versionNumber?: number) {
    const safeCanvasTitle = canvasTitle.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "未命名画布";
    const nodeNumber = String(canvasAssetNodeNumber(node, nodes)).padStart(3, "0");
    return `${safeCanvasTitle}-节点${nodeNumber}-v${versionNumber || generatedCanvasAssetVersionNumber(node)}`;
}

export function numberCanvasAssetNode(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const existing = node.metadata?.assetNodeNumber || nodes.find((item) => item.id === node.id)?.metadata?.assetNodeNumber;
    const nodeNumber = existing || Math.max(1, nodes.findIndex((item) => item.id === node.id) + 1);
    return { ...node, metadata: { ...node.metadata, assetNodeNumber: nodeNumber } };
}

export function canvasAssetNodeNumber(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    return numberCanvasAssetNode(node, nodes).metadata?.assetNodeNumber || 1;
}

export function generatedCanvasAssetVersionNumber(node: CanvasNodeData) {
    const versions = node.metadata?.mediaVersions || [];
    if (node.metadata?.pendingMediaVersion) return versions.length + 1;
    const current = versions.find((version) => version.id === node.metadata?.currentMediaVersionId) || versions.at(-1);
    return current?.versionNumber || node.metadata?.productionVideoVersionNumber || 1;
}
