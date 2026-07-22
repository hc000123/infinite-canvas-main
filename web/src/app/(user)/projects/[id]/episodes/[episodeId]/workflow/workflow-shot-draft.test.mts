import assert from "node:assert/strict";
import test from "node:test";

import { buildImportedVideoPackage } from "../../../../../video/video-package-builders.ts";
import { parseShotBreakdown, requireWorkflowShotReview } from "./workflow-shot-draft.ts";

test("imports original script and editable shot draft without inventing a final prompt", () => {
    const shots = parseShotBreakdown(JSON.stringify({ shots: [{ shotId: "shot-001", sceneKey: "scene-1", sourceScript: "阿宁推门进入。", shotDraft: { shotSize: "中景", camera: "平视", movement: "跟拍", action: "阿宁推门进入", performance: "警惕", dialogue: "", durationSeconds: 6, continuityMode: "continuous" } }] }));
    assert.equal(shots[0].shotId, "shot-001");
    assert.equal(shots[0].sourceScript, "阿宁推门进入。");
    assert.equal(shots[0].shotDraft.action, "阿宁推门进入");
    assert.equal("prompt" in shots[0], false);
});

test("newly imported workflow shots require explicit user confirmation", () => {
    const item = buildImportedVideoPackage({ duration: "6秒", episode: "episode-1", id: "shot-001", prompt: "", segment: "进门", sourcePath: "workflow", shotDraft: { shotSize: "中景", camera: "平视", movement: "跟拍", action: "进门", performance: "警惕", dialogue: "", durationSeconds: 6, continuityMode: "continuous" } });
    const pending = requireWorkflowShotReview(item);

    assert.equal(pending.shotStatus, "draft");
    assert.equal(pending.promptStatus, "待审核");
    assert.equal(pending.promptInputHash, "");
});
