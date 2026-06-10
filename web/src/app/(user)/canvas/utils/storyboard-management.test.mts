import assert from "node:assert/strict";
import test from "node:test";

import {
    applyStoryboardShotGenerationError,
    applyStoryboardShotGenerationStarted,
    applyStoryboardShotGenerationSuccess,
    buildShotGroupCanvasInsertMetadata,
    buildShotGroupGenerationTableRows,
    buildStoryboardTableDraftsFromScript,
    buildStoryboardGroupFromScriptScene,
    createShotGroupFromSelection,
    normalizeStoryboardShot,
    orderedStoryboardGroups,
    orderedStoryboardShots,
    planShotGroupCanvasInsert,
    reorderStoryboardTableShots,
    planStoryboardGroupCanvasInsert,
    reorderStoryboardItems,
    validateShotGroupSelection,
    type StoryboardGroup,
    type StoryboardShot,
    type StoryboardTableShot,
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
        episodeTitle: "第一集",
        idFactory: (prefix) => `${prefix}-id`,
        connectionIdFactory: (index) => `conn-${index}`,
    });

    assert.equal(result.nodes.length, 3);
    assert.equal(result.connections.length, 2);
    assert.equal(result.nodes[0].metadata?.storyboardGroupId, "g-1");
    assert.equal(result.nodes[1].metadata?.assetVersion?.assetId, "asset-image");
    assert.equal(result.nodes[1].metadata?.assetReferenceMode, "fixed-version");
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

test("builds storyboard table drafts from episode script paragraphs", () => {
    const drafts = buildStoryboardTableDraftsFromScript({
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        scriptText: "场景：大学操场 / 白天\n魏梁走上主席台。\n对白：我毕业了。\n\n场景：观礼区\n周泽抬头看向台上。",
        now: "now",
        idFactory: (index) => `shot-${index}`,
    });

    assert.equal(drafts.length, 2);
    assert.equal(drafts[0].sceneName, "大学操场");
    assert.equal(drafts[0].timeOfDay, "白天");
    assert.equal(drafts[0].dialogue, "我毕业了。");
    assert.equal(drafts[0].estimatedDuration, 5);
    assert.match(drafts[1].visualDescription, /周泽/);
});

test("reorders storyboard table shots inside one canvas episode scope", () => {
    const next = reorderStoryboardTableShots([tableShot("a", 1), tableShot("b", 2), { ...tableShot("c", 1), canvasId: "other" }], "b", "up");
    assert.deepEqual(
        next
            .filter((shot) => shot.canvasId === "canvas-1")
            .sort((a, b) => a.order - b.order)
            .map((shot) => shot.id),
        ["b", "a"],
    );
    assert.equal(next.find((shot) => shot.id === "c")?.order, 1);
});

test("validates shot group selection continuity duration and scene boundary", () => {
    const shots = [tableShot("s-1", 1, { sceneName: "操场", estimatedDuration: 5 }), tableShot("s-2", 2, { sceneName: "操场", estimatedDuration: 6 }), tableShot("s-3", 3, { sceneName: "观礼区", estimatedDuration: 5 })];
    assert.equal(validateShotGroupSelection(shots, ["s-1", "s-2"]).valid, true);
    assert.match(validateShotGroupSelection(shots, ["s-1", "s-3"]).errors.join("\n"), /同一个场次/);
    assert.match(validateShotGroupSelection(shots, ["s-1", "s-2", "s-3"]).errors.join("\n"), /15 秒/);
    assert.match(validateShotGroupSelection(shots, ["s-1", "s-3"]).errors.join("\n"), /连续/);
});

test("creates shot group from continuous shots and derives generation table status", () => {
    const result = createShotGroupFromSelection({
        shots: [tableShot("s-1", 1, { scriptText: "魏梁上台", visualDescription: "中景", estimatedDuration: 5 }), tableShot("s-2", 2, { scriptText: "台下反应", visualDescription: "近景", estimatedDuration: 6 })],
        id: "shot-group-1",
        now: "now",
    });

    assert.equal(result.ok, true);
    assert.equal(result.group?.totalDuration, 11);
    assert.equal(result.group?.status, "prompt_ready");
    assert.match(result.group?.prompt || "", /魏梁上台/);

    const rows = buildShotGroupGenerationTableRows([result.group!], [tableShot("s-1", 1), tableShot("s-2", 2)]);
    assert.equal(rows[0].shotRangeLabel, "1-2");
    assert.equal(rows[0].promptReady, true);
    assert.equal(rows[0].assetReady, false);
});

test("builds shot group canvas insertion metadata", () => {
    const metadata = buildShotGroupCanvasInsertMetadata(shotGroup("sg-1", ["s-1", "s-2"]), { role: "video_config" });
    assert.deepEqual(metadata, {
        episodeId: "episode-1",
        shotGroupId: "sg-1",
        shotIds: ["s-1", "s-2"],
        storyboardShotGroupId: "sg-1",
        storyboardTableShotIds: ["s-1", "s-2"],
        productionPackageId: "sg-1",
        productionPackageTitle: "操场",
        productionPackageRole: "video_config",
        storyboardRole: "video_config",
    });
});

test("plans shot group insertion into canvas with shot group metadata", () => {
    const group = shotGroup("sg-1", ["s-1", "s-2"]);
    const result = planShotGroupCanvasInsert({
        group: { ...group, assetRefs: [{ assetId: "asset-image", kind: "image", role: "reference_image" }], audioRefs: [{ assetId: "asset-audio", kind: "audio", role: "music" }] },
        shots: [tableShot("s-1", 1, { scriptText: "魏梁上台" }), tableShot("s-2", 2, { scriptText: "台下反应" })],
        assets: [
            { id: "asset-image", kind: "image", title: "角色图", data: { dataUrl: "blob:image", storageKey: "img-1", width: 1000, height: 800, bytes: 12, mimeType: "image/png" }, coverUrl: "blob:image", updatedAt: "now" },
            { id: "asset-audio", kind: "audio", title: "配乐", data: { url: "blob:audio", storageKey: "aud-1", bytes: 10, mimeType: "audio/mpeg" }, updatedAt: "now" },
        ],
        position: { x: 100, y: 200 },
        config: { provider: "volcengine-ark", model: "ep-test", size: "16:9", seconds: "8", vquality: "720" },
        episodeTitle: "第一集",
        idFactory: (prefix) => `${prefix}-id`,
        connectionIdFactory: (index) => `conn-${index}`,
    });

    assert.equal(result.nodes.length, 4);
    assert.equal(result.connections.length, 3);
    assert.equal(result.nodes[0].metadata?.shotGroupId, "sg-1");
    assert.deepEqual(result.nodes[3].metadata?.shotIds, ["s-1", "s-2"]);
    assert.equal(result.nodes[3].metadata?.generationMode, "video");
    assert.equal(result.nodes[3].metadata?.sourceType, "shot_group");
    assert.equal(result.nodes[3].metadata?.sourceId, "sg-1");
    assert.equal(result.nodes[3].metadata?.prompt, "提示词");
    assert.equal(result.nodes[3].metadata?.finalPrompt, "提示词");
    assert.equal(result.nodes[3].metadata?.episodeTitle, "第一集");
    assert.deepEqual(result.nodes[3].metadata?.references, ["asset:asset-image"]);
    assert.deepEqual(result.nodes[3].metadata?.audioReferences, ["asset:asset-audio"]);
    assert.deepEqual(
        result.groupNodeRefs.map((ref) => ref.role),
        ["prompt", "reference_image", "music", "video_config"],
    );
});

test("plans shot group video config node with agent trace and fixed asset versions", () => {
    const group = shotGroup("sg-1", ["s-1", "s-2"]);
    const result = planShotGroupCanvasInsert({
        group: {
            ...group,
            agentRunId: "run-1",
            agentConfigId: "storyboard-agent",
            agentConfigVersion: "2",
            sourceType: "agent_storyboard_director",
            assetRefs: [
                { assetId: "asset-image", kind: "image", role: "first_frame" },
                { assetId: "asset-video", kind: "video", role: "reference_video" },
            ],
            audioRefs: [{ assetId: "asset-audio", kind: "audio", role: "music" }],
        },
        shots: [tableShot("s-1", 1, { agentRunId: "run-1", agentConfigId: "storyboard-agent", agentConfigVersion: "2" }), tableShot("s-2", 2)],
        assets: [
            {
                id: "asset-image",
                kind: "image",
                title: "角色图",
                data: { dataUrl: "blob:image", storageKey: "img-1", width: 1000, height: 800, bytes: 12, mimeType: "image/png" },
                coverUrl: "blob:image",
                updatedAt: "2026-01-01T00:00:00.000Z",
                metadata: {
                    currentAssetVersionId: "ver-img",
                    generations: [],
                    assetVersions: [
                        {
                            id: "ver-img-old",
                            versionNumber: 2,
                            kind: "image",
                            title: "角色图",
                            coverUrl: "blob:image-old",
                            data: { dataUrl: "blob:image-old", width: 800, height: 600, bytes: 10, mimeType: "image/png" },
                            createdAt: "old",
                            changeNote: "旧版本",
                            source: "manual_edit",
                        },
                        {
                            id: "ver-img",
                            versionNumber: 3,
                            kind: "image",
                            title: "角色图",
                            coverUrl: "blob:image",
                            data: { dataUrl: "blob:image", width: 1000, height: 800, bytes: 12, mimeType: "image/png" },
                            createdAt: "now",
                            changeNote: "当前版本",
                            source: "manual_edit",
                        },
                    ],
                },
            },
            { id: "asset-video", kind: "video", title: "参考视频", data: { url: "blob:video", storageKey: "vid-1", width: 1280, height: 720, bytes: 20, mimeType: "video/mp4" }, updatedAt: "2026-01-02T00:00:00.000Z" },
            { id: "asset-audio", kind: "audio", title: "配乐", data: { url: "blob:audio", storageKey: "aud-1", bytes: 10, mimeType: "audio/mpeg" }, updatedAt: "2026-01-03T00:00:00.000Z" },
        ],
        position: { x: 100, y: 200 },
        config: { provider: "volcengine-ark", model: "ep-test", size: "16:9", seconds: "8", vquality: "720" },
        episodeTitle: "第一集",
        idFactory: (prefix) => `${prefix}-id`,
        connectionIdFactory: (index) => `conn-${index}`,
    });
    const node = result.nodes.find((item) => item.type === "config");
    assert.equal(node?.metadata?.generationMode, "video");
    assert.equal(node?.metadata?.agentRunId, "run-1");
    assert.equal(node?.metadata?.agentConfigId, "storyboard-agent");
    assert.equal(node?.metadata?.agentConfigVersion, "2");
    assert.equal(node?.metadata?.sourceType, "shot_group");
    assert.equal(node?.metadata?.episodeTitle, "第一集");
    assert.equal(node?.metadata?.shotGroupId, "sg-1");
    assert.equal(node?.metadata?.seconds, "8");
    assert.equal(node?.metadata?.duration, "8");
    assert.deepEqual(node?.metadata?.references, ["asset:asset-image"]);
    assert.deepEqual(node?.metadata?.videoReferences, ["asset:asset-video"]);
    assert.deepEqual(node?.metadata?.audioReferences, ["asset:asset-audio"]);
    const imageNode = result.nodes.find((item) => item.id === "shot-group-image-id");
    assert.equal(imageNode?.metadata?.assetVersion?.assetVersionId, "ver-img");
    assert.equal(imageNode?.metadata?.assetVersion?.versionNumber, 3);
    assert.equal(node?.metadata?.status, "idle");
});

test("plans shot group insertion with confirmed episode reference assets after manual refs", () => {
    const result = planShotGroupCanvasInsert({
        group: { ...shotGroup("sg-1", ["s-1"]), assetRefs: [{ assetId: "asset-manual", kind: "image", role: "first_frame" }] },
        shots: [tableShot("s-1", 1, { scriptText: "魏梁上台" })],
        assets: [
            { id: "asset-manual", kind: "image", title: "手动角色图", data: { dataUrl: "blob:manual", width: 100, height: 100, bytes: 10, mimeType: "image/png" }, coverUrl: "blob:manual", updatedAt: "now" },
            { id: "asset-auto", kind: "image", title: "自动场景图", data: { dataUrl: "blob:auto", width: 100, height: 100, bytes: 10, mimeType: "image/png" }, coverUrl: "blob:auto", updatedAt: "now" },
        ],
        autoAssetRefs: [
            {
                assetId: "asset-auto",
                kind: "image",
                role: "episode_reference",
                source: "agent_asset_extractor",
                sourceLabel: "Agent 提取",
                isAutoMatched: true,
                isPrimaryReference: true,
                assetBreakdownItemId: "need-1",
                imageBriefId: "brief-1",
                matchReasons: ["名称命中：大学操场"],
            },
        ],
        position: { x: 100, y: 200 },
        config: { provider: "volcengine-ark", model: "ep-test", size: "16:9", seconds: "8", vquality: "720" },
        episodeTitle: "第一集",
        idFactory: (prefix) => `${prefix}-id`,
        connectionIdFactory: (index) => `conn-${index}`,
    });
    const configNode = result.nodes.find((node) => node.type === "config");
    assert.deepEqual(configNode?.metadata?.references, ["asset:asset-manual", "asset:asset-auto"]);
    const refs = configNode?.metadata?.referenceAssets as Array<Record<string, unknown>>;
    assert.equal(refs[0].assetId, "asset-manual");
    assert.equal(refs[1].assetId, "asset-auto");
    assert.equal(refs[1].sourceType, "agent_asset_extractor");
    assert.equal(refs[1].isAutoMatched, true);
    assert.deepEqual(refs[1].matchReasons, ["名称命中：大学操场"]);
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

function tableShot(id: string, order: number, patch: Partial<StoryboardTableShot> = {}): StoryboardTableShot {
    return {
        id,
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        sceneName: "操场",
        location: "操场",
        timeOfDay: "白天",
        order,
        title: `镜头 ${order}`,
        scriptText: "",
        visualDescription: "",
        characters: [],
        dialogue: "",
        action: "",
        emotion: "",
        shotSize: "",
        cameraMovement: "",
        estimatedDuration: 5,
        assetRefs: [],
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}

function shotGroup(id: string, shotIds: string[]) {
    return {
        id,
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        sceneName: "操场",
        shotIds,
        totalDuration: 10,
        prompt: "提示词",
        effectivePrompt: "",
        assetRefs: [],
        audioRefs: [],
        status: "prompt_ready" as const,
        resultAssetIds: [],
        createdAt: "now",
        updatedAt: "now",
    };
}
