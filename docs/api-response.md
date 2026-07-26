# 前后端接口响应约定

后端业务接口统一返回 JSON：

```json
{
  "code": 0,
  "data": {},
  "msg": "ok"
}
```

- `code`: 业务状态码，`0` 表示成功，非 `0` 表示失败。
- `data`: 业务数据。失败时通常为 `null`。
- `msg`: 响应消息。成功默认为 `ok`，失败时放错误原因。

前端请求逻辑以 `code` 判断业务是否成功。当前后端业务失败也会返回 HTTP 200，前端不要只依赖 HTTP 状态码判断结果。

接口连接失败、服务不可达、返回体不是约定 JSON 时，前端按网络或接口异常处理。

## Artifact 与 Invocation Runtime 接口

下列 14 个接口均位于 `/api/v1`，必须携带 `Authorization: Bearer <token>`，并且只能读写 JWT 用户自己的 Artifact 和 Invocation。所有 JSON 写入请求都使用严格字段解码和大小上限；未知字段、`null`、追加 JSON 或超限请求会失败。

### Artifact（3 个）

| 接口 | 请求 | 安全响应 |
| ---- | ---- | ---- |
| `POST /artifacts` | 创建用户手动导入的 `source_text`：`artifactType`、`schemaVersion`、`projectId`、`episodeId`、`payload`、可选 `parentArtifactRefs`；不允许冒充 producer 或写入 Skill extensions。 | 返回 Artifact envelope：安全化 `artifact`、`parentArtifactIds`、`payload`、`extensions`。 |
| `GET /artifacts` | 查询参数：`project`、`episode`、`type`、`producerInvocation`、`approvalState`、`page`、`pageSize`。 | 返回所有者范围内的 `{ items, total, page, pageSize }`，列表项为 Artifact envelope。 |
| `GET /artifacts/:id` | 路径参数是 Artifact ID。 | 返回用户可见的 Artifact envelope；跨用户 ID 按不存在处理。 |

### Invocation（11 个）

| 接口 | 请求 | 安全响应 |
| ---- | ---- | ---- |
| `POST /invocations` | 仅接受 `source: "direct"`；可用 `skillVersionId` 准确锁定已发布版本，或用 Skill / Capability 条件解析；同时提交项目/分集、预期输出类型、带内容哈希的 `inputArtifactRefs`、`parameters`、`idempotencyKey` 和可选执行策略覆盖。 | 返回安全 Preflight DTO：`run`、版本摘要、冻结输入引用、执行策略摘要、路由摘要、确认要求和阻断原因；不返回请求哈希、完整 Skill/Schema 快照、渠道 ID/Key、原始输出或内部错误。 |
| `GET /invocations` | 查询参数：`project`、`episode`、`skillId`、`source`、`status`、`page`、`pageSize`。 | 返回 `{ items, total, page, pageSize }` 和安全的 run 摘要。 |
| `GET /invocations/:id` | 路径参数是 Invocation ID。 | 返回 run、revision/attempt 安全摘要、权威 Artifact refs/输出 envelope、gates、reviews、Apply 摘要、最新事件页和 `artifactSetHash`；不暴露 AgentRun ID、raw/structured output、内部 Trace 快照、Apply 回执/错误或密钥。 |
| `POST /invocations/:id/repreflight` | 仅允许 blocked 或执行目标失效的 direct Invocation 追加新预检；不可改变已冻结项目/分集边界。 | 返回新的安全 Preflight DTO，旧 revision/attempt 保留。 |
| `POST /invocations/:id/confirm` | `{ "requirementCodes": [...] }`，必须与当前 revision 冻结集合精确一致。 | 原子创建一个 attempt 和 AgentRun，返回安全 lifecycle DTO；重放同一确认不会重复入队。 |
| `POST /invocations/:id/cancel` | **Body 必须是 0 字节**；`{}`、空白或其他内容都会被拒绝。 | 返回取消后的安全 lifecycle DTO；取消和完成竞态在事务内收口。 |
| `POST /invocations/:id/retry` | **Body 必须是 0 字节**；只能重试 failed/cancelled/rejected/partial attempt。 | 返回追加 attempt 的安全 lifecycle DTO；冻结 revision、保留输出和失败 ordinal 计划不可改写。 |
| `POST /invocations/:id/revalidate` | `{ attempt, expectedRawOutputHash, output }`，只能校正 output-schema/business-gate 失败的当前 attempt。 | 不再调模型、不新建 AgentRun；保留 immutable raw output，追加校正 Trace 并重跑冻结契约。 |
| `POST /invocations/:id/review` | `{ decision: "approved" | "rejected", attempt, artifactSetHash, comment? }`，哈希必须对应当前完整有序 Artifact 集。 | 返回安全 lifecycle DTO；审核记录追加保存。 |
| `POST /invocations/:id/apply` | `{ idempotencyKey, attempt, artifactSetHash, target, targetId }`；仅允许当前 approved Artifact 集和服务端已注册 adapter。 | 返回不含 receipt/error/request hash 的 Apply 摘要；同键同请求只写一次，同键变更 body 冲突，失败保持 approved 并可用新键重试。 |
| `GET /invocations/:id/events` | 游标分页：`after` 为上次最后一条数字 ID，`limit` 经后端分页上限归一化；初次用 `after=0`。 | 按 ID 升序返回该用户 Invocation 的追加事件数组；跨用户游标查询按不存在处理。detail 内置事件页额外返回 `eventsHasMore / eventsNextAfter / eventsLimit`。 |

客户端不得把 `idempotencyKey`、`parameters`、Artifact payload 或任何业务文本当作服务端凭证；服务端也不会在上述 DTO 中回显 API Key、Authorization 头或完整执行请求。

## Workflow Registry 与 Composer Runtime 接口

下列接口均位于 `/api/v1`，需要登录。系统 Workflow 对用户只读可见；项目 Workflow、版本和 Execution 按 JWT 用户及项目隔离。所有写入请求使用严格字段解码，标记为 0 字节的生命周期接口不接受 `{}` 或空白正文。

| 接口 | 说明 |
| ---- | ---- |
| `GET /workflows?projectId=:id` | 返回用户可见的系统 / 项目 Workflow、版本摘要和推荐版本 Package。 |
| `POST /workflows` | 创建项目 Workflow 与首个草稿版本；Package 只保存 DAG、输入类型、Skill / Agent 引用、路由、条件、确认和重试策略。 |
| `GET /workflows/:id?projectId=:id` | 返回 Workflow、标签、版本和推荐 Package；跨用户项目 Workflow 按不存在处理。 |
| `POST /workflows/:id/copy` | 将可见系统 / 项目 Workflow 复制为指定项目的新 Workflow 草稿。 |
| `POST /workflows/:id/versions` | 为项目 Workflow 创建新的可编辑草稿版本。 |
| `GET /workflow-versions/:id` | 返回可见版本及完整 DAG Package。 |
| `PATCH /workflow-versions/:id` | 只允许修改项目 Workflow 的草稿；发布版本不可原地修改。 |
| `POST /workflow-versions/:id/validate` | **Body 必须是 0 字节**；校验节点 Key、依赖 DAG、输入映射、条件、路由和 Skill / Agent 契约，返回内容哈希与解析版本。 |
| `POST /workflow-versions/:id/preview` | 使用输入 Artifact、项目标签和手选版本预览每个节点的路由候选、分数、拒绝原因、阻断码、确认项和预计额度，不创建 Execution。 |
| `POST /workflow-versions/:id/publish` | **Body 必须是 0 字节**；校验通过后发布不可变版本。 |
| `PUT /workflows/:id/recommended-version` | `{ workflowVersionId }`；推荐版本必须属于同一 Workflow 且已经发布。 |
| `POST /workflow-executions/preflight` | 用精确发布版本、输入 Artifact、手选版本、项目标签、参数和幂等键冻结 Execution revision；不可执行的路由保留稳定阻断码。 |
| `GET /workflow-executions/:id` | 返回安全化 run、revision、节点坐标、路由预览、确认项和确认凭证，不暴露请求哈希或内部快照。 |
| `POST /workflow-executions/:id/confirm` | `{ revision, fingerprint, requirementCodes }` 必须精确匹配冻结 revision，确认后按 DAG 推进可运行节点。 |
| `POST /workflow-executions/:id/continue` | **Body 必须是 0 字节**；同步子 Invocation / Agent Plan 状态，并启动依赖已满足的后续节点。 |
| `POST /workflow-executions/:id/cancel` | **Body 必须是 0 字节**；停止继续调度，并向当前活动的 Invocation / Agent Plan 传播取消。 |

Skill 路由支持 `fixed`、`tag_route` 和 `manual_before_run`；候选不兼容时返回可展示的稳定错误码与 rejection reasons。节点输出始终引用统一 Artifact，不在 Workflow 表内复制业务产物。

## 视频工作流接口

视频工作流用户接口均位于 `/api/v1`，需要登录，并按 `user_id` 校验 workflow、stage、artifact 和 event 所有权：

| 接口 | 说明 |
| ---- | ---- |
| `POST /workflow-runs` | 按项目、分集、工作流版本和剧本哈希幂等创建运行记录 |
| `GET /workflow-runs/:id` | 返回最新阶段、Invocation Artifact-set 投影、质量门和底层任务摘要；阶段包含 `invocationId`，产物包含 `artifactSetHash` 与 `artifactIds` |
| `GET /skill-options` | 按项目、Capability 和输入 / 输出 Artifact 类型返回可见的已发布 Skill 版本 |
| `POST /workflow-runs/:id/stages/:stageId/start` | 校验标准 Artifact 依赖，通过统一 Preflight / Confirm 创建 `source=workflow` Invocation 并异步入队；可用 `skillVersionId` 精确冻结本次版本 |
| `POST /workflow-runs/:id/media-batches` | 为美术或分镜阶段创建绑定启动幂等键的一次性参考图批次 |
| `POST /workflow-media-batches/:id/items` | 以 multipart 上传角色 / 场景 / 道具参考图，最多 9 张 |
| `GET /workflow-media-batches/:id` | 返回批次状态与安全化图片元数据，不返回服务端路径 |
| `DELETE /workflow-media-batches/:id` | 删除尚未被任务占用的图片批次和临时文件 |
| `POST /workflow-stage-runs/:id/cancel` | 委托统一 Invocation 取消排队任务或请求取消运行中任务 |
| `POST /workflow-stage-runs/:id/retry` | 在同一冻结 Invocation revision 上追加 attempt，并创建新的阶段投影 |
| `POST /workflow-stage-runs/:id/review` | 使用当前完整 Artifact-set hash 委托 Invocation 批准或驳回产物 |
| `POST /workflow-stage-runs/:id/apply` | 通过 `workflow_local_receipt` adapter 幂等记录浏览器本地业务写入回执 |
| `GET /workflow-runs/:id/events` | 使用 `after` 游标增量读取安全化事件 |
| `GET /workflow-worker/health` | 返回 Worker 心跳、文本渠道可用性、积压和过期租约数量 |

Workflow 的执行真相是 Invocation、attempt、标准 Artifact、质量门、审核和 Apply；阶段与 Agent Run 仅作为工作台投影。创建只入队，不在 HTTP 请求中等待模型；Worker 领取后才预扣算力点。非法输出或余额不足不会创建可批准 Artifact，重复幂等请求返回原 Invocation，不重复扣费。

阶段质量门和人工审核分开：确定性质量门未通过时不能批准；审核提交的 Artifact-set hash 与当前完整有序产物集合不一致时返回冲突提示。新 Workflow 不再写 `workflow_artifacts` 或 `workflow_quality_gate_results`；服务端不会直接写浏览器本地项目、素材、分镜或生产包，只保存用户确认后的 Apply receipt。

通用 Skill 管理接口位于 `/api/v1/admin`：`skills` 管理稳定身份和推荐版本，`skill-versions` 管理草稿、校验、试运行和发布，`skill-evaluations` 查询冻结评测，`workflow-stage-skill-bindings` 仅负责工作流消费端的项目 / 全局绑定。发布版本不可原地修改，发布与推荐分离，所有绑定和推荐变更写入审计记录。
