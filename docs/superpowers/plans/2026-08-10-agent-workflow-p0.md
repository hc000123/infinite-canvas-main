# Agent Workflow P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一生产总控与分集工作台的六阶段定义和状态投影，并把用户侧“项目 Agent”入口明确命名为“生产总控”。

**Architecture:** 后端 Workflow Run / Invocation 继续作为远程执行真相，浏览器本地视频生产包继续作为视频阶段补充状态。本轮只新增一个前端 `ProductionStageProjection`，统一组合远程阶段、本地剧本、Worker 可用性和视频包进度；不改 Invocation、Artifact、Workflow Run 表结构和持久化路径。

**Tech Stack:** Next.js App Router、React、TypeScript、Node.js test runner、Zustand、Go Workflow API（只读既有契约）

---

### Task 1: Canonical production-stage projection

**Files:**
- Create: `web/src/app/(user)/projects/production-stage-projection.ts`
- Create: `web/src/app/(user)/projects/production-stage-projection.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.ts`

- [x] **Step 1: Write the failing canonical descriptor test**

```ts
test("exposes one canonical six-stage production descriptor", () => {
    assert.deepEqual(productionStageDefinitions.map(({ key, remoteStageId }) => ({ key, remoteStageId })), [
        { key: "script", remoteStageId: "script-adaptation" },
        { key: "asset-extraction", remoteStageId: "asset-extraction" },
        { key: "asset-production", remoteStageId: "asset-image-prompt" },
        { key: "storyboard", remoteStageId: "shot-breakdown" },
        { key: "prompt", remoteStageId: "shot-prompt" },
        { key: "video", remoteStageId: null },
    ]);
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test 'src/app/(user)/projects/production-stage-projection.test.mts'`

Expected: FAIL because `production-stage-projection.ts` does not exist.

- [x] **Step 3: Implement the canonical descriptor and projection**

```ts
export const productionStageDefinitions = [
    { key: "script", remoteStageId: "script-adaptation", label: "剧本确认", description: "确认不可变剧本快照" },
    { key: "asset-extraction", remoteStageId: "asset-extraction", label: "资产解析", description: "识别并校正资产槽位" },
    { key: "asset-production", remoteStageId: "asset-image-prompt", label: "资产生产", description: "生成、上传、绑定或保留文字占位" },
    { key: "storyboard", remoteStageId: "shot-breakdown", label: "结构化分镜", description: "编排镜头、节奏与连续性" },
    { key: "prompt", remoteStageId: "shot-prompt", label: "最终提示词", description: "生成并批准模型执行稿" },
    { key: "video", remoteStageId: null, label: "视频生成与预览", description: "手动启动并检查每个镜头" },
] as const;
```

实现 `projectProductionStages(input)`，统一处理最新 attempt、依赖解锁、Worker 阻断、占位 warning、镜头计数和视频完成状态；同时导出 `productionStageComplete`。

- [x] **Step 4: Reuse canonical keys in route normalization**

`workflow-route-state.ts` 从 canonical module 导入 `productionStageKeys` 和 `ProductionStageKey`，不再维护第二组六阶段 key。

- [x] **Step 5: Run focused tests and verify GREEN**

Run: `node --experimental-strip-types --test 'src/app/(user)/projects/production-stage-projection.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-route-state.test.mts'`

Expected: PASS.

### Task 2: Migrate both production surfaces

**Files:**
- Modify: `web/src/app/(user)/agent/agent-workspace-model.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts`
- Modify: `web/src/app/(user)/agent/agent-workspace-model.ts`
- Modify: `web/src/app/(user)/agent/components/agent-stage-gates.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-workbench.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-stage-rail.tsx`
- Delete: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.ts`
- Delete: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-view-types.ts`

- [x] **Step 1: Add failing source-of-truth tests**

```ts
assert.match(agentModelSource, /projectProductionStages/);
assert.doesNotMatch(agentModelSource, /remoteOr\(|latestRemoteStages\(/);
assert.match(workbenchSource, /projectProductionStages/);
```

- [x] **Step 2: Run the Agent and Workflow focused tests and verify RED**

Run: `node --experimental-strip-types --test 'src/app/(user)/agent/agent-workspace-model.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts'`

Expected: FAIL because both surfaces still own separate projection logic.

- [x] **Step 3: Migrate the Agent overview**

`buildAgentEpisodeView` 调用 `projectProductionStages`，只保留项目/分集聚合与 attention 状态计算；Agent 阶段状态 UI 补齐 queued、cancel_requested 和 rejected 的展示。

- [x] **Step 4: Migrate the episode workbench**

`useWorkflowWorkbench` 直接调用 `projectProductionStages`，阶段轨道直接使用共享类型，删除原阶段汇总和视图类型文件。

- [x] **Step 5: Run focused tests and verify GREEN**

Run: `node --experimental-strip-types --test 'src/app/(user)/projects/production-stage-projection.test.mts' 'src/app/(user)/agent/agent-workspace-model.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-summary.test.mts'`

Expected: PASS.

### Task 3: Clarify product naming and document the boundary

**Files:**
- Modify: `web/src/app/(user)/agent/agent-workspace-wiring.test.mts`
- Modify: `web/src/app/(user)/projects/project-detail-navigation.test.mts`
- Modify: `web/src/app/(user)/agent/page.tsx`
- Modify: `web/src/app/(user)/agent/agent-workspace.tsx`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workbench/components/episode-production-shell.tsx`
- Modify: `web/src/constant/navigation-tools.ts`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [x] **Step 1: Write failing naming tests**

```ts
assert.match(workspace, /生产总控/);
assert.doesNotMatch(workspace, />项目 Agent</);
assert.match(navigation, /name: "生产总控"/);
```

- [x] **Step 2: Run naming tests and verify RED**

Run: `node --experimental-strip-types --test 'src/app/(user)/agent/agent-workspace-wiring.test.mts' 'src/app/(user)/projects/project-detail-navigation.test.mts'`

Expected: FAIL because the production surface is still called “项目 Agent”.

- [x] **Step 3: Update user-facing naming**

把 `/agent`、项目入口和工作台跳转文案统一为“生产总控”；`/projects/:id/agents` 继续使用“Agent 中心”，用于定义、版本和 Skill 组合。

- [x] **Step 4: Update project documents**

`docs/todo.md` 写清“生产总控是 Workflow Run / Invocation 的项目投影”；`docs/pending-test.md` 增加六阶段一致性和双入口命名的人工验收项。

- [x] **Step 5: Run focused tests and full frontend verification**

Run: `npm test && npm run typecheck`

Expected: all tests pass and TypeScript exits 0.
