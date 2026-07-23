import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readCanvasFile(path: string) {
    return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("media version control keeps its label in one compact group", () => {
    const control = readCanvasFile("../components/canvas-media-version-control.tsx");

    assert.match(control, /inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-lg border/);
    assert.match(control, /shrink-0 whitespace-nowrap/);
});

test("node hover toolbar always stays above the node content", () => {
    const toolbar = readCanvasFile("../components/canvas-node-hover-toolbar.tsx");

    assert.match(toolbar, /const top = viewport\.y \+ node\.position\.y \* viewport\.k - 12;/);
    assert.match(toolbar, /-translate-x-1\/2 -translate-y-full/);
    assert.doesNotMatch(toolbar, /shouldOverlayMedia/);
});
