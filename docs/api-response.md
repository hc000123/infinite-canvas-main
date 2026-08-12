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

## 登录会话与失效码

所有角色均使用服务端单会话校验。新登录成功后，旧设备在下一次接口请求时收到稳定失效码；前端统一清除当前账号凭证并跳转登录页，但不会删除浏览器本地保存的项目、画布、素材或生成记录。

| `code` | 含义 | 前端提示 |
| ---- | ---- | ---- |
| `1001` | 会话不存在、凭证无效、账号不可用或安全信息已变更 | 登录状态无效，请重新登录 |
| `1002` | 当前账号已在其他设备重新登录 | 账号已在其他设备登录，请重新登录 |
| `1003` | 当前会话被管理员强制下线 | 账号已被管理员下线，并可显示服务端返回的安全原因 |
| `1004` | 连续 7 天无活动，会话已过期 | 登录状态已过期，请重新登录 |
| `1005` | 会话已达到 30 天最长有效期 | 为保障账号安全，请重新登录 |

会话接口：

| 接口 | 权限与请求 | 响应 |
| ---- | ---- | ---- |
| `POST /api/auth/logout` | 当前登录账号；无请求字段 | 服务端注销当前会话，返回 `true` |
| `GET /api/admin/users/:id/session` | `admin` 或 `superadmin` 查看普通用户 | 当前会话摘要 |
| `POST /api/admin/users/:id/force-logout` | `admin` 或 `superadmin` 强制普通用户下线；请求 `{ "reason": "2–200 字符" }` | 下线后的会话摘要 |
| `GET /api/admin/admins/:id/session` | 仅 `superadmin`；可查看管理员或超级管理员 | 当前会话摘要 |
| `POST /api/admin/admins/:id/force-logout` | 仅 `superadmin` 强制普通管理员下线；不能操作超级管理员；请求 `{ "reason": "2–200 字符" }` | 下线后的会话摘要 |

会话摘要字段为 `online`、`status`、`ipAddress`、`deviceName`、`createdAt`、`lastActiveAt` 和 `absoluteExpiresAt`。目标当前没有会话时返回这些字段的空值和 `online: false`，不会暴露 JWT 或内部会话 ID。

## Artifact 与 Invocation Runtime 接口

下列 15 个接口均位于 `/api/v1`，必须携带 `Authorization: Bearer <token>`，并且只能读写 JWT 用户自己的 Artifact 和 Invocation。所有 JSON 写入请求都使用严格字段解码和大小上限；未知字段、`null`、追加 JSON 或超限请求会失败。

### Artifact（3 个）

| 接口 | 请求 | 安全响应 |
| ---- | ---- | ---- |
| `POST /artifacts` | 创建用户手动导入的 `source_text`：`artifactType`、`schemaVersion`、`projectId`、`episodeId`、`payload`、可选 `parentArtifactRefs`；不允许冒充 producer 或写入 Skill extensions。 | 返回 Artifact envelope：安全化 `artifact`、`parentArtifactIds`、`payload`、`extensions`。 |
| `GET /artifacts` | 查询参数：`project`、`episode`、`type`、`producerInvocation`、`approvalState`、`page`、`pageSize`。 | 返回所有者范围内的 `{ items, total, page, pageSize }`，列表项为 Artifact envelope。 |
| `GET /artifacts/:id` | 路径参数是 Artifact ID。 | 返回用户可见的 Artifact envelope；跨用户 ID 按不存在处理。 |

### Invocation（12 个）

| 接口 | 请求 | 安全响应 |
| ---- | ---- | ---- |
| `POST /invocations` | 客户端只接受 `source: "direct" | "image" | "canvas_chat"`；`workflow` 和 `agent_plan` 只能由服务端调度器创建。可用 `skillVersionId` 准确锁定已发布版本，或用 Skill / Capability 条件解析；同时提交项目/分集、预期输出类型、带内容哈希的 `inputArtifactRefs`、`parameters`、`idempotencyKey` 和可选执行策略覆盖。 | 返回安全 Preflight DTO：`run`、版本摘要、冻结输入引用、执行策略摘要、路由摘要、确认要求和阻断原因；不返回请求哈希、完整 Skill/Schema 快照、渠道 ID/Key、原始输出或内部错误。 |
| `GET /invocations` | 查询参数：`project`、`episode`、`skillId`、`source`、`status`、`page`、`pageSize`。 | 返回 `{ items, total, page, pageSize }` 和安全的 run 摘要。 |
| `GET /invocations/:id` | 路径参数是 Invocation ID。 | 返回 run、revision/attempt 安全摘要、权威 Artifact refs/输出 envelope、gates、reviews、Apply 摘要、最新事件页和 `artifactSetHash`；不暴露 AgentRun ID、raw/structured output、内部 Trace 快照、Apply 回执/错误或密钥。 |
| `GET /invocations/:id/poll` | 轻量轮询；`after` 是上次响应的 `nextAfter`，初次可用 `0`。 | 只返回安全 run 摘要、最新 attempt 摘要、游标后的最多 100 条事件和 `nextAfter`；不读取 revision、Artifact、质量门、审核或 Apply 详情。客户端仅在状态指纹变化时刷新一次完整详情，进入终态后停止轮询。 |
| `POST /invocations/:id/repreflight` | 仅允许 blocked 或执行目标失效的客户端 Invocation 追加新预检；`source` 必须与原 run 完全一致，不可改变已冻结项目/分集边界。 | 返回新的安全 Preflight DTO，旧 revision/attempt 保留。 |
| `POST /invocations/:id/confirm` | `{ "requirementCodes": [...] }`，必须与当前 revision 冻结集合精确一致。 | 原子创建一个 attempt 和 AgentRun，返回安全 lifecycle DTO；重放同一确认不会重复入队。 |
| `POST /invocations/:id/cancel` | **Body 必须是 0 字节**；`{}`、空白或其他内容都会被拒绝。 | 返回取消后的安全 lifecycle DTO；取消和完成竞态在事务内收口。 |
| `POST /invocations/:id/retry` | **Body 必须是 0 字节**；只能重试 failed/cancelled/rejected/partial attempt。 | 返回追加 attempt 的安全 lifecycle DTO；冻结 revision、保留输出和失败 ordinal 计划不可改写。 |
| `POST /invocations/:id/revalidate` | `{ attempt, expectedRawOutputHash, output }`，只能校正 output-schema/business-gate 失败的当前 attempt。 | 不再调模型、不新建 AgentRun；保留 immutable raw output，追加校正 Trace 并重跑冻结契约。 |
| `POST /invocations/:id/review` | `{ decision: "approved" | "rejected", attempt, artifactSetHash, comment? }`，哈希必须对应当前完整有序 Artifact 集。 | 返回安全 lifecycle DTO；审核记录追加保存。 |
| `POST /invocations/:id/apply` | `{ idempotencyKey, attempt, artifactSetHash, target, targetId, payload? }`；仅允许当前 approved Artifact 集和服务端已注册 adapter。图片/画布本地写入使用 `target: "client_local_receipt"`，payload 必须包含 `surface: "image" | "canvas"`、`targetKind: "prompt" | "node" | "message" | "asset"`、与 `targetId` 相同的坐标，以及不超过 100 个且全部属于当前 approved Artifact-set 的 `artifactIds`。 | 返回不含 receipt/error/request hash 的 Apply 摘要；同键同请求只写一次，同键变更 body 冲突，失败保持 approved 并可用新键重试。 |
| `GET /invocations/:id/events` | 游标分页：`after` 为上次最后一条数字 ID，`limit` 经后端分页上限归一化；初次用 `after=0`。 | 按 ID 升序返回该用户 Invocation 的追加事件数组；跨用户游标查询按不存在处理。detail 内置事件页额外返回 `eventsHasMore / eventsNextAfter / eventsLimit`。 |

客户端不得把 `idempotencyKey`、`parameters`、Artifact payload 或任何业务文本当作服务端凭证；服务端也不会在上述 DTO 中回显 API Key、Authorization 头或完整执行请求。

生图工作台的 `Skill 能力` 选择器使用同一组 Artifact / Invocation 接口：仅列出已发布 Skill，按 Artifact Binding 精确匹配已批准项目产物或当前文本，预检后冻结 Skill 版本、输入哈希、模型和额度。输出不会自动审核或写入；只有人工批准并点击“使用此产物”后才替换提示词，并用 `client_local_receipt` 记录本地消费坐标。

画布节点的 `运行 Skill` 同样使用 `source: "canvas_chat"` 和上述接口。当前节点语义文本按需登记为 `source_text`；人工批准并使用完整 Artifact-set 后，浏览器为每个产物创建可追溯的下游文本节点和来源连线，再以 `target: "client_local_receipt"`、`surface: "canvas"`、`targetKind: "node"` 记录一次幂等消费回执。服务端不直接修改浏览器本地画布，也不在 Apply 响应中回传画布节点数据。

## Agent Registry 与 Agent Plan Runtime 接口

下列接口均位于 `/api/v1`，需要登录。系统 Agent 对用户只读可见；项目 Agent、版本和 Plan 按 JWT 用户及项目隔离。Agent 只保存 Role、Skill 版本引用和执行策略，不复制 Skill 正文、Schema、质量门或 Artifact payload。

| 接口 | 说明 |
| ---- | ---- |
| `GET /agents?projectId=:id` | 返回当前项目可见的系统 / 项目 Agent、版本摘要和推荐 Package；画布只展示已启用且有推荐发布版本的候选。 |
| `POST /agents` | 创建项目 Agent 与首个草稿版本，Package 保存顺序 Skill 引用、输入 Binding、参数和访问 / 模型 / 工具 / 执行策略。 |
| `GET /agents/:id?projectId=:id` | 返回可见 Agent、标签、版本和推荐 Package；跨用户项目 Agent 按不存在处理。 |
| `POST /agents/:id/versions` | 为项目 Agent 创建新的可编辑草稿版本。 |
| `GET /agent-versions/:id` | 返回 Agent Version 与完整 Package。 |
| `PATCH /agent-versions/:id` | 只允许修改项目 Agent 草稿；发布版本不可原地修改。 |
| `POST /agent-versions/:id/validate` | 校验 Skill 访问策略、版本、Binding、相邻 Artifact 契约和执行策略，返回冻结内容哈希与解析 Skill 摘要。 |
| `POST /agent-versions/:id/publish` | 校验通过后发布不可变 Agent Version。 |
| `PUT /agents/:id/recommended-version` | `{ agentVersionId }`；推荐版本必须属于同一 Agent 且已经发布。 |
| `POST /agent-plans` | 用精确 Agent / Version、目标、不可变来源 Artifact、可选 Skill overrides 和幂等键创建 draft；不执行模型。 |
| `GET /agent-plans/:id` | 返回安全化 Plan、revision、顺序 Step、Binding、参数、Invocation / 输出 Artifact 引用和确认摘要，不复制产物正文。 |
| `POST /agent-plans/:id/revisions` | 在 draft 阶段用新的目标、来源 Artifact 和 Skill overrides 追加不可变 revision，支持画布 Temporary Plan 替换、排序和删除步骤。 |
| `POST /agent-plans/:id/preflight` | 冻结 Agent、Skill、Binding、来源 Artifact、执行目标和额度，返回精确确认要求与指纹；不创建子 Invocation。 |
| `POST /agent-plans/:id/confirm` | `{ revision, fingerprint, requirementCodes }` 必须精确匹配当前冻结 revision，确认后才允许推进。 |
| `POST /agent-plans/:id/continue` | 同步当前子 Invocation，并且只在上一步完整 Artifact-set 已批准后启动下一步；重复或并发推进保持幂等。 |
| `POST /agent-plans/:id/cancel` | 停止继续调度，并向当前活动 Invocation 传播取消。 |

画布对话先通过 Artifact 接口创建一个只含目标和语义节点引用的 `source_text`，再创建 Temporary Plan。草稿编辑、预检、确认、逐步审核和最终产物读取全部复用上述 Agent Plan / Invocation 接口；浏览器消息只持久化 ID、版本、哈希和 Apply 坐标。最终 Artifact 只有在用户显式点击使用后才写入画布并登记 `client_local_receipt`。

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
| `GET /workflow-runs/:id/poll` | 轻量返回 Workflow 状态、最新阶段状态 / attempt / 聚合错误、游标后的最多 100 条事件、`nextAfter` 和 Worker 健康；不读取 Artifact、质量门、审核、Apply 或 Agent Run 详情。页面只在状态指纹变化时刷新一次完整详情，并在没有活动阶段后停止轮询 |
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
