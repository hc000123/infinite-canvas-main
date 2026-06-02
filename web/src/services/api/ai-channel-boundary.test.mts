import assert from "node:assert/strict";
import test from "node:test";

import { resolveEffectiveChannelMode, shouldAttachLocalVolcengineCredentials, shouldUseBrowserAIKey } from "./ai-channel-boundary.ts";

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

test("local mode can use browser local AI keys and Ark credentials", () => {
    assert.equal(shouldUseBrowserAIKey("local"), true);
    assert.equal(shouldAttachLocalVolcengineCredentials("local", "volcengine-ark"), true);
    assert.equal(shouldAttachLocalVolcengineCredentials("local", "openai"), false);
});
