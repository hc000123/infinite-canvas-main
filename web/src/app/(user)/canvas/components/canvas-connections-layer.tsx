"use client";

import { isHiddenBatchConnectionEndpoint } from "../utils/canvas-batch-nodes";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "../types";
import { ActiveConnectionPath, ConnectionPath } from "./canvas-connections";

type Props = {
    connectingParams: ConnectionHandle | null;
    connections: CanvasConnection[];
    mouseWorld: Position;
    nodeById: Map<string, CanvasNodeData>;
    nodes: CanvasNodeData[];
    onSelectConnection: (connectionId: string) => void;
    relatedConnectionIds: Set<string>;
    selectedConnectionId: string | null;
};

export function CanvasConnectionsLayer({ connectingParams, connections, mouseWorld, nodeById, nodes, onSelectConnection, relatedConnectionIds, selectedConnectionId }: Props) {
    return (
        <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
            {connections
                .filter((connection) => {
                    const from = nodeById.get(connection.fromNodeId);
                    const to = nodeById.get(connection.toNodeId);
                    return Boolean(from && to && !isHiddenBatchConnectionEndpoint(from, nodes) && !isHiddenBatchConnectionEndpoint(to, nodes));
                })
                .map((connection) => {
                    const from = nodeById.get(connection.fromNodeId);
                    const to = nodeById.get(connection.toNodeId);
                    if (!from || !to) return null;

                    return <ConnectionPath key={connection.id} connection={connection} from={from} to={to} active={selectedConnectionId === connection.id || relatedConnectionIds.has(connection.id)} onSelect={() => onSelectConnection(connection.id)} />;
                })}
            {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} /> : null}
        </svg>
    );
}
