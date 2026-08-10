import assert from "node:assert/strict";
import test from "node:test";

import { appendOmniV2VVideoInput } from "./omni-v2v-payload.ts";

test("adds the required Omni V2V video input without affecting other models", () => {
    const body = new FormData();
    appendOmniV2VVideoInput(body, "omni-fast-v2v", ["https://cdn.example.com/source.mp4"]);
    assert.deepEqual(body.getAll("input_video_url[]"), ["https://cdn.example.com/source.mp4"]);

    const unrelated = new FormData();
    appendOmniV2VVideoInput(unrelated, "grok-imagine-video", ["https://cdn.example.com/source.mp4"]);
    assert.deepEqual(unrelated.getAll("input_video_url[]"), []);
});

test("rejects missing, non-MP4, oversized, and multiple Omni V2V videos", () => {
    assert.throws(() => appendOmniV2VVideoInput(new FormData(), "omni-fast-v2v", []), /视频/);
    assert.throws(() => appendOmniV2VVideoInput(new FormData(), "omni-fast-v2v", [new File(["bad"], "source.mov", { type: "video/quicktime" })]), /MP4/);
    assert.throws(() => appendOmniV2VVideoInput(new FormData(), "omni-fast-v2v", [new File([new Uint8Array(15 * 1024 * 1024 + 1)], "source.mp4", { type: "video/mp4" })]), /15 MB/);
    assert.throws(() => appendOmniV2VVideoInput(new FormData(), "omni-fast-v2v", ["https://cdn.example.com/a.mp4", "https://cdn.example.com/b.mp4"]), /1 个/);
});
