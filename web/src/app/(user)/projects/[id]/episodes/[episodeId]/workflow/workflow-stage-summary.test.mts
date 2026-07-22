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

test("uses the latest stage attempt and keeps assets independent from art", () => {
    const result = summarizeWorkflowStages({
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { attempt: 1, stageId: "art-design", status: "applied" },
            { attempt: 0, stageId: "art-design", status: "ready" },
            { attempt: 0, stageId: "asset-generation", status: "ready" },
            { attempt: 0, stageId: "seedance-storyboard", status: "blocked" },
        ],
    });

    assert.equal(result.find((item) => item.key === "art")?.status, "applied");
    assert.equal(result.find((item) => item.key === "assets")?.status, "ready");
    assert.equal(result.find((item) => item.key === "storyboard")?.status, "blocked");
});

test("unlocks storyboard only after Codex asset generation is approved", () => {
    const result = summarizeWorkflowStages({
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { stageId: "art-design", status: "applied" },
            { stageId: "asset-generation", status: "approved" },
            { stageId: "seedance-storyboard", status: "blocked" },
        ],
    });

    assert.equal(result.find((item) => item.key === "assets")?.status, "approved");
    assert.equal(result.find((item) => item.key === "storyboard")?.status, "ready");
});

test("marks delivery complete when every production package has a result", () => {
    const result = summarizeWorkflowStages({ generatedCount: 3, packageCount: 3, scriptReady: true, workerReady: true });

    assert.equal(result.find((item) => item.key === "delivery")?.status, "complete");
});
