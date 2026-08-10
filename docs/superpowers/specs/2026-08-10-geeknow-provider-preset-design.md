# GeekNow 一键渠道预设设计

## 背景

GeekNow 提供文本、图片和异步视频接口，公共 API 根地址为 `https://www.geeknow.top/v1`，主要使用 `Authorization: Bearer <API_KEY>` 鉴权。文本的 Chat Completions / Responses、图片的 Images 接口可沿用项目现有 OpenAI 兼容代理；视频虽然统一提交到 `POST /v1/videos`，不同模型家族的比例、清晰度和参考素材字段仍有差异，不能只把模型名加入普通 OpenAI 渠道。

本次新增独立 GeekNow 厂商预设，保持火山 Ark、星链云、即梦 CLI、Comfly 和通用中转原有行为不变。

## 目标

- 管理员只填写一次 GeekNow API Key，即可幂等建立文本、图片和视频三个私有渠道。
- 文本和图片复用现有 OpenAI 兼容代理，视频使用仅对 GeekNow 渠道生效的请求与查询适配。
- 预设内置官方文档明确支持的一组核心模型，同时允许管理员之后手动增删。
- 重复应用预设时保留已保存密钥，不覆盖公开模型、默认模型和算力费用。
- 视频检测只验证鉴权、模型列表和接口联通，不创建真实生成任务。

## 非目标

- 不把 GeekNow 文档中的全部模型永久硬编码为完整目录；实际可用模型仍以当前 API Key 的 `GET /v1/models` 返回为准。
- 不自动公开 GeekNow 模型，不自动设置默认文本、图片或视频模型。
- 不改造其他厂商协议，不将火山 Endpoint、星链路径或即梦网页登录统一成 GeekNow/OpenAI 方式。
- 不为 Midjourney、Gemini 原生或 Claude 原生协议增加新的专用前端入口；本次使用项目已经支持的兼容入口。
- 不用真实视频任务验证参数，避免产生费用。

## 一键预设

后台“一键配置厂商”增加 `GeekNow` 卡片，表单只显示 API Key。预设使用同一密钥建立或更新以下渠道：

| 渠道 ID | 名称 | Base URL | 能力 |
| --- | --- | --- | --- |
| `geeknow-text` | GeekNow 文本 | `https://www.geeknow.top/v1` | `text` |
| `geeknow-image` | GeekNow 图片 | `https://www.geeknow.top/v1` | `image` |
| `geeknow-video` | GeekNow 视频 | `https://www.geeknow.top/v1` | `video`、`video_query` |

三个渠道继续使用项目的 `openai` 公共协议标识，使同名模型可以与其他 OpenAI 兼容渠道共同作为 fallback，并避免改动现有公开模型协议结构。GeekNow 视频的差异由后端根据稳定渠道 ID 和官方 Base URL 识别，只有 `geeknow-video` 命中专用适配器。

重复应用时按稳定渠道 ID 更新，不新增重复渠道；API Key 留空时继续使用已保存密钥。预设只修改这三个 GeekNow 渠道，现有渠道数组中的其他项目保持原值和顺序。

## 核心模型目录

预设内置精简的核心模型集合，覆盖三种能力，但不宣称等同于账户完整权限。

### 文本

- `gpt-5.5`
- `gpt-5.4`
- `claude-opus-4-8`
- `claude-sonnet-5`
- `gemini-3.5-flash`
- `deepseek-v4-pro`
- `qwen-max`

### 图片

- `gpt-image-2`
- `gpt-image-2-pro`
- `gpt-image-2-vip`
- `doubao-seedream-4-5-251128`
- `doubao-seedream-5-0-260128`
- `grok-4-2-image`

### 视频

- `grok-imagine-video`
- `grok-imagine-video-1.5-preview`
- `sora-2`
- `veo_3_1`
- `veo_3_1-fast`
- `doubao-seedance-2-0-260128`
- `doubao-seedance-2-0-fast-260128`
- `minimax-h3-768p`
- `minimax-h3-2k`
- `minimax-h3-pro-768p`
- `minimax-h3-pro-2k`
- `manxue-2.5`
- `omni-fast`
- `omni-fast-v2v`

模型列表仍可通过现有渠道编辑向导手动调整。管理员公开模型时继续显式选择，不因应用预设自动加入前台目录。

## 视频适配

### 创建任务

前端仍向项目后端提交统一的 `/api/v1/videos` 请求。后端选择到 `geeknow-video` 后，把通用字段转换为 GeekNow `POST /v1/videos` 请求：

- `ratio` 规范为各模型需要的 `aspect_ratio`、`ratio` 或兼容字段。
- `resolution` / `resolution_name` 规范为文档要求的 `480P`、`720P`、`768P`、`1080P`、`2K` 等值。
- `seconds` / `duration` 按模型家族保留其要求的字段和类型。
- 图片参考从项目统一 multipart 输入转换为 data URI，并按模型家族写入 `image`、`images`、`input_reference`、`referenceImages`、`first_image` 或 `last_image`。
- 当前端没有参考素材时保持 JSON 请求，不做文件转换。
- 视频或音频参考只有在目标模型文档明确支持、且素材已是可访问 URL 时才透传；无法安全转换时在提交上游前返回中文错误。

适配器按模型家族使用明确映射，不通过模糊名称猜测任意第三方模型。管理员手动加入未列入映射的 GeekNow 视频模型时，走最小通用 JSON 字段；如果模型要求专属字段，界面提示需要补充适配，而不是静默套用其他厂商格式。

### 查询和下载

- 任务查询使用 `GET https://www.geeknow.top/v1/videos/{task_id}`。
- 将 GeekNow 的 `queued`、`processing`、`completed`、`failed`、`cancelled` 等状态归一为项目现有任务状态。
- 查询响应中的视频 URL 归一到项目现有 `video_url` 字段。
- `/api/v1/videos/{task_id}/content` 不直接假设上游存在 `/content` 路由；后端先查询任务、提取结果 URL，再使用现有受限下载代理返回视频。
- 下载继续使用现有公网地址校验、重定向限制、Content-Type 校验和大小限制。

## 模型检测

GeekNow 文本、图片和视频渠道共用同一 API Key。渠道联通检测优先请求 `GET /v1/models`，验证：

- Base URL 可访问。
- Bearer Token 有效。
- 返回结构可解析。
- 当前预设中的模型与账户实际返回模型可以进行提示性对比。

视频渠道的“检测”不得调用 `POST /v1/videos`。发布模型不以真实生成成功为前置条件，管理员只需完成联通检测和显式公开配置。

## 错误处理与安全

- 新建预设但未填写 API Key 时阻止保存；已有密钥时允许留空。
- 401 提示检查 API Key，402 提示额度不足，429 提示请求频率限制，其余错误沿用安全错误提取。
- API Key 只写入后台私有设置，公开接口和前端模型目录不返回真实密钥。
- 日志不记录 Authorization 头、完整 Base64 素材或完整敏感请求体。
- 视频字段转换失败时不创建 AI 任务、不扣算力点、不请求 GeekNow 上游。

## 测试设计

采用测试优先方式覆盖：

- GeekNow 预设卡片、三个渠道、固定地址、核心模型和能力。
- 重复应用不新增重复渠道，留空保留密钥，输入新密钥才覆盖。
- 应用预设不修改其他厂商渠道、已有公开模型、默认模型和费用。
- 文本与图片渠道继续使用现有 OpenAI 兼容路径。
- GeekNow 视频各模型家族的比例、清晰度、时长和参考图字段转换。
- 创建响应、任务状态、失败信息和结果 URL 归一。
- 视频成片通过查询结果 URL 下载，而不是请求不存在的上游 `/content`。
- 连接检测只请求模型列表，不提交真实视频任务。

所有视频测试使用本地假 HTTP 上游，不调用 GeekNow 真实生成接口。

## 文档变更

实现完成后检查并按实际变化更新：

- `docs/system-settings.md`：补充 GeekNow 一键预设和三个私有渠道。
- `docs/api-channel-workflow.md`：补充 GeekNow 视频创建、查询和下载适配。
- `docs/pending-test.md`：记录管理员可验收的一键预设、联通检测和节点路由。
- `docs/todo.md`：仅在存在对应待办变化时调整。

## 验收标准

- 管理员只填写一次 API Key，即可幂等建立三个 GeekNow 私有渠道。
- 应用预设后，火山、星链、即梦 CLI、Comfly 和其他自定义渠道内容不变。
- 管理员可手动调整 GeekNow 模型，并显式决定公开范围与默认模型。
- 公开后的 GeekNow 文本、图片和视频模型分别由正确能力渠道执行。
- GeekNow 视频创建、查询和下载不依赖其他厂商协议，字段符合对应模型家族文档。
- 视频检测不产生真实任务或费用。
