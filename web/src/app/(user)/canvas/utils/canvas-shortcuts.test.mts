import assert from "node:assert/strict";
import test from "node:test";

import { shouldBlockCanvasShortcut } from "./canvas-shortcuts.ts";

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
