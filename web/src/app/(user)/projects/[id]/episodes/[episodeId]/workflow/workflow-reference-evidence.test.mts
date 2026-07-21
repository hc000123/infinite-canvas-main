import assert from "node:assert/strict";
import test from "node:test";

import { parseWorkflowReferenceEvidence } from "./workflow-reference-evidence.ts";

test("parses string and list image understanding evidence", () => {
    const result = parseWorkflowReferenceEvidence(JSON.stringify({ referenceEvidence: [{ imageRef: "@图1", observations: ["侧后窗光", "旧木床"], appliedTo: "scene-1" }] }));
    assert.deepEqual(result, [{ imageRef: "@图1", observations: ["侧后窗光", "旧木床"], appliedTo: ["scene-1"] }]);
});

test("drops incomplete or invalid evidence", () => {
    assert.deepEqual(parseWorkflowReferenceEvidence("not-json"), []);
    assert.deepEqual(parseWorkflowReferenceEvidence(JSON.stringify({ referenceEvidence: [{ imageRef: "@图1", observations: [] }] })), []);
});
