# Workflow、Skill 与画布总控 Agent 架构收口设计

## 目标

将 AI 生产架构收敛为三个清晰层级：

- Workflow 负责确定性的流程编排、依赖、条件、重试、审核和恢复。
- Skill 负责剧本、资产、分镜、提示词、生图和质检等原子业务能力。
- 画布对话只保留一个总控 Agent，负责理解用户目标并生成可审核的临时 Skill 计划。

正式生产入口不再依赖“剧本 Agent”“资产 Agent”“分镜 Agent”等固定岗位 Agent，也不再为了执行固定 Skill 链创建 Agent Plan。现有 Artifact、Invocation、版本冻结、质量门、人工审核、幂等 Apply 和任务恢复能力保持不变。

## 现状问题

当前 Agent 只支持 `configured_chain`，计划步骤来自版本中预先配置的 `defaultSkillRefs`。多数系统 Agent 只包装一个 Skill，“前期制作 Agent”也只是固定串联两个 Skill。因此固定岗位 Agent 没有执行动态拆解、选择或重规划，只在 Workflow 与 Skill 之间增加了 Agent Registry、Agent Plan、确认状态和前端选择层。

与此同时，Workflow Runtime 已经具备 DAG、输入绑定、条件、审批、重试和状态恢复能力；正式视频 Workflow 也已经直接通过 Invocation 调用 Skill。继续让固定生产节点经过 Agent Plan 会形成重复编排和双重状态源。

## 方案选择

采用“正式生产直连 Skill，画布保留单一总控”的方案。

不采用以下方案：

- 不把所有 Skill 固定塞进一个“总 Agent”。不同目标会被迫执行同一条链，仍然不具备真实编排能力。
- 不完全删除画布 Agent。画布对话仍需要把自然语言目标、节点上下文和 Skill Catalog 转为用户可确认的临时计划。
- 不在本次收口中立即删除 Agent Registry、Agent Plan 表和后端接口。它们先作为画布临时计划及历史代码的内部兼容层，退出正式生产入口；确认无剩余消费者后再单独清理。

## 目标架构

```text
项目 / 分集 / 正式 Workflow
        -> Skill Resolver
        -> Invocation Preflight
        -> 版本与输入快照
        -> Worker 执行
        -> Artifact + Quality Gate
        -> 人工审核
        -> 幂等 Apply

画布对话
        -> 唯一画布总控 Agent
        -> 读取画布上下文与可用 Skill Catalog
        -> 生成 Temporary Skill Plan
        -> 用户确认
        -> 逐步进入 Invocation Runtime
        -> 最终 Artifact 经确认写回画布
```

Workflow 是正式生产编排的唯一真相源；Invocation 是单次 Skill 执行的唯一真相源；Artifact 是阶段产物及血缘的唯一真相源。Agent Plan 不再出现在项目剧本、标准生产 Workflow 或视频 Workflow 的正式调用链中。

## 正式生产链改造

### 项目剧本入口

项目分集剧本优化从：

```text
系统剧本 Agent -> Agent Plan -> 剧本 Skill -> Invocation
```

改为：

```text
选定剧本 Skill -> Invocation Preflight -> 确认 -> 执行 -> 审核 -> Apply
```

制作人员仍能选择授权的剧本 Skill 精确版本。输入继续使用 `source_text`，输出继续使用 `production_script`，原有审核坐标由 `invocationId + attempt + artifactSetHash` 保证，不再需要 `agentPlanId`。

### 标准生产 Workflow

系统 Workflow 中的 `script` 和 `art` 节点从 Agent Executor 改为 Skill Executor，并固定或按能力解析对应 Skill 版本。其他节点保持现有 Skill Executor 方式。

Workflow Runtime 继续负责：

- 节点依赖与输入 Artifact 绑定；
- 条件与跳过规则；
- 每节点最大重试次数；
- 审核后解锁下游；
- 取消、失败、部分完成和刷新恢复。

### 正式视频 Workflow

正式视频 Workflow 已经通过 `PreflightInvocation` 调用阶段 Skill。本次只清理残留 Agent 文案、类型命名和无效入口，不改变阶段表投影、媒体输入、质量门、费用或 Worker 边界。

## 画布总控 Agent

画布助手不再展示岗位 Agent 下拉选择器，也不让用户在多个系统 Agent 之间选择。对用户只存在一个“画布总控”。

总控职责：

1. 读取当前画布、选中节点、上下游关系、项目和分集工作流上下文。
2. 读取当前用户可调用的已发布 Skill 摘要、输入输出契约和费用摘要。
3. 根据用户目标生成临时计划，计划只包含明确的 Skill 步骤、输入绑定、预期输出和原因。
4. 在确认前允许用户删除、调整或替换步骤。
5. 用户确认后逐步进入统一 Invocation Runtime；需要人工审核的步骤必须停在审核状态。
6. 最终 Artifact 先形成写回预览，用户确认后才创建画布节点、连线或素材引用。

总控不得复制 Skill 业务规则，不得绕过 Skill 契约、质量门、人工审核和扣费确认，也不得直接修改项目正式数据。

第一阶段继续复用 Agent Plan 的冻结步骤、预检和逐步执行能力，但 Agent 身份固定为画布总控，页面和正式 Workflow 不再暴露通用岗位 Agent 选择。总控新增 `catalog_plan` 规划模式：版本只定义 Role Prompt、Skill 访问策略、工具策略和最大步骤数，不携带固定 `defaultSkillRefs`。普通岗位 Agent 的 `configured_chain` 模式作为兼容能力保留。

总控调用模型时传入经过权限过滤的 Skill Catalog，只包含 Skill 名称、精确版本、能力、输入输出 Artifact 类型、费用摘要和工具要求。模型返回以下受限计划，不返回或复制 Skill 正文：

```json
{
  "kind": "answer | plan",
  "answer": "普通问答内容",
  "summary": "计划摘要",
  "steps": [
    {
      "stepKey": "唯一步骤键",
      "skillVersionId": "已发布精确版本",
      "inputBindings": [],
      "parameters": {},
      "expectedOutputType": "输出 Artifact 类型",
      "reason": "选择原因"
    }
  ]
}
```

`kind=answer` 时只显示普通回复，不创建计划；`kind=plan` 时，前端先按当前 Catalog、访问策略、最大步数、Artifact 契约和依赖顺序校验，再把合法步骤作为 `skillOverrides` 创建冻结 Agent Plan。后端仍以 Agent Package 访问策略和 Invocation Preflight 做最终校验，不能信任模型输出。后续若 Agent Plan 仅剩画布消费者，可再重命名为 Assistant Plan，避免领域概念混淆。

## 系统 Agent 与管理入口

- 停止在新的系统数据中推荐固定岗位 Agent 作为正式生产入口。
- 新数据库只发布一个系统画布总控 Agent；不再种入固定岗位系统 Agent。
- 画布只解析唯一的系统总控 Agent，不显示旧数据库中的其他系统或项目岗位 Agent。
- 项目剧本页、Workflow 编辑器和正式执行控制台不再读取 Agent Registry 来决定生产节点。
- Agent 管理与 Plan 接口暂时保留为兼容层；用户生产导航不再把它们作为主流程入口。
- 不迁移或兼容旧浏览器业务数据。旧服务端 Agent 记录不参与新生产链，后续清理时单独处理。

## 数据与状态边界

本次不改变以下核心契约：

- Skill Definition / Version 及其内容哈希；
- Artifact Definition、Payload、Schema Version 和血缘引用；
- Invocation 的预检、Revision、Attempt、扣费、质量门、审核和 Apply；
- Workflow Execution 的 Revision、Node Execution、确认指纹与恢复状态；
- 视频 Workflow 的阶段投影、媒体批次和本地应用回执。

需要调整的调用方不得通过复制旧 Agent 状态来模拟兼容。正式入口直接保存 Invocation 坐标；画布临时计划保存总控计划坐标和每一步 Invocation 坐标。

## 错误处理

- Skill 不可用、版本未发布或契约不匹配时，在 Invocation Preflight 阶段阻断，不创建执行尝试。
- Workflow 节点失败继续按现有节点状态和重试策略处理，不回退到岗位 Agent。
- 画布总控无法生成合法计划时，只返回可读错误或空计划，不自动执行兜底 Skill。
- 临时计划中的输入 Artifact 已变化时，原确认指纹失效，必须重新预检和确认。
- 任一步骤进入 `needs_review` 时，总控停止推进，直到用户批准或驳回。
- 写回画布失败不得改变已批准 Artifact；重试写回依靠现有幂等消费回执避免重复节点。

## 实施顺序

1. 将项目剧本入口迁移为直接 Skill Invocation，保持现有剧本审核体验。
2. 将标准生产 Workflow 的 Agent 节点改为 Skill 节点，更新路由预览和种子测试。
3. 收口画布助手为唯一总控，移除岗位 Agent 选择和固定 Agent 候选逻辑。
4. 清理生产导航、页面文案和 API 消费端中的固定岗位 Agent 概念。
5. 更新 `docs/workflow.md`、`docs/todo.md`、`docs/pending-test.md`、`docs/backend-database.md` 和 `CHANGELOG.md` 中受影响的架构说明；用户完成真实验收后再更新 `docs/features.md`。

## 验收标准

- 项目剧本优化成功执行时不会创建 Agent Plan，只创建 Skill Invocation、Attempt 和输出 Artifact。
- 系统标准生产 Workflow 的所有正式节点均为 Skill Executor，执行记录中不存在 `agentPlanId`。
- 正式视频 Workflow 继续冻结精确 Skill 版本和输入，审核、Apply、重试与刷新恢复行为不变。
- 画布助手不再出现岗位 Agent 选择器，只显示一个总控入口。
- 普通问答不会创建 Temporary Plan；只有通过 Catalog 和契约校验的 `plan` 响应才能创建计划。
- 画布总控生成的临时计划在确认前不会执行 Skill；确认后每一步都能追溯到冻结的 Invocation。
- 未审核 Artifact 不能写入项目正式数据或画布，重复写回不会创建重复节点。
- 新安装或新数据库不再把固定岗位 Agent 作为生产默认项。
- 相关文档不再把剧本、资产、分镜和视频阶段描述成必须经过独立 Agent。

## 非目标

- 本次不引入 LangGraph、AutoGen、Dify 或新的大型 Agent 框架。
- 不让画布总控自动批准、自动写入或自动触发扣费生成。
- 不改变 Skill 的领域规则、输出 Schema 或现有 Artifact 类型。
- 不重做 Workflow 编辑器视觉设计。
- 不在同一次改造中物理删除所有 Agent 数据表和历史接口。
