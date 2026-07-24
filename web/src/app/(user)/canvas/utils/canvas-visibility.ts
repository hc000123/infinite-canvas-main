import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "../types.ts";

export type CanvasWorldBounds = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

type CanvasVisibilityNode = Pick<CanvasNodeData, "id" | "position" | "width" | "height">;

export function canvasViewportBounds(viewport: ViewportTransform, size: { width: number; height: number }, padding: number): CanvasWorldBounds {
    const scale = viewport.k || 1;
    const rawLeft = -viewport.x / scale - padding;
    const rawTop = -viewport.y / scale - padding;
    const left = rawLeft === 0 ? 0 : rawLeft;
    const top = rawTop === 0 ? 0 : rawTop;
    return {
        left,
        top,
        right: left + size.width / scale + padding * 2,
        bottom: top + size.height / scale + padding * 2,
    };
}

export function canvasNodeIntersectsBounds(node: CanvasVisibilityNode, bounds: CanvasWorldBounds) {
    return node.position.x + node.width > bounds.left && node.position.x < bounds.right && node.position.y + node.height > bounds.top && node.position.y < bounds.bottom;
}

export function canvasConnectionIntersectsBounds(from: CanvasVisibilityNode, to: CanvasVisibilityNode, bounds: CanvasWorldBounds) {
    const start = { x: from.position.x + from.width, y: from.position.y + from.height / 2 };
    const end = { x: to.position.x, y: to.position.y + to.height / 2 };
    return Math.max(start.x, end.x) > bounds.left && Math.min(start.x, end.x) < bounds.right && Math.max(start.y, end.y) > bounds.top && Math.min(start.y, end.y) < bounds.bottom;
}

export function filterCanvasVisibleConnections(
    connections: CanvasConnection[],
    nodeById: ReadonlyMap<string, CanvasVisibilityNode>,
    bounds: CanvasWorldBounds,
    forcedIds = new Set<string>(),
) {
    return connections.filter((connection) => {
        const from = nodeById.get(connection.fromNodeId);
        const to = nodeById.get(connection.toNodeId);
        if (!from || !to) return false;
        return forcedIds.has(connection.id) || canvasConnectionIntersectsBounds(from, to, bounds);
    });
}
