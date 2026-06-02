import assert from "node:assert/strict";
import test from "node:test";

import { isRemoteOrInlineMediaUrl } from "./video-normalizers.ts";

test("preserves remote and inline media urls for Seedance references", () => {
    assert.equal(isRemoteOrInlineMediaUrl("https://example.com/video.mp4"), true);
    assert.equal(isRemoteOrInlineMediaUrl("http://example.com/video.mp4"), true);
    assert.equal(isRemoteOrInlineMediaUrl("asset://asset-id"), true);
    assert.equal(isRemoteOrInlineMediaUrl("data:video/mp4;base64,AAAA"), true);
    assert.equal(isRemoteOrInlineMediaUrl("blob:http://127.0.0.1:3000/video"), false);
});
