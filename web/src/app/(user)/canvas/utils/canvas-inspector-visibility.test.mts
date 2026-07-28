import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowCanvasAssistantPanel } from "./canvas-inspector-visibility.ts";

test("the right panel stays hidden until the assistant is mounted", () => {
    assert.equal(shouldShowCanvasAssistantPanel({ assistantMounted: false, collapsed: false }), false);
});

test("collapsing the assistant hides the right panel", () => {
    assert.equal(shouldShowCanvasAssistantPanel({ assistantMounted: true, collapsed: true }), false);
});

test("an expanded mounted assistant is visible", () => {
    assert.equal(shouldShowCanvasAssistantPanel({ assistantMounted: true, collapsed: false }), true);
});
