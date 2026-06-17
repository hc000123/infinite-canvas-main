import assert from "node:assert/strict";
import test from "node:test";

import { canvasPageReturnTargetForProject, videoWorkflowEpisodeFromCanvasProject } from "./canvas-page-action-targets.ts";

test("video workflow canvases return to the video production page", () => {
    const target = canvasPageReturnTargetForProject({
        episodeId: "video-workflow:ep05",
        episodeTitle: "ep05",
        projectId: "project-unfiled",
        scriptId: "video-workflow",
    });

    assert.deepEqual(target, { href: "/video?episode=ep05", label: "返回视频生产台" });
});

test("regular episode canvases return to the project detail page", () => {
    const target = canvasPageReturnTargetForProject({
        episodeId: "episode-1",
        episodeTitle: "第一集",
        projectId: "project-1",
        scriptId: "script-1",
    });

    assert.deepEqual(target, { href: "/projects/project-1", label: "返回项目详情" });
});

test("video workflow episode can fall back to the canvas episode title", () => {
    const episode = videoWorkflowEpisodeFromCanvasProject({
        episodeId: "video-workflow:",
        episodeTitle: "ep07",
        scriptId: "video-workflow",
    });

    assert.equal(episode, "ep07");
});
