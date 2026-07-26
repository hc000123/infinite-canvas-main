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

## 视频工作流接口

视频工作流用户接口均位于 `/api/v1`，需要登录，并按 `user_id` 校验 workflow、stage、artifact 和 event 所有权：

| 接口 | 说明 |
| ---- | ---- |
| `POST /workflow-runs` | 按项目、分集、工作流版本和剧本哈希幂等创建运行记录 |
| `GET /workflow-runs/:id` | 返回最新阶段、版本化产物、质量门和底层任务摘要 |
| `GET /skill-options` | 按项目、Capability 和输入 / 输出 Artifact 类型返回可见的已发布 Skill 版本 |
| `POST /workflow-runs/:id/stages/:stageId/start` | 校验依赖并使用 `idempotencyKey` 异步入队，可通过 `skillVersionId` 覆盖本次运行版本 |
| `POST /workflow-runs/:id/media-batches` | 为美术或分镜阶段创建绑定启动幂等键的一次性参考图批次 |
| `POST /workflow-media-batches/:id/items` | 以 multipart 上传角色 / 场景 / 道具参考图，最多 9 张 |
| `GET /workflow-media-batches/:id` | 返回批次状态与安全化图片元数据，不返回服务端路径 |
| `DELETE /workflow-media-batches/:id` | 删除尚未被任务占用的图片批次和临时文件 |
| `POST /workflow-stage-runs/:id/cancel` | 取消排队任务或请求取消运行中任务 |
| `POST /workflow-stage-runs/:id/retry` | 对失败、取消或驳回阶段创建新尝试 |
| `POST /workflow-stage-runs/:id/review` | 使用当前 artifact hash 批准或驳回产物 |
| `POST /workflow-stage-runs/:id/apply` | 记录前端已写入浏览器本地业务数据的回执 |
| `GET /workflow-runs/:id/events` | 使用 `after` 游标增量读取安全化事件 |
| `GET /workflow-worker/health` | 返回 Worker 心跳、文本渠道可用性、积压和过期租约数量 |

底层 Agent Run 状态包括 `queued`、`running`、`cancel_requested`、`needs_review`、`approved`、`rejected`、`applied`、`failed` 和 `cancelled`。创建只入队，不在 HTTP 请求中等待模型；Worker 领取后才预扣算力点。429、5xx 和网络失败按次数重试，没有可审核产物时返还本次预扣。重复幂等请求返回原任务，不重复扣费。

阶段质量门和人工审核分开：确定性质量门未通过时不能批准；审核提交的 hash 与当前产物不一致时返回冲突提示；服务端不会直接写浏览器本地项目、素材、分镜或生产包，只保存用户确认后的 apply receipt。

通用 Skill 管理接口位于 `/api/v1/admin`：`skills` 管理稳定身份和推荐版本，`skill-versions` 管理草稿、校验、试运行和发布，`skill-evaluations` 查询冻结评测，`workflow-stage-skill-bindings` 仅负责工作流消费端的项目 / 全局绑定。发布版本不可原地修改，发布与推荐分离，所有绑定和推荐变更写入审计记录。
