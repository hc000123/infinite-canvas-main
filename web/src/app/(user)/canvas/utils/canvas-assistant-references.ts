import type { CanvasAssistantReference, CanvasConnection, CanvasNodeData } from "../types";

const IMAGE_NODE_TYPE = "image" as CanvasNodeData["type"];
const TEXT_NODE_TYPE = "text" as CanvasNodeData["type"];

export function buildAssistantReferences(nodes: CanvasNodeData[], selectedNodeIds: Set<string>, connections: CanvasConnection[]): CanvasAssistantReference[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const seenIds = new Set<string>();
    const references: CanvasAssistantReference[] = [];
    const pushReference = (reference: CanvasAssistantReference | null) => {
        if (!reference || seenIds.has(reference.id)) return;
        seenIds.add(reference.id);
        references.push(reference);
    };

    Array.from(selectedNodeIds).forEach((id) => {
        pushReference(nodeToReference(nodeById.get(id)));
        getOrderedUpstreamNodes(id, nodes, connections).forEach((node) => pushReference(nodeToReference(node)));
    });

    return references;
}

function nodeToReference(node?: CanvasNodeData): CanvasAssistantReference | null {
    if (!node) return null;
    if (node.type === IMAGE_NODE_TYPE && node.metadata?.content) {
        return { id: node.id, type: node.type, title: node.title, dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
    }
    if (node.type === TEXT_NODE_TYPE && (node.metadata?.content || node.metadata?.prompt)) {
        return { id: node.id, type: node.type, title: node.title, text: node.metadata.content || node.metadata.prompt };
    }
    if (node.metadata?.prompt) {
        return { id: node.id, type: node.type, title: node.title, text: node.metadata.prompt };
    }
    return null;
}

function getOrderedUpstreamNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const target = nodes.find((node) => node.id === nodeId);
    const upstreamNodes = connections
        .filter((connection) => connection.toNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
        .filter((node): node is CanvasNodeData => Boolean(node));
    const order = target?.metadata?.inputOrder || [];
    return [...order.map((id) => upstreamNodes.find((node) => node.id === id)).filter((node): node is CanvasNodeData => Boolean(node)), ...upstreamNodes.filter((node) => !order.includes(node.id))];
}
