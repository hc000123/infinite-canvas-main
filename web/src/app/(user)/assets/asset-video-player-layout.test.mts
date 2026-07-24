import assert from "node:assert/strict";
import test from "node:test";

import { assetVideoPlayerStyle } from "./asset-video-player-layout.ts";

test("sizes portrait video player by intrinsic ratio and viewport height", () => {
    assert.deepEqual(assetVideoPlayerStyle(720, 1280), {
        aspectRatio: "720 / 1280",
        maxHeight: "70vh",
        width: "min(100%, calc(70vh * 720 / 1280))",
    });
});

test("falls back to a valid media ratio when dimensions are missing", () => {
    assert.deepEqual(assetVideoPlayerStyle(0, 0), {
        aspectRatio: "16 / 9",
        maxHeight: "70vh",
        width: "min(100%, calc(70vh * 16 / 9))",
    });
});
