import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the canvas media preview renders image video and audio content", () => {
    const modal = readFileSync(new URL("../components/canvas-page-modals.tsx", import.meta.url), "utf8");
    const overlays = readFileSync(new URL("../components/canvas-page-overlays.tsx", import.meta.url), "utf8");

    assert.match(modal, /CanvasMediaPreviewModal/);
    assert.match(modal, /node\?\.type === CanvasNodeType\.Video/);
    assert.match(modal, /<video/);
    assert.match(modal, /node\?\.type === CanvasNodeType\.Audio/);
    assert.match(modal, /<audio/);
    assert.match(overlays, /<CanvasMediaPreviewModal/);
});
