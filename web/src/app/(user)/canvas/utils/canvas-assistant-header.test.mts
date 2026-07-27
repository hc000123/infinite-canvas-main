import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanvasAssistantHeaderActions } from "./canvas-assistant-header.ts";

test("空助手只保留基础标题和收起动作", () => {
    assert.deepEqual(resolveCanvasAssistantHeaderActions({ view: "chat", historyCount: 0, canStartChat: false }), {
        showHistory: false,
        showNewChat: false,
    });
});

test("有对话内容时才显示新对话", () => {
    assert.deepEqual(resolveCanvasAssistantHeaderActions({ view: "chat", historyCount: 0, canStartChat: true }), {
        showHistory: false,
        showNewChat: true,
    });
});

test("有历史或正在历史视图时显示历史切换", () => {
    assert.equal(resolveCanvasAssistantHeaderActions({ view: "chat", historyCount: 2, canStartChat: true }).showHistory, true);
    assert.equal(resolveCanvasAssistantHeaderActions({ view: "history", historyCount: 0, canStartChat: true }).showHistory, true);
});
