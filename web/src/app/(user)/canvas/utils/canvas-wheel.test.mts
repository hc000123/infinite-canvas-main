import assert from "node:assert/strict";
import test from "node:test";

import { shouldHandleCanvasWheel } from "./canvas-wheel.ts";

test("plain wheel is handled by the canvas", () => {
    assert.equal(shouldHandleCanvasWheel({ ctrlKey: false, metaKey: false, excludedTarget: false }), true);
});

test("browser zoom wheel shortcuts are not handled by the canvas", () => {
    assert.equal(shouldHandleCanvasWheel({ ctrlKey: true, metaKey: false, excludedTarget: false }), false);
    assert.equal(shouldHandleCanvasWheel({ ctrlKey: false, metaKey: true, excludedTarget: false }), false);
});

test("wheel inside an excluded editor is not handled by the canvas", () => {
    assert.equal(shouldHandleCanvasWheel({ ctrlKey: false, metaKey: false, excludedTarget: true }), false);
});
