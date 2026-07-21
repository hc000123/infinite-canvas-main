import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkflowRouteState, selectDefaultWorkflowShot } from "./workflow-route-state.ts";

test("normalizes an invalid workflow URL selection", () => {
    assert.deepEqual(normalizeWorkflowRouteState({ stage: "bad", shot: "missing" }, ["P01"]), { stage: "script", shot: "P01" });
});

test("keeps a valid workflow URL selection", () => {
    assert.deepEqual(normalizeWorkflowRouteState({ stage: "video", shot: "P02" }, ["P01", "P02"]), { stage: "video", shot: "P02" });
});

test("selects blocker before review, running, and incomplete shots", () => {
    assert.equal(
        selectDefaultWorkflowShot([
            { id: "P01", status: "incomplete" },
            { id: "P02", status: "running" },
            { id: "P03", status: "review" },
            { id: "P04", status: "blocked" },
        ]),
        "P04",
    );
});
