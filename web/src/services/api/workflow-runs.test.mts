import assert from "node:assert/strict";
import test from "node:test";

import { workflowRunRequest } from "./workflow-runs-contract.ts";

test("starts a stage with an idempotency key", () => {
    assert.deepEqual(workflowRunRequest.startStage("run-1", "art-design", "idem-1"), {
        path: "/api/v1/workflow-runs/run-1/stages/art-design/start",
        body: { idempotencyKey: "idem-1" },
    });
});

test("reviews and applies an exact artifact hash", () => {
    assert.deepEqual(workflowRunRequest.reviewStage("stage-1", { decision: "approved", artifactHash: "hash-1" }), {
        path: "/api/v1/workflow-stage-runs/stage-1/review",
        body: { decision: "approved", artifactHash: "hash-1" },
    });
    assert.equal(workflowRunRequest.applyStage("stage-1", { artifactHash: "hash-1", target: "production_bible", targetIds: [], appliedCount: 0, skippedCount: 0 }).path, "/api/v1/workflow-stage-runs/stage-1/apply");
});
