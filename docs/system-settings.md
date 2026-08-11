# 系统配置数据结构

系统配置保存在 `settings` 表中，目前只使用两行：

| key       | 说明                           |
| --------- | ------------------------------ |
| `public`  | 公开配置，前端可以读取         |
| `private` | 私有配置，只给后端和管理员使用 |

## public.value

```json
{
  "modelChannel": {
    "availableModels": ["gpt-5.5", "gpt-image-2", "doubao-seedance-2-0"],
    "modelCosts": [
      { "model": "gpt-5.5", "credits": 1 },
      { "model": "gpt-image-2", "credits": 10 }
    ],
    "defaultImageModel": "gpt-image-2",
    "defaultVideoModel": "doubao-seedance-2-0",
    "defaultTextModel": "gpt-5.5",
    "systemPrompt": "",
    "allowCustomChannel": false
  },
  "auth": {
    "allowRegister": true
  }
}
```

| 字段           | 类型   | 说明               |
| -------------- | ------ | ------------------ |
| `modelChannel` | object | 模型渠道公开配置组 |
| `auth`         | object | 认证相关公开配置   |

`modelChannel` 字段：

| 字段                 | 类型     | 说明                                                                           |
| -------------------- | -------- | ------------------------------------------------------------------------------ |
| `availableModels`    | string[] | 系统可用模型，由管理员手动选择；页面下拉选项可来自私有渠道模型                 |
| `modelCosts`         | object[] | 模型单位算力点配置，后端按调用次数、图片张数或视频秒数预扣，上游失败时返还     |
| `modelTextEndpoints` | object[] | 文本模型使用的接口类型配置                                                     |
| `modelProtocols`     | object[] | 后端根据私有渠道推导出的模型协议映射，用于区分 OpenAI 兼容、Ark、MiniMax 与即梦 CLI |
| `modelCapabilities`  | object[] | 后端根据私有渠道推导出的模型能力映射，包含文本 / 图片 / 视频 / 思考         |
| `modelSources`       | object[] | 后端根据私有渠道推导出的模型来源映射，用于前台按渠道来源筛选模型               |
| `defaultImageModel`  | string   | 默认图片模型，从 `availableModels` 中选择                                      |
| `defaultVideoModel`  | string   | 默认视频模型，从 `availableModels` 中选择                                      |
| `defaultTextModel`   | string   | 默认文本模型，从 `availableModels` 中选择                                      |
| `systemPrompt`       | string   | 系统提示词                                                                     |
| `allowCustomChannel` | boolean  | 历史兼容字段；当前前端与后端都统一走后端模型渠道，默认关闭                     |

`modelCosts` 每项字段：

| 字段      | 类型   | 说明                               |
| --------- | ------ | ---------------------------------- |
| `model`   | string | 模型名称                           |
| `credits` | number | 模型单位算力点：语言按每次调用、图片按每张、视频按每秒配置 |

后端按请求中的视频秒数或图片张数计算实际预扣，语言请求固定计算一次；任务失败时按实际预扣数原额返还。未配置模型单位算力点时默认不扣除。

### 模型配置的职责边界

模型设置按两层维护，避免同一个含义在多处重复填写：

- 私有渠道是模型注册表：负责协议、凭据、模型 ID、能力、环境、权重与 Ark Endpoint 映射。
- 公开配置是产品目录：负责哪些模型对用户开放、文本 / 图片 / 视频默认值、计费和文本接口类型。
- `modelProtocols`、`modelCapabilities` 与 `modelSources` 由后端根据启用渠道推导，前端只消费，不手动维护。
- 画布节点只保存模型 ID。调用时依次解析节点模型、项目默认和系统默认，并跳过未开放或能力不匹配的候选项。
- 协议严格使用模型映射，不读取旧节点的 `provider`，也不根据模型名称猜测。

模型 ID 在不同协议之间必须全局唯一。同一个 ID 可以出现在多个同协议渠道中用于权重和故障切换；如果同名模型同时配置为 `openai`、`volcengine-ark`、`minimax`、`jimeng-cli` 或 `xinglian-cloud` 等不同协议，保存设置会失败，并要求改成不同的公开模型 ID。

用户侧请求模式：

| 模式         | 说明                                                                                    |
| ------------ | --------------------------------------------------------------------------------------- |
| 后端模型渠道 | 使用后端 `/api/v1/*` 代理接口，请求会按模型名匹配 `private.value.channels` 中的可用渠道 |

`auth` 字段：

| 字段              | 类型    | 说明                                                                   |
| ----------------- | ------- | ---------------------------------------------------------------------- |
| `allowRegister`   | boolean | 是否允许用户注册，默认允许；关闭后注册入口隐藏，注册接口拒绝新用户创建 |

## private.value

```json
{
  "channels": [
    {
      "id": "default-text",
      "protocol": "openai",
      "name": "默认渠道",
      "baseUrl": "https://api.example.com",
      "apiKey": "sk-xxx",
      "models": ["gpt-5.5", "gpt-image-2"],
      "capabilities": ["text", "image"],
      "environment": "dev",
      "weight": 1,
      "enabled": true,
      "remark": ""
    }
  ],
  "promptSync": {
    "enabled": false,
    "cron": "*/5 * * * *"
  }
}
```

| 字段         | 类型     | 说明                                                         |
| ------------ | -------- | ------------------------------------------------------------ |
| `channels`   | object[] | 模型渠道列表                                                 |
| `promptSync` | object   | 历史 GitHub 远程提示词定时同步配置；当前没有内置远程提示词源 |

`channels` 每项字段：

| 字段           | 类型     | 说明                                                                    |
| -------------- | -------- | ----------------------------------------------------------------------- |
| `id`           | string   | 渠道稳定 ID，Agent / 工作流阶段用它绑定具体渠道；为空时后端按名称生成   |
| `protocol`     | string   | 协议，当前支持 `openai`、`volcengine-ark`、`minimax`、`jimeng-cli`、`xinglian-cloud` |
| `name`         | string   | 渠道名称                                                                |
| `baseUrl`      | string   | OpenAI 兼容、火山 Ark、MiniMax 或星链云接口地址；MiniMax 官方地址为 `https://api.minimaxi.com` |
| `apiKey`       | string   | 渠道密钥，只允许后端使用；管理员接口只回显脱敏状态                       |
| `endpointId`   | string   | 火山 Ark 旧字段；新配置优先用 `endpointMappings`                         |
| `endpointMappings` | object[] | 火山 Ark 本地模型名到 Endpoint / EP 的映射                           |
| `models`       | string[] | 该渠道可用模型                                                          |
| `capabilities` | string[] | 渠道能力：`text`、`image`、`video`、`reasoning`、`video_query`、`asset_review`、`preflight`、`cli_workflow` |
| `environment`  | string   | 环境：`dev`、`test`、`prod`，用于避免测试误触正式高价 API                 |
| `weight`       | number   | 未指定渠道且同一模型有多个可用渠道时按权重随机                            |
| `enabled`      | boolean  | 是否启用                                                                |
| `remark`       | string   | 备注                                                                    |

后端调用模型时，会从已启用、具备目标能力、凭据完整且 `models` 包含目标模型的渠道中选择一个；同协议的多条候选渠道可以按权重选择。

标记 `reasoning` 的渠道不再由前端提供手动开关。文本请求到 Chat Completions 时后端统一注入 `reasoning_effort: high`，到 Responses 时注入 `reasoning: { effort: high }`；未标记的渠道不添加思考参数。

### 厂商整包预设

后台“模型渠道”提供“一键配置厂商”，用于一次写入标准协议、地址、模型、能力和正式环境：

- 火山 Ark：填写 API Key 和 Endpoint / EP，自动建立 `doubao-seedance-2-0` 到 EP 的映射。
- 星链云：填写一次 API Key，自动配置当前 15 个 SD2 / SD2.5 模型；预检会读取当前密钥实际可用模型与余额。
- MiniMax H3：填写 API Key，自动建立稳定 ID 为 `minimax-video` 的 `minimax` 视频渠道，固定使用 `MiniMax-H3`、官方地址及 `video` / `video_query` 能力。
- 即梦 CLI：无需 Base URL 或 API Key，自动配置六个模型（含 `seedance2.5`）；普通用户随后在个人配置中完成网页授权。
- Comfly：填写一次 API Key，自动拆分为文本、图片和视频三个渠道，避免模型能力混用。
- GeekNow：填写一次 API Key，使用已验证网关 `https://geeknow.ai/v1` 创建 `geeknow-text`、`geeknow-image`、`geeknow-video` 三个稳定私有渠道。文本覆盖 GPT、Claude、Gemini、DeepSeek、Qwen 核心族，图片覆盖 GPT Image、Seedream、Grok，视频覆盖 Grok、Sora、Veo、Seedance、MiniMax、manxue、Omni。
- 通用中转：填写名称、Base URL、API Key、能力和模型，预设不会根据模型名称猜测能力。

预设按稳定渠道 ID 更新，重复应用不会创建重复渠道。密钥输入留空时继续使用后台已保存值；协议、标准地址和能力会更新到当前预设，核心模型只补齐不删除管理员手动模型，渠道权重、并发数、启停状态、默认模型与已有 `modelCosts` 不会被覆盖。MiniMax H3 预设也不会自动公开模型，管理员需按实际产品配置手动加入可用模型。旧 Comfly 混合渠道会停用但不会删除，公开模型目录只保留仍属于启用渠道的模型。

GeekNow 预设默认只写入三个私有渠道，不自动公开任何新模型，也不覆盖已有默认模型、费用或其他渠道。连接检测只请求 `GET https://geeknow.ai/v1/models`，不会创建视频任务；实际视频运行由稳定渠道 ID `geeknow-video` 命中厂商专用参数映射，文本、图片和其他厂商渠道继续沿用各自原有逻辑。`omni-fast-v2v` 必须提供 1 个公网 MP4 URL、MP4 data URI 或不超过 15 MB 的本地 MP4 文件，参数在创建任务与扣费前校验。

### MiniMax H3 视频渠道

`minimax` 是 MiniMax H3 的独立后端协议。创建任务使用 `POST /v2/video_generation`，查询使用 `GET /v2/query/video_generation/{task_id}`；浏览器只调用项目统一视频接口，完整 API Key 由后端以 Bearer 方式发送。任务成功后，后端先查询结果地址，再通过现有成片代理下载链路返回内容。

画布支持文生视频、图生视频、首尾帧和全能参考四种 H3 模式，不开放即梦专用的多帧故事、编辑、延长或重新生成。时长限制为 4–15 秒，清晰度为 768P 或 2K。全能参考最多 9 张图片、3 个视频、3 个音频，总计不超过 12 个，允许纯音频输入；单次请求（含 data URI 素材）不能超过 64 MB。

纯文本且画幅为 Auto 时按 `16:9` 提交；首帧、首尾帧以及全能参考的 Auto 均按 `adaptive` 提交。H3 不接收 seed、生成音频和 callback 参数，画布会隐藏对应控件；水印参数仍可使用。

### 星链云 SD2 视频渠道

新增 `xinglian-cloud` 渠道后，填写星链云 API 地址（如 `https://www.vjimeng.vip/v1`）、API Key 和 SD2 模型名。后端会把项目内的统一视频接口转换为 `/v1/video/submit/generate` 和 `/v1/video/fetch/{task_id}`，不会向浏览器暴露 API Key；预检查询 `/v1/models` 与 `/api/user/balance`，验证当前 Key 的模型权限和余额，但不会创建视频任务或扣费。

当前预设包含 `sd2-720p-ap-fast`、`sd2-720p-ap`、`sd2-1080p-ap-fast`、`sd2-1080p-ap`、`sd2-720p-ax-fast`、`sd2-720p-ax`、`sd2-720p-ds`、`sd2-720p-ds-fast`、`sd2-720p-ax2`、`sd2-720p-ax2-fast`、`sd2-720p-ds-v933`、`sd2.5-480p-ax2`、`sd2.5-720p-ax2`、`sd2.5-480p-ax2-20s` 与 `sd2.5-720p-ax2-20s`。实际可用范围仍以当前 API Key 调用 `/v1/models` 的结果为准。

SD2.5 AX2 支持 4–30 秒；带 `-20s` 后缀的模型固定为 20 秒；DS 系列只允许 10 秒或 15 秒。分辨率由模型名决定。图、音频、视频参考素材必须是可访问的 HTTPS URL；星链云 OSS 上传使用独立的 `https://oss.vjimeng.vip` 直传服务，不与视频 Base URL 混用，当前仍需先上传后再把 URL 作为引用提交。

### 即梦 CLI 视频渠道

`jimeng-cli` 是受控后端视频协议，不属于已经关闭的 Codex CLI / 本地工作流 Runner。Docker 生产镜像已内置经过 SHA256 固定校验的官方 `dreamina`，后台渠道只需填写模型、能力以及可选的会话 ID、工作目录、输出目录和超时；默认 CLI 路径为 `dreamina`，不需要 Base URL 或 API Key。

画布支持五种明确模式：文生视频、图生视频、首尾帧、多帧故事和全能参考。图生视频需要 1 张图片，首尾帧需要 2 张图片，多帧故事需要 2–20 张图片；Seedance 2.0 全能参考最多 9 张图片、3 个视频、3 个音频且至少包含图片或视频，Seedance 2.5 放宽为最多 30 张图片、10 个视频、10 个音频、总计 50 个素材，并允许纯音频输入。浏览器无法读取的跨域素材需要先导入“我的素材”，后端不会按任意 URL 下载文件。

Docker 中登录态默认保存到 `/app/data/dreamina-home/.dreamina_cli`，输出保存到 `/app/data/jimeng-cli`。普通用户在个人配置发起网页登录并完成验证后，容器重建仍可复用登录态。`seedance2.0_vip` 支持 720p、1080p 和 4K，`seedance2.5` 支持 480p、720p 与 4–30 秒输出，其余显式模型使用 720p；多帧命令使用 CLI 固定模型并支持 720p、1080p。

## Agent Run 与模型渠道

Agent 中心仍是前端配置入口，但配置会同步保存到后端 `agent_config_records`。视频工作流阶段启动不再要求用户在浏览器里填写一次性 API Key，而是通过 `/api/v1/agent-runs` 创建后端任务。

后端 Agent Run 的文本模型与渠道选择规则：

1. Agent 配置可显式传入 `channelId`、`modelPreference`、`allowFallback`、`fallbackChannelIds`、`temperature`、`maxOutputTokens`、`estimatedCredits`、`timeoutSeconds`、`concurrencyLimit` 和 `allowBatch`。
2. 如果 `modelPreference` 非空且不是 `default`，优先使用该模型名；否则读取 `public.modelChannel.defaultTextModel`。
3. 如果传入 `channelId`，后端只使用该渠道；该渠道未启用、缺少 `baseUrl/apiKey`、不包含模型或不具备 `text` 能力时，默认阻断。
4. 只有 `allowFallback=true` 且传入 `fallbackChannelIds` 时，才按 fallback 列表寻找可用渠道；不会自动切到更贵或未授权渠道。
5. 未传入 `channelId` 时，后端按模型名匹配 `private.channels` 中已启用、已配置 `baseUrl/apiKey`、具备 `text` 能力且包含该模型的渠道。
6. 每次运行都会记录实际命中的渠道、模型、目标渠道、fallback 状态、请求快照、原始输出、结构化草案、耗时、预估费用和预扣费用。

Agent Run 会保存请求 JSON、原始输出、可解析结构化草案、审核 JSON 和映射预览 JSON。成功后状态为 `needs_review`，只有用户确认后才能继续写入资产 / 分镜 / 视频生产包。模型调用按 `modelCosts` 预扣算力点，上游失败时返还。

`promptSync` 字段当前仅保留为历史配置结构：

| 字段      | 类型    | 说明                                                                 |
| --------- | ------- | -------------------------------------------------------------------- |
| `enabled` | boolean | 是否开启定时同步；当前没有内置远程提示词源，开启后也不会同步内置内容 |
| `cron`    | string  | Cron 表达式，默认每 5 分钟                                           |
