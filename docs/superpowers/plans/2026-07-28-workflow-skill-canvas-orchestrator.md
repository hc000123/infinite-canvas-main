# Workflow、Skill 与画布总控 Agent 架构收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让正式生产链直接通过 Workflow/Invocation 调用 Skill，并把画布对话收口为唯一能够基于 Skill Catalog 生成临时计划的总控 Agent。

**Architecture:** 项目剧本入口和系统生产 Workflow 直接冻结 Skill Invocation，不再创建固定岗位 Agent Plan。Agent Registry/Plan 仅为画布总控保留：总控使用 `catalog_plan` 模式，模型只返回受限计划，前后端共同校验 Skill Catalog、访问策略、Artifact 契约和确认指纹后再执行。

**Tech Stack:** Go、Gin、GORM、Next.js App Router、React、TypeScript、TanStack Query、Ant Design、Node test runner。

---

## 文件结构

- `web/src/app/(user)/projects/script-invocation-runtime.ts`：项目剧本 Skill 的 Invocation 预检、轮询和审核坐标。
- `web/src/app/(user)/projects/script-skill-selection.ts`：只按 Skill 契约筛选和选择精确版本，不读取 Agent Package。
- `web/src/app/(user)/projects/[id]/use-script-skill-selection.ts`：加载和持久化剧本 Skill 版本。
- `web/src/app/(user)/projects/[id]/page.tsx`：接线直接 Invocation 并保持现有人工确认体验。
- `service/workflow_seed.go`：发布全 Skill 的系统生产 Workflow。
- `web/src/app/(user)/projects/[id]/workflows/`：Workflow 编辑器只创建 Skill 节点。
- `service/canvas_orchestrator_seed.go`：只为新安装发布唯一画布总控 Agent。
- `service/agent_registry.go`：支持 `catalog_plan`，允许总控版本没有固定默认步骤。
- `web/src/app/(user)/canvas/utils/canvas-orchestrator-plan.ts`：构造 Catalog 规划提示并校验模型计划。
- `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`：普通问答和 Temporary Plan 共用唯一总控入口。
- `web/src/app/(user)/canvas/components/canvas-assistant-composer.tsx`：移除岗位 Agent 下拉，只显示总控状态。
- `docs/` 与 `CHANGELOG.md`：同步架构、数据库和待验收说明。

### Task 1: 项目剧本入口直接使用 Skill Invocation

**Files:**
- Create: `web/src/app/(user)/projects/script-invocation-runtime.ts`
- Create: `web/src/app/(user)/projects/script-invocation-runtime.test.mts`
- Modify: `web/src/app/(user)/projects/script-skill-selection.ts`
- Modify: `web/src/app/(user)/projects/script-skill-selection.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/use-script-skill-selection.ts`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Delete: `web/src/app/(user)/projects/script-agent-runtime.ts`
- Delete: `web/src/app/(user)/projects/script-agent-runtime.test.mts`

- [ ] **Step 1: 写直接 Invocation 的失败测试**

测试必须证明预检请求只包含精确 `skillVersionId` 和 `source_text` Artifact，不包含 `agentId`、`agentVersionId` 或 `agentPlanId`：

```ts
const prepared = await preflightScriptInvocation(deps, {
  projectId: "project-1",
  episodeId: "episode-1",
  sourceText: "原始剧本",
  skillVersionId: "skill-version-system-workflow-script-3.2.0",
  idempotencyKey: "script-invocation-1",
});
assert.equal(prepared.preflight.run.id, "invocation-1");
assert.deepEqual(calls[1], ["invocation", {
  source: "direct",
  projectId: "project-1",
  episodeId: "episode-1",
  skillVersionId: "skill-version-system-workflow-script-3.2.0",
  expectedOutputArtifactType: "production_script",
  inputArtifactRefs: [{ bindingName: "source_text", artifactId: "source-1", contentHash: "sha256:source" }],
  parameters: {},
  idempotencyKey: "script-invocation-1",
}]);
```

另写轮询测试：`confirmInvocation` 后轮询 `getInvocation`，只有 `needs_review + artifactSetHash + production_script` 才返回；`approveScriptInvocationResult` 只调用 `reviewInvocation`，不再推进 Agent Plan。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test 'src/app/(user)/projects/script-invocation-runtime.test.mts'`

Expected: FAIL，提示 `script-invocation-runtime.ts` 不存在。

- [ ] **Step 3: 实现最小 Invocation Runtime**

导出以下稳定接口：

```ts
import type { ArtifactEnvelope, InvocationDetail, InvocationPreflightResponse, InvocationRequest } from "@/services/api/invocations";

export type ScriptInvocationReviewResult = {
  invocationId: string;
  attempt: number;
  artifactSetHash: string;
  artifactId: string;
  productionScript: string;
};

export async function preflightScriptInvocation(
  deps: {
    createArtifact: (input: Record<string, unknown>) => Promise<ArtifactEnvelope>;
    createInvocation: (input: InvocationRequest) => Promise<InvocationPreflightResponse>;
  },
  input: { projectId: string; episodeId?: string; sourceText: string; skillVersionId: string; idempotencyKey: string },
) {
  const sourceArtifact = await deps.createArtifact({
    artifactType: "source_text",
    schemaVersion: "1.0.0",
    projectId: input.projectId,
    ...(input.episodeId ? { episodeId: input.episodeId } : {}),
    payload: { text: input.sourceText },
  });
  const preflight = await deps.createInvocation({
    source: "direct",
    projectId: input.projectId,
    ...(input.episodeId ? { episodeId: input.episodeId } : {}),
    skillVersionId: input.skillVersionId,
    expectedOutputArtifactType: "production_script",
    inputArtifactRefs: [{ bindingName: "source_text", artifactId: sourceArtifact.artifact.id, contentHash: sourceArtifact.artifact.contentHash }],
    parameters: {},
    idempotencyKey: input.idempotencyKey,
  });
  return { sourceArtifact, preflight };
}

export async function executeScriptInvocationToReview(
  deps: {
    confirmInvocation: (id: string, input: { requirementCodes: string[] }) => Promise<unknown>;
    getInvocation: (id: string) => Promise<InvocationDetail>;
    wait?: (milliseconds: number) => Promise<void>;
  },
  preflight: InvocationPreflightResponse,
  options: { pollIntervalMs?: number; maxPolls?: number } = {},
): Promise<ScriptInvocationReviewResult> {
  await deps.confirmInvocation(preflight.run.id, { requirementCodes: preflight.confirmationRequirements });
  const wait = deps.wait || ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let index = 0; index < (options.maxPolls ?? 180); index += 1) {
    const detail = await deps.getInvocation(preflight.run.id);
    if (["failed", "blocked", "rejected", "cancelled", "partial"].includes(detail.run.status)) throw new Error(`剧本 Invocation 执行失败：${detail.run.status}`);
    if (detail.run.status === "needs_review") {
      const output = detail.outputArtifacts.find((item) => item.artifact.artifactType === "production_script");
      const productionScript = typeof output?.payload.productionScript === "string" ? output.payload.productionScript.trim() : "";
      if (!output || !productionScript || !detail.artifactSetHash) throw new Error("剧本 Skill 没有返回可审核的 production_script Artifact");
      return { invocationId: detail.run.id, attempt: detail.run.latestAttempt, artifactSetHash: detail.artifactSetHash, artifactId: output.artifact.id, productionScript };
    }
    if (index + 1 < (options.maxPolls ?? 180)) await wait(options.pollIntervalMs ?? 1000);
  }
  throw new Error("等待剧本 Skill 产物超时");
}

export async function approveScriptInvocationResult(
  deps: { reviewInvocation: (id: string, input: { decision: "approved"; attempt: number; artifactSetHash: string; comment: string }) => Promise<unknown> },
  review: ScriptInvocationReviewResult,
) {
  return deps.reviewInvocation(review.invocationId, { decision: "approved", attempt: review.attempt, artifactSetHash: review.artifactSetHash, comment: "项目分集剧本人工批准" });
}

export function assertScriptReviewMatches(value: string, review: Pick<ScriptInvocationReviewResult, "productionScript">) {
  if (value.trim() !== review.productionScript.trim()) throw new Error("待审剧本内容已变更，请重新运行剧本 Skill");
}
```

错误文案统一使用“剧本 Skill”或“剧本 Invocation”，不得再出现“剧本 Agent/Agent Plan”。

- [ ] **Step 4: 将 Skill 选择从 Agent Package 解耦**

`compatibleScriptSkillOptions(options)` 只保留同时满足以下条件的发布选项：

```ts
option.manifest.capabilities.includes("workflow.stage.script") &&
option.manifest.inputArtifactTypes.includes("source_text") &&
option.manifest.outputArtifactTypes.includes("production_script")
```

`resolveScriptSkillVersionId(options, storedVersionId)` 依次选择已保存版本、`isRecommended` 版本、第一项。删除 `buildScriptSkillOverride` 和所有 `AgentPackage` 类型依赖。

- [ ] **Step 5: 接线项目页**

`useScriptSkillSelection` 删除 `fetchAgents` 查询，签名只由项目、分集和 Skill Options 决定。`page.tsx` 改用：

```ts
const prepared = await preflightScriptInvocation(
  { createArtifact, createInvocation },
  { projectId: project.id, episodeId, sourceText, skillVersionId, idempotencyKey: crypto.randomUUID() },
);
const review = await executeScriptInvocationToReview({ confirmInvocation, getInvocation }, prepared.preflight);
```

确认弹窗展示 `prepared.preflight.run.id`、冻结 Skill 版本和 `executionPolicy.estimatedCredits`。批准后只调用 `approveScriptInvocationResult`。

- [ ] **Step 6: 运行前端定向测试**

Run: `cd web && bun test 'src/app/(user)/projects/script-invocation-runtime.test.mts' 'src/app/(user)/projects/script-skill-selection.test.mts' 'src/app/(user)/projects/[id]/script-skill-selection-session.test.mts'`

Expected: PASS，且测试源码中不存在 `createAgentPlan`。

- [ ] **Step 7: 提交项目剧本迁移**

```bash
git add 'web/src/app/(user)/projects/script-invocation-runtime.ts' 'web/src/app/(user)/projects/script-invocation-runtime.test.mts' 'web/src/app/(user)/projects/script-skill-selection.ts' 'web/src/app/(user)/projects/script-skill-selection.test.mts' 'web/src/app/(user)/projects/[id]/use-script-skill-selection.ts' 'web/src/app/(user)/projects/[id]/page.tsx' 'web/src/app/(user)/projects/script-agent-runtime.ts' 'web/src/app/(user)/projects/script-agent-runtime.test.mts'
git commit -m "refactor: run project scripts through skills"
```

### Task 2: 系统生产 Workflow 全部改为 Skill 节点

**Files:**
- Modify: `service/workflow_seed.go`
- Modify: `service/workflow_seed_test.go`
- Modify: `web/src/app/(user)/projects/[id]/workflows/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/workflows/components/workflow-version-editor.tsx`
- Modify: `web/src/app/(user)/projects/[id]/workflows/workflow-editor-model.ts`
- Modify: `web/src/app/(user)/projects/[id]/workflows/workflow-editor-model.test.mts`

- [ ] **Step 1: 将 Workflow 种子测试改为全 Skill 预期**

系统 Workflow 版本提升到 `2.2.0`。12 个节点的预期 `executorType` 全部为 `skill`，`agentVersionID` 全部为空，执行过程中直接读取 `node.InvocationID`，并断言每个 `node.AgentPlanID == ""`。

```go
for _, node := range packageValue.Nodes {
    if node.ExecutorType != WorkflowExecutorSkill || node.AgentRef != nil || node.SkillBinding == nil {
        t.Fatalf("system production node must be Skill-only: %+v", node)
    }
}
```

- [ ] **Step 2: 运行 Go 测试确认失败**

Run: `go test ./service -run 'TestEnsureWorkflowSeedsPublishesComposableProductionTemplate|TestSystemProductionWorkflowExecutesRoutedTwelveNodeProductionChain' -count=1`

Expected: FAIL，`script` 和 `art` 仍是 Agent Executor。

- [ ] **Step 3: 修改系统 Workflow 种子**

将：

```go
agentWorkflowNode("script", "剧本整理", WorkflowSkillStageScript, "production_script", []WorkflowNodeInputBinding{
    workflowRootBinding("source_text", "source_text"),
})
agentWorkflowNode("art", "资产提取", WorkflowSkillStageArt, "asset_catalog", []WorkflowNodeInputBinding{
    workflowOutputBinding("production_script", "production_script", "script"),
})
```

替换为：

```go
skillWorkflowNode("script", "剧本整理", WorkflowSkillStageScript, "production_script", []WorkflowNodeInputBinding{
    workflowRootBinding("source_text", "source_text"),
})
skillWorkflowNode("art", "资产提取", WorkflowSkillStageArt, "asset_catalog", []WorkflowNodeInputBinding{
    workflowOutputBinding("production_script", "production_script", "script"),
})
```

删除 `agentWorkflowNode`，把 `EnsureWorkflowSeeds` 的前置依赖从 `EnsureAgentSeeds()` 改为 `EnsureSkillSeeds()`，并将系统 Workflow ID 对应推荐版本更新为 `2.2.0`。

- [ ] **Step 4: Workflow 编辑器只允许新增 Skill 节点**

删除 Workflow 页面中的 `fetchAgents` 查询、`agents` props 和“添加 Agent 节点”按钮。新建节点统一调用：

```ts
createWorkflowNode(pkg, "skill")
```

历史 Agent 节点只在只读版本中显示其 `agentVersionId` 文本，不提供选择或发布为新生产模板的入口。

- [ ] **Step 5: 运行定向测试**

Run: `go test ./service -run 'TestEnsureWorkflowSeedsPublishesComposableProductionTemplate|TestSystemProductionWorkflowExecutesRoutedTwelveNodeProductionChain|TestSystemProductionWorkflowExecutesMixedCodexTextAndAPIImageChain' -count=1`

Run: `cd web && bun test 'src/app/(user)/projects/[id]/workflows/workflow-editor-model.test.mts'`

Expected: PASS；系统执行产生 12 个 Invocation、0 个 Agent Plan。

- [ ] **Step 6: 提交 Workflow 收口**

```bash
git add service/workflow_seed.go service/workflow_seed_test.go 'web/src/app/(user)/projects/[id]/workflows/page.tsx' 'web/src/app/(user)/projects/[id]/workflows/components/workflow-version-editor.tsx' 'web/src/app/(user)/projects/[id]/workflows/workflow-editor-model.ts' 'web/src/app/(user)/projects/[id]/workflows/workflow-editor-model.test.mts'
git commit -m "refactor: make production workflow skill only"
```

### Task 3: 发布唯一的 Catalog Planner 总控 Agent

**Files:**
- Create: `service/canvas_orchestrator_seed.go`
- Create: `service/canvas_orchestrator_seed_test.go`
- Modify: `service/agent_registry_contracts.go`
- Modify: `service/agent_registry.go`
- Modify: `service/agent_registry_test.go`
- Modify: `service/agent_plan.go`
- Modify: `main.go`
- Modify: `web/src/services/api/agent-registry.ts`

- [ ] **Step 1: 写 `catalog_plan` 失败测试**

覆盖以下行为：

```go
packageValue, err := NormalizeAgentPackage(AgentPackage{
    RolePrompt: "你是画布总控。",
    PlannerMode: AgentPlannerCatalog,
    SkillAccessPolicy: AgentSkillAccessPolicy{AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerSystem, model.SkillOwnerProject}},
    ExecutionPolicy: AgentExecutionPolicy{MaxSteps: 8, AllowRuntimeSkillOverride: true},
})
if err != nil || len(packageValue.DefaultSkillRefs) != 0 {
    t.Fatalf("package=%+v err=%v", packageValue, err)
}
```

另断言：`catalog_plan` 未启用 runtime override、`MaxSteps` 不在 1–32、创建 Plan 时没有 `skillOverrides` 均被拒绝。

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./service -run 'TestNormalizeCatalogPlanner|TestCatalogPlannerRequiresRuntimeSteps|TestEnsureCanvasOrchestratorSeed' -count=1`

Expected: FAIL，`AgentPlannerCatalog` 未定义。

- [ ] **Step 3: 扩展 Agent Package 校验**

新增：

```go
const (
    AgentPlannerConfiguredChain = "configured_chain"
    AgentPlannerCatalog = "catalog_plan"
)
```

`configured_chain` 继续要求 1–32 个默认步骤；`catalog_plan` 允许 0–32 个默认步骤，但必须 `AllowRuntimeSkillOverride=true` 且 `MaxSteps` 为 1–32。`normalizeAgentPlanInputs` 在两种模式下最终都要求至少一个实际步骤，防止空 Plan。

- [ ] **Step 4: 新增独立总控种子**

发布固定 ID：

```go
const CanvasOrchestratorAgentID = "agent-system-canvas-orchestrator"
const CanvasOrchestratorAgentVersionID = "agent-version-system-canvas-orchestrator-1.0.0"
```

种子只包含 Role Prompt、系统/项目 Skill Owner 访问策略、允许的工具集合、`catalog_plan` 和最大 8 步，不包含 `defaultSkillRefs`。`main.go` 改为调用 `EnsureCanvasOrchestratorSeed()`；`EnsureAgentSeeds()` 作为兼容函数保留但不再进入新安装启动链和 Workflow 种子链，避免覆盖工作区现有 Seedance 3.2 测试改动。

- [ ] **Step 5: 更新前端 Agent 类型**

```ts
export type AgentPlannerMode = "configured_chain" | "catalog_plan";
```

`AgentVersion.plannerMode` 和 `AgentPackage.plannerMode` 使用该联合类型。

- [ ] **Step 6: 运行种子与 Registry 测试**

Run: `go test ./service -run 'TestNormalizeCatalogPlanner|TestCatalogPlannerRequiresRuntimeSteps|TestEnsureCanvasOrchestratorSeed|TestEnsureAgentSeedsReferencesPublishedSkills' -count=1`

Expected: PASS；兼容种子测试仍保留原有 3.2.0 断言，新总控测试只看到唯一总控新种子。

- [ ] **Step 7: 提交总控 Runtime**

```bash
git add service/canvas_orchestrator_seed.go service/canvas_orchestrator_seed_test.go service/agent_registry_contracts.go service/agent_registry.go service/agent_registry_test.go service/agent_plan.go main.go web/src/services/api/agent-registry.ts
git commit -m "feat: add canvas catalog orchestrator"
```

### Task 4: 画布对话只保留一个总控入口

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-orchestrator-plan.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-orchestrator-plan.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-composer.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-agent-plan.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-agent-plan-model.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-agent-plan-card.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-agent-plan-wiring.test.mts`

- [ ] **Step 1: 写 Planner 解析和契约校验测试**

模型输出类型：

```ts
type CanvasOrchestratorDecision =
  | { kind: "answer"; answer: string }
  | { kind: "plan"; summary: string; steps: Array<{ stepKey: string; skillVersionId: string; parameters?: Record<string, unknown>; reason: string }> };
```

测试以下情况：普通回答不创建步骤；未知 Skill 版本、重复 `stepKey`、超过 `maxSteps`、第一步不接受 `source_text`、相邻步骤无兼容 Artifact 交接均抛出可读错误；合法两步计划生成精确 `AgentSkillRef[]` 和确定性上下游 binding。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && bun test 'src/app/(user)/canvas/utils/canvas-orchestrator-plan.test.mts'`

Expected: FAIL，规划工具文件不存在。

- [ ] **Step 3: 实现受限 Catalog Planner 工具**

导出：

```ts
export function buildCanvasOrchestratorSystemPrompt(rolePrompt: string, skills: SkillOption[], context: string): string;
export function parseCanvasOrchestratorDecision(raw: string): CanvasOrchestratorDecision;
export function buildCanvasOrchestratorSkillRefs(decision, skills, maxSteps): AgentSkillRef[];
```

System Prompt 明确要求只返回 JSON，不复制 Skill 规则，不臆造版本；前端解析支持纯 JSON 或单个 Markdown JSON fence。Skill Ref 的 capability、skillId、expectedOutputType 和 inputBindings 必须从真实 Catalog 重建，不信任模型同名字段。

- [ ] **Step 4: 移除岗位 Agent 下拉**

`CanvasAssistantComposer` 删除 `agentId`、`agentOptions`、`agentLoading`、`onAgentChange` 和 `PublishedAgentSelect`。对话模式只显示静态的扁平总控标识：

```tsx
<span className="inline-flex h-8 items-center gap-1 px-2 text-xs">
  <Bot className="size-3.5" /> 画布总控
</span>
```

发送按钮继续显示一次文本规划请求的 Credits，不再用 `agentId ? "Plan" : credits` 分支。

- [ ] **Step 5: 让 Panel 使用唯一总控**

Panel 只解析 `agent-system-canvas-orchestrator`，同时加载经用户权限过滤的 Skill Options。问答请求把角色设定、工作流上下文和 Catalog 摘要放入 system message。收到：

- `kind=answer`：更新当前助手消息文本，不创建 Plan；
- `kind=plan`：校验并重建 Skill Refs，创建 `source_text` Artifact，再用唯一总控 ID、版本和 `skillOverrides` 创建 Temporary Plan；
- 非法 JSON 或非法契约：显示错误，不执行任何 Skill。

现有确定性画布动作预览仍优先执行，保持确认前不修改画布。

- [ ] **Step 6: 让 Plan 卡只读取固定总控策略**

`useCanvasAgentPlan` 用 `fetchAgent(run.agentId, projectId)` 读取唯一总控，不再获取 Agent 列表。卡片标题改为“画布总控临时计划”，审核文案改为“画布总控人工批准”。编辑、预检、确认、逐步审核和最终幂等写回逻辑保持不变。

- [ ] **Step 7: 运行画布定向测试**

Run: `cd web && bun test 'src/app/(user)/canvas/utils/canvas-orchestrator-plan.test.mts' 'src/app/(user)/canvas/utils/canvas-agent-plan-model.test.mts' 'src/app/(user)/canvas/components/canvas-agent-plan-wiring.test.mts' 'src/app/(user)/canvas/components/canvas-agent-plan-card.test.mts'`

Expected: PASS；源码断言不存在 `PublishedAgentSelect` 或 `canvasAgentCandidates`。

- [ ] **Step 8: 提交画布总控 UI**

```bash
git add 'web/src/app/(user)/canvas/utils/canvas-orchestrator-plan.ts' 'web/src/app/(user)/canvas/utils/canvas-orchestrator-plan.test.mts' 'web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx' 'web/src/app/(user)/canvas/components/canvas-assistant-composer.tsx' 'web/src/app/(user)/canvas/hooks/use-canvas-agent-plan.ts' 'web/src/app/(user)/canvas/utils/canvas-agent-plan-model.ts' 'web/src/app/(user)/canvas/components/canvas-agent-plan-card.tsx' 'web/src/app/(user)/canvas/components/canvas-agent-plan-wiring.test.mts'
git commit -m "refactor: keep one canvas orchestrator"
```

### Task 5: 清理入口与同步文档

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `docs/workflow.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/backend-database.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 清理生产导航与文案**

项目生产看板移除“Agent 设置/Agent 中心”主流程按钮和对应 callback；Workflow 新建摘要从“自由组合 Skill / Agent”改为“自由组合已发布 Skill”。保留管理端兼容页面，不把它继续宣传为生产必经入口。

- [ ] **Step 2: 更新架构文档**

`docs/workflow.md` 明确：正式阶段由 Workflow 调用 Skill，画布总控只生成 Temporary Plan。`docs/backend-database.md` 标注 Agent Registry/Plan 目前仅服务画布总控和兼容查询，正式 Workflow 节点使用 Invocation ID。

- [ ] **Step 3: 更新迭代记录**

从 `docs/todo.md` 移除或改写“多 Agent 主链”待办，把本轮实际可测试内容写入 `docs/pending-test.md`；`CHANGELOG.md` 的 `Unreleased` 只写版本级归纳。用户真实验收前不修改 `docs/features.md`。

- [ ] **Step 4: 搜索残留正式生产依赖**

Run:

```bash
rg -n "createAgentPlan|fetchAgents|agentWorkflowNode|WorkflowExecutorAgent" 'web/src/app/(user)/projects/[id]/page.tsx' 'web/src/app/(user)/projects/[id]/workflows' service/workflow_seed.go
```

Expected: 无输出。画布目录允许保留 `createAgentPlan`，但只允许出现在唯一总控路径。

- [ ] **Step 5: 提交文档和入口清理**

```bash
git add 'web/src/app/(user)/projects/[id]/components/project-episode-board.tsx' docs/workflow.md docs/todo.md docs/pending-test.md docs/backend-database.md CHANGELOG.md
git commit -m "docs: align production around workflows and skills"
```

### Task 6: 完整验证与完成审计

**Files:**
- Modify only if verification exposes a defect in files already listed above.

- [ ] **Step 1: 运行 Go 定向测试**

Run:

```bash
go test ./service -run 'TestNormalizeCatalogPlanner|TestCatalogPlannerRequiresRuntimeSteps|TestEnsureCanvasOrchestratorSeed|TestEnsureWorkflowSeedsPublishesComposableProductionTemplate|TestSystemProductionWorkflowExecutesRoutedTwelveNodeProductionChain|TestSystemProductionWorkflowExecutesMixedCodexTextAndAPIImageChain' -count=1
```

Expected: PASS。

- [ ] **Step 2: 运行前端定向测试**

Run:

```bash
cd web && bun test \
  'src/app/(user)/projects/script-invocation-runtime.test.mts' \
  'src/app/(user)/projects/script-skill-selection.test.mts' \
  'src/app/(user)/canvas/utils/canvas-orchestrator-plan.test.mts' \
  'src/app/(user)/canvas/utils/canvas-agent-plan-model.test.mts' \
  'src/app/(user)/canvas/components/canvas-agent-plan-wiring.test.mts' \
  'src/app/(user)/projects/[id]/workflows/workflow-editor-model.test.mts'
```

Expected: PASS。

- [ ] **Step 3: 验证架构不变量**

Run:

```bash
rg -n "createAgentPlan|preflightAgentPlan|continueAgentPlan" 'web/src/app/(user)/projects/[id]/page.tsx' 'web/src/app/(user)/projects/script-*'
rg -n "agentWorkflowNode|ExecutorType: WorkflowExecutorAgent" service/workflow_seed.go
rg -n "PublishedAgentSelect|canvasAgentCandidates|选择已发布 Agent" 'web/src/app/(user)/canvas'
```

Expected: 三组均无输出。

- [ ] **Step 4: 检查变更和用户原有改动**

Run: `git status --short && git diff --check`

Expected: 无空白错误；原有 `service/invocation_gate_registry_test.go` 和 `service/skill_seed_test.go` Seedance 3.2 改动仍存在且未被回滚。

- [ ] **Step 5: 更新计划勾选并完成目标审计**

逐项核对设计文档的九条验收标准。只有项目剧本无 Agent Plan、系统 Workflow 零 Agent Plan、画布唯一总控、审核/Artifact/Invocation/冻结/恢复均有直接证据时，才将目标标记为完成。
