import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasNodeData } from "../types.ts";
import { fitCanvasViewport, initialMeasuredCanvasViewport } from "./canvas-viewport.ts";

test("centers and fits all canvas nodes inside the viewport", () => {
    const viewport = fitCanvasViewport(
        [
            { position: { x: -500, y: -200 }, width: 800, height: 400 },
            { position: { x: 900, y: 400 }, width: 600, height: 200 },
        ] as CanvasNodeData[],
        { width: 1000, height: 800 },
    );

    assert.deepEqual(viewport, { x: 290, y: 316, k: 0.42 });
});

test("keeps an empty canvas at the default centered viewport", () => {
    assert.deepEqual(fitCanvasViewport([], { width: 1000, height: 800 }), { x: 500, y: 400, k: 1 });
});

test("keeps a restored viewport when measuring a populated canvas", () => {
    const restored = { x: 120, y: 80, k: 0.07 };

    assert.deepEqual(initialMeasuredCanvasViewport([{} as CanvasNodeData], restored, { width: 1000, height: 800 }), restored);
    assert.deepEqual(initialMeasuredCanvasViewport([], { x: 0, y: 0, k: 1 }, { width: 1000, height: 800 }), { x: 500, y: 400, k: 1 });
});
