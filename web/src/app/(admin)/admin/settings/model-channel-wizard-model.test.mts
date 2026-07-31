import assert from "node:assert/strict";
import test from "node:test";

import {
    applyWizardPublication,
    buildWizardChannel,
    channelVerificationMode,
    normalizeWizardModels,
} from "./model-channel-wizard-model.ts";
import type { AdminModelChannel, AdminPublicModelChannelSettings } from "../../../../services/api/admin.ts";

const channel = (value: Partial<AdminModelChannel> = {}): AdminModelChannel => ({
    id: "channel-a",
    protocol: "openai",
    name: "Channel A",
    baseUrl: "https://api.example.com",
    apiKey: "key",
    cliPath: "",
    workDir: "",
    outputDir: "",
    timeoutSeconds: 30,
    sessionId: 0,
    concurrencyLimit: 1,
    endpointId: "",
    endpointMappings: [],
    models: [],
    capabilities: ["text"],
    environment: "dev",
    weight: 1,
    enabled: true,
    remark: "",
    ...value,
});

const publication = (value: Partial<AdminPublicModelChannelSettings> = {}): AdminPublicModelChannelSettings => ({
    availableModels: [],
    modelCosts: [],
    modelTextEndpoints: [],
    defaultModel: "",
    defaultImageModel: "",
    defaultVideoModel: "",
    defaultTextModel: "",
    systemPrompt: "keep me",
    allowCustomChannel: true,
    ...value,
});

test("发现模型和手动模型会修剪、忽略空项并稳定去重", () => {
    assert.deepEqual(normalizeWizardModels([" gpt-5.5 ", "", "gpt-5.5", "manual-model "]), ["gpt-5.5", "manual-model"]);
});

test("编辑渠道保留 id、掩码密钥、权重和备注，手动模型保持原名称", () => {
    const result = buildWizardChannel(channel({ id: "saved-id", apiKey: "saved-secret", weight: 5, remark: "existing" }), {
        id: "",
        apiKey: "********",
        models: [" Manual.Model ", "Manual.Model"],
        weight: 7,
        remark: "draft remark",
    });

    assert.equal(result.id, "saved-id");
    assert.equal(result.apiKey, "saved-secret");
    assert.equal(result.weight, 7);
    assert.equal(result.remark, "draft remark");
    assert.deepEqual(result.models, ["Manual.Model"]);
});

test("Ark 手动模型缺少 Endpoint / EP 时失败，完整映射生成模型和首个 endpointId", () => {
    const arkDraftMissingEP = channel({ protocol: "volcengine-ark", models: ["manual-seedance"], endpointMappings: [{ model: "manual-seedance", endpointId: "" }] });
    assert.throws(() => buildWizardChannel(undefined, arkDraftMissingEP), /manual-seedance.*Endpoint \/ EP/);

    const result = buildWizardChannel(undefined, channel({
        id: "",
        protocol: "volcengine-ark",
        models: [" manual-seedance ", "text-model"],
        endpointMappings: [{ model: "manual-seedance", endpointId: " ep-video " }, { model: "text-model", endpointId: "ep-text" }],
    }));
    assert.deepEqual(result.models, ["manual-seedance", "text-model"]);
    assert.deepEqual(result.endpointMappings, [{ model: "manual-seedance", endpointId: "ep-video" }, { model: "text-model", endpointId: "ep-text" }]);
    assert.equal(result.endpointId, "ep-video");

    const mappingOnly = buildWizardChannel(undefined, channel({ protocol: "volcengine-ark", models: [], endpointMappings: [{ model: "mapping-model", endpointId: "ep-mapping" }] }));
    assert.deepEqual(mappingOnly.models, ["mapping-model"]);
});

test("显式公开更新模型、默认项和文本端点，同时保留费用", () => {
    const previous = channel({ id: "edited", models: ["old-model", "shared-model"], capabilities: ["text"] });
    const next = channel({ id: "edited", models: ["shared-model", "new-model"], capabilities: ["text"] });
    const sibling = channel({ id: "sibling", models: ["shared-model", "unrelated-model"], capabilities: ["text"] });
    const result = applyWizardPublication(
        publication({
            availableModels: ["old-model", "shared-model"],
            modelCosts: [{ model: "shared-model", credits: 2 }],
            modelTextEndpoints: [{ model: "shared-model", endpointType: "chat_completions" }],
            defaultModel: "legacy-model",
            defaultTextModel: "shared-model",
        }),
        previous,
        next,
        [sibling],
        {
            publishedModels: ["new-model"],
            defaultTextModel: "new-model",
            defaultImageModel: "",
            defaultVideoModel: "",
            modelTextEndpoints: [{ model: "new-model", endpointType: "responses" }],
        },
    );

    assert.deepEqual(result.availableModels, ["shared-model", "new-model"]);
    assert.deepEqual(result.modelTextEndpoints, [
        { model: "shared-model", endpointType: "chat_completions" },
        { model: "new-model", endpointType: "responses" },
    ]);
    assert.equal(result.defaultTextModel, "new-model");
    assert.equal(result.defaultModel, "legacy-model");
    assert.deepEqual(result.modelCosts, [{ model: "shared-model", credits: 2 }]);
});

test("渠道检测模式根据协议和视频能力选择", () => {
    assert.equal(channelVerificationMode(channel({ capabilities: ["video"] })), "connectivity");
    assert.equal(channelVerificationMode(channel({ capabilities: ["text", "video"] })), "connectivity");
    assert.equal(channelVerificationMode(channel({ protocol: "volcengine-ark" })), "preflight");
    assert.equal(channelVerificationMode(channel({ protocol: "jimeng-cli" })), "preflight");
    assert.equal(channelVerificationMode(channel({ protocol: "xinglian-cloud" })), "preflight");
    assert.equal(channelVerificationMode(channel({ capabilities: ["text"] })), "model-test");
});
