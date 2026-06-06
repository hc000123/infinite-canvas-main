import assert from "node:assert/strict";
import test from "node:test";

import {
    buildEpisodeScriptSnapshot,
    buildImportedEpisodeWriteInput,
    canvasEpisodeContextFromCanvas,
    canvasEpisodeContextFromCreateBinding,
    canvasEpisodeContextFromEpisode,
    canvasEpisodeContextFromImportedScript,
    canvasEpisodeLabel,
    canvasEpisodeMetadata,
} from "./canvas-episode-context.ts";
import type { ScriptEpisode, ScriptScene } from "./script-management.ts";

test("builds canvas episode context from an existing script episode", () => {
    const context = canvasEpisodeContextFromEpisode("project-1", episode("episode-1", "第一集"), [scene("scene-1", "episode-1")]);
    assert.equal(context.episodeId, "episode-1");
    assert.equal(context.episodeTitle, "第一集");
    assert.equal(context.scriptId, "project-1");
    assert.match(context.scriptSnapshot, /第一集/);
    assert.match(context.scriptSnapshot, /操场重逢/);
});

test("builds canvas episode context from imported script text", () => {
    const context = canvasEpisodeContextFromImportedScript("project-1", "episode-2", "第二集", "本集完整剧本文本");
    assert.deepEqual(context, {
        episodeId: "episode-2",
        episodeTitle: "第二集",
        scriptId: "project-1",
        scriptSnapshot: "本集完整剧本文本",
    });
});

test("labels legacy canvases without episode info", () => {
    assert.equal(canvasEpisodeLabel({}), "未绑定集数");
    assert.equal(canvasEpisodeLabel({ episodeTitle: "第三集" }), "第三集");
});

test("builds generation metadata from canvas episode context", () => {
    assert.deepEqual(
        canvasEpisodeMetadata({
            episodeId: "episode-1",
            episodeTitle: "第一集",
            scriptId: "project-1",
            scriptSnapshot: "快照",
        }),
        {
            episodeId: "episode-1",
            episodeTitle: "第一集",
            scriptId: "project-1",
            scriptSnapshot: "快照",
        },
    );
});

test("builds imported episode write input for new canvas creation", () => {
    assert.deepEqual(buildImportedEpisodeWriteInput("project-1", { mode: "import", title: "  ", scriptText: "本集剧本文本" }), {
        projectId: "project-1",
        title: "未命名集数",
        summary: "本集剧本文本",
        hook: "",
        turningPoint: "",
        cliffhanger: "",
    });
    assert.equal(buildImportedEpisodeWriteInput("project-1", { mode: "none" }), undefined);
});

test("resolves create binding without page-local metadata branching", () => {
    const existingContext = canvasEpisodeContextFromEpisode("project-1", episode("episode-1", "第一集"));
    assert.equal(canvasEpisodeContextFromCreateBinding("project-1", { mode: "existing", episodeId: "episode-1", context: existingContext })?.episodeId, "episode-1");
    assert.equal(canvasEpisodeContextFromCreateBinding("project-1", { mode: "import", title: "第二集", scriptText: "导入文本" }, "episode-2")?.scriptSnapshot, "导入文本");
    assert.equal(canvasEpisodeContextFromCreateBinding("project-1", { mode: "import", title: "第二集", scriptText: "导入文本" }), undefined);
});

test("script snapshot remains stable after the original episode changes", () => {
    const original = episode("episode-1", "第一集");
    const snapshot = buildEpisodeScriptSnapshot(original, [scene("scene-1", "episode-1")]);
    const changed = { ...original, title: "第一集新版", summary: "新版摘要" };
    assert.notEqual(snapshot, buildEpisodeScriptSnapshot(changed, [scene("scene-1", "episode-1")]));
    assert.equal(canvasEpisodeContextFromCanvas({ episodeId: original.id, episodeTitle: original.title, scriptId: "project-1", scriptSnapshot: snapshot })?.scriptSnapshot, snapshot);
});

function episode(id: string, title: string): ScriptEpisode {
    return {
        id,
        projectId: "project-1",
        order: 1,
        title,
        summary: "毕业前夕",
        hook: "一封旧信",
        turningPoint: "",
        cliffhanger: "",
        sceneIds: [],
        createdAt: "now",
        updatedAt: "now",
    };
}

function scene(id: string, episodeId: string): ScriptScene {
    return {
        id,
        episodeId,
        order: 1,
        location: "操场",
        characterIds: [],
        beat: "操场重逢",
        dialogue: "你终于来了。",
        emotion: "克制",
        durationHint: "60秒",
        createdAt: "now",
        updatedAt: "now",
    };
}
