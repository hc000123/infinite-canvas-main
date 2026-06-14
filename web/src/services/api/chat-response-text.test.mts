import assert from "node:assert/strict";
import test from "node:test";

import { collectChatCompletionTextFromRawResponse, parseChatCompletionStreamChunk } from "./chat-response-text.ts";

test("parses standard chat completion stream deltas", () => {
    const text = parseChatCompletionStreamChunk('data: {"choices":[{"delta":{"content":"剧本"}}]}\n\ndata: {"choices":[{"delta":{"content":"优化完成"}}]}\n\ndata: [DONE]\n\n');
    assert.equal(text, "剧本优化完成");
});

test("falls back to non-stream chat completion message content", () => {
    const text = collectChatCompletionTextFromRawResponse(JSON.stringify({ choices: [{ message: { content: "{\"productionScript\":\"新版剧本\"}" } }] }));
    assert.equal(text, "{\"productionScript\":\"新版剧本\"}");
});
