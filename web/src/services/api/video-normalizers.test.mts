import assert from "node:assert/strict";
import test from "node:test";

import { isRemoteOrInlineMediaUrl, isSeedance25Model, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution } from "./video-normalizers.ts";

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

test("recognizes only explicit Seedance 2.5 aliases", () => {
    assert.equal(isSeedance25Model("doubao-seedance-2-5"), true);
    assert.equal(isSeedance25Model("doubao-seedance-2-5-260628"), true);
    assert.equal(isSeedance25Model(" doubao_seedance 2.5 "), true);
    assert.equal(isSeedance25Model("seedance_2-5"), true);
    assert.equal(isSeedance25Model("Seedance2.5"), true);
    assert.equal(isSeedance25Model("doubao-seedance-2-50"), false);
    assert.equal(isSeedance25Model("doubao-seedance-2-50-260628"), false);
    assert.equal(isSeedance25Model("seedance2.50"), false);
    assert.equal(isSeedance25Model("seedance/2/5"), false);
});

test("normalizes Seedance duration by model and task mode", () => {
    assert.equal(normalizeSeedanceDuration("30", "doubao-seedance-2-5"), 30);
    assert.equal(normalizeSeedanceDuration("30", "doubao-seedance-2-0-260128"), 15);
    assert.equal(normalizeSeedanceDuration("30", "doubao-seedance-2-50"), 15);
    assert.equal(normalizeSeedanceDuration("12", "seedance2.5", "edit"), -1);
});

test("normalizes Seedance 2.5 resolution to 480p or 720p", () => {
    assert.equal(normalizeSeedanceResolution("480", "doubao-seedance-2-5"), "480p");
    assert.equal(normalizeSeedanceResolution("1080", "doubao-seedance-2-5"), "720p");
    assert.equal(normalizeSeedanceResolution("4k", "doubao-seedance-2-5"), "720p");
});

test("forces adaptive ratio for Seedance 2.5 derived and frame modes", () => {
    assert.equal(normalizeSeedanceRatio("16:9", "doubao-seedance-2-5", "extend"), "adaptive");
    assert.equal(normalizeSeedanceRatio("16:9", "doubao-seedance-2-5", "generate", "first_frame"), "adaptive");
    assert.equal(normalizeSeedanceRatio("16:9", "doubao-seedance-2-5", "generate", "first_last_frame"), "adaptive");
    assert.equal(normalizeSeedanceRatio("16:9", "doubao-seedance-2-50", "extend", "first_frame"), "16:9");
});
