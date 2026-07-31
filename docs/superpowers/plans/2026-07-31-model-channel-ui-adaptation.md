# 模型渠道配置界面适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有模型渠道结构和运行时调用链的前提下，用四步向导简化管理员渠道配置，并让普通用户看清模型来源和算力点。

**Architecture:** 管理端继续编辑现有 `AdminModelChannel`，通过纯函数完成模型清洗、火山 EP 校验和公开模型合并，再由页面调用现有 `/api/admin/settings` 保存；Go 设置服务只负责私有渠道规范化、密钥恢复和公开元数据派生，不改动运行时路由与供应商调用链。普通用户继续从 `/api/settings` 读取原模型名称，只把已有来源和费用元数据补充到选择器展示。所有视频检测复用现有模型列表、Ark 鉴权、即梦 CLI 和星链云余额预检，不创建视频任务。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Ant Design 6、Zustand、Node.js `node:test`、Go 现有设置服务（仅设置规范化与公开元数据，不改运行时调用链）

---

## 实施前边界

- 工作分支固定为 `codex/model-channel-ui-adaptation`，工作树固定为 `.worktrees/model-channel-ui-adaptation`。
- 开始功能实现前，先等待 `main` 工作区中与 `handler/settings.go`、`service/settings.go`、`web/src/services/api/admin.ts`、`web/src/app/(admin)/admin/settings/page.tsx` 有关的现有改动提交，再执行 `git rebase main`。遇到冲突时保留主线已经支持的 `endpointType` 文本/图片检测，不复制旧统一运行时分支的实现。
- 禁止修改 `handler/ai.go`、`service/jimeng_cli.go`、`service/xinglian_video.go`、Agent Run / Invocation / Workflow、`web/src/services/api/video.ts`、`web/src/services/api/image.ts`。
- 不修改 `AdminModelChannel` 的字段，不新增部署 ID、模型发布状态、Provider Connection、Model Deployment 或 `/api/model-catalog`。
- 当前基线 `bun run test` 有一个与本功能无关的既有失败：`admin-asset-manager.test.mts` 仍断言已删除的“全部集数”文案。新增模型渠道测试必须全部通过，不在本计划内顺手修复该用例。

## 文件结构

- Create: `web/src/app/(admin)/admin/settings/model-channel-wizard-model.ts` — 向导草稿、模型清洗、火山 EP 校验、公开模型合并和检测模式的纯函数。
- Create: `web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts` — 上述纯函数的 TDD 用例。
- Create: `web/src/app/(admin)/admin/settings/components/model-channel-wizard.tsx` — 新增/编辑渠道共用的四步向导。
- Create: `web/src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts` — 向导结构和关键交互的轻量源码契约测试。
- Modify: `web/src/app/(admin)/admin/settings/model-channel-presets.ts` — 一键预设不再自动公开全部模型。
- Modify: `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts` — 锁定显式公开语义。
- Modify: `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx` — 修正一键预设的说明文案。
- Modify: `web/src/app/(admin)/admin/settings/page.tsx` — 接入向导、保存现有设置载荷，并把视频渠道测试收口为预检/连通检测。
- Modify: `web/src/stores/use-config-store.ts` — 把现有公开 `modelCosts` 放进前端有效配置。
- Modify: `web/src/stores/use-config-store.test.mts` — 锁定费用元数据传递。
- Modify: `web/src/components/model-picker-options.ts` — 生成来源摘要和算力点文案，值仍为模型名称。
- Modify: `web/src/components/model-picker-options.test.mts` — 锁定筛选、来源数、费用单位和原模型值。
- Modify: `web/src/components/model-picker.tsx` — 在模型选项中展示来源和算力点。
- Modify: `docs/pending-test.md` — 记录本轮待用户验收的界面变化和稳定性回归。
- Inspect only: `docs/todo.md` — 确认没有需要迁移的同名待办；若没有则不修改。

### Task 1: 让厂商预设保持“配置后再明确公开”

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts`
- Modify: `web/src/app/(admin)/admin/settings/model-channel-presets.ts`
- Modify: `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx`

- [ ] **Step 1: 写出预设不自动公开的失败测试**

把现有 `reconciles public models from enabled channels` 用例替换为：

```ts
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
```

- [ ] **Step 2: 运行测试并确认旧行为失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts'`

Expected: FAIL，实际列表仍包含 `XINGLIAN_MODELS`。

- [ ] **Step 3: 只保留仍有启用渠道承载的已公开模型**

将 `reconcilePublicModels` 改为：

```ts
function reconcilePublicModels(settings: AdminSettings) {
    const enabled = new Set(uniqueValues(settings.private.channels.filter((item) => item.enabled).flatMap((item) => item.models || [])));
    settings.public.modelChannel.availableModels = uniqueValues(settings.public.modelChannel.availableModels.filter((item) => enabled.has(item)));
}
```

同时把预设弹窗顶部说明改为：

```tsx
<Alert
    showIcon
    type="info"
    title="先建立私有渠道，再决定公开哪些模型"
    description="协议、地址、模型、能力和环境会写入现有渠道；新模型不会自动开放给前台，请随后到公开配置选择系统可用模型和默认模型。"
/>
```

- [ ] **Step 4: 运行预设测试确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts'`

Expected: 7 tests PASS。

- [ ] **Step 5: 提交显式公开行为**

```bash
git add 'web/src/app/(admin)/admin/settings/model-channel-presets.ts' 'web/src/app/(admin)/admin/settings/model-channel-presets.test.mts' 'web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx'
git commit -m "fix: keep preset model publication explicit"
```

### Task 2: 建立向导纯数据边界

**Files:**
- Create: `web/src/app/(admin)/admin/settings/model-channel-wizard-model.ts`
- Create: `web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts`

- [ ] **Step 1: 写模型清洗、EP、密钥和公开范围的失败测试**

创建测试文件，至少包含以下四个用例：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { AdminModelChannel } from "../../../../services/api/admin.ts";

import {
    applyWizardPublication,
    buildWizardChannel,
    channelVerificationMode,
    normalizeWizardModels,
} from "./model-channel-wizard-model.ts";

const baseChannel: AdminModelChannel = {
    id: "existing-channel",
    protocol: "openai",
    name: "Existing",
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
    models: ["old-model"],
    capabilities: ["text"],
    environment: "prod",
    weight: 2,
    enabled: true,
    remark: "keep me",
};

test("merges discovered and manual model names with trim and stable dedupe", () => {
    assert.deepEqual(normalizeWizardModels([" gpt-5.5 ", "", "gpt-5.5", "manual-model "]), ["gpt-5.5", "manual-model"]);
});

test("editing keeps id masked key and advanced fields while accepting manual models", () => {
    const saved = buildWizardChannel(baseChannel, { ...baseChannel, apiKey: "", models: [" manual-model "] });
    assert.equal(saved.id, "existing-channel");
    assert.equal(saved.apiKey, "********");
    assert.equal(saved.weight, 2);
    assert.equal(saved.remark, "keep me");
    assert.deepEqual(saved.models, ["manual-model"]);
});

test("Ark requires an EP for every selected or manually entered model", () => {
    assert.throws(
        () => buildWizardChannel(undefined, { ...baseChannel, id: "ark", protocol: "volcengine-ark", apiKey: "key", endpointMappings: [{ model: "manual-seedance", endpointId: "" }], models: ["manual-seedance"] }),
        /manual-seedance.*Endpoint \/ EP/,
    );
});

test("publication only adds explicitly selected models and keeps sibling-backed models", () => {
    const previous = { ...baseChannel, models: ["old-model", "shared-model"] };
    const next = { ...baseChannel, models: ["new-model", "shared-model"] };
    const sibling = { ...baseChannel, id: "sibling", models: ["shared-model"], capabilities: ["text"] };
    const result = applyWizardPublication(
        {
            availableModels: ["old-model", "shared-model"],
            modelCosts: [],
            modelTextEndpoints: [],
            defaultModel: "",
            defaultImageModel: "",
            defaultVideoModel: "",
            defaultTextModel: "shared-model",
            systemPrompt: "",
            allowCustomChannel: false,
        },
        previous,
        next,
        [sibling],
        { publishedModels: ["new-model"], defaultTextModel: "new-model", defaultImageModel: "", defaultVideoModel: "", modelTextEndpoints: [{ model: "new-model", endpointType: "responses" }] },
    );
    assert.deepEqual(result.availableModels, ["shared-model", "new-model"]);
    assert.equal(result.defaultTextModel, "new-model");
    assert.deepEqual(result.modelTextEndpoints, [
        { model: "shared-model", endpointType: "chat_completions" },
        { model: "new-model", endpointType: "responses" },
    ]);
});

test("all video-capable OpenAI channels use connectivity detection instead of generation tests", () => {
    assert.equal(channelVerificationMode({ ...baseChannel, capabilities: ["video"] }), "connectivity");
    assert.equal(channelVerificationMode({ ...baseChannel, protocol: "volcengine-ark", capabilities: ["video"] }), "preflight");
    assert.equal(channelVerificationMode({ ...baseChannel, capabilities: ["text"] }), "model-test");
});
```

- [ ] **Step 2: 运行测试并确认模块尚不存在**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts'`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现最小纯函数**

创建 `model-channel-wizard-model.ts`，公开接口固定为：

```ts
import { modelMatchesAiCapability, type AiModelKind } from "../../../../lib/ai-model-kind.ts";
import type { AdminModelChannel, AdminModelTextEndpoint, AdminPublicModelChannelSettings } from "../../../../services/api/admin.ts";

export type WizardPublicSelection = {
    publishedModels: string[];
    defaultTextModel: string;
    defaultImageModel: string;
    defaultVideoModel: string;
    modelTextEndpoints: AdminModelTextEndpoint[];
};

export function normalizeWizardModels(values: readonly (string | undefined)[]) {
    const seen = new Set<string>();
    return values.map((value) => value?.trim() || "").filter((value) => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
    });
}

export function buildWizardChannel(existing: AdminModelChannel | undefined, draft: AdminModelChannel): AdminModelChannel {
    const protocol = draft.protocol || "openai";
    const endpointMappings = protocol === "volcengine-ark"
        ? draft.endpointMappings.map((item) => ({ model: item.model.trim(), endpointId: item.endpointId.trim() })).filter((item) => item.model)
        : [];
    if (protocol === "volcengine-ark") {
        const missing = endpointMappings.find((item) => !item.endpointId);
        if (missing) throw new Error(`${missing.model} 缺少火山 Endpoint / EP`);
    }
    const models = protocol === "volcengine-ark" ? normalizeWizardModels(endpointMappings.map((item) => item.model)) : normalizeWizardModels(draft.models);
    if (!models.length) throw new Error("请配置至少一个模型");
    return {
        ...existing,
        ...draft,
        id: draft.id.trim() || existing?.id || "",
        name: draft.name.trim(),
        baseUrl: protocol === "jimeng-cli" ? "" : draft.baseUrl.trim().replace(/\/+$/, ""),
        apiKey: protocol === "jimeng-cli" ? "" : draft.apiKey.trim() || existing?.apiKey || "",
        endpointId: endpointMappings[0]?.endpointId || "",
        endpointMappings,
        models,
        capabilities: normalizeWizardModels(draft.capabilities),
        weight: Math.max(1, Number(draft.weight) || 1),
        concurrencyLimit: Math.max(1, Number(draft.concurrencyLimit) || 1),
    };
}

export function applyWizardPublication(
    current: AdminPublicModelChannelSettings,
    previousChannel: AdminModelChannel | undefined,
    nextChannel: AdminModelChannel,
    siblingChannels: AdminModelChannel[],
    selection: WizardPublicSelection,
): AdminPublicModelChannelSettings {
    const siblings = siblingChannels.filter((item) => item.enabled);
    const siblingModels = new Set(normalizeWizardModels(siblings.flatMap((item) => item.models)));
    const previousModels = new Set(normalizeWizardModels(previousChannel?.models || []));
    const nextModels = new Set(nextChannel.enabled ? normalizeWizardModels(nextChannel.models) : []);
    const selected = normalizeWizardModels(selection.publishedModels).filter((model) => nextModels.has(model));
    const kept = normalizeWizardModels(current.availableModels).filter((model) => siblingModels.has(model) || (!previousModels.has(model) && nextModels.has(model)));
    const availableModels = normalizeWizardModels([...kept, ...selected]);
    const available = new Set(availableModels);
    const channels = [...siblings, ...(nextChannel.enabled ? [nextChannel] : [])];
    const pickDefault = (requested: string, existing: string, kind: AiModelKind) => {
        const candidates = [requested.trim(), existing.trim()].filter(Boolean);
        return candidates.find((model) => available.has(model) && modelHasCapability(model, channels, kind)) || "";
    };
    const endpointByModel = new Map(current.modelTextEndpoints.map((item) => [item.model, item.endpointType]));
    selection.modelTextEndpoints.forEach((item) => endpointByModel.set(item.model.trim(), item.endpointType));
    return {
        ...current,
        availableModels,
        modelTextEndpoints: availableModels
            .filter((model) => modelHasCapability(model, channels, "text"))
            .map((model) => ({ model, endpointType: endpointByModel.get(model) || "chat_completions" })),
        defaultTextModel: pickDefault(selection.defaultTextModel, current.defaultTextModel, "text"),
        defaultImageModel: pickDefault(selection.defaultImageModel, current.defaultImageModel, "image"),
        defaultVideoModel: pickDefault(selection.defaultVideoModel, current.defaultVideoModel, "video"),
    };
}

export function channelVerificationMode(channel?: AdminModelChannel) {
    if (!channel) return "model-test" as const;
    if (channel.protocol === "volcengine-ark" || channel.protocol === "jimeng-cli" || channel.protocol === "xinglian-cloud") return "preflight" as const;
    if (channel.capabilities.includes("video")) return "connectivity" as const;
    return "model-test" as const;
}

function modelHasCapability(model: string, channels: AdminModelChannel[], capability: AiModelKind) {
    const capabilities = channels.filter((channel) => channel.models.includes(model)).flatMap((channel) => channel.capabilities);
    return modelMatchesAiCapability(model, capabilities, capability);
}
```

- [ ] **Step 4: 运行纯函数测试并确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts'`

Expected: 5 tests PASS。

- [ ] **Step 5: 提交向导数据模型**

```bash
git add 'web/src/app/(admin)/admin/settings/model-channel-wizard-model.ts' 'web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts'
git commit -m "feat: add model channel wizard data model"
```

### Task 3: 实现管理员四步向导

**Files:**
- Create: `web/src/app/(admin)/admin/settings/components/model-channel-wizard.tsx`
- Create: `web/src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts`

- [ ] **Step 1: 写向导结构的失败契约测试**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./model-channel-wizard.tsx", import.meta.url), "utf8");

test("channel wizard exposes four named steps", () => {
    assert.match(source, /选择渠道类型/);
    assert.match(source, /连接信息/);
    assert.match(source, /配置模型/);
    assert.match(source, /确认使用范围/);
});

test("model step supports manual names and Ark endpoint mappings", () => {
    assert.match(source, /mode="tags"/);
    assert.match(source, /手动输入模型名称/);
    assert.match(source, /endpointMappings/);
    assert.match(source, /火山 Endpoint \/ EP/);
});

test("Jimeng copy keeps personal login outside admin setup", () => {
    assert.match(source, /用户仍在个人配置中完成即梦网页登录/);
});
```

- [ ] **Step 2: 运行测试并确认组件尚不存在**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts'`

Expected: FAIL with `ENOENT`。

- [ ] **Step 3: 创建向导公开契约和四步状态机**

组件的 props 和提交路径固定为：

```tsx
type ModelChannelWizardProps = {
    open: boolean;
    initialChannel: AdminModelChannel;
    existingChannel?: AdminModelChannel;
    siblingChannels: AdminModelChannel[];
    publicModelChannel: AdminPublicModelChannelSettings;
    knownModels: string[];
    saving: boolean;
    onCancel: () => void;
    onDiscoverModels: (draft: AdminModelChannel) => Promise<string[]>;
    onFinish: (channel: AdminModelChannel, publicModelChannel: AdminPublicModelChannelSettings) => Promise<void>;
};

export function ModelChannelWizard(props: ModelChannelWizardProps) {
    const [form] = Form.useForm<AdminModelChannel & WizardPublicSelection>();
    const [step, setStep] = useState(0);
    const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
    const protocol = Form.useWatch("protocol", form) || "openai";
    const selectedModels = Form.useWatch("models", form) || [];
    const endpointMappings = Form.useWatch("endpointMappings", form) || [];
    const currentModels = protocol === "volcengine-ark"
        ? normalizeWizardModels(endpointMappings.map((item) => item.model))
        : normalizeWizardModels(selectedModels);
    const defaultCandidates = normalizeWizardModels([...props.publicModelChannel.availableModels, ...currentModels]);

    useEffect(() => {
        if (!props.open) return;
        const channel = props.existingChannel || props.initialChannel;
        setStep(0);
        setDiscoveredModels([]);
        form.setFieldsValue({
            ...channel,
            apiKey: "",
            publishedModels: channel.models.filter((model) => props.publicModelChannel.availableModels.includes(model)),
            defaultTextModel: props.publicModelChannel.defaultTextModel,
            defaultImageModel: props.publicModelChannel.defaultImageModel,
            defaultVideoModel: props.publicModelChannel.defaultVideoModel,
            modelTextEndpoints: props.publicModelChannel.modelTextEndpoints,
        });
    }, [form, props.existingChannel, props.initialChannel, props.open, props.publicModelChannel]);

    const next = async () => {
        const connectionFields = protocol === "jimeng-cli"
            ? ["name", "cliPath"]
            : props.existingChannel?.apiKey
              ? ["name", "baseUrl"]
              : ["name", "baseUrl", "apiKey"];
        const fields = step === 0 ? ["protocol"] : step === 1 ? connectionFields : protocol === "volcengine-ark" ? ["endpointMappings"] : ["models"];
        await form.validateFields(fields);
        setStep((value) => Math.min(3, value + 1));
    };

    const discover = async () => {
        const values = form.getFieldsValue(true);
        const models = await props.onDiscoverModels({ ...props.initialChannel, ...props.existingChannel, ...values });
        setDiscoveredModels(normalizeWizardModels(models));
    };

    const finish = async () => {
        const values = await form.validateFields();
        const channel = buildWizardChannel(props.existingChannel, values);
        const publicModelChannel = applyWizardPublication(props.publicModelChannel, props.existingChannel, channel, props.siblingChannels, values);
        await props.onFinish(channel, publicModelChannel);
    };

    return (
        <Modal open={props.open} width={880} title={props.existingChannel ? "编辑模型渠道" : "新增模型渠道"} onCancel={props.onCancel} footer={null} destroyOnHidden>
            <Steps current={step} items={[{ title: "选择渠道类型" }, { title: "连接信息" }, { title: "配置模型" }, { title: "确认使用范围" }]} />
            <Form form={form} layout="vertical" requiredMark={false} className="mt-6">
                {step === 0 ? <ChannelTypeStep /> : null}
                {step === 1 ? <ConnectionStep protocol={protocol} hasSavedKey={Boolean(props.existingChannel?.apiKey)} /> : null}
                {step === 2 ? <ModelStep protocol={protocol} knownModels={normalizeWizardModels([...props.knownModels, ...discoveredModels])} onDiscover={() => void discover()} /> : null}
                {step === 3 ? <PublicationStep channelModels={currentModels} defaultCandidates={defaultCandidates} /> : null}
            </Form>
            <Flex justify="space-between" className="mt-6">
                <Button disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>上一步</Button>
                {step < 3 ? <Button type="primary" onClick={() => void next()}>下一步</Button> : <Button type="primary" loading={props.saving} onClick={() => void finish()}>保存渠道</Button>}
            </Flex>
        </Modal>
    );
}
```

`ChannelTypeStep` 必须用四张可点击卡片写入 `protocol`；`ConnectionStep` 只渲染协议所需字段：OpenAI/Ark/星链云显示名称、Base URL、API Key，Jimeng 显示名称、CLI 路径、工作目录、输出目录、会话、超时和并发。即梦提示固定使用“管理员只检查 CLI 环境，用户仍在个人配置中完成即梦网页登录”。

- [ ] **Step 4: 实现模型与公开范围步骤**

非火山模型控件使用可创建条目的选择器：

```tsx
<Form.Item name="models" label="渠道可用模型" rules={[{ required: true, message: "请配置至少一个模型" }]} extra="可从发现结果选择，也可手动输入模型名称后回车；名称会作为节点实际提交的 model 值。">
    <Select
        mode="tags"
        tokenSeparators={[",", "\n"]}
        placeholder="选择或手动输入模型名称"
        options={knownModels.map((model) => ({ label: model, value: model }))}
    />
</Form.Item>
```

火山模型使用 `Form.List name="endpointMappings"`，每一行同时包含 `model` 和 `endpointId` 必填输入；第三步顶部提供“发现模型”按钮，发现结果只加入候选项，不自动勾选，失败或无列表时仍可继续手动输入。第四步包含：`capabilities` 多选、`publishedModels` 多选、文本模型 `modelTextEndpoints` 的 Chat Completions/Responses 选择，以及三个默认模型选择；公开模型控件只允许选择当前渠道模型，默认模型控件使用 `defaultCandidates`，并显示“保存渠道不会自动公开，只有这里选中的模型会加入系统可用模型”。

- [ ] **Step 5: 运行向导测试确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts'`

Expected: 3 tests PASS。

- [ ] **Step 6: 提交向导组件**

```bash
git add 'web/src/app/(admin)/admin/settings/components/model-channel-wizard.tsx' 'web/src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts'
git commit -m "feat: add four-step model channel wizard"
```

### Task 4: 接入设置页并禁止视频实际生成测试

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Test: `web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts`

- [ ] **Step 1: 先扩充检测模式测试**

在 `channelVerificationMode` 用例中增加混合渠道断言：

```ts
assert.equal(channelVerificationMode({ ...baseChannel, capabilities: ["text", "video"] }), "connectivity");
assert.equal(channelVerificationMode({ ...baseChannel, protocol: "xinglian-cloud", capabilities: ["video"] }), "preflight");
```

- [ ] **Step 2: 运行测试确认当前覆盖仍通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts'`

Expected: 5 tests PASS；新增断言固定后续页面分支的预期。

- [ ] **Step 3: 用向导替换旧渠道抽屉接线**

在页面导入：

```tsx
import { ModelChannelWizard } from "./components/model-channel-wizard";
import { channelVerificationMode } from "./model-channel-wizard-model";
```

移除旧 `channelForm`、模型选择子页和 900ms 自动保存状态；保留渠道表、删除、启停、预设和测试弹窗。新增/编辑都只设置索引并打开向导：

```tsx
const openChannelWizard = (index: number | null) => {
    setEditingChannelIndex(index);
    setIsChannelWizardOpen(true);
};

const finishChannelWizard = async (channel: AdminModelChannel, publicModelChannel: AdminSettings["public"]["modelChannel"]) => {
    const nextChannels = [...channels];
    if (editingChannelIndex === null) nextChannels.push(normalizeChannel(channel));
    else nextChannels[editingChannelIndex] = normalizeChannel(channel);
    form.setFieldValue(["public", "modelChannel"], publicModelChannel);
    await persistChannels(nextChannels);
    setIsChannelWizardOpen(false);
    setEditingChannelIndex(null);
};
```

页面底部接入：

```tsx
<ModelChannelWizard
    open={isChannelWizardOpen}
    initialChannel={emptyChannel}
    existingChannel={editingChannelIndex === null ? undefined : channels[editingChannelIndex]}
    siblingChannels={channels.filter((_, index) => index !== editingChannelIndex)}
    publicModelChannel={publicModelChannel}
    knownModels={knownModels}
    saving={isSaving}
    onCancel={() => {
        setIsChannelWizardOpen(false);
        setEditingChannelIndex(null);
    }}
    onDiscoverModels={async (channel) => {
        if (!token) return [];
        return fetchChannelModels(token, { index: editingChannelIndex ?? undefined, channel: normalizeChannel(channel) });
    }}
    onFinish={finishChannelWizard}
/>
```

`openEnterpriseVideoChannel` 继续找到原 Ark 渠道并打开；不存在时仅准备现有 Ark 默认草稿，不改变模型名到 EP 的运行时映射。

- [ ] **Step 4: 把视频渠道检测分成预检、连通检测、模型测试**

在测试弹窗计算：

```tsx
const verificationMode = channelVerificationMode(testChannel || undefined);
const isPreflight = verificationMode === "preflight";
const isConnectivityCheck = verificationMode === "connectivity";
```

`testModelOnline` 的调用规则固定为：

```tsx
if (isConnectivityCheck) {
    await fetchChannelModels(token, { index: testChannelIndex, channel });
    setTestResults((current) => ({ ...current, [model]: { status: "success", message: "连接与鉴权可用；未创建视频任务" } }));
    return;
}
const result = await testChannelModel(token, { index: testChannelIndex, channel, model });
```

弹窗文案分别使用：

```tsx
const verificationDescription = isConnectivityCheck
    ? "视频渠道只读取模型列表验证连接与鉴权，不提交生成任务，不扣除视频生成额度。"
    : isPreflight
      ? "当前渠道只执行现有鉴权、CLI 环境或余额预检，不创建视频任务。"
      : "文本和图片模型按现有测试入口验证；不会改变渠道配置。";
```

操作按钮在 `isPreflight || isConnectivityCheck` 时统一显示“预检”。不得新增任何视频生成 API 调用。

- [ ] **Step 5: 运行管理员配置定向测试**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts' 'src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts' 'src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts'`

Expected: 15 tests PASS。

- [ ] **Step 6: 提交设置页接入**

```bash
git add 'web/src/app/(admin)/admin/settings/page.tsx' 'web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts'
git commit -m "feat: connect model channel wizard to settings"
```

### Task 5: 在普通用户模型选择器展示来源和算力点

**Files:**
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/stores/use-config-store.test.mts`
- Modify: `web/src/components/model-picker-options.ts`
- Modify: `web/src/components/model-picker-options.test.mts`
- Modify: `web/src/components/model-picker.tsx`

- [ ] **Step 1: 写费用元数据进入有效配置的失败测试**

在 `use-config-store.test.mts` 新增：

```ts
test("remote config preserves public model costs for picker display", () => {
    const result = resolveEffectiveConfig(defaultConfig, {
        availableModels: ["video-one"],
        modelCosts: [{ model: "video-one", credits: 18 }],
        modelTextEndpoints: [],
        modelCapabilities: [{ model: "video-one", capabilities: ["video"] }],
        modelProtocols: [{ model: "video-one", protocol: "openai" }],
        modelSources: [{ model: "video-one", channelId: "video-a", channelName: "视频渠道 A", protocol: "openai" }],
        defaultModel: "",
        defaultImageModel: "",
        defaultVideoModel: "video-one",
        defaultTextModel: "",
        systemPrompt: "",
        allowCustomChannel: false,
    });
    assert.deepEqual(result.modelCosts, [{ model: "video-one", credits: 18 }]);
});
```

- [ ] **Step 2: 运行 store 测试并确认缺少 `modelCosts`**

Run: `cd web && node --experimental-strip-types --test 'src/stores/use-config-store.test.mts'`

Expected: FAIL，`result.modelCosts` 为 `undefined`。

- [ ] **Step 3: 把现有公开费用带入 `AiConfig`**

在 `AiConfig` 中加入：

```ts
modelCosts: AdminModelCost[];
```

同步导入 `AdminModelCost`，在 `defaultConfig` 中设为 `[]`，在 `resolveEffectiveConfig` 返回值中加入：

```ts
modelCosts: modelChannel.modelCosts || [],
```

持久化 merge 时对旧本地配置使用：

```ts
modelCosts: Array.isArray(config.modelCosts) ? config.modelCosts : [],
```

- [ ] **Step 4: 写模型选项来源、费用和原值的失败测试**

在 `model-picker-options.test.mts` 新增：

```ts
test("remote options keep model names while showing source count and capability billing unit", () => {
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
});
```

- [ ] **Step 5: 运行选项测试并确认新字段缺失**

Run: `cd web && node --experimental-strip-types --test 'src/components/model-picker-options.test.mts'`

Expected: FAIL，`sourceLabel` 和 `costLabel` 为 `undefined`。

- [ ] **Step 6: 扩展选项构建和展示，不改变选中值**

扩展 `BuildModelPickerOptionsInput`：

```ts
type BuildModelPickerOptionsInput = {
    models: string[];
    value?: string;
    modelSources?: Array<{ model: string; channelId: string; channelName: string; protocol: string }>;
    modelCosts?: Array<{ model: string; credits: number }>;
    modelCapabilities?: Array<{ model: string; capabilities: string[] }>;
};
```

给 `ModelPickerOption` 增加 `sourceLabel`、`costLabel`，把函数签名改为 `buildModelPickerOptions(input: BuildModelPickerOptionsInput)`，并在函数内计算：

```ts
export function buildModelPickerOptions(input: BuildModelPickerOptionsInput) {
    const values = uniqueModels([input.value, ...input.models]);
    return values.map((model) => {
        const provider = resolveModelProvider(model);
        const sources = (input.modelSources || []).filter((item) => item.model === model);
        const credits = input.modelCosts?.find((item) => item.model === model)?.credits || 0;
        const capabilities = input.modelCapabilities?.find((item) => item.model === model)?.capabilities || [];
        const unit = capabilities.includes("video") ? "秒" : capabilities.includes("image") ? "张" : "次";
        const sourceLabel = sources.length > 1 ? `${sources.length} 个渠道` : sources[0]?.channelName || provider.label;
        return {
            value: model,
            provider: provider.key,
            providerLabel: provider.label,
            sourceLabel,
            costLabel: `${credits} 算力点/${unit}`,
            searchText: [model, provider.label, ...provider.aliases, ...sources.map((item) => item.channelName)].join(" ").toLowerCase(),
        };
    });
}
```

`ModelPicker` 调用固定为：

```tsx
const options = useMemo(
    () => buildModelPickerOptions({ models: modelOptions, value: current, modelSources: config.modelSources, modelCosts: config.modelCosts, modelCapabilities: config.modelCapabilities }),
    [config.modelCapabilities, config.modelCosts, config.modelSources, current, modelOptions],
);
```

`ModelOptionButton` 增加 `costLabel` 参数，在来源行右侧显示算力点。`onChange`、`option.value`、节点保存值继续使用原模型名称。

- [ ] **Step 7: 运行 store 和选择器测试确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/stores/use-config-store.test.mts' 'src/components/model-picker-options.test.mts' 'src/lib/ai-model-catalog.test.mts'`

Expected: 全部 PASS，且现有 capability/default fallback 用例不变。

- [ ] **Step 8: 提交普通用户模型展示**

```bash
git add 'web/src/stores/use-config-store.ts' 'web/src/stores/use-config-store.test.mts' 'web/src/components/model-picker-options.ts' 'web/src/components/model-picker-options.test.mts' 'web/src/components/model-picker.tsx'
git commit -m "feat: show model sources and credit costs"
```

### Task 6: 文档、静态检查和稳定性回归

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`
- Inspect only: `handler/ai.go`, `service/settings.go`, `service/jimeng_cli.go`, `service/xinglian_video.go`

- [ ] **Step 1: 在待验收文档加入本轮真实变更**

在 `docs/pending-test.md` 的“当前必须验收”中加入：

```markdown
### 模型渠道四步配置与前台模型信息

- 入口：`/admin/settings` 私有配置、公开配置，以及画布/图片/视频中的模型选择器。
- 已实现：
  - 新增和编辑渠道统一为“渠道类型 → 连接信息 → 配置模型 → 确认使用范围”四步；保存仍写现有 `private.channels` 和 `public.modelChannel`。
  - 模型既可从发现列表选择，也可手动输入；输入会去首尾空格、忽略空项并去重。火山每个模型都必须填写对应 Endpoint / EP。
  - 新渠道模型不会自动公开；第四步明确选择的模型才进入系统可用模型，默认文本/图片/视频模型仍保存原模型名称。
  - 视频渠道只做模型列表、Ark 鉴权、即梦 CLI 环境或星链云余额预检，不创建真实视频任务。
  - 普通用户模型选项显示渠道来源、同名来源数量和算力点单位，节点提交值仍为原模型名称。
- 重点回归：
  1. 编辑现有火山渠道并直接保存，确认原渠道 ID、API Key 掩码、权重和模型到 EP 映射不变。
  2. 编辑即梦 CLI 渠道，确认管理员不需要登录；普通用户仍在个人配置完成网页登录。
  3. 编辑星链云和 OpenAI 兼容渠道，确认专用视频提交/查询路径、同协议权重与 fallback 不变。
  4. 输入一个发现列表里没有的模型名称，保存并明确公开后，前台可按能力筛选；未公开时前台不可见。
```

- [ ] **Step 2: 检查待办和禁止修改范围**

Run: `rg -n "模型渠道|API 配置|模型配置" docs/todo.md`

Expected: 若没有与本轮完全对应的未完成条目，`docs/todo.md` 不修改；若存在，则把该条目原文从 todo 移除，本轮内容只保留在 `docs/pending-test.md`。

Run: `git diff --name-only bd5f854...HEAD | rg '^(handler/ai.go|service/jimeng_cli.go|service/xinglian_video.go|web/src/services/api/(video|image).ts)$'`

Expected: 无输出。

- [ ] **Step 3: 运行新增功能定向测试**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-presets.test.mts' 'src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts' 'src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts' 'src/stores/use-config-store.test.mts' 'src/components/model-picker-options.test.mts' 'src/lib/ai-model-catalog.test.mts'`

Expected: 全部 PASS。

- [ ] **Step 4: 运行前端类型检查**

Run: `cd web && bun run typecheck`

Expected: PASS，无 TypeScript 错误。

- [ ] **Step 5: 运行全量前端测试并记录既有失败**

Run: `cd web && bun run test`

Expected: 本轮新增和模型相关测试全部 PASS；若仍只有 `admin-asset-manager.test.mts` 的“全部集数”断言失败，记录为基线既有失败，不在本分支修复。若出现其他失败，停止交付并修复本轮回归。

- [ ] **Step 6: 回归后端渠道选择和预检测试**

Run: `go test ./service ./handler`

Expected: PASS；不修改任何现有 `SelectModelChannel`、fallback、Ark EP、Jimeng 或 Xinglian 断言。

- [ ] **Step 7: 提交待验收文档**

```bash
git add docs/pending-test.md docs/todo.md
git commit -m "docs: add model channel UI verification"
```

## 计划自检

- Spec coverage：Task 1 覆盖显式公开；Task 2 覆盖手动模型、去重、密钥、火山 EP 和检测分类；Task 3 覆盖四步管理员 UI 与即梦登录边界；Task 4 覆盖现有保存契约和视频零生成检测；Task 5 覆盖普通用户能力筛选、来源、算力点和原模型值；Task 6 覆盖文档与稳定性回归。
- 类型一致性：向导统一使用现有 `AdminModelChannel`、`AdminPublicModelChannelSettings`、`AdminModelTextEndpoint`；选择器统一使用 `AiConfig.modelCosts`，没有引入部署 ID。
- 运行时边界：计划没有修改渠道选择、Agent、Workflow 或协议执行器；唯一后端动作是执行现有测试回归。
