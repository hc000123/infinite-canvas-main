import assert from "node:assert/strict";
import test from "node:test";

import { buildModelPickerOptions, filterModelPickerOptions, resolveCustomModelCandidate } from "./model-picker-options.ts";

test("local model options keep the current custom model visible", () => {
    const options = buildModelPickerOptions({
        channelMode: "local",
        models: ["gpt-image-2", "claude-sonnet-4.5"],
        value: "custom-render-model",
    });

    assert.deepEqual(
        options.map((item) => item.value),
        ["custom-render-model", "gpt-image-2", "claude-sonnet-4.5"],
    );
});

test("model search matches model ids and provider aliases", () => {
    const options = buildModelPickerOptions({
        channelMode: "remote",
        models: ["gpt-5-codex", "claude-sonnet-4.5", "gemini-3-pro"],
    });

    assert.deepEqual(
        filterModelPickerOptions(options, "anthropic").map((item) => item.value),
        ["claude-sonnet-4.5"],
    );
    assert.deepEqual(
        filterModelPickerOptions(options, "codex").map((item) => item.value),
        ["gpt-5-codex"],
    );
});

test("custom model candidate is only available for new local ids", () => {
    const options = buildModelPickerOptions({
        channelMode: "local",
        models: ["gpt-image-2"],
    });

    assert.equal(resolveCustomModelCandidate("  gemini-3-pro  ", options, true), "gemini-3-pro");
    assert.equal(resolveCustomModelCandidate("GPT-IMAGE-2", options, true), "");
    assert.equal(resolveCustomModelCandidate("gemini-3-pro", options, false), "");
});
