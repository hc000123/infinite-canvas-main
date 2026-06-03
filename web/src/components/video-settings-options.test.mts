import assert from "node:assert/strict";
import test from "node:test";

import { isSeedanceVideoProtocol, resolveSeedanceTaskModeForSource, seedanceReferenceImageModeOptions, shouldShowSeedanceImageControl, visibleSeedanceReferenceImageMode, visibleSeedanceTaskModeOptions } from "./video-settings-options.ts";

test("only exposes generate mode when there is no source video", () => {
    assert.deepEqual(
        visibleSeedanceTaskModeOptions(false).map((option) => option.label),
        ["生成新视频"],
    );
    assert.equal(resolveSeedanceTaskModeForSource("edit", false), "generate");
    assert.equal(resolveSeedanceTaskModeForSource("extend", false), "generate");
});

test("exposes edit and extend modes when a source video exists", () => {
    assert.deepEqual(
        visibleSeedanceTaskModeOptions(true).map((option) => option.label),
        ["生成新视频", "编辑视频", "延长视频"],
    );
    assert.equal(resolveSeedanceTaskModeForSource("edit", true), "edit");
    assert.equal(resolveSeedanceTaskModeForSource("extend", true), "extend");
});

test("shows image control only for generate mode", () => {
    assert.equal(shouldShowSeedanceImageControl("generate", false), true);
    assert.equal(shouldShowSeedanceImageControl("edit", true), false);
    assert.equal(shouldShowSeedanceImageControl("extend", true), false);
});

test("keeps continue compatible but out of visible image control options", () => {
    assert.deepEqual(
        seedanceReferenceImageModeOptions.map((option) => option.label),
        ["普通参考", "作为首帧", "首尾帧"],
    );
    assert.equal(visibleSeedanceReferenceImageMode("continue"), "reference");
});

test("detects Seedance settings by video protocol regardless of channel mode", () => {
    assert.equal(isSeedanceVideoProtocol({ videoProtocol: "volcengine-ark" }), true);
    assert.equal(isSeedanceVideoProtocol({ videoProtocol: "openai" }), false);
    assert.equal(isSeedanceVideoProtocol(true), true);
});
