# 星链云 SD2 视频渠道设计

## 目标

在既有“模型渠道”设置中增加独立 `xinglian-cloud` 协议。管理员可配置星链云的服务地址、API Key 与 SD2 模型；前端仍只调用本项目的 `/api/v1/videos`，不接触供应商密钥。

## 接口映射

- 配置地址接受截图中的 `https://www.vjimeng.vip/v1`，后端会去掉结尾的 `/v1` 后固定请求 `/v1/video/submit/generate` 与 `/v1/video/fetch/{task_id}`，避免重复拼接。
- 内部请求的 `model`、`prompt`、时长、比例、音效和引用素材转换为 SD2 的 `model`、`prompt`、`duration`、`metadata`、`images`、`audios` 与 `videos`。
- 星链云的 `queued`、`in_progress`、`completed`、`failed` 统一转换为现有视频任务响应；完成地址取 `metadata.url`。
- `GET /api/user/balance` 用作不扣费预检；视频任务查询仍使用 SD2 专用查询接口。

## 边界

- 文生与已具备 HTTPS URL 的图/音频/视频引用均可提交。浏览器本地素材的星链云 OSS 直传不纳入本次最小接入，避免将后台 API Key 暴露到浏览器。
- 继续复用现有的额度、AI 任务账本、失败退款、任务恢复和内容下载代理。
- 不伪装成 OpenAI 兼容协议，也不改变 Ark 与即梦 CLI 链路。
