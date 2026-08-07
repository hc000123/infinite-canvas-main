import assert from "node:assert/strict";
import test from "node:test";

import { applyModelChannelPreset, JIMENG_MODELS, MODEL_CHANNEL_PRESETS, VOLCENGINE_ARK_MODELS, XINGLIAN_MODELS } from "./model-channel-presets.ts";

function emptySettings() {
    return {
        public: {
            modelChannel: {
                availableModels: [],
                modelCosts: [],
                modelTextEndpoints: [],
                defaultModel: "",
                defaultImageModel: "",
                defaultVideoModel: "",
                defaultTextModel: "",
                systemPrompt: "",
                allowCustomChannel: false,
            },
            auth: { allowRegister: true },
            volcengineAsset: { enabled: false },
        },
        private: {
            channels: [],
            promptSync: { enabled: false, cron: "*/5 * * * *" },
            auth: {},
            volcengineAsset: { enabled: false, accessKey: "", secretKey: "", accessKeyConfigured: false, secretKeyConfigured: false, projectName: "default", region: "cn-beijing", assetGroupId: "", publicAssetBaseUrl: "" },
        },
    };
}

function channel(overrides = {}) {
    return {
        id: "channel",
        protocol: "openai",
        name: "Channel",
        baseUrl: "https://example.com/v1",
        apiKey: "********",
        cliPath: "",
        workDir: "",
        outputDir: "",
        timeoutSeconds: 0,
        sessionId: 0,
        concurrencyLimit: 1,
        endpointId: "",
        endpointMappings: [],
        models: [],
        capabilities: ["text"],
        environment: "prod",
        weight: 1,
        enabled: true,
        remark: "",
        ...overrides,
    };
}

test("applies all Xinglian models idempotently without changing billing or defaults", () => {
    const initial = emptySettings();
    initial.public.modelChannel.defaultVideoModel = "existing-video";
    initial.public.modelChannel.modelCosts = [{ model: "sd2-720p-mini", credits: 18 }];
    initial.public.modelChannel.availableModels = ["existing-video"];
    initial.private.channels = [channel({ id: "existing-video", models: ["existing-video"], capabilities: ["video"] })];
    const first = applyModelChannelPreset(initial, "xinglian", { apiKey: "new-key" });
    const second = applyModelChannelPreset(first.settings, "xinglian", { apiKey: "" });
    const channels = second.settings.private.channels.filter((item) => item.id === "xinglian-cloud");

    assert.equal(channels.length, 1);
    assert.deepEqual(channels[0].models, XINGLIAN_MODELS);
    assert.equal(channels[0].apiKey, "new-key");
    assert.equal(second.settings.public.modelChannel.defaultVideoModel, "existing-video");
    assert.deepEqual(second.settings.public.modelChannel.modelCosts, [{ model: "sd2-720p-mini", credits: 18 }]);
});

test("migrates an existing Ark provider channel and preserves its key and EP", () => {
    const settings = emptySettings();
    settings.private.channels = [
        channel({
            id: "api",
            name: "企业 API",
            protocol: "volcengine-ark",
            baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
            models: ["doubao-seedance-2-0"],
            capabilities: ["video"],
            endpointId: "ep-existing",
            endpointMappings: [{ model: "doubao-seedance-2-0", endpointId: "ep-existing" }],
        }),
    ];

    const result = applyModelChannelPreset(settings, "volcengine", {});
    const channels = result.settings.private.channels.filter((item) => item.protocol === "volcengine-ark");

    assert.equal(channels.length, 1);
    assert.equal(channels[0].id, "volcengine-seedance");
    assert.equal(channels[0].apiKey, "********");
    assert.deepEqual(channels[0].endpointMappings, [{ model: "doubao-seedance-2-0", endpointId: "ep-existing" }]);
    assert.deepEqual(channels[0].models, [VOLCENGINE_ARK_MODELS.seedance20]);
});

test("adds an independent Seedance 2.5 mapping to an existing Ark channel", () => {
    const settings = emptySettings();
    settings.private.channels = [channel({
        id: "volcengine-seedance",
        protocol: "volcengine-ark",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        endpointId: "ep-20-existing",
        endpointMappings: [{ model: VOLCENGINE_ARK_MODELS.seedance20, endpointId: "ep-20-existing" }],
    })];

    const result = applyModelChannelPreset(settings, "volcengine", { seedance25EndpointId: "ep-25-new" });
    const saved = result.settings.private.channels[0];

    assert.deepEqual(saved.endpointMappings, [
        { model: VOLCENGINE_ARK_MODELS.seedance20, endpointId: "ep-20-existing" },
        { model: VOLCENGINE_ARK_MODELS.seedance25, endpointId: "ep-25-new" },
    ]);
    assert.deepEqual(saved.models, [VOLCENGINE_ARK_MODELS.seedance20, VOLCENGINE_ARK_MODELS.seedance25]);
    assert.equal(saved.endpointId, "ep-20-existing");
});

test("does not create a Seedance 2.5 model when only a new 2.0 EP is configured", () => {
    const result = applyModelChannelPreset(emptySettings(), "volcengine", { apiKey: "ark-key", endpointId: "ep-20-new" });
    const saved = result.settings.private.channels[0];

    assert.deepEqual(saved.endpointMappings, [{ model: VOLCENGINE_ARK_MODELS.seedance20, endpointId: "ep-20-new" }]);
    assert.deepEqual(saved.models, [VOLCENGINE_ARK_MODELS.seedance20]);
});

test("preserves an existing Seedance 2.5 mapping when its input is left blank", () => {
    const settings = emptySettings();
    settings.private.channels = [channel({
        id: "volcengine-seedance",
        protocol: "volcengine-ark",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        endpointId: "ep-20-existing",
        endpointMappings: [
            { model: VOLCENGINE_ARK_MODELS.seedance20, endpointId: "ep-20-existing" },
            { model: VOLCENGINE_ARK_MODELS.seedance25, endpointId: "ep-25-existing" },
        ],
    })];

    const result = applyModelChannelPreset(settings, "volcengine", {});

    assert.deepEqual(result.settings.private.channels[0].endpointMappings, [
        { model: VOLCENGINE_ARK_MODELS.seedance20, endpointId: "ep-20-existing" },
        { model: VOLCENGINE_ARK_MODELS.seedance25, endpointId: "ep-25-existing" },
    ]);
});

test("keeps Jimeng advanced runtime settings", () => {
    const settings = emptySettings();
    settings.private.channels = [channel({ id: "jimeng-video", protocol: "jimeng-cli", baseUrl: "", apiKey: "", cliPath: "/custom/dreamina", outputDir: "/custom/output", workDir: "/custom/work", timeoutSeconds: 420, sessionId: 7, concurrencyLimit: 1 })];

    const result = applyModelChannelPreset(settings, "jimeng", {});
    const saved = result.settings.private.channels.find((item) => item.id === "jimeng-video");

    assert.equal(saved?.cliPath, "/custom/dreamina");
    assert.equal(saved?.outputDir, "/custom/output");
    assert.equal(saved?.workDir, "/custom/work");
    assert.equal(saved?.timeoutSeconds, 420);
    assert.equal(saved?.sessionId, 7);
    assert.deepEqual(saved?.models, JIMENG_MODELS);
    assert.equal(saved?.models.includes("seedance2.5"), true);
});

test("Jimeng 预设明确由普通用户在个人配置完成网页登录", () => {
    const description = MODEL_CHANNEL_PRESETS.find((item) => item.id === "jimeng")?.description || "";

    assert.match(description, /普通用户/);
    assert.match(description, /个人配置/);
    assert.match(description, /网页登录/);
    assert.match(description, /六个模型/);
    assert.doesNotMatch(description, /渠道编辑/);
});

test("splits legacy Comfly models by capability and disables the mixed channel", () => {
    const settings = emptySettings();
    settings.private.channels = [channel({ id: "comfly", name: "中转 comfly", baseUrl: "https://ai.comfly.org", models: ["gpt-5.5", "gpt-image-2-all", "veo3.1"], capabilities: ["text", "image"] })];

    const result = applyModelChannelPreset(settings, "comfly", {});

    assert.deepEqual(result.settings.private.channels.find((item) => item.id === "comfly-text")?.capabilities, ["text"]);
    assert.deepEqual(result.settings.private.channels.find((item) => item.id === "comfly-image")?.capabilities, ["image"]);
    assert.deepEqual(result.settings.private.channels.find((item) => item.id === "comfly-video")?.capabilities, ["video", "video_query"]);
    assert.equal(result.settings.private.channels.find((item) => item.id === "comfly")?.enabled, false);
    assert.equal(result.settings.private.channels.find((item) => item.id === "comfly-text")?.apiKey, "********");
});

test("keeps publication explicit while removing models that no enabled channel serves", () => {
    const settings = emptySettings();
    settings.public.modelChannel.availableModels = ["kept-model", "stale-model"];
    settings.private.channels = [
        channel({ id: "kept", models: ["kept-model"], enabled: true }),
        channel({ id: "disabled", models: ["stale-model"], enabled: false }),
    ];

    const result = applyModelChannelPreset(settings, "xinglian", { apiKey: "key" });

    assert.deepEqual(result.settings.public.modelChannel.availableModels, ["kept-model"]);
    assert.equal(result.settings.public.modelChannel.availableModels.includes("sd2-720p-fast"), false);
    assert.deepEqual(result.summary.publishedModels, ["kept-model"]);
});

test("requires credentials for a new provider but accepts saved masked credentials", () => {
    assert.throws(() => applyModelChannelPreset(emptySettings(), "xinglian", {}), /API Key/);
    const configured = emptySettings();
    configured.private.channels = [channel({ id: "xinglian-cloud", protocol: "xinglian-cloud", baseUrl: "https://www.vjimeng.vip/v1", models: ["sd2-720p-fast"] })];
    assert.doesNotThrow(() => applyModelChannelPreset(configured, "xinglian", {}));
});

test("creates a generic OpenAI-compatible channel from explicit capability and models", () => {
    const result = applyModelChannelPreset(emptySettings(), "openai-compatible", {
        name: "自定义视频中转",
        baseUrl: "https://relay.example.com/v1",
        apiKey: "relay-key",
        capability: "video",
        models: ["video-one", "video-two"],
    });
    const saved = result.settings.private.channels[0];

    assert.equal(saved.protocol, "openai");
    assert.deepEqual(saved.capabilities, ["video", "video_query"]);
    assert.deepEqual(saved.models, ["video-one", "video-two"]);
    assert.equal(result.settings.public.modelChannel.availableModels.includes("video-one"), false);
});

test("replacing an Ark preset removes stale publication defaults and text endpoints", () => {
    const settings = emptySettings();
    settings.public.modelChannel.availableModels = ["old-ark-model"];
    settings.public.modelChannel.modelTextEndpoints = [{ model: "old-ark-model", endpointType: "responses" }];
    settings.public.modelChannel.defaultModel = "old-ark-model";
    settings.public.modelChannel.defaultTextModel = "old-ark-model";
    settings.public.modelChannel.defaultImageModel = "old-ark-model";
    settings.public.modelChannel.defaultVideoModel = "old-ark-model";
    settings.private.channels = [channel({
        id: "volcengine-seedance",
        protocol: "volcengine-ark",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        models: ["old-ark-model"],
        capabilities: ["text", "image", "video"],
        endpointId: "ep-old",
        endpointMappings: [{ model: "old-ark-model", endpointId: "ep-old" }],
    })];

    const result = applyModelChannelPreset(settings, "volcengine", { endpointId: "ep-new" });

    assert.deepEqual(result.settings.public.modelChannel.availableModels, []);
    assert.deepEqual(result.settings.public.modelChannel.modelTextEndpoints, []);
    assert.equal(result.settings.public.modelChannel.defaultModel, "");
    assert.equal(result.settings.public.modelChannel.defaultTextModel, "");
    assert.equal(result.settings.public.modelChannel.defaultImageModel, "");
    assert.equal(result.settings.public.modelChannel.defaultVideoModel, "");
});

test("changing a generic relay from text to image clears only invalid text publication", () => {
    const settings = emptySettings();
    settings.public.modelChannel.availableModels = ["shared-model"];
    settings.public.modelChannel.modelTextEndpoints = [{ model: "shared-model", endpointType: "responses" }];
    settings.public.modelChannel.defaultTextModel = "shared-model";
    settings.public.modelChannel.defaultImageModel = "shared-model";
    settings.private.channels = [channel({
        id: "openai-shared-relay",
        name: "Shared Relay",
        baseUrl: "https://relay.example.com/v1",
        apiKey: "saved-key",
        models: ["shared-model"],
        capabilities: ["text"],
    })];

    const result = applyModelChannelPreset(settings, "openai-compatible", {
        name: "Shared Relay",
        baseUrl: "https://relay.example.com/v1",
        capability: "image",
        models: ["shared-model"],
    });

    assert.deepEqual(result.settings.public.modelChannel.availableModels, ["shared-model"]);
    assert.deepEqual(result.settings.public.modelChannel.modelTextEndpoints, []);
    assert.equal(result.settings.public.modelChannel.defaultTextModel, "");
    assert.equal(result.settings.public.modelChannel.defaultImageModel, "shared-model");
});
