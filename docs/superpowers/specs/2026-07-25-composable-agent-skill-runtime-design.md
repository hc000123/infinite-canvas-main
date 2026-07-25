# 可组合 Agent + Skill 能力运行时设计

## 状态

- 设计已经用户逐节确认。
- 本文是总架构规格，实施拆成六个可独立验收的子项目。
- 本文不授权直接实施；进入开发前需要另行编写实施计划。

## 背景

项目当前同时存在两套能力配置：

1. 前端 Agent 配置和本地 `workflow preset`，包含 Agent 提示词、Skill 摘要、模型参数、工作流阶段和质量门摘要。
2. 后端 Workflow Skill 版本中心，包含六阶段 Skill 包、输入输出契约、评测、灰度、发布、回滚和运行快照。

新生产工作流已经使用后端 Workflow Skill 快照，旧前端 preset 仍被部分页面和本地 Runner 使用。两套数据源对 Agent、Skill、Workflow 的边界定义不一致，因此无法稳定支持跨工作流、图片页、画布和单次任务的自由组合。

## 目标

建立一套通用的可组合能力系统：

- Skill 是可独立发布、测试和运行的原子能力。
- Agent 是可独立运行的执行与调度主体，可携带默认 Skill，也可在调用时覆盖。
- Workflow 引用 Agent 和 Skill，负责节点、数据流、分支、并行、路由和人工确认。
- 图片页、画布、工作流和 API 共用一套 Capability Runtime，不再自己拼提示词或复制 Skill 内容。
- 中间产物使用统一 Artifact 模型，保证同一份资产信息可以被多个图片、分镜和提示词 Skill 复用。
- 设计时可跟随推荐版，工作流发布和任务启动时必须冻结 Agent、Skill、Workflow 和 Schema 的精确版本及内容快照。

## 非目标

第一版不实现：

- 公开能力市场、订阅、付费分发和跨团队商业化。
- 无确认的自主扣费、生图、生视频、批量执行或业务写入。
- 让 Agent 为选择 Skill 而把全部 Skill 正文加载到模型上下文。
- 为现有前端本地 preset 和旧 Agent 提示词建立长期双写或兼容层。

## 已确认的设计决策

1. Agent 与 Skill 分别发布，运行时使用版本化引用组合。
2. Agent 可保存默认 Skill 组合；Workflow、画布和单次调用可以增删或替换 Skill。
3. 画布对话 Agent 使用混合调度：用户可手动锁定 Skill，未指定时由 Agent 匹配并推荐。
4. Workflow 节点支持三种 Skill 绑定模式：`fixed`、`tag_route`、`manual_before_run`。
5. 核心 Artifact 使用统一 Schema；Skill 可以使用命名空间扩展字段，不得篡改核心事实和引用 ID。
6. 设计态可引用推荐版或兼容范围；发布和运行态解析为精确版本。
7. 任何已发布 Skill 都可通过通用 Skill Runner 独立运行，不强制绑定 Agent。
8. 生成产物与写入业务目标分离，写入必须经过独立审核与幂等 Apply。

## 总体架构

```text
Workflow / Image / Canvas Chat / Direct API
                     |
              Invocation API
                     |
    +------------------------------------+
    | Capability Runtime                 |
    | Resolver -> Planner -> Policy      |
    | -> Executor -> Gate -> Trace       |
    +------------------------------------+
       |          |          |         |
    Skill      Agent     Workflow   Artifact
   Registry   Registry   Registry   Registry
```

### Capability Runtime

Capability Runtime 是所有调用入口共用的执行层，由五个逻辑单元组成：

- Resolver：验证可见范围，把推荐版和兼容范围解析为精确版本。
- Planner：为 Agent 调用和画布对话生成多步 Skill 计划；直接 Skill 调用生成单步计划。
- Policy：检查模型、工具、成本、副作用、审核和写入权限。
- Executor：运行 Agent、Skill、模型与工具，产生原始输出。
- Gate/Trace：执行 Schema 和服务端硬门禁，保存快照、输入、产物、审核、费用与错误记录。

## 核心领域对象

### Skill

Skill 定义“一项工作怎么完成”。Skill 稳定身份和不可变版本分离保存。

`SkillDefinition` 至少包含：

- `skillId`
- `name`
- `summary`
- `ownerType`: `system` 或 `project`
- `ownerProjectId`
- `enabled`
- `recommendedVersionId`
- `createdAt` / `updatedAt`

`SkillVersion` 至少包含：

- `skillVersionId`
- `skillId`
- `version`
- `status`: `draft` / `published` / `archived`
- `manifest`
- `files`
- `inputContract`
- `outputContract`
- `qualityGateProfile`
- `contentHash`
- `evaluationSummary`
- `createdBy` / `publishedAt`

Agent、Skill、Workflow 和核心 Schema 版本统一使用语义化版本。设计态引用可以使用推荐版或语义化兼容范围；发布和运行快照中只允许精确版本 ID。

`SkillManifest` 是检索和路由层，不包含完整 Skill 正文：

```json
{
  "capabilities": ["asset.character.rendition"],
  "inputArtifactTypes": ["asset_record"],
  "outputArtifactTypes": ["asset_brief"],
  "projectTags": ["vertical", "short_drama"],
  "schemaCompatibility": {
    "asset_record": ">=1.0 <2.0"
  },
  "sideEffects": ["none"],
  "estimatedCostClass": "text_low"
}
```

Skill 不保存模型 API Key、项目运行数据、画布节点或 Agent 整段提示词。

### Agent

Agent 定义“由谁理解、选择和执行”。Agent 可对话、运行默认 Skill，或根据允许范围调度其他 Skill。

`AgentDefinition` 至少包含：

- `agentId`
- `name`
- `summary`
- `ownerType` / `ownerProjectId`
- `enabled`
- `recommendedVersionId`

`AgentVersion` 至少包含：

- `agentVersionId`
- `agentId`
- `version`
- `status`
- `rolePrompt`：只包含身份、职责、对话方式和调度边界
- `modelPolicy`
- `toolPolicy`
- `executionPolicy`：超时、并发、fallback、成本上限、写入策略
- `defaultSkillRefs`
- `skillAccessPolicy`：允许检索的 capability、标签或 Skill ID 范围
- `contentHash`

Agent 不复制 Skill 的 `SKILL.md`、输出 Schema、示例或质量门。

`defaultSkillRefs` 在 Agent 草稿中可以引用推荐版或兼容范围。Agent 版本发布时将当时默认组合解析为精确 Skill Version ID；调用时覆盖项在 Invocation 预检时解析。

### Workflow

Workflow 定义节点、数据流、分支、并行、确认点和引用关系，不内嵌 Agent 或 Skill 内容。

`WorkflowNode` 至少包含：

- `nodeId`
- `name`
- `executorType`: `skill` 或 `agent`
- `agentRef`：可选
- `skillBindings`
- `inputBindings`
- `outputArtifactType`
- `dependsOn`
- `condition`
- `confirmationPolicy`
- `retryPolicy`

`SkillBinding` 有三种模式：

1. `fixed`：引用 Skill ID 和推荐版/兼容范围；发布时解析为精确版本。
2. `tag_route`：保存 capability、输入/输出类型、项目标签和候选范围；运行预检时确定精确版本。
3. `manual_before_run`：运行前显示通过契约检查的候选版本，由用户选择。

Workflow 发布后的版本不可原地修改。项目自定义通过复制或新建版本完成，不修改系统内置版本。

### Artifact

Artifact 是任何执行产生的不可变中间产物。

```json
{
  "artifactId": "artifact-...",
  "artifactType": "asset_catalog",
  "schemaVersion": "1.0.0",
  "projectId": "project-...",
  "episodeId": "episode-...",
  "parentArtifactIds": [],
  "producerInvocationId": "invocation-...",
  "contentHash": "sha256:...",
  "payload": {},
  "extensions": {},
  "createdAt": "..."
}
```

约束：

- 任何修订都生成新 Artifact，不原地覆盖历史内容。
- 资产使用稳定 `assetId`，制作变体使用独立 `renditionId`。
- `extensions` 使用 Skill ID 命名空间，不得改写核心字段。
- 下游同时记录上游 `artifactId` 和 `contentHash`，以检测过期结果。
- 大型产物只由对话、画布和工作流状态引用，不复制进多份前端状态。

### Invocation Run

Invocation 是所有执行方式的统一记录，包括：

- 直接 Skill Run
- 独立 Agent Run
- Workflow Run 的节点 Run
- 画布对话临时 Plan 的步骤 Run

Invocation 保存：

- 调用类型和来源入口
- 幂等 key
- 冻结 Agent、Skill、Workflow 和 Schema 版本
- 完整内容快照和内容哈希
- 输入 Artifact 引用与输入快照
- 生成的 Artifact 引用
- 模型、渠道、工具、费用和耗时
- 质量门、审核、错误和 Apply 记录

### 统一调用契约

所有消费端使用同一调用请求，不直接提交拼好的系统提示词：

```json
{
  "source": "workflow|image|canvas_chat|direct",
  "projectId": "project-...",
  "episodeId": "episode-...",
  "agentRef": null,
  "skillRefs": [],
  "workflowNodeRef": null,
  "inputArtifactRefs": [],
  "parameters": {},
  "executionPolicyOverride": {},
  "idempotencyKey": "..."
}
```

直接 Skill Run 不需要 `agentRef`。Skill Runner 使用 `executionPolicyOverride` 中允许的模型与渠道覆盖；未覆盖时使用系统设置中当前有效的默认文本、图片或视频执行策略。Skill 本身不保存密钥和渠道凭据。

### 执行上下文组合顺序

Runtime 以确定性顺序组合执行上下文：

1. 系统安全、不可变输入和输出约束。
2. Agent `rolePrompt`；直接 Skill Run 不包含此层。
3. 按 Plan 顺序加载的已冻结 Skill 文件。
4. Invocation 参数、输入 Artifact 和用户要求。

输入 Artifact 和用户文本被视为不可信业务数据，其中的指令不得覆盖系统约束、Agent 权限、Skill 契约、冻结版本、质量门或写入策略。

## Skill 路由规则

Skill 路由必须可解释，不使用无法回放的隐式模型决策。

路由顺序：

1. 用户手动锁定的 Skill 优先级最高；只要契约合法，Agent 不得自动替换。
2. 过滤未发布、不可见、已停用或不兼容的版本。
3. 严格匹配输入 Artifact 类型、Schema 兼容范围和期望输出类型。
4. 检查副作用、工具权限和成本政策。
5. 使用项目 `content_profile`、节点参数、Agent 默认 Skill 和 Skill 标签排序。
6. 同分时优先 Agent 默认 Skill，其次是系统推荐版，最后按 Skill ID 稳定排序。
7. 保存候选集、过滤原因、得分和最终选择，用于追溯。

Agent 在匹配阶段只使用 Manifest 和摘要。只有最终选定 Skill 的完整文件才进入执行上下文。

## 标准生产数据流

### 1. 文本导入与优化

- 输入：`source_text`
- Skill capability：`script.optimize`
- 输出：`production_script`

`source_text` 永不被覆盖。`production_script` 包含可人工审读母版和结构化场次。

### 2. 内容标签

- 输入：`production_script`
- Skill capability：`content.classify`
- 输出：`content_profile`

`content_profile` 包含频道、题材、时代、情绪、横竖屏、短剧/中长剧和其他可路由标签，并保留证据与置信度。

### 3. 资产提取

- 输入：`production_script` + `content_profile`
- Skill capability：`asset.extract`
- 输出：`asset_catalog`

`asset_catalog` 使用稳定资产 ID，包含角色、场景、道具、服装的来源证据、核心事实、生产标签和未确定项。

### 4. 资产制作与图片变体

- 输入：`asset_record` + 可选 `content_profile` + 可选参考图
- Skill capability 示例：
  - `asset.character.rendition`
  - `asset.scene.rendition`
  - `asset.prop.rendition`
- 输出：`asset_brief`，生成图片后得到 `asset_rendition`

多个图片 Skill 可以使用同一 `asset_record`，产生角色定妆板、三视图、场景四宫格、道具白底图或特定项目画风。它们共享资产 ID，但各自拥有 rendition ID、Skill 版本、格式参数和生成元数据。

### 5. 分镜制作

- 输入：`production_script` + `content_profile` + 已批准资产引用
- Skill capability：`storyboard.create`
- 输出：`storyboard_package`

Workflow 可根据横/竖屏、短剧/中长剧、题材和项目要求路由到不同分镜 Skill。

### 6. 视频提示词

- 输入：`storyboard_package` + `asset_rendition` 引用 + 可选平台配置
- Skill capability：`video.prompt.compose`
- 输出：`video_prompt_package`

视频提示词 Skill 组合已批准分镜和资产变体，不重新推断资产核心事实。提示词模板通过 Skill 版本持续迭代。

## 画布对话 Agent

画布对话 Agent 是通用 Skill 库的动态入口。每个复杂请求被转成一个可审查、可修订的临时 Workflow Plan。

调度顺序：

1. 收集对话、选中画布节点、附件、项目标签和已批准 Artifact。
2. 解析任务目标、输入类型、期望输出和限制条件。
3. 使用 Skill Manifest 过滤和排序候选 Skill。
4. 生成临时 Plan，显示步骤、依赖、精确版本、输入绑定、预期产物和预估费用。
5. 用户可以替换 Skill、删除步骤、改参数或锁定版本。
6. 需要扣费、生图、生视频、批量执行或写入时，必须显式确认。
7. 确认后冻结 Plan revision 和所有版本，逐步产生 Invocation 和 Artifact。
8. 结果先在对话中预览，用户批准后再创建或更新画布节点。

`TemporaryPlan` 至少包含：

```json
{
  "planId": "plan-...",
  "revision": 1,
  "agentVersionRef": "agent-version-...",
  "steps": [
    {
      "stepId": "step-1",
      "skillVersionRef": "skill-version-...",
      "inputBindings": [],
      "dependsOn": [],
      "parameters": {},
      "expectedOutputType": "asset_brief"
    }
  ],
  "estimatedCost": 0,
  "confirmationRequirements": []
}
```

对话消息保存 `planId`、`invocationId` 和 `artifactId`，不把大型产物完整复制进消息数据。

## 四个产品中心

### Skill 中心

用于定义、检索、测试、评测和发布任意 Skill，不再锁死六个工作流阶段。现有 Workflow Skill 版本中心泛化后成为该入口。

页面包含：

- 搜索、capability、输入/输出类型、标签和所有者筛选
- 版本轨道、推荐版、内容哈希和发布状态
- Manifest、Skill 文件、契约、质量门和评测编辑
- 独立试运行、同输入对比和评测报告
- 项目灰度、系统推荐和回滚

### Agent 中心

用于定义职位、模型策略、工具权限、执行策略、默认 Skill 和 Skill 访问范围。

页面不再维护阶段 Skill 全文、输出 Schema 或前端硬编码 workflow preset。Agent 可在中心里独立对话测试，并被画布、Workflow 或 API 调用。

### Workflow 中心

用于编辑和发布节点图、分支、并行、输入输出绑定、Agent/Skill 引用、三种路由模式和确认点。

项目可以选择已发布 Workflow 模板，复制成项目草稿后覆盖节点绑定。

### Run 中心

统一查看直接 Skill、独立 Agent、Workflow 和画布临时 Plan 的运行记录，包括冻结版本、输入快照、Artifact、质量门、费用、失败重试、续跑、审核和 Apply 记录。

### 消费端

- 图片页使用统一能力选择器，按当前资产类型过滤可用 Skill。
- 画布节点菜单可直接选 Skill；对话面板选 Agent，由 Agent 匹配 Skill。
- 项目工作流选择 Workflow 模板，显示当前项目的节点路由结果和可替换 Skill。
- 以上页面均不保存 Agent、Skill 或 Workflow 的第二份内容。

## 可见范围与权限

第一版只支持：

- `system`：系统内置，普通用户只读和调用，管理员发布和回滚。
- `project`：项目自定义，项目成员可依权限创建、测试和发布到本项目。

本子系统不新增一套项目 RBAC。`project` 权限直接沿用现有项目访问与编辑权限；当前只有项目所有者时，即只有所有者可编辑和发布项目自定义能力。

普通用户修改系统对象时，必须复制成项目草稿，不得原地修改系统版本。

Capability Runtime 在计划和预检阶段同时验证：

- 对象可见性
- Agent 的 Skill 访问范围
- Skill 工具和副作用声明
- 模型与渠道可用性
- 项目预算和单次成本限制
- 写入目标和人工确认要求

## Invocation 状态机

```text
planned
  -> preflight
  -> awaiting_confirmation
  -> queued
  -> running
  -> needs_review
  -> approved
  -> applied
```

旁路状态：

- `blocked`：缺少输入或等待上游产物
- `failed`：当前步骤失败
- `partial`：批量或并行步骤部分成功
- `rejected`：人工驳回产物
- `cancelled`：用户或系统取消

进入 `queued` 前必须冻结精确版本、内容快照、输入引用和执行参数。

## 质量门

每个 Invocation 经过四层检查：

1. Input Contract：Artifact 类型、Schema 兼容性、必需字段、媒体数量和格式。
2. Output Schema：输出必须通过 Skill 发布的 JSON Schema。
3. Business Gate：服务端验证剧本事实、资产 ID、引用完整性、分镜时长和其他硬规则。
4. Policy Gate：合规、成本、工具权限、写入范围和人工确认。

Skill 可以增加业务检查，不能关闭系统必需硬门禁。产物未通过时保留原始输出和报告，不自动 Apply。

## 失败与恢复

### 无可用 Skill

不创建执行任务，返回每个候选被过滤的原因，并提示需要补充的输入或可改用的 capability。

### 输入不完整

状态为 `blocked`，记录缺少的 Artifact 类型、字段或媒体。上游补齐后重新预检。

### 模型、网络或 Worker 失败

按幂等 key 和重试策略恢复。重试不重复预留费用、创建 Artifact 或执行 Apply。

### Schema 或质量门失败

保留原始输出、结构化问题和质量门报告。用户可以修复后重验证，或在保留上游 Artifact 的前提下替换 Skill/版本重跑。

### 部分成功

批量和并行步骤保留已通过的单项 Artifact，只重跑失败项。整批产物在所有必需项通过前保持 `partial`。

### Apply 失败

Apply 使用独立幂等 key、目标 ID 和 Artifact hash。失败后可单独重试 Apply，不重新调用模型。

## 实施分解

本设计包含多个独立子系统，不作为一次性重写实施。

### Phase 1：通用 Skill Registry

- 将现有六阶段 Workflow Skill 泛化为任意 capability 的 Skill Definition / Version。
- 新增 Skill Manifest、输入/输出 Artifact 类型和 Schema 兼容性。
- 现有 3.0.1 六个 Skill 包作为首批系统内置版本。
- 保留现有评测、灰度、推荐版和回滚能力。
- 新增独立 Skill 试运行入口。

### Phase 2：Artifact + Invocation Runtime

- 新增统一 Artifact 外壳和核心 Schema Registry。
- 实现 Resolver、Preflight、Skill Runner、版本快照、幂等、质量门和 Trace。
- 提供统一 Invocation API 和 Run 查询。

### Phase 3：正式生产工作流切换

- 将现有生产工作流节点切换到 Invocation Runtime。
- 将现有工作流产物封装为标准 Artifact。
- 保留当前硬质量门、快照、审核和 Apply 语义。

### Phase 4：Agent Registry + Agent Runtime

- 建立 Agent Definition / Version。
- 实现默认 Skill、Skill 访问范围、模型/工具/执行策略。
- 实现 Agent 独立运行、Skill 匹配和 Temporary Plan。
- 将旧 Agent 中的业务规则移入 Skill，只保留职位和执行策略。

### Phase 5：Workflow Composer

- 建立 Workflow Definition / Version 和可组合节点图。
- 实现 `fixed`、`tag_route`、`manual_before_run` 三种节点路由。
- 实现项目复制、路由预览、成本预估、契约预检和发布。

### Phase 6：画布和图片入口

- 图片页和画布节点接入统一能力选择器。
- 画布对话 Agent 接入 Temporary Plan 和 Invocation Runtime。
- 将结果通过 Artifact 引用回写对话和画布。
- 在等价能力验收后删除前端硬编码 workflow preset、`projectWorkflowSelections` 和重复业务 prompt。

### 切换原则

- 不长期双写旧本地 preset 和新 Registry。
- 不为未上线旧数据建立通用兼容层。
- 系统内置 Skill 和 Agent 通过 seed 重建；项目本地 preset 在切换后重新选择。
- 每个 Phase 必须先完成端到端验收，再移除对应旧路径。

## 测试与验收

### 单元与契约测试

- Skill Manifest 规范化、可见性和不可变版本。
- Agent 默认 Skill 与调用覆盖合并。
- 三种 Workflow 路由模式。
- 标签路由排序的确定性和可解释记录。
- Schema 兼容性、Artifact 哈希与过期检测。
- Invocation 版本解析、快照和幂等。
- 四层质量门和 Apply 幂等。

### 集成测试

- 直接运行单个 Skill。
- 独立 Agent 使用默认 Skill 和调用时替换 Skill。
- Workflow 固定路由、标签路由和运行前选择。
- 画布对话生成 Temporary Plan，修改计划，确认后执行和回写。
- 失败重试、部分成功、从失败步续跑、取消和幂等 Apply。
- 切换推荐版后，已启动任务仍使用原快照。

### 真实全链路验收

使用一部固定测试剧本完成：

1. 原始文本优化成生产母版。
2. 提取频道、题材、画幅和剧集类型标签。
3. 提取角色、场景、道具和服装并生成稳定 ID。
4. 使用至少三个图片格式 Skill 处理同一资产记录，确认共享核心事实但生成独立 rendition。
5. 根据横/竖屏和短剧/中长剧标签路由到对应分镜 Skill。
6. 组合已批准分镜和资产 rendition 生成视频提示词。
7. 使用画布对话 Agent 选择节点、生成临时 Plan、执行并回写产物。
8. 检查全链路版本快照、Artifact 引用、内容哈希、质量门、审核、费用和 Apply 记录。

真实模型调用必须在用户确认费用后执行。在自动 CI 中使用固定 mock 与契约样本；发布前另运行真实模型验收。

## 总体验收标准

以下条件全部满足时，总架构实施才算完成：

- 同一已发布 Skill 可在独立试运行、Workflow、图片页和画布 Agent 中使用，且使用同一 Skill Version ID。
- Agent 可以独立运行，默认 Skill 可在调用时被合法覆盖。
- Workflow 可以自由组合 Agent 和 Skill，并支持三种路由模式。
- 资产事实只提取一次，多个图片 Skill 使用同一资产 ID 产生不同 rendition。
- 工作流发布和任务启动均冻结精确版本与内容快照，更换推荐版不影响已启动任务。
- 所有扣费、生图、生视频、批量执行和写入动作都有明确确认记录。
- 任何失败都可查看候选路由、冻结快照、输入、原始输出、质量门和错误分类。
- 工作流、图片页和画布不再保存 Agent、Skill 或 Workflow 的重复内容。
- 前端硬编码 workflow preset、`projectWorkflowSelections` 和重复业务 prompt 在等价功能验收后移除。
