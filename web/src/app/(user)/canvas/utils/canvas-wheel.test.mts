import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanvasWheelAction } from "./canvas-wheel.ts";

test("touchpad two-finger scrolling pans the canvas", () => {
    assert.equal(resolveCanvasWheelAction({ ctrlKey: false, metaKey: false, deltaMode: 0, deltaX: 18, deltaY: 26, excludedTarget: false }), "pan");
    assert.equal(resolveCanvasWheelAction({ ctrlKey: false, metaKey: false, deltaMode: 0, deltaX: 0, deltaY: 12.5, excludedTarget: false }), "pan");
});

test("touchpad pinch and modified wheel zoom the canvas", () => {
    assert.equal(resolveCanvasWheelAction({ ctrlKey: true, metaKey: false, deltaMode: 0, deltaX: 0, deltaY: 8, excludedTarget: false }), "zoom");
    assert.equal(resolveCanvasWheelAction({ ctrlKey: false, metaKey: true, deltaMode: 0, deltaX: 0, deltaY: 8, excludedTarget: false }), "zoom");
});

test("coarse mouse wheels continue to zoom the canvas", () => {
    assert.equal(resolveCanvasWheelAction({ ctrlKey: false, metaKey: false, deltaMode: 1, deltaX: 0, deltaY: 3, excludedTarget: false }), "zoom");
    assert.equal(resolveCanvasWheelAction({ ctrlKey: false, metaKey: false, deltaMode: 0, deltaX: 0, deltaY: 100, excludedTarget: false }), "zoom");
});

test("wheel inside an excluded editor is not handled by the canvas", () => {
    assert.equal(resolveCanvasWheelAction({ ctrlKey: false, metaKey: false, deltaMode: 0, deltaX: 8, deltaY: 8, excludedTarget: true }), "ignore");
});
