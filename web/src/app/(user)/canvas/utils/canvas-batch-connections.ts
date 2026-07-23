import type { CanvasConnection, CanvasNodeData, ConnectionHandle } from "../types";

export type CanvasConnectionDraft = Omit<CanvasConnection, "id">;

export type CanvasBatchConnectionPlan = {
    connections: CanvasConnectionDraft[];
    skippedDuplicate: number;
    skippedInvalid: number;
};

type NormalizeConnection = (
    firstNodeId: string,
    secondNodeId: string,
    nodes: CanvasNodeData[],
    firstHandleType: "source" | "target",
    firstHandleId?: string,
) => CanvasConnectionDraft | null;

export function freezeCanvasConnectionSources(anchor: ConnectionHandle, selectedNodeIds: Set<string>, nodes: CanvasNodeData[]): ConnectionHandle[] {
    if (anchor.handleType !== "source" || anchor.handleId || selectedNodeIds.size < 2 || !selectedNodeIds.has(anchor.nodeId)) return [anchor];
    return nodes.filter((node) => selectedNodeIds.has(node.id)).map((node) => ({ nodeId: node.id, handleType: "source" }));
}

export function planCanvasBatchConnections({
    sources,
    targetNodeId,
    nodes,
    existingConnections,
    normalizeConnection,
}: {
    sources: ConnectionHandle[];
    targetNodeId: string;
    nodes: CanvasNodeData[];
    existingConnections: CanvasConnection[];
    normalizeConnection: NormalizeConnection;
}): CanvasBatchConnectionPlan {
    const connections: CanvasConnectionDraft[] = [];
    let skippedDuplicate = 0;
    let skippedInvalid = 0;

    for (const source of sources) {
        if (source.nodeId === targetNodeId) {
            skippedInvalid += 1;
            continue;
        }
        const draft = normalizeConnection(source.nodeId, targetNodeId, nodes, source.handleType, source.handleId);
        if (!draft) {
            skippedInvalid += 1;
            continue;
        }
        if ([...existingConnections, ...connections].some((connection) => sameConnection(connection, draft))) skippedDuplicate += 1;
        else connections.push(draft);
    }

    return { connections, skippedDuplicate, skippedInvalid };
}

function sameConnection(first: CanvasConnectionDraft, second: CanvasConnectionDraft) {
    return first.fromNodeId === second.fromNodeId && first.toNodeId === second.toNodeId && first.fromHandle === second.fromHandle && first.toHandle === second.toHandle;
}
