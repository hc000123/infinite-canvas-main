import type { CanvasConnection, CanvasNodeData } from "../types.ts";

export function removeVariantVideoConnections(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    return connections.filter((connection) => {
        const from = nodeById.get(connection.fromNodeId);
        const to = nodeById.get(connection.toNodeId);
        if (from?.type !== "video" || to?.type !== "video") return true;

        const metadata = to.metadata;
        const isVariant = metadata?.relationType === "variant" || metadata?.videoActionType === "variant" || metadata?.actionType === "variant";
        if (!isVariant) return true;

        const sourceIds = new Set([metadata?.variantOfNodeId, metadata?.sourceVideoNodeId].filter(Boolean));
        return !sourceIds.has(from.id);
    });
}
