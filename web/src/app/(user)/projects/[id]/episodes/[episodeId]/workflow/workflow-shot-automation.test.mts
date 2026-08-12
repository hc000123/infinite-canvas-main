import assert from "node:assert/strict";
import test from "node:test";

import { nextWorkflowShotAction } from "./workflow-shot-automation.ts";

test("approves and loads valid storyboards without a human gate", () => {
    assert.deepEqual(nextWorkflowShotAction({ stageStatus: "needs_review", gatePassed: true, shotCount: 4 }), { type: "approve" });
    assert.deepEqual(nextWorkflowShotAction({ stageStatus: "approved", gatePassed: true, shotCount: 4 }), { type: "load" });
});

test("stops when output is invalid or already applied", () => {
    assert.equal(nextWorkflowShotAction({ stageStatus: "needs_review", gatePassed: false, shotCount: 4 }).type, "idle");
    assert.equal(nextWorkflowShotAction({ stageStatus: "approved", gatePassed: true, shotCount: 0 }).type, "idle");
    assert.equal(nextWorkflowShotAction({ stageStatus: "applied", gatePassed: true, shotCount: 4 }).type, "idle");
});
