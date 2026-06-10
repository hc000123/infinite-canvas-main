import assert from "node:assert/strict";
import test from "node:test";

import { classifyAiModels, defaultConfig, resolveEffectiveConfig } from "./use-config-store.ts";

test("classifies nano banana models as image models", () => {
    const result = classifyAiModels(["nano-banana-pro", "nano-banana-2", "gemini-3.1-pro-preview"]);

    assert.deepEqual(result.imageModels, ["nano-banana-pro", "nano-banana-2"]);
    assert.deepEqual(result.textModels, ["gemini-3.1-pro-preview"]);
});

test("keeps remote default video model visible when it is missing from available models", () => {
    const result = resolveEffectiveConfig(
        { ...defaultConfig, channelMode: "remote" },
        {
            availableModels: ["gpt-image-2", "gemini-3.1-pro-preview"],
            modelCosts: [],
            defaultModel: "gpt-image-2",
            defaultImageModel: "gpt-image-2",
            defaultVideoModel: "doubao-seedance-2-0-260128",
            defaultTextModel: "gemini-3.1-pro-preview",
            systemPrompt: "",
            allowCustomChannel: true,
        },
    );

    assert.equal(result.videoModel, "doubao-seedance-2-0");
    assert.deepEqual(result.videoModels, ["doubao-seedance-2-0"]);
});

test("does not leak stale local seedance model into remote video models", () => {
    const result = resolveEffectiveConfig(
        { ...defaultConfig, channelMode: "remote", seedanceModel: "chat_fast_video", videoModel: "chat_fast_video" },
        {
            availableModels: ["gpt-image-2", "gemini-3.1-pro-preview", "doubao-seedance-2-0"],
            modelCosts: [],
            defaultModel: "gpt-image-2",
            defaultImageModel: "gpt-image-2",
            defaultVideoModel: "doubao-seedance-2-0",
            defaultTextModel: "gemini-3.1-pro-preview",
            systemPrompt: "",
            allowCustomChannel: true,
        },
    );

    assert.equal(result.videoModel, "doubao-seedance-2-0");
    assert.equal(result.seedanceModel, "doubao-seedance-2-0");
    assert.deepEqual(result.videoModels, ["doubao-seedance-2-0"]);
});
