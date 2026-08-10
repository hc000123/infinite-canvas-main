# MiniMax H3 视频渠道适配设计

## 背景

项目现有视频生成统一从前端 `/api/ai/videos` 发起，由后端按模型渠道协议完成请求转换、任务轮询、结果下载、算力扣费和任务记录。后台“一键配置厂商”目前包含火山 Ark、星链云、即梦 CLI、Comfly 和通用中转，但没有 MiniMax 官方渠道。

MiniMax H3 使用独立的异步视频 V2 协议：创建任务为 `POST /v2/video_generation`，查询任务为 `GET /v2/query/video_generation/{task_id}`。其请求和响应都不兼容项目当前通用 OpenAI `/videos` 协议，因此不能只把模型名加入预设列表。

## 目标

- 后台厂商预设新增 MiniMax，使用官方 Base URL 和固定模型 `MiniMax-H3`。
- 新增独立 `minimax` 模型协议，不按模型名称猜测路由。
- 支持文生视频、首帧图生视频、首尾帧图生视频和图片/视频/音频多模态参考生成。
- 将 MiniMax 创建、查询和成片下载适配到现有 `/api/ai/videos` 前端协议。
- 复用现有模型公开、默认模型、算力扣费、失败退款、AI 任务日志、轮询恢复和成片归档链路。
- 不调用真实 MiniMax 生成接口做验证，不产生费用。

## 非目标

- 不接入 H3-Context-IR、视频再生成、任务列表、取消或删除任务。
- 不支持回调通知，继续使用现有前端轮询。
- 不新增通用的可配置异步视频协议引擎。
- 不自动把 MiniMax 模型公开给普通用户，也不自动设为默认视频模型。
- 不兼容未发布的 MiniMax 历史配置或旧字段。

## 方案

### 渠道和预设

新增 `minimax` 协议和 MiniMax 厂商预设。预设只要求管理员填写 API Key，并幂等创建或更新稳定渠道：

- 渠道 ID：`minimax-video`
- 名称：`MiniMax H3`
- 协议：`minimax`
- Base URL：`https://api.minimaxi.com`
- 模型：`MiniMax-H3`
- 能力：`video`、`video_query`

重复应用预设时保留已保存的 API Key。预设应用后继续通过现有公开配置选择器决定是否公开模型及是否设为默认模型，已有模型费用配置不被覆盖。

### 前端模型能力

MiniMax H3 使用以下固定能力：

- 时长：4～15 秒整数。
- 清晰度：768P、2K。
- 比例：`adaptive`、`21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`。
- 参考图最多 9 张、参考视频最多 3 段、参考音频最多 3 段，总素材最多 12 个。

视频设置和节点校验通过协议和模型目录解析 H3 能力，不通过模型名启发式判断。H3 不支持的生成音频、seed、编辑和续写参数不进入上游请求；水印沿用现有开关并映射为 `aigc_watermark`。

分辨率在现有配置值和 MiniMax API 值间明确映射：

- `768` / `768p` → `768P`
- `2160` / `2k` → `2K`

UI 将 `2160` 对 MiniMax 显示为 `2K`，不复用其他模型的 `4K` 标签。

### 参考模式和请求构造

所有请求必须包含一个非空 `text` 项。前端保留素材顺序和图片角色，将可访问的公网 URL 直接传递；浏览器本地素材转换为 MiniMax 支持的 data URI。提交前校验请求素材数量和互斥关系。

模式映射如下：

| 画布模式 | MiniMax `content` | `ratio` |
| --- | --- | --- |
| 文生视频 | `text` | 必须是具体比例；Auto 回退为 `16:9` |
| 首帧图生视频 | `text` + `image_url(first_frame)` | `adaptive` |
| 首尾帧图生视频 | `text` + `image_url(first_frame)` + `image_url(last_frame)` | `adaptive` |
| 全能参考 | `text` + `reference_image/video/audio` | 用户比例；Auto 为 `adaptive` |

出现 `first_frame` 或 `last_frame` 时，不允许同时出现任一 `reference_*` 角色。全能参考至少包含一种素材。图片、视频和音频沿用画布现有连接顺序，提示词中的“图片 1”“视频 1”“音频 1”继续对应该顺序。

前端仍向项目后端提交统一的视频任务请求。后端只信任并规范化允许字段，再生成 MiniMax 上游请求：

```json
{
  "model": "MiniMax-H3",
  "content": [{ "type": "text", "text": "..." }],
  "resolution": "2K",
  "duration": 6,
  "ratio": "16:9",
  "aigc_watermark": false
}
```

### 后端创建、查询和下载

后端按 `minimax` 协议处理现有 `/api/ai/videos` 三段操作：

1. 创建：把统一请求转换后发送到 `POST {baseUrl}/v2/video_generation`，将 `{ task_id }` 归一为 `{ id, status: "queued" }`。
2. 查询：把 `/videos/{id}` 转发到 `GET {baseUrl}/v2/query/video_generation/{id}`，将 `task` 归一为项目现有任务结构。
3. 下载：当 `/videos/{id}/content` 被请求时，先查询任务并读取 `task.content.url`，再通过现有受限下载代理返回视频内容。

状态按以下规则归一：

- `queued` → `queued`
- `running` → `running`
- `succeeded` → `succeeded`
- `failed` → `failed`
- `cancelled` → `cancelled`

失败信息使用 `task.error.code` 和 `task.error.message`。查询结果同步到现有 AI 任务记录；创建失败或任务失败继续走现有退款逻辑，成功下载后继续记录成片已获取状态。

### 错误处理和安全

- 缺少模型、提示词、API Key 或非法参数时，在请求上游前返回中文错误。
- 上游 400、401、402、422、429、500 等错误通过现有安全错误提取返回，不记录 API Key 或完整敏感请求体。
- Base URL 来自管理员私有渠道，公开设置不返回私有地址或密钥。
- 沿用现有视频下载大小、Content-Type、重定向和公网请求限制。
- data URI 请求受 MiniMax 64 MB 请求体限制；超限时在本地或后端转换阶段明确失败，不提交上游任务。

## 测试设计

使用测试优先方式覆盖：

- 厂商预设新增、重复应用、密钥保留、模型发布清洗和默认模型不覆盖。
- `minimax` 协议在后端设置校验、公开模型目录和前端模型目录中的往返。
- 文生视频、首帧、首尾帧、全能参考四类请求映射。
- 文生视频 Auto 回退、帧模式强制 adaptive、768P/2K、4～15 秒和水印映射。
- 帧角色与参考角色互斥，以及图片、视频、音频和总素材数量限制。
- 创建响应、五种任务状态、失败错误、结果 URL和成片下载归一。
- 使用本地假 HTTP 上游验证路径、鉴权头和请求体；不调用 MiniMax 真实接口。

## 文档变更

实现完成后更新：

- `docs/system-settings.md`：补充 MiniMax 厂商预设和独立协议。
- `docs/api-channel-workflow.md`：补充 MiniMax 视频创建、查询和下载路由。
- `docs/pending-test.md`：记录本版本可人工验收的预设、参数和四类生成模式。
- `docs/todo.md`：检查是否存在对应待办；仅在实际有条目变化时调整。

## 验收标准

- 管理员可以通过 MiniMax 预设仅填写 API Key 幂等建立官方 H3 渠道。
- 管理员公开 `MiniMax-H3` 后，用户可将其选为默认或节点视频模型。
- H3 设置只显示 768P、2K 和 4～15 秒，并正确显示 2K 标签。
- 四类生成模式提交的路径、鉴权、`content` 角色、分辨率、时长和比例符合 MiniMax V2 文档。
- 创建、轮询、失败提示、退款、成片下载和任务归档继续使用项目现有链路。
- 假上游测试通过，验证过程不产生任何真实 MiniMax 任务或费用。
