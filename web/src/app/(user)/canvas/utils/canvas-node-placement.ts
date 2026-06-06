import type { CanvasNodeData, Position } from "../types.ts";

type NodeRect = Pick<CanvasNodeData, "position" | "width" | "height">;

const DEFAULT_GAP = 36;
const MAX_RING = 24;

export function resolveNonOverlappingNodePosition(nodes: NodeRect[], position: Position, size: { width: number; height: number }, gap = DEFAULT_GAP): Position {
    const base = { x: position.x, y: position.y };
    if (!overlapsAny(nodes, base, size, gap)) return base;

    const stepX = size.width + gap;
    const stepY = size.height + gap;
    for (let ring = 1; ring <= MAX_RING; ring += 1) {
        for (const [x, y] of ringOffsets(ring)) {
            const candidate = { x: base.x + x * stepX, y: base.y + y * stepY };
            if (!overlapsAny(nodes, candidate, size, gap)) return candidate;
        }
    }

    return { x: base.x + (MAX_RING + 1) * stepX, y: base.y };
}

export function placeCanvasNodeAwayFromNodes<T extends CanvasNodeData>(node: T, nodes: NodeRect[], gap = DEFAULT_GAP): T {
    const position = resolveNonOverlappingNodePosition(nodes, node.position, { width: node.width, height: node.height }, gap);
    return position.x === node.position.x && position.y === node.position.y ? node : { ...node, position };
}

export function resolveRightwardNodePosition(nodes: NodeRect[], position: Position, size: { width: number; height: number }, gap = DEFAULT_GAP): Position {
    let candidate = { x: position.x, y: position.y };
    const stepX = size.width + gap;
    for (let index = 0; index <= MAX_RING; index += 1) {
        if (!overlapsAny(nodes, candidate, size, gap)) return candidate;
        candidate = { x: candidate.x + stepX, y: position.y };
    }
    return candidate;
}

function overlapsAny(nodes: NodeRect[], position: Position, size: { width: number; height: number }, gap: number) {
    return nodes.some((node) => rectsOverlap(position, size, node.position, { width: node.width, height: node.height }, gap));
}

function rectsOverlap(a: Position, aSize: { width: number; height: number }, b: Position, bSize: { width: number; height: number }, gap: number) {
    return a.x < b.x + bSize.width + gap && a.x + aSize.width + gap > b.x && a.y < b.y + bSize.height + gap && a.y + aSize.height + gap > b.y;
}

function ringOffsets(ring: number) {
    const offsets: Array<[number, number]> = [
        [ring, 0],
        [0, ring],
        [-ring, 0],
        [0, -ring],
    ];
    for (let y = -ring; y <= ring; y += 1) {
        for (let x = -ring; x <= ring; x += 1) {
            if (Math.abs(x) !== ring && Math.abs(y) !== ring) continue;
            if (offsets.some(([ox, oy]) => ox === x && oy === y)) continue;
            offsets.push([x, y]);
        }
    }
    return offsets;
}
