import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentEpisodeView, buildAgentProjectViews, filterAgentProjectViews } from "./agent-workspace-model.ts";

const project = { id: "project-1", title: "清道夫", description: "", status: "active" as const, canvasIds: [], createdAt: "2026-08-08T08:00:00Z", updatedAt: "2026-08-08T08:00:00Z" };
const episode = { id: "episode-1", projectId: project.id, code: "EP01", order: 1, title: "雨夜", summary: "阿宁进入房间。", hook: "", turningPoint: "", cliffhanger: "", sceneIds: [], createdAt: "2026-08-08T08:00:00Z", updatedAt: "2026-08-08T08:00:00Z" };

test("derives the six explicit Agent production stages", () => {
    const view = buildAgentEpisodeView({
        episode,
        project,
        run: {
            id: "run-1", projectId: project.id, episodeId: episode.id, workflowId: "video", workflowVersion: "2", currentStageId: "shot-breakdown", status: "active", reviewCount: 0, warningCount: 2, createdAt: "2026-08-08T08:00:00Z", updatedAt: "2026-08-08T09:00:00Z",
            stages: [
                { id: "script", stageId: "script-adaptation", invocationId: "", status: "approved", attempt: 0, errorMessage: "", updatedAt: "2026-08-08T08:00:00Z" },
                { id: "assets", stageId: "asset-extraction", invocationId: "inv-1", status: "approved", attempt: 1, errorMessage: "", updatedAt: "2026-08-08T08:30:00Z" },
            ],
        },
    });

    assert.deepEqual(view.stages.map((item) => item.label), ["剧本确认", "资产解析", "资产生产", "结构化分镜", "最终提示词", "视频生成与预览"]);
    assert.equal(view.stages.find((item) => item.key === "asset-production")?.status, "warning");
    assert.equal(view.stages.find((item) => item.key === "storyboard")?.status, "ready");
});

test("keeps an episode without a remote run visible and blocks only a missing script", () => {
    const ready = buildAgentEpisodeView({ episode, project });
    const blocked = buildAgentEpisodeView({ episode: { ...episode, id: "episode-empty", summary: "" }, project });

    assert.equal(ready.runId, "");
    assert.equal(ready.stages[0].status, "ready");
    assert.equal(blocked.stages[0].status, "blocked");
    assert.equal(blocked.stages[0].blockingReason, "本集还没有可确认的剧本");
});

test("uses approved gates for progress instead of background task count", () => {
    const view = buildAgentEpisodeView({
        episode,
        project,
        packageCount: 2,
        generatedCount: 2,
        run: {
            id: "run-1", projectId: project.id, episodeId: episode.id, workflowId: "video", workflowVersion: "2", currentStageId: "shot-prompt", status: "completed", reviewCount: 0, warningCount: 0, createdAt: "", updatedAt: "2026-08-08T10:00:00Z",
            stages: [
                ["script-adaptation", "approved"], ["asset-extraction", "applied"], ["asset-image-prompt", "approved"], ["shot-breakdown", "applied"], ["shot-prompt", "approved"],
            ].map(([stageId, status], index) => ({ id: String(index), stageId, invocationId: "", status, attempt: 1, errorMessage: "", updatedAt: "" })),
        },
    });

    assert.equal(view.progress, 100);
    assert.equal(view.status, "completed");
});

test("routes an episode to its exact current six-stage gate", () => {
    const view = buildAgentEpisodeView({
        episode,
        project,
        run: {
            id: "run-1", projectId: project.id, episodeId: episode.id, workflowId: "video", workflowVersion: "2", currentStageId: "shot-breakdown", status: "active", reviewCount: 0, warningCount: 0, createdAt: "", updatedAt: "2026-08-08T10:00:00Z",
            stages: [
                ["script-adaptation", "approved"], ["asset-extraction", "approved"], ["asset-image-prompt", "approved"], ["shot-breakdown", "approved"], ["shot-prompt", "needs_review"],
            ].map(([stageId, status], index) => ({ id: String(index), stageId, invocationId: "", status, attempt: 1, errorMessage: "", updatedAt: "" })),
        },
    });

    assert.equal(view.currentStageKey, "prompt");
});

test("merges local video packages into episode and project progress", () => {
    const run = {
        id: "run-1", projectId: project.id, episodeId: episode.id, workflowId: "video", workflowVersion: "2", currentStageId: "shot-prompt", status: "active" as const, reviewCount: 0, warningCount: 0, createdAt: "", updatedAt: "2026-08-08T10:00:00Z",
        stages: [
            ["script-adaptation", "approved"], ["asset-extraction", "approved"], ["asset-image-prompt", "approved"], ["shot-breakdown", "approved"], ["shot-prompt", "approved"],
        ].map(([stageId, status], index) => ({ id: String(index), stageId, invocationId: "", status: status as "approved", attempt: 1, errorMessage: "", updatedAt: "" })),
    };
    const packages = [
        { projectId: project.id, episodeId: episode.id, canvasStatus: "已生成", generation: { status: "succeeded" } },
        { projectId: project.id, episodeId: episode.id, canvasStatus: "未导入", generation: { status: "running" } },
    ];
    const [view] = buildAgentProjectViews({ projects: [project], episodes: [episode], runs: [run], packages });

    assert.equal(view.episodes[0].stages.at(-1)?.status, "ready");
    assert.equal(view.episodes[0].status, "running");
    assert.equal(view.progress, 83);

    const completed = buildAgentProjectViews({ projects: [project], episodes: [episode], runs: [run], packages: packages.map((item) => ({ ...item, canvasStatus: "已生成", generation: { status: "succeeded" } })) })[0];
    assert.equal(completed.episodes[0].stages.at(-1)?.status, "complete");
    assert.equal(completed.status, "completed");
});

test("merges local projects with remote progress and filters attention states", () => {
    const projects = [project, { ...project, id: "project-local", title: "本地新项目" }];
    const runs = [{ id: "run-1", projectId: project.id, episodeId: episode.id, workflowId: "video", workflowVersion: "2", currentStageId: "shot-breakdown", status: "active" as const, reviewCount: 1, warningCount: 0, createdAt: "", updatedAt: "2026-08-08T10:00:00Z", stages: [{ id: "storyboard", stageId: "shot-breakdown", invocationId: "", status: "needs_review" as const, attempt: 1, errorMessage: "", updatedAt: "" }] }];
    const views = buildAgentProjectViews({ projects, episodes: [episode], runs });

    assert.equal(views.length, 2);
    assert.equal(views.find((item) => item.id === "project-local")?.episodeCount, 0);
    assert.deepEqual(filterAgentProjectViews(views, { keyword: "清道", status: "review" }).map((item) => item.id), [project.id]);
});
