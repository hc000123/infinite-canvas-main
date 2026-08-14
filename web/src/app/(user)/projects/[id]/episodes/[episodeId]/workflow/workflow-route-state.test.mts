import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkflowRouteState, selectDefaultWorkflowShot, workflowRouteHref } from "./workflow-route-state.ts";

test("normalizes an invalid workflow URL selection", () => {
    assert.deepEqual(normalizeWorkflowRouteState({ stage: "bad", shot: "missing" }, ["P01"]), { stage: "script", shot: "P01" });
});

test("keeps a valid workflow URL selection", () => {
    assert.deepEqual(normalizeWorkflowRouteState({ stage: "video", shot: "P02" }, ["P01", "P02"]), { stage: "video", shot: "P02" });
});

test("uses six agent stages and maps legacy routes", () => {
    assert.deepEqual(normalizeWorkflowRouteState({ stage: "assets" }, []), { stage: "asset-extraction", shot: "" });
    assert.deepEqual(normalizeWorkflowRouteState({ stage: "delivery" }, []), { stage: "video", shot: "" });
    assert.deepEqual(normalizeWorkflowRouteState({ stage: "storyboard" }, []), { stage: "storyboard", shot: "" });
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

test("keeps workflow navigation on the episode route and preserves its source", () => {
    assert.equal(
        workflowRouteHref("project / 1", "episode / 1", { stage: "video", shot: "P02" }, "returnTo=%2Fagent%3FprojectId%3Dp1&returnLabel=%E8%BF%94%E5%9B%9E%E7%94%9F%E4%BA%A7%E6%80%BB%E6%8E%A7&stage=script"),
        "/projects/project%20%2F%201/episodes/episode%20%2F%201/workflow?returnTo=%2Fagent%3FprojectId%3Dp1&returnLabel=%E8%BF%94%E5%9B%9E%E7%94%9F%E4%BA%A7%E6%80%BB%E6%8E%A7&stage=video&shot=P02",
    );
});
