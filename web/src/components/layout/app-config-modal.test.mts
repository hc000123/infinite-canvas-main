import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modal = readFileSync(new URL("./app-config-modal.tsx", import.meta.url), "utf8");

test("configuration modal loads once without a height-changing polling indicator", () => {
    assert.doesNotMatch(modal, /setInterval/);
    assert.doesNotMatch(modal, /正在同步后台配置/);
});

test("configuration modal no longer exposes manual reasoning controls", () => {
    assert.doesNotMatch(modal, /思考模式/);
    assert.doesNotMatch(modal, /reasoningEffort|thinkingMode/);
});
