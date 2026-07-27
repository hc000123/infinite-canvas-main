import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readCanvasFile = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("canvas overlays avoid React 19 and Ant Design 6 console errors", () => {
    const topBar = readCanvasFile("../components/canvas-top-bar.tsx");
    const assetPicker = readCanvasFile("../components/asset-picker-modal.tsx");

    assert.doesNotMatch(topBar, /\bDropdown\b|overlayClassName/);
    assert.doesNotMatch(assetPicker, /maskClosable/);
    assert.match(assetPicker, /mask=\{\{ closable: !importing \}\}/);
});
