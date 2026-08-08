import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { workflowRunRequest, workflowStageSkillCapability } from "./workflow-runs-contract.ts";

test("exposes invocation and artifact-set coordinates on workflow projections", () => {
    const source = readFileSync(new URL("./workflow-runs-contract.ts", import.meta.url), "utf8");
    assert.match(source, /invocationId:\s*string/);
    assert.match(source, /artifactSetHash:\s*string/);
    assert.match(source, /artifactIds:\s*string\[\]/);
});

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

test("builds a compact workflow poll request", () => {
    assert.deepEqual(workflowRunRequest.poll("run/1", 17), {
        path: "/api/v1/workflow-runs/run%2F1/poll",
        params: { after: 17 },
    });
});

test("builds a filtered workflow run list request", () => {
    assert.deepEqual(workflowRunRequest.list({ projectId: "project/1", episodeId: "episode 1", status: "active", page: 2, pageSize: 10 }), {
        path: "/api/v1/workflow-runs",
        params: { projectId: "project/1", episodeId: "episode 1", status: "active", page: 2, pageSize: 10 },
    });
});

test("builds asset-slot read and immutable save requests", () => {
    const body = { baseArtifactHash: "sha256:catalog", slots: [{ slotId: "slot-1", category: "character" as const, name: "阿宁", description: "黑色短发", status: "placeholder" as const, sourceSceneIds: [], sourceEvidence: [] }] };
    assert.deepEqual(workflowRunRequest.assetSlots("stage/1"), {
        path: "/api/v1/workflow-stage-runs/stage%2F1/asset-slots",
    });
    assert.deepEqual(workflowRunRequest.saveAssetSlots("stage/1", body), {
        path: "/api/v1/workflow-stage-runs/stage%2F1/asset-slots",
        body,
    });
});
