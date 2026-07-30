# 运行时增量轮询与 SSE 流式转发设计

## 目标

降低 Workflow / Invocation 活跃期间的重复数据库查询和网络传输，并让 AI 文本流在上游产生内容后立即到达浏览器。保留现有完整详情、审核、重试、Apply、计费和追溯行为。

## 范围

- 新增 Workflow 轻量轮询接口，合并 Worker 状态、阶段状态和游标后的新增事件。
- 新增 Invocation 轻量轮询接口，只返回 Run 摘要、最新 Attempt 摘要和游标后的新增事件。
- Workflow Workbench、Agent Run Console 和画布 Agent Plan 在活跃态使用轻量接口，关键状态变化时按需刷新一次完整详情，终态停止轮询。
- AI 代理对 `text/event-stream` 边读取边写入浏览器，同时增量生成归档摘要；非 SSE 和图片转换继续沿用现有缓冲路径。

不新增 WebSocket，不改现有完整详情响应结构，不调整计费规则，不删除历史事件。

## 接口设计

### Workflow Poll

`GET /api/v1/workflow-runs/:id/poll?after=<eventId>` 返回：

- `runId / status / updatedAt`
- 轻量阶段数组：`id / stageId / invocationId / status / attempt / errorMessage / updatedAt`
- `events`：仅返回 `after` 之后的事件
- `nextAfter`：本次最后事件 ID，没有新增事件时保持传入游标
- `worker`：现有 Worker 健康摘要

阶段状态只批量读取 Workflow Stage 和关联 Invocation Run，不展开 Revision、Artifact、Gate、Review、Apply 或 Agent Run。前端检测到阶段状态、attempt 或错误摘要变化时获取一次现有完整 Workflow Detail。

### Invocation Poll

`GET /api/v1/invocations/:id/poll?after=<eventId>` 返回：

- 现有安全 Run Summary
- 最新 Attempt Summary，可为空
- `events / nextAfter`

不读取 Revision、Artifact、Gate、Review、Apply 和输出 Artifact 内容。前端在状态或 attempt 变化时按需获取一次现有完整 Invocation Detail。

## 前端轮询

- 首次进入仍获取完整详情和首批事件，记录最大事件 ID。
- 活跃态前台每 2 秒轮询，页面隐藏时每 6 秒轮询。
- 新事件按 ID 去重追加，不再从 `after=0` 重读历史。
- 轻量状态无变化时只更新 Worker 和事件。
- 状态进入成功、失败、阻塞、待审核、已取消等关键节点时刷新一次完整详情。
- Workflow 无活跃阶段、Invocation 进入终态后停止计时器。

## SSE 数据流

- 上游返回 2xx 且 Content-Type 为 `text/event-stream` 时，先复制响应头并写出状态码。
- 每个上游字节块同时写入浏览器和增量摘要收集器；浏览器写入后立即 Flush。
- 收集器只保留未完成事件块、合并输出文本、最后完成事件、usage、事件类型计数和原始字节数，不保存完整原始流。
- 上游正常 EOF 后，将收集器生成的紧凑 JSON 交给现有 AI Task 成功归档逻辑。
- 流复制失败时记录“AI 响应流中断”；响应头已发出后不再尝试写第二个 JSON 错误响应。
- 非 SSE、错误响应和图片归档路径保持原行为。

## 数据与查询

- Repository 新增按 Workflow 关联 Invocation ID 批量读取 Run Summary 的查询，查询数量不随阶段数线性增加。
- Workflow / Invocation Event 继续使用现有 `after` 语义和数量上限。
- 不创建新的审计表，不删除原有事件。

## 测试

- Repository / Service：轻量接口不调用完整详情依赖，阶段映射、最新 Attempt、事件游标和权限隔离正确。
- Handler：Poll 参数和响应结构正确，外部用户不能读取其他用户运行。
- 前端纯函数 / Hook：事件去重追加、状态变化触发一次详情刷新、终态停止轮询。
- AI Handler：首个 SSE 块在上游结束前即可写出；归档内容为紧凑摘要；非 SSE 与图片转换行为不变；流中断不会追加第二个错误 JSON。

## 验收标准

- 无状态变化的 Workflow 轮询不再执行完整 Invocation Detail 查询。
- 历史事件不再重复传输。
- Workflow / Invocation 终态后没有持续请求。
- SSE 首段内容在完整响应结束前可被客户端接收。
- AI Task 仍保留最终输出、usage、事件统计、计费与前台追溯。
- 现有完整详情、审核、重试、Apply、失败返还和非 SSE 请求保持兼容。
