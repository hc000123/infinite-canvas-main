import assert from "node:assert/strict";
import test from "node:test";

import { isReadableProductionBibleItem } from "./production-bible.ts";

test("keeps user-facing production bible names visible", () => {
    assert.equal(isReadableProductionBibleItem({ name: "林秀妹", description: "女主角设定" }), true);
    assert.equal(isReadableProductionBibleItem({ name: "1960 年代乡村院落", description: "" }), true);
});

test("hides technical json fragments from production bible lists", () => {
    assert.equal(isReadableProductionBibleItem({ name: '"agentId": "art-designer",', description: "" }), false);
    assert.equal(isReadableProductionBibleItem({ name: '"metadata": {', description: "" }), false);
    assert.equal(isReadableProductionBibleItem({ name: "{", description: "" }), false);
    assert.equal(isReadableProductionBibleItem({ name: "```json", description: "" }), false);
});
