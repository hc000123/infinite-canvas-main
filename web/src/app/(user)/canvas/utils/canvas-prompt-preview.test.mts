import assert from "node:assert/strict";
import test from "node:test";

import { promptPreviewNoZoomProps, promptPreviewTextareaClass, promptPreviewTextareaStyle } from "./canvas-prompt-preview.ts";

test("uses a larger scrollable prompt preview for video nodes", () => {
    const className = promptPreviewTextareaClass("video");

    assert.match(className, /h-52/);
    assert.match(className, /max-h-52/);
    assert.match(className, /overflow-y-auto/);
    assert.deepEqual(promptPreviewTextareaStyle("video"), { fontSize: 15, lineHeight: "24px" });
});

test("marks prompt preview as no-zoom so wheel events stay inside the textarea", () => {
    assert.deepEqual(promptPreviewNoZoomProps(), { "data-canvas-no-zoom": true });
});
