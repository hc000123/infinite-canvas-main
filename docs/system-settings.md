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
| `modelCosts`         | object[] | 模型算力点配置，后端模型接口调用前按模型预扣，上游失败时返还；未配置默认不扣除 |
| `modelTextEndpoints` | object[] | 文本模型使用的接口类型配置                                                     |
| `modelProtocols`     | object[] | 后端根据私有渠道推导出的模型协议映射，用于区分 OpenAI 兼容与 Ark               |
| `modelCapabilities`  | object[] | 后端根据私有渠道推导出的模型能力映射，用于前台区分文本 / 图片 / 视频           |
| `defaultImageModel`  | string   | 默认图片模型，从 `availableModels` 中选择                                      |
| `defaultVideoModel`  | string   | 默认视频模型，从 `availableModels` 中选择                                      |
| `defaultTextModel`   | string   | 默认文本模型，从 `availableModels` 中选择                                      |
| `systemPrompt`       | string   | 系统提示词                                                                     |
| `allowCustomChannel` | boolean  | 历史兼容字段；当前前端与后端都统一走后端模型渠道，默认关闭                     |

`modelCosts` 每项字段：

| 字段      | 类型   | 说明                               |
| --------- | ------ | ---------------------------------- |
| `model`   | string | 模型名称                           |
| `credits` | number | 每次后端模型接口调用前预扣的算力点 |

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
| `protocol`     | string   | 协议，当前支持 `openai`、`volcengine-ark`                                |
| `name`         | string   | 渠道名称                                                                |
| `baseUrl`      | string   | OpenAI 兼容接口地址或火山 Ark 接口地址                                   |
| `apiKey`       | string   | 渠道密钥，只允许后端使用；管理员接口只回显脱敏状态                       |
| `endpointId`   | string   | 火山 Ark 旧字段；新配置优先用 `endpointMappings`                         |
| `endpointMappings` | object[] | 火山 Ark 本地模型名到 Endpoint / EP 的映射                           |
| `models`       | string[] | 该渠道可用模型                                                          |
| `capabilities` | string[] | 渠道能力：`text`、`image`、`video`、`video_query`、`asset_review`、`preflight`、`cli_workflow` |
| `environment`  | string   | 环境：`dev`、`test`、`prod`，用于避免测试误触正式高价 API                 |
| `weight`       | number   | 未指定渠道且同一模型有多个可用渠道时按权重随机                            |
| `enabled`      | boolean  | 是否启用                                                                |
| `remark`       | string   | 备注                                                                    |

后端调用模型时，会从已启用、已配置 `baseUrl` 和 `apiKey`、且 `models` 包含目标模型的渠道中选择一个。

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
