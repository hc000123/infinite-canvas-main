import assert from "node:assert/strict";
import test from "node:test";

import { canvasConnectionIntersectsBounds, canvasNodeIntersectsBounds, canvasViewportBounds, filterCanvasVisibleConnections } from "./canvas-visibility.ts";

const node = (id, x, y) => ({
    id,
    type: "image",
    title: id,
    position: { x, y },
    width: 100,
    height: 100,
    metadata: {},
});

test("builds world bounds and detects nodes inside the viewport", () => {
    const bounds = canvasViewportBounds({ x: 0, y: 0, k: 1 }, { width: 1_000, height: 800 }, 0);

    assert.deepEqual(bounds, { left: 0, top: 0, right: 1_000, bottom: 800 });
    assert.equal(canvasNodeIntersectsBounds(node("inside", 100, 100), bounds), true);
    assert.equal(canvasNodeIntersectsBounds(node("outside", 1_100, 100), bounds), false);
});

test("keeps crossing and forced connections while culling offscreen connections", () => {
    const bounds = canvasViewportBounds({ x: 0, y: 0, k: 1 }, { width: 1_000, height: 800 }, 0);
    const nodes = [
        node("left", -300, 300),
        node("right", 1_200, 300),
        node("above-a", 100, -500),
        node("above-b", 400, -500),
        node("forced-a", 1_300, 1_000),
        node("forced-b", 1_600, 1_000),
    ];
    const nodeById = new Map(nodes.map((item) => [item.id, item]));
    const connections = [
        { id: "crossing", fromNodeId: "left", toNodeId: "right" },
        { id: "outside", fromNodeId: "above-a", toNodeId: "above-b" },
        { id: "forced", fromNodeId: "forced-a", toNodeId: "forced-b" },
        { id: "missing", fromNodeId: "missing", toNodeId: "right" },
    ];

    assert.equal(canvasConnectionIntersectsBounds(nodes[0], nodes[1], bounds), true);
    assert.deepEqual(
        filterCanvasVisibleConnections(connections, nodeById, bounds, new Set(["forced"])).map((connection) => connection.id),
        ["crossing", "forced"],
    );
});

test("converts translated and scaled viewports to world coordinates", () => {
    const bounds = canvasViewportBounds({ x: 100, y: -50, k: 0.5 }, { width: 1_000, height: 800 }, 20);

    assert.deepEqual(bounds, { left: -220, top: 80, right: 1_820, bottom: 1_720 });
});
