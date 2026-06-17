import assert from "node:assert/strict";
import test from "node:test";

import { classifyAiModels, defaultConfig, resolveEffectiveConfig, resolveSeedanceRequestModel, textModelEndpointType } from "./use-config-store.ts";

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
            modelTextEndpoints: [],
            defaultModel: "gpt-image-2",
            defaultImageModel: "gpt-image-2",
            defaultVideoModel: "doubao-seedance-2-0-260128",
            defaultTextModel: "gemini-3.1-pro-preview",
            systemPrompt: "",
            allowCustomChannel: true,
        },
    );

    assert.equal(result.videoModel, "doubao-seedance-2-0-260128");
    assert.deepEqual(result.videoModels, ["doubao-seedance-2-0-260128"]);
});

test("falls back to backend channel when public model channel is unavailable", () => {
    const result = resolveEffectiveConfig({ ...defaultConfig, channelMode: "local", videoProtocol: "volcengine-ark" }, null);

    assert.equal(result.channelMode, "remote");
    assert.equal(result.videoProtocol, "volcengine-ark");
});

test("drops stale local seedance selection while keeping backend video models visible", () => {
    const result = resolveEffectiveConfig(
        { ...defaultConfig, channelMode: "remote", seedanceModel: "chat_fast_video", videoModel: "chat_fast_video" },
        {
            availableModels: ["gpt-image-2", "gemini-3.1-pro-preview", "doubao-seedance-2-0"],
            modelCosts: [],
            modelTextEndpoints: [],
            modelProtocols: [{ model: "doubao-seedance-2-0", protocol: "volcengine-ark" }],
            defaultModel: "gpt-image-2",
            defaultImageModel: "gpt-image-2",
            defaultVideoModel: "doubao-seedance-2-0",
            defaultTextModel: "gemini-3.1-pro-preview",
            systemPrompt: "",
            allowCustomChannel: true,
        },
    );

    assert.equal(result.videoModel, "doubao-seedance-2-0");
    assert.equal(result.videoProtocol, "volcengine-ark");
    assert.equal(result.seedanceModel, "doubao-seedance-2-0");
    assert.deepEqual(result.videoModels, ["doubao-seedance-2-0"]);
    assert.deepEqual(result.modelProtocols, [{ model: "doubao-seedance-2-0", protocol: "volcengine-ark" }]);
});

test("clears stale local seedance endpoint when backend channel controls video model", () => {
    const result = resolveEffectiveConfig(
        { ...defaultConfig, channelMode: "remote", videoProtocol: "volcengine-ark", seedanceEndpointId: "Seedance 2.0", seedanceModel: "Seedance 2.0", videoModel: "Seedance 2.0" },
        {
            availableModels: ["gpt-image-2", "doubao-seedance-2-0"],
            modelCosts: [],
            modelTextEndpoints: [],
            modelProtocols: [{ model: "doubao-seedance-2-0", protocol: "volcengine-ark" }],
            defaultModel: "gpt-image-2",
            defaultImageModel: "gpt-image-2",
            defaultVideoModel: "doubao-seedance-2-0",
            defaultTextModel: "gpt-image-2",
            systemPrompt: "",
            allowCustomChannel: true,
        },
    );

    assert.equal(result.videoModel, "doubao-seedance-2-0");
    assert.equal(result.seedanceModel, "doubao-seedance-2-0");
    assert.equal(result.seedanceEndpointId, "");
    assert.equal(resolveSeedanceRequestModel(result), "doubao-seedance-2-0");
});

test("uses enterprise Ark endpoint before visible Seedance model for video requests", () => {
    assert.equal(
        resolveSeedanceRequestModel({
            seedanceEndpointId: "ep-enterprise",
            seedanceModel: "doubao-seedance-2-0",
            videoModel: "grok-imagine-video",
            model: "gpt-5.5",
        }),
        "ep-enterprise",
    );
});

test("keeps all backend video routes visible without mixing image and text models", () => {
    const result = resolveEffectiveConfig(
        {
            ...defaultConfig,
            channelMode: "remote",
            videoModel: "relay-i2v-main",
        },
        {
            availableModels: ["gpt-image-2", "relay-i2v-main", "doubao-seedance-2-0", "gpt-5.5"],
            modelCosts: [],
            modelTextEndpoints: [],
            modelProtocols: [
                { model: "relay-i2v-main", protocol: "openai" },
                { model: "doubao-seedance-2-0", protocol: "volcengine-ark" },
            ],
            modelCapabilities: [
                { model: "gpt-image-2", capabilities: ["image"] },
                { model: "relay-i2v-main", capabilities: ["video"] },
                { model: "doubao-seedance-2-0", capabilities: ["video"] },
                { model: "gpt-5.5", capabilities: ["text"] },
            ],
            defaultModel: "gpt-5.5",
            defaultImageModel: "gpt-image-2",
            defaultVideoModel: "doubao-seedance-2-0",
            defaultTextModel: "gpt-5.5",
            systemPrompt: "",
            allowCustomChannel: true,
        },
    );

    assert.equal(result.videoModel, "relay-i2v-main");
    assert.equal(result.videoProtocol, "openai");
    assert.deepEqual(result.videoModels, ["doubao-seedance-2-0", "relay-i2v-main"]);
    assert.deepEqual(result.imageModels, ["gpt-image-2"]);
    assert.deepEqual(result.textModels, ["gpt-5.5"]);
});

test("uses model kind before broad channel capabilities", () => {
    const result = resolveEffectiveConfig(
        { ...defaultConfig, channelMode: "remote" },
        {
            availableModels: ["gemini-3.1-flash-image-preview", "gpt-image-2-all", "gemini-3.1-pro-preview", "gpt-5.5-pro", "doubao-seedance-2-0", "relay-i2v-main"],
            modelCosts: [],
            modelTextEndpoints: [
                { model: "gemini-3.1-flash-image-preview", endpointType: "chat_completions" },
                { model: "gemini-3.1-pro-preview", endpointType: "chat_completions" },
            ],
            modelProtocols: [
                { model: "doubao-seedance-2-0", protocol: "volcengine-ark" },
                { model: "relay-i2v-main", protocol: "openai" },
            ],
            modelCapabilities: [
                { model: "gemini-3.1-flash-image-preview", capabilities: ["text", "image"] },
                { model: "gpt-image-2-all", capabilities: ["text", "image"] },
                { model: "gemini-3.1-pro-preview", capabilities: ["text", "image"] },
                { model: "gpt-5.5-pro", capabilities: ["text", "image"] },
                { model: "doubao-seedance-2-0", capabilities: ["text", "video"] },
                { model: "relay-i2v-main", capabilities: ["video"] },
            ],
            defaultModel: "gpt-5.5-pro",
            defaultImageModel: "gpt-image-2-all",
            defaultVideoModel: "doubao-seedance-2-0",
            defaultTextModel: "gemini-3.1-pro-preview",
            systemPrompt: "",
            allowCustomChannel: true,
        },
    );

    assert.deepEqual(result.imageModels, ["gpt-image-2-all", "gemini-3.1-flash-image-preview"]);
    assert.deepEqual(result.videoModels, ["doubao-seedance-2-0", "relay-i2v-main"]);
    assert.equal(result.model, "gemini-3.1-pro-preview");
    assert.deepEqual(result.textModels, ["gemini-3.1-pro-preview", "gpt-5.5-pro"]);
    assert.deepEqual(result.modelTextEndpoints, [
        { model: "gemini-3.1-pro-preview", endpointType: "chat_completions" },
        { model: "gpt-5.5-pro", endpointType: "responses" },
    ]);
});

test("keeps available local model selections before backend defaults", () => {
    const result = resolveEffectiveConfig(
        {
            ...defaultConfig,
            channelMode: "remote",
            imageModel: "gemini-3.1-flash-image-preview",
            videoModel: "doubao-seedance-2-0-fast",
            textModel: "gemini-3.1-pro-preview",
        },
        {
            availableModels: ["gemini-3.1-flash-image-preview", "gpt-image-2", "gemini-3.1-pro-preview", "gpt-5.5-pro", "doubao-seedance-2-0", "doubao-seedance-2-0-fast"],
            modelCosts: [],
            modelTextEndpoints: [{ model: "gemini-3.1-pro-preview", endpointType: "chat_completions" }],
            defaultModel: "gpt-image-2",
            defaultImageModel: "gpt-image-2",
            defaultVideoModel: "doubao-seedance-2-0",
            defaultTextModel: "gpt-5.5-pro",
            systemPrompt: "",
            allowCustomChannel: true,
        },
    );

    assert.equal(result.imageModel, "gemini-3.1-flash-image-preview");
    assert.equal(result.videoModel, "doubao-seedance-2-0-fast");
    assert.equal(result.textModel, "gemini-3.1-pro-preview");
    assert.equal(textModelEndpointType(result, "gpt-5.5-pro"), "responses");
    assert.equal(textModelEndpointType(result, "gemini-3.1-pro-preview"), "chat_completions");
    assert.deepEqual(
        result.modelTextEndpoints.filter((item) => item.model === "gpt-5.5-pro" || item.model === "gemini-3.1-pro-preview"),
        [
            { model: "gemini-3.1-pro-preview", endpointType: "chat_completions" },
            { model: "gpt-5.5-pro", endpointType: "responses" },
        ],
    );
});

test("falls back to backend defaults when local selections are no longer available", () => {
    const result = resolveEffectiveConfig(
        {
            ...defaultConfig,
            channelMode: "remote",
            imageModel: "old-image-model",
            textModel: "old-text-model",
        },
        {
            availableModels: ["gpt-image-2", "gemini-3.1-pro-preview", "gpt-5.5-pro"],
            modelCosts: [],
            modelTextEndpoints: [],
            defaultModel: "gpt-image-2",
            defaultImageModel: "gpt-image-2",
            defaultVideoModel: "",
            defaultTextModel: "gpt-5.5-pro",
            systemPrompt: "",
            allowCustomChannel: true,
        },
    );

    assert.equal(result.imageModel, "gpt-image-2");
    assert.equal(result.textModel, "gpt-5.5-pro");
});
