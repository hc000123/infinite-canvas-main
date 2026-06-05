import assert from "node:assert/strict";
import test from "node:test";

import { inferRemoteVideoProtocol, resolveAllowedVideoProtocol, resolveEffectiveChannelMode, shouldAttachLocalVolcengineCredentials, shouldUseBrowserAIKey } from "./ai-channel-boundary.ts";

test("forces remote mode when cloud settings disable custom channels", () => {
    assert.equal(resolveEffectiveChannelMode("local", false), "remote");
    assert.equal(resolveEffectiveChannelMode("remote", false), "remote");
});

test("keeps requested mode when custom channels are allowed", () => {
    assert.equal(resolveEffectiveChannelMode("local", true), "local");
    assert.equal(resolveEffectiveChannelMode("remote", true), "remote");
});

test("remote mode never uses browser local AI keys", () => {
    assert.equal(shouldUseBrowserAIKey("remote"), false);
    assert.equal(shouldAttachLocalVolcengineCredentials("remote", "volcengine-ark"), false);
});

test("local mode can use browser local OpenAI compatible keys only", () => {
    assert.equal(shouldUseBrowserAIKey("local"), true);
    assert.equal(shouldAttachLocalVolcengineCredentials("local", "volcengine-ark"), false);
    assert.equal(shouldAttachLocalVolcengineCredentials("local", "openai"), false);
});

test("local mode forces OpenAI compatible video protocol", () => {
    assert.equal(resolveAllowedVideoProtocol("local", "volcengine-ark"), "openai");
    assert.equal(resolveAllowedVideoProtocol("remote", "volcengine-ark"), "volcengine-ark");
});

test("remote video protocol can be inferred from Seedance model names", () => {
    assert.equal(inferRemoteVideoProtocol("doubao-seedance-2-0-260128"), "volcengine-ark");
    assert.equal(inferRemoteVideoProtocol("ep-20260605-demo"), "volcengine-ark");
    assert.equal(inferRemoteVideoProtocol("grok-imagine-video"), "openai");
});
