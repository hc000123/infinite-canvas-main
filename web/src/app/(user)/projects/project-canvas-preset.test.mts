import assert from "node:assert/strict";
import test from "node:test";

import { editableCanvasPreset } from "./project-canvas-preset.ts";

test("editableCanvasPreset prefers the canvas preset over the project preset", () => {
    assert.deepEqual(editableCanvasPreset({ ratio: "9:16", defaultDuration: "8" }, { ratio: "16:9", defaultDuration: "6" }), { ratio: "9:16", defaultDuration: "8" });
});

test("editableCanvasPreset falls back to the project preset for old canvases", () => {
    assert.deepEqual(editableCanvasPreset(undefined, { ratio: "16:9", defaultDuration: "6" }), { ratio: "16:9", defaultDuration: "6" });
});
