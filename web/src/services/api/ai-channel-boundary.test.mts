import assert from "node:assert/strict";
import test from "node:test";

import { inferRemoteVideoProtocol, resolveAllowedVideoProtocol, resolveEffectiveChannelMode, shouldAttachLocalVolcengineCredentials, shouldUseBrowserAIKey } from "./ai-channel-boundary.ts";

test("forces remote mode when cloud settings disable custom channels", () => {
    assert.equal(resolveEffectiveChannelMode("local", false), "remote");
    assert.equal(resolveEffectiveChannelMode("remote", false), "remote");
});

test("always uses backend channel even when custom channels are allowed", () => {
    assert.equal(resolveEffectiveChannelMode("local", true), "remote");
    assert.equal(resolveEffectiveChannelMode("remote", true), "remote");
});

test("remote mode never uses browser local AI keys", () => {
    assert.equal(shouldUseBrowserAIKey("remote"), false);
    assert.equal(shouldAttachLocalVolcengineCredentials("remote", "volcengine-ark"), false);
});

test("local mode no longer uses browser local AI keys", () => {
    assert.equal(shouldUseBrowserAIKey("local"), false);
    assert.equal(shouldAttachLocalVolcengineCredentials("local", "volcengine-ark"), false);
    assert.equal(shouldAttachLocalVolcengineCredentials("local", "openai"), false);
});

test("local and remote modes keep the selected video protocol", () => {
    assert.equal(resolveAllowedVideoProtocol("local", "volcengine-ark"), "volcengine-ark");
    assert.equal(resolveAllowedVideoProtocol("local", "openai"), "openai");
    assert.equal(resolveAllowedVideoProtocol("remote", "volcengine-ark"), "volcengine-ark");
});

test("remote video protocol only treats endpoint ids as Ark", () => {
    assert.equal(inferRemoteVideoProtocol("doubao-seedance-2-0-260128"), "openai");
    assert.equal(inferRemoteVideoProtocol("ep-20260605-demo"), "volcengine-ark");
    assert.equal(inferRemoteVideoProtocol("grok-imagine-video"), "openai");
});

test("remote video protocol uses backend model protocol mapping first", () => {
    assert.equal(inferRemoteVideoProtocol("doubao-seedance-2-0", "openai", [{ model: "doubao-seedance-2-0", protocol: "volcengine-ark" }]), "volcengine-ark");
    assert.equal(inferRemoteVideoProtocol("doubao-seedance-2-0-260128", "volcengine-ark", [{ model: "doubao-seedance-2-0-260128", protocol: "openai" }]), "openai");
});

test("remote video protocol supports Jimeng CLI backend mapping", () => {
    assert.equal(inferRemoteVideoProtocol("seedance2.0fast", "openai", [{ model: "seedance2.0fast", protocol: "jimeng-cli" }]), "jimeng-cli");
    assert.equal(resolveAllowedVideoProtocol("remote", "jimeng-cli"), "jimeng-cli");
});

test("remote video protocol supports Xinglian cloud backend mapping", () => {
    assert.equal(inferRemoteVideoProtocol("sd2-720p-fast", "openai", [{ model: "sd2-720p-fast", protocol: "xinglian-cloud" }]), "xinglian-cloud");
    assert.equal(resolveAllowedVideoProtocol("remote", "xinglian-cloud"), "xinglian-cloud");
});

test("remote video protocol supports MiniMax backend mapping", () => {
    assert.equal(inferRemoteVideoProtocol("MiniMax-H3", "openai", [{ model: "MiniMax-H3", protocol: "minimax" }]), "minimax");
    assert.equal(resolveAllowedVideoProtocol("remote", "minimax"), "minimax");
});
