import assert from "node:assert/strict";
import test from "node:test";

import { buildAiModelCatalog, modelsForCapability, protocolForModel, resolveGenerationModel } from "./ai-model-catalog.ts";
import { modelMatchesAiCapability } from "./ai-model-kind.ts";

const config = {
    model: "text-default",
    imageModel: "image-default",
    videoModel: "video-default",
    textModel: "text-default",
    models: ["image-default", "video-default", "video-alt", "text-default"],
    imageModels: ["image-default"],
    videoModels: ["video-default", "video-alt"],
    textModels: ["text-default"],
    modelCapabilities: [
        { model: "image-default", capabilities: ["image"] },
        { model: "video-default", capabilities: ["video"] },
        { model: "video-alt", capabilities: ["video"] },
        { model: "text-default", capabilities: ["text"] },
    ],
    modelProtocols: [
        { model: "video-default", protocol: "volcengine-ark" },
        { model: "video-alt", protocol: "xinglian-cloud" },
    ],
    modelSources: [{ model: "video-alt", channelId: "xinglian", channelName: "星链云", protocol: "xinglian-cloud" }],
    modelTextEndpoints: [{ model: "text-default", endpointType: "responses" }],
    videoProtocol: "openai",
} as const;

test("explicit single capability overrides a misleading model name", () => {
    assert.equal(modelMatchesAiCapability("video-named-text-model", ["text"], "text"), true);
    assert.equal(modelMatchesAiCapability("video-named-text-model", ["text"], "video"), false);
});

test("builds one catalog entry per public model", () => {
    const catalog = buildAiModelCatalog(config);
    assert.deepEqual(catalog.map((item) => item.id), config.models);
    assert.deepEqual(catalog.find((item) => item.id === "video-alt"), {
        id: "video-alt",
        capabilities: ["video"],
        protocol: "xinglian-cloud",
        sources: [{ model: "video-alt", channelId: "xinglian", channelName: "星链云", protocol: "xinglian-cloud" }],
    });
});

test("filters models by the catalog capability", () => {
    assert.deepEqual(modelsForCapability(config, "image"), ["image-default"]);
    assert.deepEqual(modelsForCapability(config, "video"), ["video-default", "video-alt"]);
    assert.deepEqual(modelsForCapability(config, "text"), ["text-default"]);
});

test("resolves node then project then system model while rejecting wrong capabilities", () => {
    assert.equal(resolveGenerationModel({ config, capability: "video", nodeModel: "video-alt", projectModel: "video-default" }), "video-alt");
    assert.equal(resolveGenerationModel({ config, capability: "video", nodeModel: "image-default", projectModel: "video-alt" }), "video-alt");
    assert.equal(resolveGenerationModel({ config, capability: "video", nodeModel: "missing", projectModel: "missing" }), "video-default");
    assert.equal(resolveGenerationModel({ config: { ...config, models: [], videoModels: [], videoModel: "" }, capability: "video" }), "");
});

test("resolves video protocol only from the selected model mapping", () => {
    assert.equal(protocolForModel(config, "video-alt"), "xinglian-cloud");
    assert.equal(protocolForModel(config, "video-default"), "volcengine-ark");
    assert.equal(protocolForModel(config, "unmapped"), "openai");
});
