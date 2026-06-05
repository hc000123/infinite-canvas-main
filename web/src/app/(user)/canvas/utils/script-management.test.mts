import assert from "node:assert/strict";
import test from "node:test";

import { normalizeScriptScene, orderedScriptEpisodes, orderedScriptScenes, parseScriptScenesFromText, reorderScriptItems, type ScriptEpisode, type ScriptScene } from "./script-management.ts";

test("orders episodes and scenes by order", () => {
    const episodes: ScriptEpisode[] = [episode("ep-2", "project-1", 2), episode("ep-other", "project-2", 1), episode("ep-1", "project-1", 1)];
    const scenes: ScriptScene[] = [scene("scene-2", "ep-1", 2), scene("scene-1", "ep-1", 1), scene("scene-other", "ep-2", 1)];

    assert.deepEqual(
        orderedScriptEpisodes(episodes, "project-1").map((item) => item.id),
        ["ep-1", "ep-2"],
    );
    assert.deepEqual(
        orderedScriptScenes(scenes, "ep-1").map((item) => item.id),
        ["scene-1", "scene-2"],
    );
});

test("reorders items without changing unrelated rows", () => {
    const next = reorderScriptItems([episode("a", "project-1", 1), episode("b", "project-1", 2), episode("c", "project-1", 3)], "b", "up");
    assert.deepEqual(
        next.sort((a, b) => a.order - b.order).map((item) => item.id),
        ["b", "a", "c"],
    );
});

test("normalizes scene references and text fields", () => {
    const normalized = normalizeScriptScene({
        episodeId: "ep-1",
        order: 1,
        location: "  操场  ",
        characterIds: [" char-1 ", "char-1", ""],
        sceneSettingId: " scene-setting ",
        beat: "  走上主席台  ",
        dialogue: "  我毕业了  ",
        emotion: "  克制  ",
        durationHint: "  30 秒  ",
        storyboardGroupId: "",
    });

    assert.deepEqual(normalized.characterIds, ["char-1"]);
    assert.equal(normalized.location, "操场");
    assert.equal(normalized.sceneSettingId, "scene-setting");
    assert.equal(normalized.storyboardGroupId, undefined);
});

test("parses paragraph text into scene drafts", () => {
    const drafts = parseScriptScenesFromText("第一场\n地点：大学操场\n情绪：克制\n魏梁走上主席台。\n\n第二场\n对白：我们终于毕业了\n时长：40 秒");
    assert.equal(drafts.length, 2);
    assert.equal(drafts[0].location, "大学操场");
    assert.equal(drafts[0].emotion, "克制");
    assert.equal(drafts[1].dialogue, "我们终于毕业了");
    assert.equal(drafts[1].durationHint, "40 秒");
});

function episode(id: string, projectId: string, order: number): ScriptEpisode {
    return { id, projectId, order, title: id, summary: "", hook: "", turningPoint: "", cliffhanger: "", sceneIds: [], createdAt: "", updatedAt: "" };
}

function scene(id: string, episodeId: string, order: number): ScriptScene {
    return { id, episodeId, order, location: "", characterIds: [], beat: "", dialogue: "", emotion: "", durationHint: "", createdAt: "", updatedAt: "" };
}
