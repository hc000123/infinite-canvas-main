import assert from "node:assert/strict";
import test from "node:test";

import { workflowRunRequest, workflowStageSkillCapability } from "./workflow-runs-contract.ts";

test("starts a shot prompt stage with media and confirmed-shot context", () => {
    const context = {
        shotId: "shot-001",
        sourceScript: "阿宁进入房间。",
        shotDraft: { action: "阿宁进入房间", durationSeconds: 6 },
        references: [{ logicalAssetId: "CHAR-001", libraryAssetId: "asset-1", version: "v1", usage: "角色一致性" }],
    };
    assert.deepEqual(workflowRunRequest.startStage("run-1", "shot-prompt", "idem-1", { mediaBatchId: "batch-1", context }), {
        path: "/api/v1/workflow-runs/run-1/stages/shot-prompt/start",
        body: { idempotencyKey: "idem-1", mediaBatchId: "batch-1", context },
    });
});

test("starts an extraction stage with an explicit skill version", () => {
    assert.deepEqual(workflowRunRequest.startStage("run-1", "asset-extraction", "idem-2", { skillVersionId: "skill-version-2" }), {
        path: "/api/v1/workflow-runs/run-1/stages/asset-extraction/start",
        body: { idempotencyKey: "idem-2", skillVersionId: "skill-version-2" },
    });
});

test("resolves workflow choices through the generic skill registry", () => {
    assert.equal(workflowRunRequest.skillOptions().path, "/api/v1/skill-options");
    assert.equal(workflowStageSkillCapability("asset-extraction"), "workflow.stage.art");
    assert.equal(workflowStageSkillCapability("shot-breakdown"), "workflow.stage.storyboard");
});
