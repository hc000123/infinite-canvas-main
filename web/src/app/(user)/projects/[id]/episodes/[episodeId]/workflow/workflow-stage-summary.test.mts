import assert from "node:assert/strict";
import test from "node:test";

import { summarizeWorkflowStages } from "./workflow-stage-summary.ts";

test("shows worker outage as blocked only for remote stages", () => {
    const result = summarizeWorkflowStages({ packageCount: 3, scriptReady: true, workerReady: false });

    assert.equal(result.find((item) => item.key === "art")?.status, "blocked");
    assert.notEqual(result.find((item) => item.key === "video")?.status, "blocked");
});

test("summarizes review and approved remote stages", () => {
    const result = summarizeWorkflowStages({
        packageCount: 2,
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { stageId: "art-design", status: "approved" },
            { stageId: "seedance-storyboard", status: "needs_review" },
        ],
    });

    assert.equal(result.find((item) => item.key === "art")?.status, "approved");
    assert.equal(result.find((item) => item.key === "storyboard")?.status, "needs_review");
});

test("marks delivery complete when every production package has a result", () => {
    const result = summarizeWorkflowStages({ generatedCount: 3, packageCount: 3, scriptReady: true, workerReady: true });

    assert.equal(result.find((item) => item.key === "delivery")?.status, "complete");
});
