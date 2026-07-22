import assert from "node:assert/strict";
import test from "node:test";

import { promptEditorContentClass } from "./canvas-prompt-editor-layout.ts";

test("expanded prompt editor uses most of the viewport instead of the compact height cap", () => {
    assert.match(promptEditorContentClass(true), /min-h-\[62dvh\]/);
    assert.match(promptEditorContentClass(true), /max-h-\[72dvh\]/);
    assert.doesNotMatch(promptEditorContentClass(true), /max-h-44/);
});

test("embedded prompt editor keeps a compact scrollable height", () => {
    assert.match(promptEditorContentClass(false), /min-h-24/);
    assert.match(promptEditorContentClass(false), /max-h-44/);
});
