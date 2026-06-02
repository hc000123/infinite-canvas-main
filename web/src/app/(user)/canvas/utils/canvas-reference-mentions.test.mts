import assert from "node:assert/strict";
import test from "node:test";

import { applyReferenceMention, buildReferenceMentionOptions, filterReferenceMentions, findReferenceMentionTrigger } from "./canvas-reference-mentions.ts";

test("finds the active @ mention before the caret", () => {
    assert.deepEqual(findReferenceMentionTrigger("镜头跟随@图", 6), { start: 4, query: "图" });
    assert.deepEqual(findReferenceMentionTrigger("镜头跟随 @视频1", 9), { start: 5, query: "视频1" });
    assert.equal(findReferenceMentionTrigger("镜头跟随 图片 1", 8), null);
});

test("filters reference mentions by compact @ query", () => {
    const options = [
        { id: "image-1", label: "图片 1", detail: "角色图" },
        { id: "image-2", label: "图片 2", detail: "服装图" },
        { id: "video-1", label: "视频 1", detail: "运镜参考" },
    ];

    assert.deepEqual(filterReferenceMentions(options, ""), options);
    assert.deepEqual(filterReferenceMentions(options, "图片"), options.slice(0, 2));
    assert.deepEqual(filterReferenceMentions(options, "图片2"), [options[1]]);
    assert.deepEqual(filterReferenceMentions(options, "视频1"), [options[2]]);
});

test("builds reference mention options with preview urls", () => {
    const options = buildReferenceMentionOptions([
        { nodeId: "image-1", type: "image", title: "角色图", image: { dataUrl: "image-url" } },
        { nodeId: "video-1", type: "video", title: "运镜参考", video: { url: "video-url" } },
        { nodeId: "audio-1", type: "audio", title: "节奏参考", audio: { url: "audio-url" } },
        { nodeId: "text-1", type: "text", title: "提示词", text: "雨夜" },
    ]);

    assert.deepEqual(options, [
        { id: "image-1", label: "图片 1", detail: "角色图", previewType: "image", previewUrl: "image-url" },
        { id: "video-1", label: "视频 1", detail: "运镜参考", previewType: "video", previewUrl: "video-url" },
        { id: "audio-1", label: "音频 1", detail: "节奏参考", previewType: "audio", previewUrl: "audio-url" },
    ]);
});

test("replaces the active @ token with the official Seedance label", () => {
    assert.deepEqual(applyReferenceMention("让@图", 3, "图片 1"), { text: "让图片 1", caret: 5 });
    assert.deepEqual(applyReferenceMention("参考 @视频1 的运动", 7, "视频 1"), { text: "参考 视频 1 的运动", caret: 7 });
});
