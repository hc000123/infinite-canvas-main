import assert from "node:assert/strict";
import test from "node:test";

import { isRemoteOrInlineMediaUrl, normalizeSeedanceRatio, normalizeSeedanceResolution } from "./video-normalizers.ts";

test("preserves remote and inline media urls for Seedance references", () => {
    assert.equal(isRemoteOrInlineMediaUrl("https://example.com/video.mp4"), true);
    assert.equal(isRemoteOrInlineMediaUrl("http://example.com/video.mp4"), true);
    assert.equal(isRemoteOrInlineMediaUrl("asset://asset-id"), true);
    assert.equal(isRemoteOrInlineMediaUrl("data:video/mp4;base64,AAAA"), true);
    assert.equal(isRemoteOrInlineMediaUrl("blob:http://127.0.0.1:3000/video"), false);
});

test("keeps official Seedance 21:9 ratio", () => {
    assert.equal(normalizeSeedanceRatio("21:9"), "21:9");
    assert.equal(normalizeSeedanceRatio("2560x1080"), "21:9");
});

test("caps Seedance Fast resolution to 720p", () => {
    assert.equal(normalizeSeedanceResolution("1080", "doubao-seedance-2-0-fast-260128"), "720p");
    assert.equal(normalizeSeedanceResolution("1080", "doubao-seedance-2-0-260128"), "1080p");
});
