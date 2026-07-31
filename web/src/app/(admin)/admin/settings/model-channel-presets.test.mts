import assert from "node:assert/strict";
import test from "node:test";

import { applyModelChannelPreset, XINGLIAN_MODELS } from "./model-channel-presets.ts";

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
