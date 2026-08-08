import assert from "node:assert/strict";
import test from "node:test";

import { summarizeWorkflowStages } from "./workflow-stage-summary.ts";

test("exposes six blocked production stages when their replaceable skill runner is unavailable", () => {
    const result = summarizeWorkflowStages({ packageCount: 3, scriptReady: true, workerReady: false });

    assert.deepEqual(result.map((item) => item.label), ["剧本确认", "资产解析", "资产生产", "结构化分镜", "最终提示词", "视频生成与预览"]);
    assert.equal(result.find((item) => item.key === "asset-extraction")?.status, "blocked");
    assert.equal(result.find((item) => item.key === "video")?.status, "blocked");
    assert.equal(result.find((item) => item.key === "video")?.blockingReason, "工作流执行器暂不可用，已有内容仍可查看和编辑");
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

    assert.equal(result.find((item) => item.key === "asset-production")?.status, "approved");
    assert.equal(result.find((item) => item.key === "storyboard")?.status, "needs_review");
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

    assert.equal(result.find((item) => item.key === "asset-production")?.status, "ready");
    assert.equal(result.find((item) => item.key === "storyboard")?.status, "ready");
});

test("unlocks storyboard after the asset catalog is approved", () => {
    const result = summarizeWorkflowStages({
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { stageId: "asset-extraction", status: "applied" },
            { stageId: "asset-image-prompt", status: "applied" },
            { stageId: "shot-breakdown", status: "blocked" },
        ],
    });

    assert.equal(result.find((item) => item.key === "asset-production")?.status, "applied");
    assert.equal(result.find((item) => item.key === "storyboard")?.status, "ready");
});

test("keeps storyboard independent from asset image application", () => {
    const result = summarizeWorkflowStages({
        scriptReady: true,
        workerReady: true,
        remoteStages: [
            { stageId: "asset-extraction", status: "approved" },
            { stageId: "asset-image-prompt", status: "approved" },
            { stageId: "shot-breakdown", status: "blocked" },
        ],
    });

    assert.equal(result.find((item) => item.key === "asset-production")?.status, "approved");
    assert.equal(result.find((item) => item.key === "storyboard")?.status, "ready");
});

test("marks delivery complete when every production package has a result", () => {
    const result = summarizeWorkflowStages({ generatedCount: 3, packageCount: 3, scriptReady: true, workerReady: true, remoteStages: [
        { stageId: "asset-extraction", status: "approved" },
        { stageId: "shot-breakdown", status: "approved" },
        { stageId: "shot-prompt", status: "approved" },
    ] });

    assert.equal(result.find((item) => item.key === "video")?.status, "complete");
});

test("blocks prompts until storyboard approval and video until final prompt approval", () => {
    const result = summarizeWorkflowStages({ scriptReady: true, workerReady: true, remoteStages: [
        { stageId: "asset-extraction", status: "approved" },
        { stageId: "shot-breakdown", status: "needs_review" },
        { stageId: "shot-prompt", status: "blocked" },
    ] });
    assert.equal(result.find((item) => item.key === "prompt")?.status, "blocked");
    assert.equal(result.find((item) => item.key === "video")?.status, "blocked");
});
