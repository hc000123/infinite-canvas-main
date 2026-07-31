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

test("model options summarize sources and video credit costs without changing the value", () => {
    const [option] = buildModelPickerOptions({
        models: ["video-one"],
        modelSources: [
            { model: "video-one", channelId: "a", channelName: "渠道 A", protocol: "openai" },
            { model: "video-one", channelId: "b", channelName: "渠道 B", protocol: "openai" },
        ],
        modelCosts: [{ model: "video-one", credits: 18 }],
        modelCapabilities: [{ model: "video-one", capabilities: ["video"] }],
    });

    assert.equal(option.value, "video-one");
    assert.equal(option.sourceLabel, "2 个渠道");
    assert.equal(option.costLabel, "18 算力点/秒");
    assert.match(option.searchText, /渠道 a/);
    assert.match(option.searchText, /openai 兼容/);
});

test("model options distinguish free models from models without a cost", () => {
    const options = buildModelPickerOptions({
        models: ["free-image", "unknown-text"],
        modelCosts: [{ model: "free-image", credits: 0 }],
        modelCapabilities: [
            { model: "free-image", capabilities: ["image"] },
            { model: "unknown-text", capabilities: ["text"] },
        ],
    });

    assert.equal(options[0].costLabel, "0 算力点/张");
    assert.equal(options[1].costLabel, "");
});

test("model options show a single channel name", () => {
    const [option] = buildModelPickerOptions({
        models: ["custom-model"],
        modelSources: [{ model: "custom-model", channelId: "channel-a", channelName: "渠道 A", protocol: "openai" }],
    });

    assert.equal(option.sourceLabel, "渠道 A");
});

test("model options deduplicate repeated sources by channel and protocol", () => {
    const [option] = buildModelPickerOptions({
        models: ["custom-model"],
        modelSources: [
            { model: "custom-model", channelId: "channel-a", channelName: "渠道 A", protocol: "openai" },
            { model: "custom-model", channelId: "channel-a", channelName: "渠道 A 副本", protocol: "openai" },
        ],
    });

    assert.equal(option.sourceLabel, "渠道 A");
});
