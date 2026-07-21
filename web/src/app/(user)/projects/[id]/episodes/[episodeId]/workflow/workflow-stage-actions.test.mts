import assert from "node:assert/strict";
import test from "node:test";

import { workflowStageActions } from "./workflow-stage-actions.ts";

test("cannot approve a failed gate", () => {
    assert.equal(workflowStageActions({ hasArtifact: true, status: "needs_review" }, false).canApprove, false);
});

test("running stages expose cancel but not retry", () => {
    const actions = workflowStageActions({ hasArtifact: false, status: "running" }, false);

    assert.equal(actions.canCancel, true);
    assert.equal(actions.canRetry, false);
});

test("failed and rejected stages can retry", () => {
    assert.equal(workflowStageActions({ hasArtifact: false, status: "failed" }, false).canRetry, true);
    assert.equal(workflowStageActions({ hasArtifact: true, status: "rejected" }, true).canRetry, true);
});
