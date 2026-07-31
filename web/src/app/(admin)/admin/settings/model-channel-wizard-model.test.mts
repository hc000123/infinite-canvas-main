import assert from "node:assert/strict";
import test from "node:test";

import {
    applyWizardPublication,
    buildWizardChannel,
    channelVerificationCopy,
    channelVerificationMode,
    createChannelVerificationCoordinator,
    filterWizardPublicationSnapshot,
    normalizeWizardModels,
    runChannelVerification,
} from "./model-channel-wizard-model.ts";
import type { AdminModelChannel, AdminPublicModelChannelSettings } from "../../../../services/api/admin.ts";
import { sanitizeModelChannelPublication } from "./model-channel-publication.ts";

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
    assert.equal(result.defaultModel, "");
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

    let result: AdminPublicModelChannelSettings | undefined;
    assert.doesNotThrow(() => {
        result = filterWizardPublicationSnapshot(override, [channel({
            models: ["text-a", "image-a", "video-a"],
            capabilities: ["text", "image", "video"],
        })]);
    });

    assert.deepEqual(result, {
        ...override,
        availableModels: ["text-a", "image-a", "video-a"],
        modelTextEndpoints: [{ model: "text-a", endpointType: "responses" }],
    });
});

test("删除唯一渠道会清空公开模型、文本端点与三类默认模型", () => {
    const result = filterWizardPublicationSnapshot(publication({
        availableModels: ["text-a", "image-a", "video-a"],
        modelCosts: [{ model: "video-a", credits: 8 }],
        modelTextEndpoints: [{ model: "text-a", endpointType: "responses" }],
        defaultModel: "legacy-model",
        defaultTextModel: "text-a",
        defaultImageModel: "image-a",
        defaultVideoModel: "video-a",
    }), []);

    assert.deepEqual(result.availableModels, []);
    assert.deepEqual(result.modelTextEndpoints, []);
    assert.equal(result.defaultTextModel, "");
    assert.equal(result.defaultImageModel, "");
    assert.equal(result.defaultVideoModel, "");
    assert.equal(result.defaultModel, "");
    assert.deepEqual(result.modelCosts, [{ model: "video-a", credits: 8 }]);
});

test("普通保存的显式空公开集合会清空所有默认模型和历史文本端点", () => {
    const result = sanitizeModelChannelPublication(publication({
        availableModels: [],
        modelTextEndpoints: [{ model: "legacy-text", endpointType: "responses" }],
        defaultModel: "legacy-text",
        defaultTextModel: "legacy-text",
        defaultImageModel: "legacy-image",
        defaultVideoModel: "legacy-video",
    }), [channel({ models: ["legacy-text", "legacy-image", "legacy-video"], capabilities: ["text", "image", "video"] })]);

    assert.deepEqual(result.availableModels, []);
    assert.deepEqual(result.modelTextEndpoints, []);
    assert.equal(result.defaultModel, "");
    assert.equal(result.defaultTextModel, "");
    assert.equal(result.defaultImageModel, "");
    assert.equal(result.defaultVideoModel, "");
});

test("同名 sibling 仍提供 text 能力时保留文本默认和端点", () => {
    const result = sanitizeModelChannelPublication(publication({
        availableModels: ["shared-model"],
        modelTextEndpoints: [{ model: "shared-model", endpointType: "responses" }],
        defaultTextModel: "shared-model",
        defaultImageModel: "shared-model",
    }), [
        channel({ id: "image-channel", models: ["shared-model"], capabilities: ["image"] }),
        channel({ id: "text-sibling", models: ["shared-model"], capabilities: ["text"] }),
    ]);

    assert.deepEqual(result.modelTextEndpoints, [{ model: "shared-model", endpointType: "responses" }]);
    assert.equal(result.defaultTextModel, "shared-model");
    assert.equal(result.defaultImageModel, "shared-model");
});

test("公开清洗忽略缺少连接凭证的渠道但保留即梦 CLI", () => {
    const result = sanitizeModelChannelPublication(publication({
        availableModels: ["unroutable-text", "seedance2.0fast"],
        modelTextEndpoints: [{ model: "unroutable-text", endpointType: "responses" }],
        defaultTextModel: "unroutable-text",
        defaultVideoModel: "seedance2.0fast",
    }), [
        channel({ id: "missing-key", apiKey: "", models: ["unroutable-text"], capabilities: ["text"] }),
        channel({ id: "jimeng", protocol: "jimeng-cli", baseUrl: "", apiKey: "", models: ["seedance2.0fast"], capabilities: ["video"] }),
    ]);

    assert.deepEqual(result.availableModels, ["seedance2.0fast"]);
    assert.deepEqual(result.modelTextEndpoints, []);
    assert.equal(result.defaultTextModel, "");
    assert.equal(result.defaultVideoModel, "seedance2.0fast");
});

test("同名模型只剩 image 来源时清理文本默认并保留图片默认", () => {
    let result: AdminPublicModelChannelSettings | undefined;
    assert.doesNotThrow(() => {
        result = filterWizardPublicationSnapshot(publication({
            availableModels: ["shared-model"],
            modelTextEndpoints: [{ model: "shared-model", endpointType: "responses" }],
            defaultTextModel: "shared-model",
            defaultImageModel: "shared-model",
        }), [channel({ id: "image-only", models: ["shared-model"], capabilities: ["image"] })]);
    });

    assert.deepEqual(result?.availableModels, ["shared-model"]);
    assert.deepEqual(result?.modelTextEndpoints, []);
    assert.equal(result?.defaultTextModel, "");
    assert.equal(result?.defaultImageModel, "shared-model");
});

test("检测协调器隔离重置前后的同名请求", () => {
    const coordinator = createChannelVerificationCoordinator();
    const videoChannel = channel({ id: "video-channel", capabilities: ["video"] });
    const requestA = coordinator.begin(0, videoChannel, ["video-a"]);
    assert.ok(requestA);
    assert.equal(coordinator.begin(0, videoChannel, ["video-a"]), null);

    coordinator.reset();
    assert.equal(coordinator.isCurrent(requestA, 0, videoChannel.id), false);
    const requestB = coordinator.begin(0, videoChannel, ["video-a"]);
    assert.ok(requestB);
    assert.equal(coordinator.finish(requestA), false);
    assert.equal(coordinator.begin(0, videoChannel, ["video-b"]), null);
    assert.equal(coordinator.isCurrent(requestB, 0, videoChannel.id), true);
});

test("检测协调器按渠道锁连接检测并按模型锁其他检测", () => {
    const coordinator = createChannelVerificationCoordinator();
    const videoChannel = channel({ id: "video-channel", capabilities: ["video"] });
    assert.ok(coordinator.begin(0, videoChannel, ["video-a"]));
    assert.equal(coordinator.begin(0, videoChannel, ["video-b"]), null);

    const textChannel = channel({ id: "text-channel", capabilities: ["text"] });
    assert.ok(coordinator.begin(1, textChannel, ["text-a"]));
    assert.equal(coordinator.begin(1, textChannel, ["text-a"]), null);
    assert.ok(coordinator.begin(1, textChannel, ["text-b"]));
});
