import assert from "node:assert/strict";
import test from "node:test";

import { summarizeWorkflowStages } from "./workflow-stage-summary.ts";

test("blocks both production stages when their replaceable skill runner is unavailable", () => {
    const result = summarizeWorkflowStages({ packageCount: 3, scriptReady: true, workerReady: false });

    assert.equal(result.find((item) => item.key === "assets")?.status, "blocked");
    assert.equal(result.find((item) => item.key === "video")?.status, "blocked");
    assert.equal(result.find((item) => item.key === "video")?.blockingReason, "请先生成并绑定全部资产草图");
});

test("summarizes review and approved remote stages", () => {
    const result = summarizeWorkflowStages({
        packageCount: 2,
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { stageId: "asset-extraction", status: "approved" },
            { stageId: "asset-image-prompt", status: "approved" },
            { stageId: "shot-breakdown", status: "needs_review" },
        ],
    });

    assert.equal(result.find((item) => item.key === "assets")?.status, "approved");
    assert.equal(result.find((item) => item.key === "video")?.status, "needs_review");
});

test("uses the latest stage attempt and keeps assets independent from art", () => {
    const result = summarizeWorkflowStages({
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { attempt: 1, stageId: "asset-extraction", status: "applied" },
            { attempt: 0, stageId: "asset-extraction", status: "ready" },
            { attempt: 0, stageId: "asset-image-prompt", status: "ready" },
            { attempt: 0, stageId: "shot-breakdown", status: "blocked" },
        ],
    });

    assert.equal(result.find((item) => item.key === "assets")?.status, "ready");
    assert.equal(result.find((item) => item.key === "video")?.status, "blocked");
});

test("unlocks storyboard only after every generated asset image is applied", () => {
    const result = summarizeWorkflowStages({
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { stageId: "asset-extraction", status: "applied" },
            { stageId: "asset-image-prompt", status: "applied" },
            { stageId: "shot-breakdown", status: "blocked" },
        ],
    });

    assert.equal(result.find((item) => item.key === "assets")?.status, "applied");
    assert.equal(result.find((item) => item.key === "video")?.status, "ready");
});

test("does not unlock storyboard before asset images are applied", () => {
    const result = summarizeWorkflowStages({
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { stageId: "asset-extraction", status: "approved" },
            { stageId: "asset-image-prompt", status: "approved" },
            { stageId: "shot-breakdown", status: "blocked" },
        ],
    });

    assert.equal(result.find((item) => item.key === "assets")?.status, "approved");
    assert.equal(result.find((item) => item.key === "video")?.status, "blocked");
});

test("marks delivery complete when every production package has a result", () => {
    const result = summarizeWorkflowStages({ generatedCount: 3, packageCount: 3, scriptReady: true, workerReady: true });

    assert.equal(result.find((item) => item.key === "delivery")?.status, "complete");
});
