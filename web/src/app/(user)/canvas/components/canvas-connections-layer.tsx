"use client";

import { isHiddenBatchConnectionEndpoint } from "../utils/canvas-batch-nodes";
import { canvasViewportBounds, filterCanvasVisibleConnections } from "../utils/canvas-visibility";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position, ViewportTransform } from "../types";
import { ActiveConnectionPath, ConnectionPath } from "./canvas-connections";

type Props = {
    connectingParams: ConnectionHandle | null;
    connections: CanvasConnection[];
    mouseWorld: Position;
    nodeById: Map<string, CanvasNodeData>;
    nodes: CanvasNodeData[];
    onSelectConnection: (connectionId: string) => void;
    onDeleteConnection: (connectionId: string) => void;
    relatedConnectionIds: Set<string>;
    selectedConnectionId: string | null;
    viewport: ViewportTransform;
    viewportSize: { width: number; height: number };
};

export function CanvasConnectionsLayer({ connectingParams, connections, mouseWorld, nodeById, nodes, onSelectConnection, onDeleteConnection, relatedConnectionIds, selectedConnectionId, viewport, viewportSize }: Props) {
    const forcedConnectionIds = new Set(relatedConnectionIds);
    if (selectedConnectionId) forcedConnectionIds.add(selectedConnectionId);
    const visibleConnections = filterCanvasVisibleConnections(connections, nodeById, canvasViewportBounds(viewport, viewportSize, 600), forcedConnectionIds);

    return (
        <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
            {visibleConnections
                .filter((connection) => {
                    const from = nodeById.get(connection.fromNodeId);
                    const to = nodeById.get(connection.toNodeId);
                    return Boolean(from && to && !isHiddenBatchConnectionEndpoint(from, nodes) && !isHiddenBatchConnectionEndpoint(to, nodes));
                })
                .map((connection) => {
                    const from = nodeById.get(connection.fromNodeId);
                    const to = nodeById.get(connection.toNodeId);
                    if (!from || !to) return null;

                    return (
                        <ConnectionPath
                            key={connection.id}
                            connection={connection}
                            from={from}
                            to={to}
                            active={selectedConnectionId === connection.id || relatedConnectionIds.has(connection.id)}
                            selected={selectedConnectionId === connection.id}
                            onSelect={() => onSelectConnection(connection.id)}
                            onDelete={() => onDeleteConnection(connection.id)}
                        />
                    );
                })}
            {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} /> : null}
        </svg>
    );
}
