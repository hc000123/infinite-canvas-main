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

## 视频工作流接口

视频工作流用户接口均位于 `/api/v1`，需要登录，并按 `user_id` 校验 workflow、stage、artifact 和 event 所有权：

| 接口 | 说明 |
| ---- | ---- |
| `POST /workflow-runs` | 按项目、分集、工作流版本和剧本哈希幂等创建运行记录 |
| `GET /workflow-runs/:id` | 返回最新阶段、版本化产物、质量门和底层任务摘要 |
| `POST /workflow-runs/:id/stages/:stageId/start` | 校验依赖并使用 `idempotencyKey` 异步入队 |
| `POST /workflow-stage-runs/:id/cancel` | 取消排队任务或请求取消运行中任务 |
| `POST /workflow-stage-runs/:id/retry` | 对失败、取消或驳回阶段创建新尝试 |
| `POST /workflow-stage-runs/:id/review` | 使用当前 artifact hash 批准或驳回产物 |
| `POST /workflow-stage-runs/:id/apply` | 记录前端已写入浏览器本地业务数据的回执 |
| `GET /workflow-runs/:id/events` | 使用 `after` 游标增量读取安全化事件 |
| `GET /workflow-worker/health` | 返回 Worker 心跳、文本渠道可用性、积压和过期租约数量 |

底层 Agent Run 状态包括 `queued`、`running`、`cancel_requested`、`needs_review`、`approved`、`rejected`、`applied`、`failed` 和 `cancelled`。创建只入队，不在 HTTP 请求中等待模型；Worker 领取后才预扣算力点。429、5xx 和网络失败按次数重试，没有可审核产物时返还本次预扣。重复幂等请求返回原任务，不重复扣费。

阶段质量门和人工审核分开：确定性质量门未通过时不能批准；审核提交的 hash 与当前产物不一致时返回冲突提示；服务端不会直接写浏览器本地项目、素材、分镜或生产包，只保存用户确认后的 apply receipt。
