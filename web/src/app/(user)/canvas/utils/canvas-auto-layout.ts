import type { CanvasConnection, CanvasNodeData } from "../types.ts";

const HORIZONTAL_GAP = 120;
const VERTICAL_GAP = 72;
const SECTION_GAP = 160;
const LANE_WIDTH = 1600;
const TYPE_ORDER: Record<string, number> = {
    image: 0,
    text: 1,
    config: 2,
    video: 3,
    audio: 4,
};

export function organizeCanvasNodes(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    if (nodes.length < 2) return nodes;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const layoutNodes = nodes.filter((node) => !node.metadata?.batchRootId || !nodeById.has(node.metadata.batchRootId));
    const layoutNodeById = new Map(layoutNodes.map((node) => [node.id, node]));
    const rootId = (id: string) => nodeById.get(id)?.metadata?.batchRootId || id;
    const edges = connections.flatMap((connection) => {
        const from = rootId(connection.fromNodeId);
        const to = rootId(connection.toNodeId);
        return from !== to && layoutNodeById.has(from) && layoutNodeById.has(to) ? [{ from, to }] : [];
    });
    const connectedIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    const connected = layoutNodes.filter((node) => connectedIds.has(node.id));
    const disconnected = layoutNodes.filter((node) => !connectedIds.has(node.id));
    const positions = new Map<string, CanvasNodeData["position"]>();
    let mainBottom = 0;

    if (connected.length) {
        const layers = buildConnectionLayers(connected, edges);
        const layerNumbers = Array.from(layers.keys()).sort((a, b) => a - b);
        let x = 0;
        layerNumbers.forEach((layerNumber) => {
            const layer = layers.get(layerNumber)!.sort(compareOriginalPosition);
            let y = 0;
            layer.forEach((node) => {
                positions.set(node.id, { x, y });
                y += node.height + VERTICAL_GAP;
            });
            mainBottom = Math.max(mainBottom, y ? y - VERTICAL_GAP : 0);
            x += Math.max(...layer.map((node) => node.width), 1) + HORIZONTAL_GAP;
        });
    }

    let laneY = connected.length ? mainBottom + SECTION_GAP : 0;
    const groups = groupDisconnectedNodes(disconnected);
    groups.forEach((group) => {
        let x = 0;
        let rowY = laneY;
        let rowHeight = 0;
        group.forEach((node) => {
            if (x > 0 && x + node.width > LANE_WIDTH) {
                x = 0;
                rowY += rowHeight + VERTICAL_GAP;
                rowHeight = 0;
            }
            positions.set(node.id, { x, y: rowY });
            x += node.width + HORIZONTAL_GAP;
            rowHeight = Math.max(rowHeight, node.height);
        });
        laneY = rowY + rowHeight + SECTION_GAP;
    });

    const rootDelta = new Map<string, { x: number; y: number }>();
    layoutNodes.forEach((node) => {
        const position = positions.get(node.id);
        if (position) rootDelta.set(node.id, { x: position.x - node.position.x, y: position.y - node.position.y });
    });
    return nodes.map((node) => {
        const position = positions.get(node.id);
        if (position) return { ...node, position };
        const delta = node.metadata?.batchRootId ? rootDelta.get(node.metadata.batchRootId) : undefined;
        return delta ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } } : node;
    });
}

function buildConnectionLayers(nodes: CanvasNodeData[], edges: Array<{ from: string; to: string }>) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Map(nodes.map((node) => [node.id, 0]));
    const outgoing = new Map(nodes.map((node) => [node.id, new Set<string>()]));
    edges.forEach(({ from, to }) => {
        const targets = outgoing.get(from);
        if (!targets || targets.has(to)) return;
        targets.add(to);
        incoming.set(to, (incoming.get(to) || 0) + 1);
    });
    const level = new Map<string, number>();
    const queue = nodes.filter((node) => incoming.get(node.id) === 0).sort(compareOriginalPosition);
    queue.forEach((node) => level.set(node.id, 0));
    const processed = new Set<string>();
    while (queue.length) {
        const node = queue.shift()!;
        processed.add(node.id);
        outgoing.get(node.id)?.forEach((targetId) => {
            level.set(targetId, Math.max(level.get(targetId) || 0, (level.get(node.id) || 0) + 1));
            incoming.set(targetId, (incoming.get(targetId) || 0) - 1);
            if (incoming.get(targetId) === 0) queue.push(nodeById.get(targetId)!);
        });
        queue.sort(compareOriginalPosition);
    }
    let cycleLevel = Math.max(-1, ...level.values()) + 1;
    nodes
        .filter((node) => !processed.has(node.id))
        .sort(compareOriginalPosition)
        .forEach((node) => level.set(node.id, cycleLevel++));
    const layers = new Map<number, CanvasNodeData[]>();
    nodes.forEach((node) => {
        const nodeLevel = level.get(node.id) || 0;
        layers.set(nodeLevel, [...(layers.get(nodeLevel) || []), node]);
    });
    return layers;
}

function groupDisconnectedNodes(nodes: CanvasNodeData[]) {
    const groups = new Map<number, CanvasNodeData[]>();
    nodes.forEach((node) => {
        const order = TYPE_ORDER[node.type] ?? Number.MAX_SAFE_INTEGER;
        groups.set(order, [...(groups.get(order) || []), node]);
    });
    return Array.from(groups.entries())
        .sort(([left], [right]) => left - right)
        .map(([, group]) => group.sort(compareOriginalPosition));
}

function compareOriginalPosition(left: CanvasNodeData, right: CanvasNodeData) {
    return left.position.y - right.position.y || left.position.x - right.position.x || left.id.localeCompare(right.id);
}
