import assert from "node:assert/strict";
import test from "node:test";

import { buildImportedVideoPackage } from "./video-package-builders.ts";

test("imports source script and editable shot separately from the final prompt", () => {
    const item = buildImportedVideoPackage({
        duration: "6秒", episode: "第一集", id: "shot-001", prompt: "最终提示词", segment: "阿宁进入房间", sourcePath: "workflow",
        sourceScript: "【原剧本】阿宁进入房间。",
        shotDraft: { shotSize: "中景", camera: "平视", movement: "缓慢推近", action: "阿宁进入房间", performance: "克制", dialogue: "", durationSeconds: 6, continuityMode: "continuous" },
    });
    assert.equal(item.sourceScript, "【原剧本】阿宁进入房间。");
    assert.equal(item.shotDraft?.action, "阿宁进入房间");
    assert.equal(item.shotStatus, "confirmed");
    assert.notEqual(item.promptInputHash, "");
});
