import assert from "node:assert/strict";
import test from "node:test";

import { placeCanvasNodeAwayFromNodes, resolveNonOverlappingNodePosition, resolveRightwardNodePosition } from "./canvas-node-placement.ts";

const existing = {
    position: { x: 100, y: 100 },
    width: 340,
    height: 240,
};

test("keeps requested position when it does not overlap existing nodes", () => {
    const position = resolveNonOverlappingNodePosition([existing], { x: 520, y: 100 }, { width: 340, height: 240 });

    assert.deepEqual(position, { x: 520, y: 100 });
});

test("moves a new node to the nearest free slot when requested position overlaps", () => {
    const position = resolveNonOverlappingNodePosition([existing], { x: 100, y: 100 }, { width: 340, height: 240 });

    assert.deepEqual(position, { x: 476, y: 100 });
});

test("skips occupied candidate slots until a free position is found", () => {
    const position = resolveNonOverlappingNodePosition([existing, { position: { x: 476, y: 100 }, width: 340, height: 240 }, { position: { x: 100, y: 376 }, width: 340, height: 240 }], { x: 100, y: 100 }, { width: 340, height: 240 });

    assert.deepEqual(position, { x: -276, y: 100 });
});

test("places a full canvas node without mutating the original node", () => {
    const node = { id: "node-1", type: "text" as const, title: "文本", position: { x: 100, y: 100 }, width: 340, height: 240, metadata: {} };
    const placed = placeCanvasNodeAwayFromNodes(node, [existing]);

    assert.deepEqual(node.position, { x: 100, y: 100 });
    assert.deepEqual(placed.position, { x: 476, y: 100 });
});

test("rightward placement only moves along the x axis", () => {
    const position = resolveRightwardNodePosition([existing, { position: { x: 476, y: 100 }, width: 340, height: 240 }], { x: 100, y: 100 }, { width: 340, height: 240 });

    assert.deepEqual(position, { x: 852, y: 100 });
});
