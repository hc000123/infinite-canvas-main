# Model Channel Editing UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让已有模型渠道可直接跳转配置区并随时保存，同时让公开模型下拉按渠道来源分组且正确表达多渠道共享关系。

**Architecture:** 保持现有渠道与公开配置数据结构不变，只增加两个前端纯计算边界：向导步骤定位辅助函数、渠道模型来源分组函数。向导组件继续复用现有 Form、模型发现和保存协调器；系统设置页只把原来的扁平模型选项替换为带来源元数据的 Ant Design 分组选项。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Ant Design 6、Node.js 内置测试运行器。

**Design:** `docs/superpowers/specs/2026-08-10-model-channel-edit-and-source-groups-design.md`

**Worktree note:** 目标文件当前已有用户的未提交改动。实施时只追加本计划列出的代码，不覆盖 `model-channel-wizard.tsx`、`model-channel-wizard-model.ts` 和 `page.tsx` 中现有的星链云及布局修改。

---

## File map

- Create `web/src/app/(admin)/admin/settings/model-channel-source-options.ts`: 从已启用渠道计算唯一模型、来源和 Ant Design 分组。
- Create `web/src/app/(admin)/admin/settings/model-channel-source-options.test.mts`: 覆盖单渠道、多渠道、禁用渠道、重复模型与搜索元数据。
- Modify `web/src/app/(admin)/admin/settings/model-channel-wizard-model.ts`: 提供编辑初始步骤和字段错误到步骤的纯映射。
- Modify `web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts`: 单元验证步骤映射。
- Modify `web/src/app/(admin)/admin/settings/components/model-channel-wizard.tsx`: 编辑模式默认第二步、可点步骤、任意步骤保存并在错误时跳转。
- Modify `web/src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts`: 验证向导交互接线仍存在。
- Modify `web/src/app/(admin)/admin/settings/page.tsx`: 使用来源分组选项并渲染来源说明。
- Modify `docs/pending-test.md`: 增加两项人工验收入口；`docs/todo.md` 不新增待办，因为本次需求直接完成。

### Task 1: Channel model source grouping

**Files:**
- Create: `web/src/app/(admin)/admin/settings/model-channel-source-options.ts`
- Create: `web/src/app/(admin)/admin/settings/model-channel-source-options.test.mts`

- [ ] **Step 1: Write the grouping tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildChannelModelSourceGroups } from "./model-channel-source-options.ts";
import type { AdminModelChannel } from "../../../../services/api/admin.ts";

const channel = (id: string, name: string, models: string[], enabled = true): AdminModelChannel => ({
    id,
    name,
    models,
    enabled,
    protocol: "openai",
    baseUrl: "https://api.example.com/v1",
    apiKey: "key",
    cliPath: "",
    workDir: "",
    outputDir: "",
    timeoutSeconds: 30,
    sessionId: 0,
    concurrencyLimit: 1,
    endpointId: "",
    endpointMappings: [],
    capabilities: ["text"],
    environment: "dev",
    weight: 1,
    remark: "",
});

test("系统可用模型按单一渠道和多渠道共享分组", () => {
    const groups = buildChannelModelSourceGroups([
        channel("a", "主渠道", ["shared-model", "alpha", "ep-hidden"]),
        channel("b", "备用渠道", ["shared-model", " beta ", "beta"]),
        channel("off", "已禁用", ["disabled-model"], false),
    ]);

    assert.deepEqual(groups, [
        { label: "多渠道共享", options: [{ label: "shared-model", value: "shared-model", sources: ["主渠道", "备用渠道"], searchText: "shared-model 主渠道 备用渠道" }] },
        { label: "主渠道", options: [{ label: "alpha", value: "alpha", sources: ["主渠道"], searchText: "alpha 主渠道" }] },
        { label: "备用渠道", options: [{ label: "beta", value: "beta", sources: ["备用渠道"], searchText: "beta 备用渠道" }] },
    ]);
});
```

- [ ] **Step 2: Implement the pure grouping helper**

```ts
import type { AdminModelChannel } from "../../../../services/api/admin.ts";

export type ChannelModelSourceOption = {
    label: string;
    value: string;
    sources: string[];
    searchText: string;
};

export type ChannelModelSourceGroup = {
    label: string;
    options: ChannelModelSourceOption[];
};

export function buildChannelModelSourceGroups(channels: AdminModelChannel[]): ChannelModelSourceGroup[] {
    const channelOrder: string[] = [];
    const sourcesByModel = new Map<string, string[]>();

    channels.filter((channel) => channel.enabled).forEach((channel) => {
        const source = channel.name.trim() || channel.id.trim() || "未命名渠道";
        if (!channelOrder.includes(source)) channelOrder.push(source);
        const seen = new Set<string>();
        channel.models.forEach((value) => {
            const model = value.trim();
            if (!model || seen.has(model) || model.toLowerCase().startsWith("ep-")) return;
            seen.add(model);
            const sources = sourcesByModel.get(model) || [];
            if (!sources.includes(source)) sources.push(source);
            sourcesByModel.set(model, sources);
        });
    });

    const options = Array.from(sourcesByModel, ([model, sources]) => ({
        label: model,
        value: model,
        sources,
        searchText: [model, ...sources].join(" ").toLowerCase(),
    }));
    const groups: ChannelModelSourceGroup[] = [];
    const shared = options.filter((option) => option.sources.length > 1);
    if (shared.length) groups.push({ label: "多渠道共享", options: shared });
    channelOrder.forEach((source) => {
        const sourceOptions = options.filter((option) => option.sources.length === 1 && option.sources[0] === source);
        if (sourceOptions.length) groups.push({ label: source, options: sourceOptions });
    });
    return groups;
}
```

- [ ] **Step 3: Record the exact focused verification command without running it**

Project instructions disable routine test execution. If the user later explicitly requests verification, run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-channel-source-options.test.mts'
```

Expected: one passing test and exit code `0`.

### Task 2: Editable wizard navigation and save behavior

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/model-channel-wizard-model.ts`
- Modify: `web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts`
- Modify: `web/src/app/(admin)/admin/settings/components/model-channel-wizard.tsx`
- Modify: `web/src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts`

- [ ] **Step 1: Add unit tests for step selection**

Add `wizardInitialStep` and `wizardStepForField` to the existing import list, then append:

```ts
test("编辑渠道从连接信息开始且保存错误定位到对应步骤", () => {
    assert.equal(wizardInitialStep(false), 0);
    assert.equal(wizardInitialStep(true), 1);
    assert.equal(wizardStepForField(["protocol"]), 0);
    assert.equal(wizardStepForField(["apiKey"]), 1);
    assert.equal(wizardStepForField(["endpointMappings", 0, "endpointId"]), 2);
    assert.equal(wizardStepForField(["publishedModels"]), 3);
});
```

- [ ] **Step 2: Implement the pure step helpers**

Append near the other exported wizard helpers in `model-channel-wizard-model.ts`:

```ts
export function wizardInitialStep(editing: boolean) {
    return editing ? 1 : 0;
}

export function wizardStepForField(name: readonly (string | number)[] = []) {
    const field = String(name[0] || "");
    if (field === "protocol") return 0;
    if (["models", "capabilities", "endpointMappings"].includes(field)) return 2;
    if (["publishedModels", "defaultTextModel", "defaultImageModel", "defaultVideoModel", "modelTextEndpoints"].includes(field)) return 3;
    return 1;
}
```

- [ ] **Step 3: Initialize editing at the connection step**

Import both helpers into `model-channel-wizard.tsx`. In the initialization effect, replace the unconditional open-state reset with the mode-aware value while keeping the close branch at step `0`:

```ts
setInitializedKey(initializationKey);
setStep(wizardInitialStep(Boolean(initializationInput.existingChannel)));
setDiscoveredModels([]);
```

- [ ] **Step 4: Make saved-channel steps directly clickable**

Update the existing `Steps` component without changing its labels or styling:

```tsx
<Steps
    current={step}
    size="small"
    responsive
    items={wizardSteps.map((title) => ({ title }))}
    onChange={existingChannel && !busy ? (nextStep) => setStep(nextStep) : undefined}
    style={{ marginBottom: 24 }}
/>
```

- [ ] **Step 5: Allow save from every edit step and prepare publication before validation**

At the start of `finish`, clean the current publication selection before validating all form fields:

```ts
try {
    preparePublication();
    const values = await form.validateFields();
```

Replace the right side of the modal footer with buttons that keep new-channel behavior linear and add an always-visible save button only for editing:

```tsx
<Space>
    {step > 0 ? <Button onClick={() => { invalidateDiscovery(); setStep((current) => current - 1); }} disabled={busy}>上一步</Button> : null}
    {step < 3 ? <Button type={existingChannel ? "default" : "primary"} disabled={busy} onClick={() => void nextStep()}>下一步</Button> : null}
    {existingChannel || step === 3 ? <Button type="primary" loading={busy} disabled={busy} onClick={() => void finish()}>保存渠道</Button> : null}
</Space>
```

- [ ] **Step 6: Jump to the first invalid field's step**

Replace the current form-error early return in `finish` with:

```ts
if (error && typeof error === "object" && "errorFields" in error) {
    const errorFields = (error as { errorFields?: Array<{ name?: Array<string | number> }> }).errorFields;
    setStep(wizardStepForField(errorFields?.[0]?.name));
    return;
}
```

- [ ] **Step 7: Extend the component wiring test**

Append to `components/model-channel-wizard.test.mts`:

```ts
test("editing can jump between steps and save without reaching the last step", () => {
    assert.match(source, /wizardInitialStep\(Boolean\(initializationInput\.existingChannel\)\)/);
    assert.match(source, /onChange=\{existingChannel && !busy/);
    assert.match(source, /existingChannel \|\| step === 3/);
    assert.match(source, /wizardStepForField\(errorFields\?\.\[0\]\?\.name\)/);
});
```

- [ ] **Step 8: Record focused verification commands without running them**

If the user explicitly requests verification, run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts' \
  'src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts'
```

Expected: all tests pass and exit code `0`.

- [ ] **Step 9: Restrict model candidates to the edited channel**

Remove the page-level `configuredModels` prop and state. Build candidates from the current channel plus the current discovery response:

```ts
const candidateModels = useMemo(() => modelDiscoveryCandidates(baseChannel.models, discoveredModels), [baseChannel.models, discoveredModels]);
```

Keep `mode="tags"` so administrators can still enter a model name manually.

### Task 3: Wire source groups into public model selection

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
- Modify: `web/src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts`

- [ ] **Step 1: Add the page-level wiring assertions**

Append to `components/model-channel-wizard.test.mts`:

```ts
test("public model selector groups models by configured channel source", () => {
    assert.match(pageSource, /buildChannelModelSourceGroups\(channels\)/);
    assert.match(pageSource, /option\.data\.sources/);
    assert.match(pageSource, /option\?\.searchText/);
    assert.match(pageSource, /多渠道共享/);
});
```

- [ ] **Step 2: Compute grouped options from the live channel list**

Import the helper and add a memo beside `channelModels`:

```ts
import { buildChannelModelSourceGroups } from "./model-channel-source-options";

const channelModelSourceGroups = useMemo(() => buildChannelModelSourceGroups(channels), [channels]);
```

- [ ] **Step 3: Render grouped options and searchable source text**

Replace only the `Select` inside the existing “系统可用模型” form item:

```tsx
<Select
    mode="multiple"
    showSearch
    placeholder="请选择系统可用模型"
    options={channelModelSourceGroups}
    filterOption={(input, option) => String(option?.searchText || "").includes(input.trim().toLowerCase())}
    optionRender={(option) => (
        <Flex justify="space-between" align="center" gap={12}>
            <Typography.Text>{option.label}</Typography.Text>
            <Typography.Text type="secondary" className="text-xs" ellipsis>
                来源：{option.data.sources.join(" / ")}
            </Typography.Text>
        </Flex>
    )}
/>
```

Remove the old `channelModels` memo after replacing the selector; validation calls `collectChannelModels` directly and does not consume that local variable.

- [ ] **Step 4: Record the focused verification command without running it**

If the user explicitly requests verification, run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(admin)/admin/settings/model-channel-source-options.test.mts' \
  'src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts'
```

Expected: all tests pass and exit code `0`.

### Task 4: Documentation and handoff

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Add the pending-test entry**

Add near the start of the current version checklist:

```md
### 模型渠道快捷编辑与来源分组

- 编辑已有渠道默认进入“连接信息”，四个步骤可直接点击，并可从任意步骤保存；保存校验失败时自动定位到包含错误字段的步骤。新建渠道仍按原四步顺序完成。
- “系统可用模型”按已启用渠道分组；同名多来源模型只显示一次，归入“多渠道共享”并列出全部来源。公开配置仍只保存模型名称，不改变渠道路由。
- 人工验收：分别编辑已有渠道和新建渠道，确认快捷跳转、任意步骤保存、错误定位和密钥留空保留；再检查模型下拉的单渠道、多渠道共享与渠道名称搜索。
```

- [ ] **Step 2: Confirm todo scope**

Inspect `docs/todo.md`. Do not add or remove roadmap items because both requested improvements are implemented directly and require only pending user acceptance.

- [ ] **Step 3: Review only owned diffs**

```bash
git diff -- \
  'web/src/app/(admin)/admin/settings/model-channel-source-options.ts' \
  'web/src/app/(admin)/admin/settings/model-channel-source-options.test.mts' \
  'web/src/app/(admin)/admin/settings/model-channel-wizard-model.ts' \
  'web/src/app/(admin)/admin/settings/model-channel-wizard-model.test.mts' \
  'web/src/app/(admin)/admin/settings/components/model-channel-wizard.tsx' \
  'web/src/app/(admin)/admin/settings/components/model-channel-wizard.test.mts' \
  'web/src/app/(admin)/admin/settings/page.tsx' \
  'docs/pending-test.md'
```

Expected: only the behavior described in this plan plus pre-existing user changes remain; no unrelated refactor or settings schema change.

No build, typecheck, lint, or test command is run unless the user separately requests verification, per project instructions.
