import assert from "node:assert/strict";
import test from "node:test";

import { videoWorkflowHref } from "../../../../../original-workflow/video-workflow-routing.ts";
import { buildDeliveryReport, buildProductionAcceptanceManifest } from "./workflow-delivery-check.ts";

test("delivery blocks missing selected versions", () => {
    const report = buildDeliveryReport([{ assetStatus: "完整", generation: undefined, id: "P01", promptStatus: "已确认" }]);
    assert.equal(report.blockingCount, 1);
    assert.match(report.items[0].issues.join("；"), /成功视频版本/);
});

test("delivery reports active and failed tasks", () => {
    const report = buildDeliveryReport([
        { assetStatus: "完整", generation: { status: "running" }, id: "P01", promptStatus: "已确认" },
        { assetStatus: "完整", generation: { status: "failed" }, id: "P02", promptStatus: "已确认" },
    ]);
    assert.equal(report.blockingCount, 2);
});

test("delivery blocks an unfinished post-processing task", () => {
    const report = buildDeliveryReport(
        [{ assetStatus: "完整", generation: { assetId: "video-1", status: "succeeded" }, id: "P01", promptStatus: "已确认" }],
        [{ id: "video-1", metadata: { subtitleErase: { jobId: "subtitle-1", status: "processing" } } }],
    );

    assert.equal(report.ready, false);
    assert.match(report.items[0].issues.join("；"), /字幕擦除仍在处理/);
});

test("delivery blocks a stale selected asset reference", () => {
    const report = buildDeliveryReport([{ assetStatus: "完整", generation: { assetId: "missing-video", status: "succeeded" }, id: "P01", promptStatus: "已确认" }], []);

    assert.equal(report.ready, false);
    assert.match(report.items[0].issues.join("；"), /成功版本资产不存在/);
});

test("builds a traceable production acceptance manifest", () => {
    const manifest = buildProductionAcceptanceManifest({
        assets: [
            {
                id: "video-1",
                metadata: {
                    generation: { assetVersionNumber: 3, productionPackageId: "P01", scriptSnapshot: "第一场：推门", taskStatus: "succeeded" },
                },
            },
            { id: "video-2", metadata: { canvasSource: { sourceAssetId: "video-1" }, videoUpscale: { estimatedCostCny: 0.21, jobId: "upscale-1", provider: "volcengine-las", status: "succeeded" } } },
            {
                id: "video-3",
                title: "镜头一最终版",
                updatedAt: "2026-08-14T09:30:00.000Z",
                data: { storageKey: "videos/final.mp4" },
                metadata: { canvasSource: { sourceAssetId: "video-2" }, subtitleErase: { estimatedCostCny: 0.08, jobId: "subtitle-1", provider: "volcengine-las", status: "succeeded" } },
            },
        ],
        episodeId: "episode-1",
        exportedAt: "2026-08-14T10:00:00.000Z",
        packages: [
            {
                assetStatus: "完整",
                generation: { aiTaskCredits: 12, aiTaskId: "ledger-1", assetId: "video-1", status: "succeeded", taskId: "generate-1", updatedAt: "2026-08-14T09:00:00.000Z" },
                id: "P01",
                prompt: "人物缓慢推门",
                promptStatus: "已确认",
                sourceScript: "第一场：推门",
            },
        ],
        projectId: "project-1",
        scriptSnapshot: "第一场：推门",
        workflowRunId: "workflow-1",
    });

    assert.equal(manifest.ready, true);
    assert.match(manifest.script.version, /^snapshot-[a-f0-9]{8}$/);
    assert.equal(manifest.shots[0].productionPackageId, "P01");
    assert.equal(manifest.shots[0].generation.taskId, "generate-1");
    assert.equal(manifest.shots[0].costSnapshot.generationCredits, 12);
    assert.equal(manifest.shots[0].costSnapshot.postProcessingCny, 0.29);
    assert.deepEqual(manifest.shots[0].postProcessing.map((item) => item.type), ["video_upscale", "subtitle_erase"]);
    assert.deepEqual(manifest.shots[0].selectedOutput, { assetId: "video-3", assetVersionNumber: 3, storageKey: "videos/final.mp4", title: "镜头一最终版", updatedAt: "2026-08-14T09:30:00.000Z" });
    assert.equal(manifest.shots[0].nextAction, "export_clip_package");
});

test("an empty script snapshot blocks the acceptance manifest", () => {
    const manifest = buildProductionAcceptanceManifest({
        assets: [{ id: "video-1", metadata: { generation: { taskId: "task-1" } } }],
        episodeId: "episode-1",
        packages: [{ assetStatus: "完整", generation: { assetId: "video-1", status: "succeeded", taskId: "task-1" }, id: "P01", promptStatus: "已确认" }],
        projectId: "project-1",
        scriptSnapshot: "  ",
    });

    assert.equal(manifest.ready, false);
    assert.match(manifest.shots[0].issues.join("；"), /剧本快照缺失/);
});

test("canonical workflow href uses the Agent workspace", () => {
    assert.equal(videoWorkflowHref(1, "p1", "e1"), "/agent?projectId=p1&episodeId=e1&stage=script");
});
