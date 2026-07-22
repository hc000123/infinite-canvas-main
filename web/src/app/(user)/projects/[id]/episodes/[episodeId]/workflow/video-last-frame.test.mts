import assert from "node:assert/strict";
import test from "node:test";

import { selectLastFrameSource } from "./video-last-frame.ts";

test("prefers provider tail frame and falls back to local video extraction", () => {
    assert.deepEqual(selectLastFrameSource({ lastFrameUrl: "https://cdn/tail.png", videoUrl: "blob:video" }), { kind: "provider", url: "https://cdn/tail.png" });
    assert.deepEqual(selectLastFrameSource({ videoUrl: "blob:video" }), { kind: "video", url: "blob:video" });
    assert.equal(selectLastFrameSource({}), null);
});
