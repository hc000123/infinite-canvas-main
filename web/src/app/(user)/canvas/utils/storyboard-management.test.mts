import assert from "node:assert/strict";
import test from "node:test";

import {
    applyStoryboardShotGenerationError,
    applyStoryboardShotGenerationStarted,
    applyStoryboardShotGenerationSuccess,
    buildStoryboardGroupFromScriptScene,
    normalizeStoryboardShot,
    orderedStoryboardGroups,
    orderedStoryboardShots,
    planStoryboardGroupCanvasInsert,
    reorderStoryboardItems,
    type StoryboardGroup,
    type StoryboardShot,
} from "./storyboard-management.ts";

test("orders storyboard groups and shots by order fields", () => {
    const groups: StoryboardGroup[] = [group("g-2", "project-1", 2), group("g-other", "project-2", 1), group("g-1", "project-1", 1)];
    const shots: StoryboardShot[] = [shot("s-2", "g-1", 2), shot("s-1", "g-1", 1), shot("s-other", "g-2", 1)];

    assert.deepEqual(
        orderedStoryboardGroups(groups, "project-1").map((item) => item.id),
        ["g-1", "g-2"],
    );
    assert.deepEqual(
        orderedStoryboardShots(shots, "g-1").map((item) => item.id),
        ["s-1", "s-2"],
    );
});

test("normalizes shot references and removes duplicates", () => {
    const normalized = normalizeStoryboardShot({
        groupId: "g-1",
        order: 1,
        title: "  开场  ",
        description: "  她走上主席台  ",
        prompt: "  中景，侧向跟拍  ",
        effectivePrompt: "",
        assetRefs: [
            { assetId: " asset-1 ", kind: "image", role: "reference_image" },
            { assetId: "asset-1", kind: "image", role: "first_frame" },
            { assetId: "asset-2", kind: "video", role: "" },
        ],
        nodeRefs: [{ nodeId: " node-1 ", role: "source" }],
        resultAssetIds: ["asset-result", "asset-result", ""],
        primaryAssetId: " ",
        productionBibleRefs: [
            { itemId: "char-1", kind: "character" },
            { itemId: "char-1", kind: "character" },
        ],
        status: "ready",
    });

    assert.equal(normalized.title, "开场");
    assert.equal(normalized.assetRefs.length, 2);
    assert.equal(normalized.assetRefs[1].role, "reference");
    assert.deepEqual(normalized.resultAssetIds, ["asset-result"]);
    assert.equal(normalized.primaryAssetId, undefined);
    assert.equal(normalized.productionBibleRefs.length, 1);
});

test("creates storyboard group and first shot from a script scene", () => {
    const result = buildStoryboardGroupFromScriptScene(
        {
            id: "scene-1",
            episodeId: "ep-1",
            order: 3,
            location: "大学操场",
            characterIds: ["char-1"],
            sceneSettingId: "setting-1",
            beat: "魏梁走上主席台",
            dialogue: "我毕业了",
            emotion: "克制",
            durationHint: "30 秒",
            createdAt: "",
            updatedAt: "",
        },
        { projectId: "project-1", groupId: "group-1", shotId: "shot-1" },
    );

    assert.equal(result.group.title, "场 3 · 大学操场");
    assert.equal(result.group.shotIds[0], "shot-1");
    assert.equal(result.shots[0].productionBibleRefs.length, 2);
    assert.match(result.shots[0].prompt, /魏梁走上主席台/);
});

test("plans storyboard group insertion into canvas nodes and connections", () => {
    const result = planStoryboardGroupCanvasInsert({
        group: group("g-1", "project-1", 1),
        shots: [
            {
                ...shot("s-1", "g-1", 1),
                title: "开场",
                prompt: "中景，角色走入画面",
                assetRefs: [{ assetId: "asset-image", kind: "image", role: "reference_image" }],
            },
        ],
        assets: [
            {
                id: "asset-image",
                kind: "image",
                title: "角色图",
                data: { dataUrl: "blob:image", storageKey: "img-1", width: 1000, height: 800, bytes: 12, mimeType: "image/png" },
                coverUrl: "blob:image",
                tags: [],
                createdAt: "",
                updatedAt: "",
            },
        ],
        position: { x: 100, y: 200 },
        config: { provider: "volcengine-ark", model: "ep-test", size: "16:9", seconds: "8", vquality: "720" },
        idFactory: (prefix) => `${prefix}-id`,
        connectionIdFactory: (index) => `conn-${index}`,
    });

    assert.equal(result.nodes.length, 3);
    assert.equal(result.connections.length, 2);
    assert.equal(result.nodes[0].metadata?.storyboardGroupId, "g-1");
    assert.equal(result.nodes[2].metadata?.generationMode, "video");
    assert.equal(result.nodes[2].metadata?.storyboardShotId, "s-1");
    assert.deepEqual(
        result.shotNodeRefs["s-1"].map((ref) => ref.role),
        ["prompt", "reference_image", "video_config"],
    );
});

test("reorders storyboard rows without changing unrelated groups", () => {
    const next = reorderStoryboardItems([shot("a", "g-1", 1), shot("b", "g-1", 2), shot("c", "g-2", 1)], "b", "up", (item) => item.groupId === "g-1");
    assert.deepEqual(
        next
            .filter((item) => item.groupId === "g-1")
            .sort((a, b) => a.order - b.order)
            .map((item) => item.id),
        ["b", "a"],
    );
    assert.equal(next.find((item) => item.id === "c")?.order, 1);
});

test("marks storyboard shot as generating with node and task references", () => {
    const next = applyStoryboardShotGenerationStarted([shot("s-1", "g-1", 1)], {
        storyboardShotId: "s-1",
        nodeId: "video-node",
        taskId: "task-1",
    });

    assert.equal(next[0].status, "generating");
    assert.equal(next[0].lastResultNodeId, "video-node");
    assert.equal(next[0].lastTaskId, "task-1");
    assert.deepEqual(next[0].nodeRefs, [
        { nodeId: "video-node", role: "result_video" },
        { nodeId: "task-1", role: "video_task" },
    ]);
});

test("writes successful storyboard result once and keeps existing primary asset", () => {
    const original = { ...shot("s-1", "g-1", 1), resultAssetIds: ["asset-old"], primaryAssetId: "asset-old" };
    const next = applyStoryboardShotGenerationSuccess([original], {
        storyboardShotId: "s-1",
        assetId: "asset-new",
        nodeId: "video-node",
        taskId: "task-1",
    });
    const duplicated = applyStoryboardShotGenerationSuccess(next, {
        storyboardShotId: "s-1",
        assetId: "asset-new",
        nodeId: "video-node",
        taskId: "task-1",
    });

    assert.deepEqual(duplicated[0].resultAssetIds, ["asset-old", "asset-new"]);
    assert.equal(duplicated[0].primaryAssetId, "asset-old");
    assert.equal(duplicated[0].status, "done");
});

test("sets first successful storyboard result as primary asset", () => {
    const next = applyStoryboardShotGenerationSuccess([shot("s-1", "g-1", 1)], {
        storyboardShotId: "s-1",
        assetId: "asset-first",
        nodeId: "video-node",
    });

    assert.equal(next[0].primaryAssetId, "asset-first");
    assert.deepEqual(next[0].resultAssetIds, ["asset-first"]);
});

test("records storyboard generation failure reason", () => {
    const next = applyStoryboardShotGenerationError([shot("s-1", "g-1", 1)], {
        storyboardShotId: "s-1",
        nodeId: "video-node",
        taskId: "task-1",
        errorMessage: "视频生成失败",
    });

    assert.equal(next[0].status, "error");
    assert.equal(next[0].errorMessage, "视频生成失败");
    assert.equal(next[0].lastResultNodeId, "video-node");
    assert.equal(next[0].lastTaskId, "task-1");
});

function group(id: string, projectId: string, order: number): StoryboardGroup {
    return { id, projectId, order, title: id, description: "", preset: {}, shotIds: [], createdAt: "", updatedAt: "" };
}

function shot(id: string, groupId: string, order: number): StoryboardShot {
    return {
        id,
        groupId,
        order,
        title: id,
        description: "",
        prompt: "",
        effectivePrompt: "",
        assetRefs: [],
        nodeRefs: [],
        resultAssetIds: [],
        status: "draft",
        createdAt: "",
        updatedAt: "",
    };
}
