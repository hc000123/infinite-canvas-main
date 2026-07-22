import assert from "node:assert/strict";
import test from "node:test";

import { buildOriginalScriptEditPatch } from "./project-episode-script-edit.ts";

test("editing the original script invalidates stale optimized output", () => {
    assert.deepEqual(buildOriginalScriptEditPatch("  新的完整剧本  "), {
        sourceSummary: "新的完整剧本",
        summary: "",
        structuredScript: undefined,
    });
});

test("the original script cannot be saved empty", () => {
    assert.throws(() => buildOriginalScriptEditPatch("   "), /剧本正文不能为空/);
});
