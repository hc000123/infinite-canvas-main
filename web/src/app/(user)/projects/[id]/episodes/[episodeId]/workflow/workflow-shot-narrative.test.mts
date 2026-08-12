import assert from "node:assert/strict";
import test from "node:test";

import { workflowShotNarrative } from "./workflow-shot-narrative.ts";

const draft = { shotSize: "中景", camera: "平视", movement: "缓慢跟拍", action: "阿宁推门走进房间", performance: "呼吸放轻，神情警惕", dialogue: "阿宁：有人吗？", durationSeconds: 6, continuityMode: "continuous" as const };

test("formats structured shot data as one natural-language paragraph", () => {
    const result = workflowShotNarrative(draft);
    assert.match(result, /中景/);
    assert.match(result, /缓慢跟拍/);
    assert.match(result, /阿宁推门走进房间/);
    assert.match(result, /阿宁：有人吗/);
    assert.match(result, /6 秒/);
});

test("prefers a direct narrative edit", () => {
    assert.equal(workflowShotNarrative({ ...draft, narrative: "  镜头紧跟阿宁进门。  " }), "镜头紧跟阿宁进门。");
});
