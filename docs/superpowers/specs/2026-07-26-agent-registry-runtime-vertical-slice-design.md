# Agent Registry + Runtime 首个可见纵向切片设计

## 状态

已批准。用户授权后续由 Codex 自主选择推荐方案，不再逐项询问。本设计是《可组合 Agent + Skill 能力运行时设计》的 Phase 4 首个纵向切片，不改变已批准的总架构。

## 目的

把已经完成的通用 Skill Registry、Artifact Registry 和 Invocation Runtime 变成用户可以直接操作的 Agent 产品闭环：

1. Agent 可以独立定义、版本化、校验和发布。
2. Agent Version 只保存角色与执行策略，通过引用组合已发布 Skill，不复制 Skill 正文、Schema 或质量门。
3. 用户可以在 Agent 中心导入文本为源 Artifact，生成可审查的 Temporary Plan。
4. 用户确认后按计划执行既有 Invocation，逐步产生 Artifact，并完成审核。
5. 后续 Workflow、画布、图片页和 API 复用同一 Agent/Plan 接口，不建立第二套执行路径。

## 方案比较

### 方案 A：扩展旧 AgentConfigRecord

在旧的固定七类 Agent 配置中增加 Skill ID 和运行按钮。改动少，但没有不可变 Agent Version，业务提示词、Schema 和 Skill 摘要仍会重复保存，无法成为 Workflow 和画布共用的稳定契约。

### 方案 B：一次完成所有消费端

同时重写 Agent 中心、Workflow Composer、画布对话和图片页。最终形态完整，但单次改动过大，无法尽快交付可操作结果，也难以独立验证边界。

### 方案 C：完整领域边界的纵向切片

先完成 Agent Registry、顺序 Temporary Plan 和 Agent 中心运行台；每一步调用现有 Invocation Runtime。该切片自身可运行、可审核、可追溯，后续消费端只增加入口和编排能力。

采用方案 C。

## 领域边界

### AgentDefinition

保存可变的产品身份：

- `id`
- `ownerType`: `system` 或 `project`
- `ownerProjectId`
- `name`
- `summary`
- `tags`
- `recommendedVersionId`
- `enabled`
- `createdAt` / `updatedAt`

系统 Agent 由 seed 创建；项目 Agent 只能被项目所有者编辑。系统 Agent 对普通用户只读，复制后成为项目草稿。

### AgentVersion

保存发布后不可变的执行定义：

- `id`
- `agentId`
- `version`
- `status`: `draft`、`published`、`retired`
- `rolePrompt`: 只描述职位、目标、决策风格和边界
- `plannerMode`: 首个切片为 `configured_chain`
- `defaultSkillRefs[]`
- `skillAccessPolicy`
- `modelPolicy`
- `toolPolicy`
- `executionPolicy`
- `contentHash`
- `createdBy` / `createdAt` / `updatedAt`

`defaultSkillRefs` 是有序引用，每项包含：

- `stepKey`
- `label`
- `capability`
- `skillId`、`skillVersionId` 或版本约束
- `required`
- `inputBindings`
- `parameters`
- `expectedOutputType`

Agent Version 不保存 Skill 文件、输入输出 Schema、质量门或业务提示词。发布时必须解析所有引用，并验证它们处于 Agent 的 Skill 访问范围内。

### AgentPlan

表示一次独立 Agent 调用：

- `id`
- `userId` / `projectId` / `episodeId`
- `agentId` / `agentVersionId`
- `goal`
- `status`
- `currentRevision`
- `estimatedCredits`
- `confirmationFingerprint`
- `createdAt` / `updatedAt`

状态为：

```text
draft -> preflight -> awaiting_confirmation -> running
      -> needs_review -> completed
```

旁路状态为 `blocked`、`failed`、`cancelled`。

### AgentPlanRevision 与 AgentPlanStep

每次修改 Skill、顺序、绑定或参数都创建新的不可变 Plan Revision。Step 保存：

- 顺序和依赖
- 冻结的 Skill Definition/Version ID 与内容哈希
- 源 Artifact 绑定或上游 Step 输出绑定
- 参数和预期 Artifact 类型
- 预检结果、确认要求和预估费用
- 对应的 `invocationId`
- 当前状态和输出 Artifact 引用

旧 Revision 永不被覆盖。

## 首个切片的计划能力

首个切片支持顺序 Skill 链，来源有两种：

1. Agent Version 发布的默认 Skill 链。
2. 运行前在访问策略允许范围内手动替换、插入、删除或排序 Skill。

它暂不使用模型自动创造任意图结构。该限制只约束首个可见切片；数据模型和 API 使用 Revision、Step 依赖与符号绑定，后续可增加 `adaptive` planner 和分支/并行，而无需更换 Registry 或 Invocation Runtime。

## 预检与确认

预检分两层：

1. 第一项使用真实 Artifact 引用调用既有 Invocation Resolver 和 Input Contract 检查。
2. 下游项在 Artifact 尚未产生时，使用上游输出 Schema 进行符号契约兼容检查。

预检冻结：

- Agent Version ID 与内容哈希
- 每一步 Skill Version ID、内容哈希和快照
- 输入 Artifact ID 与内容哈希
- 参数、预计输出和预计费用
- 所有确认要求

Plan 确认记录授权的 Revision、指纹和费用上限。执行时，如果任何版本、输入、参数、顺序或费用超出已确认快照，Plan 返回 `awaiting_confirmation`，不能静默继续。

扣费、生图、生视频、批量和 Apply 仍沿用既有显式确认规则。Plan 确认只能委托给快照中完全一致的 Step Invocation，不能扩大权限。

## 执行数据流

```text
文本导入
  -> source_text Artifact
  -> 选择已发布 Agent Version
  -> 默认 Skill 链 / 合法运行时覆盖
  -> Plan Preflight
  -> 显示版本、绑定、费用和确认项
  -> Confirm Plan Revision
  -> 创建并确认 Step 1 Invocation
  -> Worker 执行并产生 Artifact
  -> Step 1 needs_review
  -> 用户批准
  -> 将已批准 Artifact 绑定到 Step 2
  -> 继续既有 Invocation Runtime
  -> 最后一步批准后 AgentPlan completed
```

Agent Plan 是编排和追踪层，不直接调用模型，不直接扣费，不直接写业务表。每一步实际执行、质量门、费用、重试、审核和 Apply 都由现有 Invocation Runtime 负责。

## API

### Registry

- `GET /api/v1/agents?projectId=`：列出系统与当前项目可见 Agent。
- `POST /api/v1/agents`：创建项目 Agent 与首个草稿版本。
- `GET /api/v1/agents/:id`：读取 Definition、版本轨道和推荐版。
- `POST /api/v1/agents/:id/versions`：从指定版本创建草稿。
- `PATCH /api/v1/agent-versions/:id`：仅更新草稿。
- `POST /api/v1/agent-versions/:id/validate`：解析 Skill 引用并返回问题。
- `POST /api/v1/agent-versions/:id/publish`：发布不可变版本。
- `PUT /api/v1/agents/:id/recommended-version`：切换推荐版。

### Plan Runtime

- `POST /api/v1/agent-plans`：从 Agent Version、目标和源 Artifact 创建 Draft。
- `GET /api/v1/agent-plans/:id`：读取 Revision、Steps、Invocation 与 Artifact 摘要。
- `POST /api/v1/agent-plans/:id/revisions`：修改 Skill 链或绑定并创建新 Revision。
- `POST /api/v1/agent-plans/:id/preflight`：解析和冻结精确版本。
- `POST /api/v1/agent-plans/:id/confirm`：确认当前 Revision。
- `POST /api/v1/agent-plans/:id/continue`：在前一步批准后物化下一步 Invocation。
- `POST /api/v1/agent-plans/:id/cancel`：取消未完成 Plan，并请求取消当前 Invocation。

所有响应使用 `{ code, data, msg }`，所有读取和操作都按当前用户、项目权限和 Artifact 所有权隔离。

## Agent 中心界面

项目 Agent 中心改为三个连续区域，窄屏时垂直排列：

1. **Agent 列表与版本轨道**：区分系统/项目、草稿/已发布/推荐版，支持复制系统 Agent 为项目草稿。
2. **定义编辑区**：编辑职位、策略和有序 Skill 引用；Skill 选择器只展示当前项目可见的已发布版本，并显示 capability、输入输出类型和版本。
3. **独立运行台**：粘贴或导入文本创建 `source_text` Artifact，显示 Temporary Plan、预检、确认、步骤状态、Artifact 结果和审核动作。

界面不显示或编辑 Skill 全文、Schema 和质量门；需要查看时跳转 Skill 中心对应版本。

## 旧路径处理

- 新 Agent Registry 不写入旧 `AgentConfigRecord` 或前端 Zustand preset。
- 旧生产工作流在等价功能切换前继续读取旧配置，避免半迁移影响已有页面。
- Agent 中心新页面只读新 Registry；完成 Agent 独立运行验收后，再在后续切片逐个切换旧工作流消费端。
- 所有消费端完成后删除固定七类、`skillSummary` 和重复业务 prompt；不保留长期双写。

## 错误与恢复

- Skill 无权限、未发布或契约不兼容：预检失败，不创建 Invocation，并逐项显示原因。
- 源 Artifact hash 变化：确认指纹失效，必须重新预检。
- 推荐 Skill 版本变化：已确认 Revision 继续使用冻结版本；新 Plan 才使用新推荐版。
- Step 执行失败：保留之前已批准 Artifact；用户可重试现有 Invocation，或创建新 Revision 更换 Skill 后从失败 Step 继续。
- Step 需要审核：Plan 保持 `needs_review`，不会自动启动下游。
- 取消：取消当前运行中的 Invocation；未开始的 Step 不创建任务，也不扣费。
- Apply 失败：只重试既有 Invocation Apply，不重跑模型。

## 测试与验收

### Registry

- system/project 可见性和用户隔离。
- 草稿可修改、发布版不可修改、推荐版切换不改变旧 Plan。
- Agent 发布时拒绝越权、未发布或契约不合法的 Skill 引用。
- Agent 内容哈希覆盖所有执行字段，但不包含时间和展示统计。

### Plan 与 Runtime

- 默认 Skill 链和合法覆盖生成确定性 Revision。
- 符号输出绑定通过/拒绝契约兼容性测试。
- Preflight 冻结 Agent/Skill/Artifact hash 和费用。
- 错误指纹、错误 Revision 或越权用户不能 Confirm。
- Confirm 后逐步创建真实 Invocation，Artifact hash 正确传给下一步。
- Step 审核前不启动下游；批准后 `continue` 只创建一次下一步任务。
- retry、cancel、失败后换 Skill 新 Revision、推荐版切换、重复请求和并发请求保持幂等。
- Plan 取消和失败不重复扣费。

### HTTP 与前端

- Registry 和 Plan 路由使用真实 Gin Router、JWT 与用户隔离测试。
- 前端共享 API contract 覆盖成功与错误 DTO。
- Agent 中心完成创建项目 Agent、选择两个已发布 Skill、导入文本、预检、确认、运行、审核和查看 Artifact 的浏览器 E2E。

### 首个纵向切片完成标准

- 用户可以在界面创建并发布项目 Agent Version。
- Agent Version 可以保存两个或更多有序 Skill 引用，且不复制 Skill 正文。
- 文本能创建真实 `source_text` Artifact。
- Plan Preflight 显示冻结版本、契约检查、费用与确认要求。
- Confirm 后至少两个 Skill 通过同一 Invocation Runtime 顺序执行，上一步 Artifact 成为下一步真实输入。
- 每一步均可查看 Invocation、质量门、费用和审核；最后得到可查看的 Artifact。
- 失败、取消、重复继续和推荐版切换具有自动化证据。
- Agent 中心不再把旧固定七类配置作为新运行入口。

## 后续切片

完成本设计后继续总目标：

1. 将正式六阶段生产工作流切换为 Artifact/Invocation。
2. 增加 `adaptive` Agent Planner 和画布对话 Temporary Plan。
3. 建立 Workflow Definition/Version 与可组合节点图。
4. 图片页和画布节点接入统一能力选择器。
5. 删除所有已被新 Registry/Runtime 替代的旧 preset 和重复 prompt。
6. 使用固定剧本完成全链路效果验收和真实模型门禁验收。
