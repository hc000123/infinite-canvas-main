import assert from "node:assert/strict";
import test from "node:test";

import {
    applyWizardPublication,
    buildWizardChannel,
    buildWizardProspectiveChannel,
    channelVerificationCopy,
    channelVerificationMode,
    createChannelVerificationCoordinator,
    createAuthoritativeSettingsCoordinator,
    createModelDiscoveryCoordinator,
    configuredModelsFromSettings,
    filterWizardPublicationSnapshot,
    finishAuthoritativeSettingsOperation,
    modelDiscoveryCandidates,
    normalizeWizardModels,
    runModelDiscoveryRequest,
    switchWizardProtocolCapabilities,
    syncConfiguredModelsFromAuthoritativeSettings,
    runChannelVerification,
} from "./model-channel-wizard-model.ts";
import type { AdminModelChannel, AdminPublicModelChannelSettings, AdminSettings } from "../../../../services/api/admin.ts";
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

test("专用视频协议将文本草稿能力收敛为 video 并清理文本公开项", () => {
    for (const protocol of ["jimeng-cli", "xinglian-cloud"] as const) {
        const previous = channel({ protocol: "openai", models: ["shared-model"], capabilities: ["text"] });
        const next = buildWizardChannel(previous, {
            ...previous,
            protocol,
            models: ["shared-model"],
            capabilities: ["text", "image", "video_query"],
        });
        const prospective = buildWizardProspectiveChannel(previous, {
            protocol,
            baseUrl: protocol === "xinglian-cloud" ? "https://video.example.com/v1" : "",
            apiKey: protocol === "xinglian-cloud" ? "video-key" : "",
            models: ["shared-model"],
            capabilities: ["text"],
            enabled: true,
        });

        assert.deepEqual(next.capabilities, ["video"], `${protocol} saved draft capabilities`);
        assert.deepEqual(prospective.capabilities, ["video"], `${protocol} prospective draft capabilities`);

        const result = applyWizardPublication(
            publication({
                availableModels: ["shared-model"],
                defaultTextModel: "shared-model",
                modelTextEndpoints: [{ model: "shared-model", endpointType: "responses" }],
            }),
            previous,
            next,
            [],
            { publishedModels: [], defaultTextModel: "shared-model", defaultImageModel: "", defaultVideoModel: "", modelTextEndpoints: [{ model: "shared-model", endpointType: "responses" }] },
        );

        assert.deepEqual(result.availableModels, [], `${protocol} must not auto-publish the switched model`);
        assert.equal(result.defaultTextModel, "", `${protocol} text default`);
        assert.deepEqual(result.modelTextEndpoints, [], `${protocol} text endpoints`);
    }
});

test("从专用视频协议返回时恢复原 OpenAI 和 Ark 能力草稿", () => {
    for (const editableProtocol of ["openai", "volcengine-ark"] as const) {
        const originalCapabilities = editableProtocol === "openai" ? ["text", "image"] : ["text", "video"];
        const dedicated = switchWizardProtocolCapabilities({}, editableProtocol, "jimeng-cli", originalCapabilities);
        assert.deepEqual(dedicated.capabilities, ["video"]);

        const restored = switchWizardProtocolCapabilities(dedicated.drafts, "jimeng-cli", editableProtocol, dedicated.capabilities);
        assert.deepEqual(restored.capabilities, originalCapabilities, `${editableProtocol} capability draft`);
    }
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

test("新建非 Jimeng 渠道的实时预览使用当前连接草稿并保留公开模型与默认项", () => {
    const prospective = buildWizardProspectiveChannel(channel({ id: "", baseUrl: "", apiKey: "", models: [] }), {
        protocol: "openai",
        baseUrl: "https://draft.example.com/v1",
        apiKey: "draft-key",
        models: ["draft-text"],
        capabilities: ["text"],
        enabled: true,
    });

    const result = applyWizardPublication(publication(), undefined, prospective, [], {
        publishedModels: ["draft-text"],
        defaultTextModel: "draft-text",
        defaultImageModel: "",
        defaultVideoModel: "",
        modelTextEndpoints: [{ model: "draft-text", endpointType: "responses" }],
    });

    assert.deepEqual(result.availableModels, ["draft-text"]);
    assert.equal(result.defaultTextModel, "draft-text");
    assert.deepEqual(result.modelTextEndpoints, [{ model: "draft-text", endpointType: "responses" }]);
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

test("启用但不可路由的 sibling 不应阻止取消公开模型", () => {
    const edited = channel({ id: "edited", models: ["shared-model"], capabilities: ["text"] });
    const result = applyWizardPublication(
        publication({ availableModels: ["shared-model"], defaultTextModel: "shared-model", modelTextEndpoints: [{ model: "shared-model", endpointType: "responses" }] }),
        edited,
        edited,
        [channel({ id: "unroutable", apiKey: "", models: ["shared-model"], capabilities: ["text"] })],
        { publishedModels: [], defaultTextModel: "", defaultImageModel: "", defaultVideoModel: "", modelTextEndpoints: [] },
    );

    assert.deepEqual(result.availableModels, []);
    assert.deepEqual(result.modelTextEndpoints, []);
    assert.equal(result.defaultTextModel, "");
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

test("显式多能力渠道为自定义模型保留对应默认项和文本端点", () => {
    const result = sanitizeModelChannelPublication(publication({
        availableModels: ["custom-v1"],
        modelTextEndpoints: [{ model: "custom-v1", endpointType: "responses" }],
        defaultTextModel: "custom-v1",
        defaultImageModel: "custom-v1",
    }), [channel({ models: ["custom-v1"], capabilities: ["text", "image"] })]);

    assert.deepEqual(result.availableModels, ["custom-v1"]);
    assert.deepEqual(result.modelTextEndpoints, [{ model: "custom-v1", endpointType: "responses" }]);
    assert.equal(result.defaultTextModel, "custom-v1");
    assert.equal(result.defaultImageModel, "custom-v1");
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

test("模型发现请求绑定开始时的协议和连接草稿", () => {
    const drafts = [
        channel({ protocol: "volcengine-ark" }),
        channel({ baseUrl: "https://other.example.com" }),
        channel({ apiKey: "other-key" }),
        channel({ protocol: "jimeng-cli", baseUrl: "", apiKey: "", cliPath: "/other/dreamina", sessionId: 2 }),
    ];

    drafts.forEach((changedDraft) => {
        const coordinator = createModelDiscoveryCoordinator();
        const original = channel();
        coordinator.sync(original);
        const request = coordinator.begin(original);

        assert.equal(coordinator.sync(changedDraft), true);
        assert.equal(coordinator.isCurrent(request, changedDraft), false);
    });
});

test("模型发现协调器隔离关闭重开和后发请求，稳定草稿可正常完成", () => {
    const coordinator = createModelDiscoveryCoordinator();
    const draft = channel();
    coordinator.sync(draft);
    const requestA = coordinator.begin(draft);
    const requestB = coordinator.begin(draft);

    assert.equal(coordinator.isCurrent(requestA, draft), false);
    assert.equal(coordinator.isCurrent(requestB, draft), true);

    coordinator.reset();
    assert.equal(coordinator.isCurrent(requestB, draft), false);
    coordinator.sync(draft);
    const requestC = coordinator.begin(draft);
    assert.equal(coordinator.isCurrent(requestC, draft), true);
});

test("异步发现集成只让当前请求写入局部候选和状态", async () => {
    const coordinator = createModelDiscoveryCoordinator();
    const configuredModels = ["configured-model"];
    const selectedModels = ["manual-model"];
    const original = channel();
    const changed = channel({ baseUrl: "https://changed.example.com" });
    let currentDraft = original;
    let discoveredModels = ["previous-discovery"];
    let loading = false;
    const errors: string[] = [];
    const stale = deferred<string[]>();
    const runStale = runModelDiscoveryRequest(coordinator, original, {
        discover: () => stale.promise,
        getCurrentDraft: () => currentDraft,
        setDiscoveredModels: (models) => { discoveredModels = models; },
        setLoading: (value) => { loading = value; },
        onError: (error) => { errors.push(String(error)); },
    });

    assert.equal(loading, true);
    currentDraft = changed;
    if (coordinator.sync(changed)) {
        discoveredModels = [];
        loading = false;
    }
    stale.resolve(["stale-model"]);
    await runStale;

    assert.deepEqual(modelDiscoveryCandidates(configuredModels, discoveredModels), ["configured-model"]);
    assert.equal(loading, false);
    assert.deepEqual(errors, []);

    currentDraft = original;
    coordinator.sync(original);
    const staleError = deferred<string[]>();
    const runStaleError = runModelDiscoveryRequest(coordinator, original, {
        discover: () => staleError.promise,
        getCurrentDraft: () => currentDraft,
        setDiscoveredModels: (models) => { discoveredModels = models; },
        setLoading: (value) => { loading = value; },
        onError: (error) => { errors.push(String(error)); },
    });
    currentDraft = changed;
    coordinator.sync(changed);
    discoveredModels = [];
    loading = false;
    staleError.reject(new Error("stale error"));
    await runStaleError;
    assert.deepEqual(errors, []);

    currentDraft = original;
    coordinator.sync(original);
    discoveredModels = ["completed-before-close"];
    let cleanedUp = false;
    let writesAfterCleanup = 0;
    const closing = deferred<string[]>();
    const runClosing = runModelDiscoveryRequest(coordinator, original, {
        discover: () => closing.promise,
        getCurrentDraft: () => currentDraft,
        setDiscoveredModels: (models) => { if (cleanedUp) writesAfterCleanup += 1; discoveredModels = models; },
        setLoading: (value) => { if (cleanedUp) writesAfterCleanup += 1; loading = value; },
        onSuccess: () => { if (cleanedUp) writesAfterCleanup += 1; },
        onError: (error) => { if (cleanedUp) writesAfterCleanup += 1; errors.push(String(error)); },
    });
    cleanedUp = true;
    coordinator.reset();
    discoveredModels = [];
    loading = false;
    closing.resolve(["returned-after-close"]);
    await runClosing;
    assert.deepEqual(modelDiscoveryCandidates(configuredModels, discoveredModels), ["configured-model"]);
    assert.equal(loading, false);
    assert.deepEqual(errors, []);
    assert.equal(writesAfterCleanup, 0);

    currentDraft = original;
    coordinator.sync(original);
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    const runFirst = runModelDiscoveryRequest(coordinator, original, {
        discover: () => first.promise,
        getCurrentDraft: () => currentDraft,
        setDiscoveredModels: (models) => { discoveredModels = models; },
        setLoading: (value) => { loading = value; },
    });
    const runSecond = runModelDiscoveryRequest(coordinator, original, {
        discover: () => second.promise,
        getCurrentDraft: () => currentDraft,
        setDiscoveredModels: (models) => { discoveredModels = models; },
        setLoading: (value) => { loading = value; },
    });
    first.resolve(["first-model"]);
    await runFirst;
    assert.deepEqual(discoveredModels, []);
    assert.equal(loading, true);
    second.resolve(["second-model"]);
    await runSecond;
    assert.deepEqual(modelDiscoveryCandidates(configuredModels, discoveredModels), ["configured-model", "second-model"]);
    assert.deepEqual(configuredModels, ["configured-model"]);
    assert.deepEqual(selectedModels, ["manual-model"]);
    assert.equal(loading, false);
});

test("基础候选只跟随权威保存响应，取消和保存失败不泄漏草稿，删除后可收缩", async () => {
    const coordinator = createAuthoritativeSettingsCoordinator();
    let configuredModels: string[] = [];
    const saved = settingsWithChannels([channel({ models: ["saved-model"] })]);
    await syncConfiguredModelsFromAuthoritativeSettings(coordinator, async () => saved, (models) => { configuredModels = models; });
    assert.deepEqual(configuredModels, ["saved-model"]);

    const cancelledDraft = channel({ models: ["cancelled-draft-model"] });
    assert.deepEqual(modelDiscoveryCandidates(configuredModels, cancelledDraft.models), ["saved-model", "cancelled-draft-model"]);
    assert.deepEqual(configuredModels, ["saved-model"]);

    await assert.rejects(
        syncConfiguredModelsFromAuthoritativeSettings(coordinator, async () => { throw new Error("save failed"); }, (models) => { configuredModels = models; }),
        /save failed/,
    );
    assert.deepEqual(configuredModels, ["saved-model"]);

    const afterDelete = settingsWithChannels([]);
    afterDelete.public.modelChannel.modelCosts = [{ model: "saved-model", credits: 10 }];
    await syncConfiguredModelsFromAuthoritativeSettings(coordinator, async () => afterDelete, (models) => { configuredModels = models; });
    assert.deepEqual(configuredModels, []);
    assert.deepEqual(configuredModelsFromSettings(afterDelete), []);
});

test("权威设置只允许最新操作更新模型和页面状态", async () => {
    const coordinator = createAuthoritativeSettingsCoordinator();
    const oldLoad = deferred<AdminSettings>();
    const newSave = deferred<AdminSettings>();
    let configuredModels: string[] = [];
    let pageModels: string[] = [];
    const runOldLoad = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => oldLoad.promise, (models, settings) => {
        configuredModels = models;
        pageModels = configuredModelsFromSettings(settings);
    });
    const runNewSave = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => newSave.promise, (models, settings) => {
        configuredModels = models;
        pageModels = configuredModelsFromSettings(settings);
    });

    oldLoad.resolve(settingsWithChannels([channel({ models: ["loaded-old"] })]));
    assert.equal(await runOldLoad, false);
    newSave.resolve(settingsWithChannels([channel({ models: ["saved-new"] })]));
    assert.equal(await runNewSave, true);
    assert.deepEqual(configuredModels, ["saved-new"]);
    assert.deepEqual(pageModels, ["saved-new"]);
});

test("新读取取代旧读取，且最新失败后旧响应仍然作废", async () => {
    const coordinator = createAuthoritativeSettingsCoordinator();
    const oldLoad = deferred<AdminSettings>();
    const newLoad = deferred<AdminSettings>();
    let configuredModels: string[] = [];
    const apply = (models: string[]) => { configuredModels = models; };
    const runOldLoad = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => oldLoad.promise, apply);
    const runNewLoad = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => newLoad.promise, apply);
    oldLoad.resolve(settingsWithChannels([channel({ models: ["old-load"] })]));
    assert.equal(await runOldLoad, false);
    newLoad.resolve(settingsWithChannels([channel({ models: ["new-load"] })]));
    assert.equal(await runNewLoad, true);
    assert.deepEqual(configuredModels, ["new-load"]);

    const staleLoad = deferred<AdminSettings>();
    const failedNewest = deferred<AdminSettings>();
    const runStaleLoad = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => staleLoad.promise, apply);
    const runFailedNewest = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => failedNewest.promise, apply);
    staleLoad.resolve(settingsWithChannels([channel({ models: ["stale-after-error"] })]));
    assert.equal(await runStaleLoad, false);
    failedNewest.reject(new Error("newest failed"));
    await assert.rejects(runFailedNewest, /newest failed/);
    assert.deepEqual(configuredModels, ["new-load"]);

    const unmountedLoad = deferred<AdminSettings>();
    const runUnmountedLoad = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => unmountedLoad.promise, apply);
    coordinator.reset();
    unmountedLoad.resolve(settingsWithChannels([channel({ models: ["after-unmount"] })]));
    assert.equal(await runUnmountedLoad, false);
    assert.deepEqual(configuredModels, ["new-load"]);
});

test("权威设置协调器只由最新读取、保存或预设请求收口 pending 状态", async () => {
    const coordinator = createAuthoritativeSettingsCoordinator();
    const oldLoad = deferred<AdminSettings>();
    const oldSave = deferred<AdminSettings>();
    const newestPreset = deferred<AdminSettings>();
    const loadPending: boolean[] = [];
    const savePending: boolean[] = [];
    const presetPending: boolean[] = [];
    const apply = () => {};

    const runLoad = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => oldLoad.promise, apply, (value) => loadPending.push(value));
    assert.deepEqual(loadPending, [true]);
    const runSave = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => oldSave.promise, apply, (value) => savePending.push(value));
    assert.deepEqual(loadPending, [true, false]);
    assert.deepEqual(savePending, [true]);
    const runPreset = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => newestPreset.promise, apply, (value) => presetPending.push(value));
    assert.deepEqual(savePending, [true, false]);
    assert.deepEqual(presetPending, [true]);

    oldLoad.resolve(settingsWithChannels([]));
    oldSave.resolve(settingsWithChannels([]));
    assert.equal(await runLoad, false);
    assert.equal(await runSave, false);
    assert.deepEqual(loadPending, [true, false]);
    assert.deepEqual(savePending, [true, false]);
    newestPreset.resolve(settingsWithChannels([]));
    assert.equal(await runPreset, true);
    assert.deepEqual(presetPending, [true, false]);

    const failed = deferred<AdminSettings>();
    const failedPending: boolean[] = [];
    const runFailed = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => failed.promise, apply, (value) => failedPending.push(value));
    failed.reject(new Error("save failed"));
    await assert.rejects(runFailed, /save failed/);
    assert.deepEqual(failedPending, [true, false]);

    const unmounted = deferred<AdminSettings>();
    const unmountedPending: boolean[] = [];
    const runUnmounted = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => unmounted.promise, apply, (value) => unmountedPending.push(value));
    coordinator.reset();
    unmounted.resolve(settingsWithChannels([]));
    assert.equal(await runUnmounted, false);
    assert.deepEqual(unmountedPending, [true]);
});

test("被新设置操作取代的向导保存不完成或关闭向导", async () => {
    const coordinator = createAuthoritativeSettingsCoordinator();
    const wizardSave = deferred<AdminSettings>();
    const newerLoad = deferred<AdminSettings>();
    const wizardPending: boolean[] = [];
    let wizardOpen = true;
    const runWizardSave = finishAuthoritativeSettingsOperation(
        () => syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => wizardSave.promise, () => {}, (value) => wizardPending.push(value)),
        () => { wizardOpen = false; },
    );
    assert.deepEqual(wizardPending, [true]);

    const runNewerLoad = syncConfiguredModelsFromAuthoritativeSettings(coordinator, () => newerLoad.promise, () => {});
    assert.deepEqual(wizardPending, [true, false]);
    wizardSave.resolve(settingsWithChannels([channel({ models: ["stale-wizard"] })]));
    assert.equal(await runWizardSave, false);
    newerLoad.resolve(settingsWithChannels([]));
    assert.equal(await runNewerLoad, true);
    assert.equal(wizardOpen, true);
    assert.deepEqual(wizardPending, [true, false]);
});

test("权威设置生产边界串行持久化，写入和刷新不会重叠执行", async () => {
    const coordinator = createAuthoritativeSettingsCoordinator();
    const firstWrite = deferred<AdminSettings>();
    const secondWrite = deferred<AdminSettings>();
    const refresh = deferred<AdminSettings>();
    const events: string[] = [];
    const runFirstWrite = syncConfiguredModelsFromAuthoritativeSettings(coordinator, async () => {
        events.push("write-1-start");
        const result = await firstWrite.promise;
        events.push("write-1-commit");
        return result;
    }, () => {});
    const runSecondWrite = syncConfiguredModelsFromAuthoritativeSettings(coordinator, async () => {
        events.push("write-2-start");
        const result = await secondWrite.promise;
        events.push("write-2-commit");
        return result;
    }, () => {});
    const runRefresh = syncConfiguredModelsFromAuthoritativeSettings(coordinator, async () => {
        events.push("refresh-start");
        return refresh.promise;
    }, () => {});

    await Promise.resolve();
    assert.deepEqual(events, ["write-1-start"]);
    secondWrite.resolve(settingsWithChannels([]));
    refresh.resolve(settingsWithChannels([]));
    firstWrite.resolve(settingsWithChannels([]));
    assert.equal(await runFirstWrite, false);
    assert.equal(await runSecondWrite, false);
    assert.equal(await runRefresh, true);
    assert.deepEqual(events, ["write-1-start", "write-1-commit", "write-2-start", "write-2-commit", "refresh-start"]);
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function settingsWithChannels(channels: AdminModelChannel[]): AdminSettings {
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
            channels,
            promptSync: { enabled: false, cron: "*/5 * * * *" },
            auth: {},
            volcengineAsset: { enabled: false, accessKey: "", secretKey: "", accessKeyConfigured: false, secretKeyConfigured: false, projectName: "default", region: "cn-beijing", assetGroupId: "", publicAssetBaseUrl: "" },
        },
    };
}
