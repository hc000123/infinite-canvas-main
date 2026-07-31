import assert from "node:assert/strict";
import test from "node:test";

import {
    applyWizardPublication,
    buildWizardChannel,
    channelVerificationCopy,
    channelVerificationMode,
    filterWizardPublicationSnapshot,
    normalizeWizardModels,
    runChannelVerification,
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
        id: "   ",
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

test("显式 undefined 协议回退到现有协议或 openai", () => {
    const existingResult = buildWizardChannel(channel({ protocol: "xinglian-cloud", models: ["video-model"] }), { protocol: undefined, models: ["video-model"] });
    const newResult = buildWizardChannel(undefined, { protocol: undefined, models: ["text-model"] });

    assert.equal(existingResult.protocol, "xinglian-cloud");
    assert.equal(newResult.protocol, "openai");
});

test("渠道结果仅包含 AdminModelChannel 契约字段", () => {
    const draft = {
        models: ["text-model"],
        discoveredModels: ["discovered-model"],
        manualModels: ["manual-model"],
        publishedModels: ["text-model"],
        defaultTextModel: "text-model",
        defaultImageModel: "",
        defaultVideoModel: "",
        modelTextEndpoints: [{ model: "text-model", endpointType: "responses" }],
    } as unknown as Parameters<typeof buildWizardChannel>[1];

    assert.deepEqual(Object.keys(buildWizardChannel(undefined, draft)).sort(), Object.keys(channel()).sort());
});

test("Jimeng 渠道强制清空 baseUrl 和 apiKey", () => {
    const result = buildWizardChannel(undefined, channel({ protocol: "jimeng-cli", baseUrl: "https://should-clear.example.com", apiKey: "should-clear", models: ["jimeng-video"] }));

    assert.equal(result.baseUrl, "");
    assert.equal(result.apiKey, "");
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

    const mappingTruth = buildWizardChannel(undefined, channel({
        protocol: "volcengine-ark",
        models: ["stale-model"],
        endpointMappings: [{ model: "", endpointId: "ignored" }, { model: "ark-model", endpointId: " ep-good " }, { model: "ark-model", endpointId: "" }],
    }));
    assert.deepEqual(mappingTruth.endpointMappings, [{ model: "ark-model", endpointId: "ep-good" }]);
    assert.deepEqual(mappingTruth.models, ["ark-model"]);
    assert.throws(() => buildWizardChannel(undefined, channel({
        protocol: "volcengine-ark",
        endpointMappings: [{ model: "strict-model", endpointId: "" }, { model: "strict-model", endpointId: "ep-later" }],
    })), /strict-model.*Endpoint \/ EP/);
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

test("无关 sibling 的公开文本模型缺少端点记录时补 chat_completions", () => {
    const result = applyWizardPublication(
        publication({ availableModels: ["sibling-text"] }),
        undefined,
        channel({ id: "new", models: ["new-text"] }),
        [channel({ id: "sibling", models: ["sibling-text"] })],
        { publishedModels: [], defaultTextModel: "", defaultImageModel: "", defaultVideoModel: "", modelTextEndpoints: [] },
    );

    assert.deepEqual(result.modelTextEndpoints, [{ model: "sibling-text", endpointType: "chat_completions" }]);
});

test("本次明确公开的文本模型未指定端点时重置为 chat_completions", () => {
    const selected = channel({ id: "edited", models: ["selected-text"] });
    const result = applyWizardPublication(
        publication({ availableModels: ["selected-text"], modelTextEndpoints: [{ model: "selected-text", endpointType: "responses" }] }),
        selected,
        selected,
        [],
        { publishedModels: ["selected-text"], defaultTextModel: "", defaultImageModel: "", defaultVideoModel: "", modelTextEndpoints: [] },
    );

    assert.deepEqual(result.modelTextEndpoints, [{ model: "selected-text", endpointType: "chat_completions" }]);
});

test("渠道检测模式根据协议和视频能力选择", () => {
    assert.equal(channelVerificationMode(channel({ capabilities: ["video"] })), "connectivity");
    assert.equal(channelVerificationMode(channel({ capabilities: ["text", "video"] })), "connectivity");
    assert.equal(channelVerificationMode(channel({ protocol: "volcengine-ark" })), "preflight");
    assert.equal(channelVerificationMode(channel({ protocol: "jimeng-cli" })), "preflight");
    assert.equal(channelVerificationMode(channel({ protocol: "xinglian-cloud" })), "preflight");
    assert.equal(channelVerificationMode(channel({ capabilities: ["text"] })), "model-test");
});

test("渠道检测文案覆盖三种模式并正确标记星链与 OpenAI 视频渠道", () => {
    assert.deepEqual(channelVerificationCopy(channel({ protocol: "xinglian-cloud" })), {
        tableLabel: "视频预检",
        modalLabel: "视频预检",
        actionLabel: "预检",
        batchLabel: "批量预检",
        description: "星链云只查询 API Key 对应账户余额，不创建视频任务或扣除额度。",
    });
    assert.deepEqual(channelVerificationCopy(channel({ capabilities: ["video"] })), {
        tableLabel: "连接检测",
        modalLabel: "连接检测",
        actionLabel: "检测",
        batchLabel: "批量检测",
        description: "连接检测只读模型列表，不创建视频任务、不扣视频额度。",
    });
    assert.deepEqual(channelVerificationCopy(channel({ capabilities: ["text"] })), {
        tableLabel: "模型测试",
        modalLabel: "模型测试",
        actionLabel: "测试",
        batchLabel: "批量测试",
        description: "测试会向选中模型发送一条 hi，用于确认渠道是否有响应。",
    });
});

test("连接检测批量只连接一次且绝不测试模型", async () => {
    let connectCalls = 0;
    let testCalls = 0;

    const result = await runChannelVerification(channel({ capabilities: ["video"] }), ["video-a", "video-b"], {
        connect: async () => { connectCalls += 1; return "connected"; },
        testModel: async (model) => { testCalls += 1; return model; },
    });

    assert.equal(connectCalls, 1);
    assert.equal(testCalls, 0);
    assert.deepEqual(result.map(({ model, status, message }) => ({ model, status, message })), [
        { model: "video-a", status: "success", message: "connected" },
        { model: "video-b", status: "success", message: "connected" },
    ]);
});

test("视频预检与普通模型测试逐模型调用测试回调", async () => {
    const tested: string[] = [];
    let connectCalls = 0;
    const actions = {
        connect: async () => { connectCalls += 1; return "connected"; },
        testModel: async (model: string) => { tested.push(model); return `${model}:ok`; },
    };

    const preflight = await runChannelVerification(channel({ protocol: "volcengine-ark" }), ["ark-a", "ark-b"], actions);
    const modelTest = await runChannelVerification(channel({ capabilities: ["text"] }), ["text-a", "text-b"], actions);

    assert.equal(connectCalls, 0);
    assert.deepEqual(tested, ["ark-a", "ark-b", "text-a", "text-b"]);
    assert.deepEqual([...preflight, ...modelTest].map(({ model, status, message }) => ({ model, status, message })), [
        { model: "ark-a", status: "success", message: "ark-a:ok" },
        { model: "ark-b", status: "success", message: "ark-b:ok" },
        { model: "text-a", status: "success", message: "text-a:ok" },
        { model: "text-b", status: "success", message: "text-b:ok" },
    ]);
});

test("公开配置快照只过滤不可用模型和文本端点并保留 override 其余字段", () => {
    const override = publication({
        availableModels: ["text-a", "image-a", "video-a", "gone"],
        modelCosts: [{ model: "gone", credits: 9 }],
        modelTextEndpoints: [
            { model: "text-a", endpointType: "responses" },
            { model: "gone", endpointType: "chat_completions" },
        ],
        modelProtocols: [{ model: "text-a", protocol: "openai" }],
        modelCapabilities: [{ model: "text-a", capabilities: ["text"] }],
        modelSources: [{ model: "text-a", channelId: "channel-a", channelName: "Channel A", protocol: "openai" }],
        defaultTextModel: "text-a",
        defaultImageModel: "image-a",
        defaultVideoModel: "video-a",
        systemPrompt: "override prompt",
        allowCustomChannel: false,
    });

    const result = filterWizardPublicationSnapshot(override, ["text-a", "image-a", "video-a"], ["text-a"]);

    assert.deepEqual(result, {
        ...override,
        availableModels: ["text-a", "image-a", "video-a"],
        modelTextEndpoints: [{ model: "text-a", endpointType: "responses" }],
    });
});
