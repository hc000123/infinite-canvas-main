import assert from "node:assert/strict";
import test from "node:test";

import { buildEpisodeWorkbenchStats, buildShotGroupGenerationSummaries, deriveEpisodeProductionStatus, groupedTableShotsByScene, productionStatusLabel, validateEpisodeShotGroupSelection, workbenchModes } from "./episode-workbench.ts";

const canvas = { id: "canvas-1", title: "第一集画布", episodeId: "ep-1", episodeTitle: "第一集", scriptSnapshot: "剧本文本" };

function shot(id: string, order: number, sceneName = "操场", estimatedDuration = 4) {
    const now = "2026-06-06T00:00:00.000Z";
    return {
        id,
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "ep-1",
        sceneName,
        location: sceneName,
        timeOfDay: "白天",
        order,
        title: `镜头 ${order}`,
        scriptText: "剧本文本",
        visualDescription: "画面描述",
        characters: [],
        dialogue: "",
        action: "",
        emotion: "",
        shotSize: "中景",
        cameraMovement: "推近",
        estimatedDuration,
        assetNeeds: ["character"],
        assetRefs: [],
        productionBibleRefs: [],
        createdAt: now,
        updatedAt: now,
    };
}

function group(patch = {}) {
    const now = "2026-06-06T00:00:00.000Z";
    return {
        id: "sg-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "ep-1",
        sceneName: "操场",
        shotIds: ["s-1", "s-2"],
        totalDuration: 8,
        prompt: "提示词",
        effectivePrompt: "",
        assetRefs: [],
        audioRefs: [],
        productionBibleRefs: [],
        status: "in_canvas",
        resultAssetIds: [],
        createdAt: now,
        updatedAt: now,
        ...patch,
    };
}

test("builds episode workbench stats and production status", () => {
    const stats = buildEpisodeWorkbenchStats({
        canvas,
        tableShots: [shot("s-1", 1), shot("s-2", 2)],
        shotGroups: [group()],
        assetBreakdownItems: [
            {
                id: "asset-breakdown-1",
                projectId: "project-1",
                canvasId: "canvas-1",
                episodeId: "ep-1",
                episodeTitle: "第一集",
                scriptId: "project-1",
                kind: "character",
                name: "魏梁",
                description: "",
                sourceText: "",
                tags: [],
                assetIds: [],
                status: "draft",
                createdAt: "",
                updatedAt: "",
            },
        ],
        nodes: [{ id: "video-1", type: "video", title: "视频", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { episodeId: "ep-1", status: "success" } }],
    });

    assert.equal(stats.hasScript, true);
    assert.equal(stats.assetBreakdownReady, true);
    assert.equal(stats.tableShotCount, 2);
    assert.equal(stats.shotGroupCount, 1);
    assert.equal(stats.generatedVideoCount, 1);
    assert.equal(deriveEpisodeProductionStatus(stats), "shot_groups_ready");
    assert.equal(productionStatusLabel("failed"), "待处理失败");
});

test("scopes video node stats to the active episode", () => {
    const stats = buildEpisodeWorkbenchStats({
        canvas,
        tableShots: [shot("s-1", 1), shot("s-2", 2)],
        shotGroups: [group(), group({ id: "sg-other", episodeId: "ep-other", shotIds: [] })],
        assetBreakdownItems: [],
        nodes: [
            { id: "video-1", type: "video", title: "本集视频", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { shotGroupId: "sg-1", status: "success" } },
            { id: "video-2", type: "video", title: "其他集视频", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { shotGroupId: "sg-other", status: "success" } },
            { id: "video-3", type: "video", title: "其他集失败", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { episodeId: "ep-other", status: "error" } },
        ],
    });

    assert.equal(stats.generatedVideoCount, 1);
    assert.equal(stats.failedCount, 0);
});

test("returns workbench modes without disabling free canvas", () => {
    const modes = workbenchModes({
        hasScript: false,
        scriptStatus: "unbound",
        assetBreakdownCount: 0,
        assetBreakdownReady: false,
        tableShotCount: 0,
        shotGroupCount: 0,
        generatedVideoCount: 0,
        failedCount: 0,
        generatingCount: 0,
        hasShotGroupsInCanvas: false,
    });
    assert.equal(modes.find((mode) => mode.key === "script_driven")?.active, false);
    assert.equal(modes.find((mode) => mode.key === "free_canvas")?.active, true);
});

test("groups table shots by scene and validates shot group selection", () => {
    const shots = [shot("s-1", 1, "操场", 4), shot("s-2", 2, "操场", 5), shot("s-3", 3, "教室", 4)];
    assert.deepEqual(
        groupedTableShotsByScene(shots).map((item) => [item.sceneName, item.shots.length, item.totalDuration]),
        [
            ["操场", 2, 9],
            ["教室", 1, 4],
        ],
    );
    assert.equal(validateEpisodeShotGroupSelection(shots, ["s-1", "s-2"]).valid, true);
    assert.equal(validateEpisodeShotGroupSelection(shots, ["s-1", "s-3"]).valid, false);
});

test("summarizes shot group generation status from canvas nodes", () => {
    const summaries = buildShotGroupGenerationSummaries({
        shotGroups: [group({ status: "generating", taskId: "task-1" })],
        tableShots: [shot("s-1", 1), shot("s-2", 2)],
        nodes: [{ id: "video-1", type: "video", title: "视频", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { shotGroupId: "sg-1", status: "loading", taskId: "task-1", aiTaskId: "aitask-1", aiTaskCredits: 6 } }],
    });
    assert.equal(summaries[0].status, "generating");
    assert.equal(summaries[0].nodeId, "video-1");
    assert.equal(summaries[0].aiTaskId, "aitask-1");
    assert.equal(summaries[0].credits, 6);
});
