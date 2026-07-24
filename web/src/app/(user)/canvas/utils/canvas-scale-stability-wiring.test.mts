import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readCanvasFile = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the canvas page exposes capacity through the top bar", () => {
    const page = readCanvasFile("../[id]/canvas-client-page.tsx");
    const topBar = readCanvasFile("../components/canvas-top-bar.tsx");
    const indicator = readCanvasFile("../components/canvas-capacity-indicator.tsx");

    assert.match(page, /useCanvasCapacity\(nodes, connections\)/);
    assert.match(page, /capacity=\{capacity\}/);
    assert.match(topBar, /<CanvasCapacityIndicator capacity=\{capacity\}/);
    assert.match(indicator, /画布容量/);
});

test("nodes and connections share viewport visibility helpers", () => {
    const page = readCanvasFile("../[id]/canvas-client-page.tsx");
    const derived = readCanvasFile("../hooks/use-canvas-derived-state.ts");
    const connectionsLayer = readCanvasFile("../components/canvas-connections-layer.tsx");

    assert.match(derived, /canvasNodeIntersectsBounds/);
    assert.match(connectionsLayer, /filterCanvasVisibleConnections/);
    assert.match(connectionsLayer, /canvasViewportBounds\(viewport, viewportSize, 600\)/);
    assert.match(page, /viewportSize=\{size\}/);
});
