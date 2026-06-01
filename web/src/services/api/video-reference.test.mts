import assert from "node:assert/strict";
import test from "node:test";

import { buildSeedanceContent, buildSeedanceVideoTaskPayload } from "./video-reference.ts";

test("builds Seedance content with image and video reference roles", () => {
    const content = buildSeedanceContent("镜头跟随主角穿过雨夜街道", ["data:image/png;base64,aaa"], ["data:video/mp4;base64,bbb"]);

    assert.deepEqual(content, [
        { type: "text", text: "镜头跟随主角穿过雨夜街道" },
        { type: "image_url", image_url: { url: "data:image/png;base64,aaa" }, role: "reference_image" },
        { type: "video_url", video_url: { url: "data:video/mp4;base64,bbb" }, role: "reference_video" },
    ]);
});

test("limits Seedance omni references to 9 images, 3 videos, and 12 files total", () => {
    const images = Array.from({ length: 10 }, (_, index) => `image-${index}`);
    const videos = Array.from({ length: 4 }, (_, index) => `video-${index}`);
    const content = buildSeedanceContent("prompt", images, videos);

    assert.equal(content.filter((item) => item.type === "image_url").length, 9);
    assert.equal(content.filter((item) => item.type === "video_url").length, 3);
    assert.equal(content.length, 13);
});

test("builds Seedance video task payload with image and video references", () => {
    const payload = buildSeedanceVideoTaskPayload(
        {
            model: "doubao-seedance-2-0-260128",
            seedanceModel: "doubao-seedance-2-0-260128",
            videoModel: "grok-imagine-video",
            videoSeconds: "10",
            size: "16:9",
            vquality: "720",
            videoGenerateAudio: "true",
            videoWatermark: "false",
            videoSeed: "",
        },
        "prompt",
        ["image-url"],
        ["video-url"],
    );

    assert.deepEqual(payload.content, [
        { type: "text", text: "prompt" },
        { type: "image_url", image_url: { url: "image-url" }, role: "reference_image" },
        { type: "video_url", video_url: { url: "video-url" }, role: "reference_video" },
    ]);
    assert.equal(payload.model, "doubao-seedance-2-0-260128");
    assert.equal(payload.duration, 10);
    assert.equal(payload.generate_audio, true);
});
