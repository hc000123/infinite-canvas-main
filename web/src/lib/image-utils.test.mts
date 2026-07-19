import assert from "node:assert/strict";
import test from "node:test";

import { dataUrlToFile, validatedImageMeta } from "./image-utils.ts";

const tinyPng = "data:image/png;base64,iVBORw0KGgo=";

test("converts reference images to short safe upload filenames", () => {
    const longPromptName = "角色/人物设定：这是一个非常非常长的生成图片名字，会被作为视频生成参考图上传文件名并导致上游拒绝".repeat(2) + ".png";
    const file = dataUrlToFile({ id: "image-node-1", name: longPromptName, type: "image/png", dataUrl: tinyPng });

    assert.equal(file.type, "image/png");
    assert.match(file.name, /^角色_人物设定_这是一个非常非常长的生成图片名字/);
    assert.match(file.name, /\.png$/);
    assert.ok(file.name.length <= 64);
    assert.doesNotMatch(file.name, /[\\/:*?"<>|]/);
});

test("rejects media that cannot be decoded as an image", () => {
    assert.deepEqual(validatedImageMeta(640, 360, "image/png"), { width: 640, height: 360, mimeType: "image/png" });
    assert.throws(() => validatedImageMeta(0, 0, "image/png"), /图片格式无效或文件已损坏/);
});
