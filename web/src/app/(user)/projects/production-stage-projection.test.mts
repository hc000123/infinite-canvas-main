import assert from "node:assert/strict";
import test from "node:test";

import { productionStageDefinitions, productionStageKeys, projectProductionStages } from "./production-stage-projection.ts";

test("exposes one canonical six-stage production descriptor", () => {
    assert.deepEqual(productionStageKeys, ["script", "asset-extraction", "asset-production", "storyboard", "prompt", "video"]);
    assert.deepEqual(productionStageDefinitions.map(({ key, remoteStageId }) => ({ key, remoteStageId })), [
        { key: "script", remoteStageId: "script-adaptation" },
        { key: "asset-extraction", remoteStageId: "asset-extraction" },
        { key: "asset-production", remoteStageId: "asset-image-prompt" },
        { key: "storyboard", remoteStageId: "shot-breakdown" },
        { key: "prompt", remoteStageId: "shot-prompt" },
        { key: "video", remoteStageId: null },
    ]);
});

test("projects remote gates and local video progress through one state model", () => {
    const stages = projectProductionStages({
        generatedCount: 1,
        missingAssetCount: 2,
        packageCount: 2,
        scriptReady: true,
        warningCount: 2,
        workerReady: true,
        remoteStages: [
            { attempt: 1, stageId: "script-adaptation", status: "approved" },
            { attempt: 1, stageId: "asset-extraction", status: "approved" },
            { attempt: 1, stageId: "asset-image-prompt", status: "approved" },
            { attempt: 1, stageId: "shot-breakdown", status: "approved" },
            { attempt: 1, stageId: "shot-prompt", status: "approved" },
        ],
    });

    assert.equal(stages.find((stage) => stage.key === "asset-production")?.status, "warning");
    assert.equal(stages.find((stage) => stage.key === "asset-production")?.count, "2 个占位");
    assert.equal(stages.find((stage) => stage.key === "video")?.status, "ready");
    assert.equal(stages.find((stage) => stage.key === "video")?.count, "1/2");
});

test("uses the latest remote attempt and unlocks storyboard from asset extraction", () => {
    const stages = projectProductionStages({
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { attempt: 1, stageId: "asset-extraction", status: "applied" },
            { attempt: 0, stageId: "asset-extraction", status: "ready" },
            { attempt: 0, stageId: "shot-breakdown", status: "blocked" },
        ],
    });

    assert.equal(stages.find((stage) => stage.key === "storyboard")?.status, "ready");
});
