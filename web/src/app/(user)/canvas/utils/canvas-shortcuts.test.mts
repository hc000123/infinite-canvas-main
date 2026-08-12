import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { shouldBlockCanvasShortcut } from "./canvas-shortcuts.ts";

const shortcutHook = readFileSync(new URL("../hooks/use-canvas-keyboard-shortcuts.ts", import.meta.url), "utf8");

test("a hidden mounted overlay does not block canvas shortcuts", () => {
    assert.equal(
        shouldBlockCanvasShortcut({
            canvasHasFocus: true,
            targetIsEditable: false,
            targetIsInOverlay: false,
            hasVisibleOverlay: false,
            hasTextSelection: false,
            isCopyShortcut: false,
        }),
        false,
    );
});

test("a visible overlay or editable target blocks canvas shortcuts", () => {
    const base = { canvasHasFocus: true, hasTextSelection: false, isCopyShortcut: false };
    assert.equal(shouldBlockCanvasShortcut({ ...base, targetIsEditable: false, targetIsInOverlay: false, hasVisibleOverlay: true }), true);
    assert.equal(shouldBlockCanvasShortcut({ ...base, targetIsEditable: true, targetIsInOverlay: false, hasVisibleOverlay: false }), true);
});

test("canvas shortcuts retain undo, redo, delete, and escape without adding creation keys", () => {
    assert.match(shortcutHook, /key === "z"/);
    assert.match(shortcutHook, /key === "y"/);
    assert.match(shortcutHook, /event\.key === "Delete"/);
    assert.match(shortcutHook, /event\.key === "Escape"/);
    assert.doesNotMatch(shortcutHook, /CanvasNodeType\.(Text|Image|Video|Audio)|onAdd(Text|Image|Video|Audio)|createNode\s*\(/);
});
