# 后端数据库说明

本文档只记录后端当前已经使用的主要数据表。

## 数据库

后端使用 GORM 管理数据库连接和表结构迁移。

支持的存储驱动：

- `sqlite`
- `mysql`
- `postgresql`

当前启动时执行 `AutoMigrate`，自动维护以下表：

- `users`
- `credit_logs`
- `ai_tasks`
- `user_activity_logs`
- `user_allowed_ips`
- `login_approvals`
- `agent_config_records`
- `agent_runs`
- `workflow_runs`
- `workflow_stage_runs`
- `workflow_artifacts`
- `workflow_quality_gate_results`
- `workflow_events`
- `workflow_skills`
- `workflow_skill_versions`
- `workflow_stage_skill_bindings`
- `workflow_skill_evaluations`
- `workflow_media_batches`
- `workflow_media_items`
- `prompts`
- `assets`
- `settings`

后续新增表时再同步补充本文档，未实际使用的规划表不提前写入。

### users

系统用户表。用户基础信息、角色、算力点余额和第三方登录标识放在该表中。

| 字段            | 类型   | 说明                                                 |
| --------------- | ------ | ---------------------------------------------------- |
| `id`            | string | 主键                                                 |
| `username`      | string | 用户名，唯一索引                                     |
| `password`      | string | 密码哈希                                             |
| `email`         | string | 邮箱                                                 |
| `display_name`  | string | 昵称                                                 |
| `avatar_url`    | string | 头像地址                                             |
| `role`          | string | 角色：`user`、`admin`、`superadmin`                  |
| `credits`       | number | 算力点余额                                           |
| `aff_code`      | string | 用户自己的邀请码，唯一索引                           |
| `aff_count`     | number | 已邀请用户数量，冗余统计字段                         |
| `inviter_id`    | string | 邀请人用户 ID                                        |
| `github_id`     | string | 历史第三方登录字段，当前不提供 GitHub 登录            |
| `linux_do_id`   | string | 历史第三方登录字段，当前不提供 Linux.do 登录          |
| `wechat_id`     | string | 历史第三方登录字段，当前不提供微信登录                |
| `status`        | string | 用户状态：`active`、`ban`                            |
| `last_login_at` | string | 最近登录时间                                         |
| `extra`         | json   | 扩展信息，保留历史第三方资料                          |
| `created_at`    | string | 创建时间                                             |
| `updated_at`    | string | 更新时间                                             |
| `ip_approval_enabled` | bool | 普通用户是否启用登录 IP 审批；管理员角色不受此限制 |

`superadmin` 可管理管理员账号；普通 `admin` 只能管理 `user`。系统禁止超级管理员修改或删除自己，也禁止降级、禁用或删除最后一个有效超级管理员。只有 `superadmin` 调用 AI 时不校验或扣减 `credits`，任务仍保留本次折算用量；普通 `admin` 与 `user` 均持有并消耗真实余额。

### user_activity_logs

低频用户操作审计表。只记录登录、安全审批、项目/画布/素材完成动作、AI 工具调用、导入导出和算力点等业务事件；不记录拖拽、缩放、选择、输入、轮询或自动保存。浏览器本地项目/画布/素材事件只是审计记录，不代表这些本地业务数据已云同步。

| 字段 | 说明 |
| ---- | ---- |
| `id`、`user_id` | 事件主键与稳定用户 ID |
| `category`、`action`、`result` | 受控分类、动作和结果枚举 |
| `target_type`、`target_id`、`target_name` | 业务对象摘要 |
| `summary`、`metadata` | 截断并去敏后的摘要与允许字段 |
| `ip_address`、`ip_allowed` | 服务端解析的客户端 IP 及是否在工作 IP 范围 |
| `session_id`、`login_approval_id` | 会话和登录审批关联 |
| `user_agent` | 截断后的设备信息 |
| `client_event_id` | 每用户幂等事件 ID；服务端事件使用内部 ID |
| `created_at` | 发生时间 |

### user_allowed_ips

普通用户的登录 IP/CIDR 白名单，`user_id + cidr` 唯一。地址使用标准 IPv4 `/32`、IPv6 `/128` 或规范化网段格式。

### login_approvals

白名单外登录审批表。只保存随机审批凭证的 SHA-256 哈希，不保存明文凭证；记录申请用户、服务端解析 IP、设备、状态、单次/加入白名单范围、审批人、审批时间、10 分钟有效期和消费时间。管理员与超级管理员登录绕过 IP 限制；受限普通用户登录后的 JWT 绑定获批 IP。

### prompts

提示词表。用于保存管理员手动维护的公开提示词、分类和预览内容；旧版内置 GitHub 远程提示词会在启动时清理。启动时会补齐缺失的系统种子模板，例如场景多角度、九宫格、高清放大、重绘增强和图片修复；已有同 ID 记录不会被覆盖。

| 字段         | 类型   | 说明                                            |
| ------------ | ------ | ----------------------------------------------- |
| `id`         | string | 主键                                            |
| `title`      | string | 标题                                            |
| `cover_url`  | string | 封面图                                          |
| `prompt`     | string | 提示词内容                                      |
| `tags`       | json   | 标签列表                                                                      |
| `metadata`   | json   | 提示词模板结构化信息，可为空；旧提示词没有该字段时按普通提示词展示            |
| `category`   | string | 分类标识                                                                      |
| `preview`    | text   | Markdown 展示内容，可包含文本、图片、视频链接等                               |
| `created_at` | string | 创建时间                                                                      |
| `updated_at` | string | 更新时间                                                                      |

`github_url` 仅用于接口返回，不写入数据库。

`metadata` 当前用于把提示词仓库升级为可复用模板库：

| 字段         | 类型     | 说明                                                                                 |
| ------------ | -------- | ------------------------------------------------------------------------------------ |
| `nodeGroup`  | string   | 节点分组：`text`、`image`、`video`，用于按画布节点筛选提示词                         |
| `type`       | string   | 模板用途：`asset`、`image`、`video`、`grid`、`positive`、`negative`、`workflow` 等    |
| `scenario`   | string   | 使用场景，例如短剧、人物设定、镜头模板、分镜等                                       |
| `provider`   | string   | 推荐供应商，例如 `openai`、`volcengine-ark`、`jimeng-cli`，可为空                     |
| `model`      | string   | 推荐模型或 Endpoint ID，可为空                                                       |
| `inputKind`  | string   | 输入类型，例如 `text`、`image`、`video`、`audio`、`multimodal`                        |
| `outputKind` | string   | 输出类型，例如 `text`、`image`、`video`、`asset`、`workflow`                          |
| `variables`  | object[] | 模板变量说明，每项包含 `name`、`description`、`defaultValue`                          |
| `favorite`   | bool     | 是否常用                                                                             |

模板变量使用 `{变量名}` 形式写在 `prompt` 中，前端会按 `metadata.variables` 展示说明并替换为最终提示词。

### assets

素材表。当前用于后台素材库。

| 字段                      | 类型   | 说明                                              |
| ------------------------- | ------ | ------------------------------------------------- |
| `id`                      | string | 主键                                              |
| `title`                   | string | 标题                                              |
| `type`                    | string | 素材类型：`text`、`image`、`video`、`audio` 等    |
| `cover_url`               | string | 封面图                                            |
| `tags`                    | json   | 标签列表                                          |
| `category`                | string | 分类标识                                          |
| `description`             | string | 描述                                              |
| `content`                 | text   | 文本或 Markdown 内容                              |
| `url`                     | string | 图片、视频等媒体地址                              |
| `volcengine_asset_id`     | string | 火山素材 Asset ID，可为空                         |
| `volcengine_group_id`     | string | 火山素材组 ID，可为空                             |
| `volcengine_project_name` | string | 火山 ProjectName，可为空                          |
| `volcengine_status`       | string | 火山审核状态：`Processing`、`Active`、`Failed` 等 |
| `volcengine_error`        | string | 火山审核失败原因，可为空                          |
| `volcengine_public_url`   | string | 提交给火山的公网素材 URL，可为空                  |
| `volcengine_submitted_at` | string | 提交火山审核时间，可为空                          |
| `volcengine_updated_at`   | string | 最近刷新火山审核状态时间，可为空                  |
| `created_at`              | string | 创建时间                                          |
| `updated_at`              | string | 更新时间                                          |

### settings

系统配置表，只保存两行数据：`public` 放前端可读取的公开配置，`private` 放仅后端和管理员可读取的私有配置，配置值都用 JSON。

| 字段         | 类型   | 说明                      |
| ------------ | ------ | ------------------------- |
| `key`        | string | 主键：`public`、`private` |
| `value`      | json   | 配置内容                  |
| `created_at` | string | 创建时间                  |
| `updated_at` | string | 更新时间                  |

`public.value` 常放前端展示和可公开读取的配置，例如模型列表、登录开关等。
`private.value` 常放渠道密钥、登录密钥、后台内部开关等。

当前系统设置接口会按后端结构体序列化和反序列化已知字段；数据库 JSON 中额外存在的旧字段会被忽略。

`public.value` 当前字段：

| 字段              | 类型   | 说明                 |
| ----------------- | ------ | -------------------- |
| `modelChannel`    | object | 模型渠道公开配置组   |
| `auth`            | object | 公开登录配置         |
| `volcengineAsset` | object | 火山素材审核公开开关 |

`modelChannel` 当前字段：

| 字段                 | 类型     | 说明                                                               |
| -------------------- | -------- | ------------------------------------------------------------------ |
| `availableModels`    | string[] | 系统可用模型列表                                                   |
| `modelCosts`         | object[] | 模型算力点配置                                                     |
| `modelTextEndpoints` | object[] | 文本模型使用的接口类型配置                                         |
| `modelProtocols`     | object[] | 后端根据私有渠道推导出的模型协议映射，用于区分 OpenAI 兼容、Ark 与即梦 CLI |
| `modelCapabilities`  | object[] | 后端根据私有渠道推导出的模型能力映射，用于前台区分文本 / 图片 / 视频 |
| `modelSources`       | object[] | 后端根据私有渠道推导出的模型来源映射，用于前台按渠道来源筛选模型   |
| `defaultModel`       | string   | 历史兼容字段；后台不再展示，默认文本模型使用 `defaultTextModel`    |
| `defaultImageModel`  | string   | 默认图片模型                                                       |
| `defaultVideoModel`  | string   | 默认视频模型                                                       |
| `defaultTextModel`   | string   | 默认文本模型                                                       |
| `systemPrompt`       | string   | 系统提示词                                                         |
| `allowCustomChannel` | bool     | 历史兼容字段；当前前端与后端都统一走后端模型渠道，默认关闭 |

`modelCosts` 每项字段：

| 字段      | 类型   | 说明                                                 |
| --------- | ------ | ---------------------------------------------------- |
| `model`   | string | 模型名称                                             |
| `credits` | number | 每次后端模型接口调用前预扣的算力点，未配置默认不扣除 |

`modelProtocols` 每项字段：

| 字段       | 类型   | 说明                                      |
| ---------- | ------ | ----------------------------------------- |
| `model`    | string | 前端可见模型名称                          |
| `protocol` | string | 该模型应使用的渠道协议：`openai`、`volcengine-ark` 或 `jimeng-cli` |

`modelCapabilities` 每项字段：

| 字段           | 类型     | 说明                                      |
| -------------- | -------- | ----------------------------------------- |
| `model`        | string   | 前端可见模型名称                          |
| `capabilities` | string[] | 该模型支持的能力，例如 `text`、`image`、`video` |

`modelSources` 每项字段：

| 字段          | 类型   | 说明                                                         |
| ------------- | ------ | ------------------------------------------------------------ |
| `model`       | string | 前端可见模型名称                                             |
| `channelId`   | string | 后端模型渠道 ID                                              |
| `channelName` | string | 后端模型渠道名称                                             |
| `protocol`    | string | 该渠道协议：`openai`、`volcengine-ark` 或 `jimeng-cli`；不包含密钥或接口地址 |

`private.value` 当前字段：

| 字段              | 类型     | 说明                                                         |
| ----------------- | -------- | ------------------------------------------------------------ |
| `channels`        | object[] | 模型渠道配置列表                                             |
| `promptSync`      | object   | 历史 GitHub 远程提示词定时同步配置；当前没有内置远程提示词源 |
| `auth`            | object   | 私有登录配置，当前不包含第三方登录配置                       |
| `volcengineAsset` | object   | 火山素材审核私有配置                                         |

`channels` 每项字段：

| 字段               | 类型     | 说明                                                       |
| ------------------ | -------- | ---------------------------------------------------------- |
| `id`               | string   | 渠道稳定 ID，供 Agent / 工作流阶段绑定；为空时后端自动生成 |
| `protocol`         | string   | 协议，当前支持 `openai`、`volcengine-ark`、`jimeng-cli`    |
| `name`             | string   | 渠道名称                                                   |
| `baseUrl`          | string   | 渠道接口地址；`jimeng-cli` 可为空                          |
| `apiKey`           | string   | 渠道密钥，后台返回时隐藏；`jimeng-cli` 不需要              |
| `cliPath`          | string   | 即梦 CLI 可执行文件路径；为空时使用 `PATH` 中的 `dreamina` |
| `workDir`          | string   | 即梦 CLI 工作目录，可为空                                  |
| `outputDir`        | string   | 即梦 CLI 下载输出目录；为空时使用后端 `data/jimeng-cli`    |
| `timeoutSeconds`   | number   | 即梦 CLI 命令超时时间；为空或 0 时使用视频任务默认超时     |
| `sessionId`        | number   | 即梦 CLI 会话 ID；0 表示默认会话                           |
| `concurrencyLimit` | number   | 即梦 CLI 渠道并发配置，当前作为渠道配置字段保留            |
| `endpointId`       | string   | Ark 渠道默认 Endpoint / EP                                 |
| `endpointMappings` | object[] | Ark 渠道模型名到 Endpoint / EP 的映射                      |
| `models`           | string[] | 渠道可用模型列表                                           |
| `capabilities`     | string[] | 渠道能力：`text`、`image`、`video`、`video_query`、`asset_review`、`preflight`、`cli_workflow` |
| `environment`      | string   | 环境：`dev`、`test`、`prod`                                |
| `weight`           | number   | 未显式指定渠道时，同一模型命中多个渠道按权重随机           |
| `enabled`          | bool     | 是否启用                                                   |
| `remark`           | string   | 备注                                                       |

`promptSync` 字段当前仅保留为历史配置结构：

| 字段      | 类型   | 说明                                                 |
| --------- | ------ | ---------------------------------------------------- |
| `enabled` | bool   | 是否开启定时同步；当前没有内置远程提示词源，默认关闭 |
| `cron`    | string | Cron 表达式，默认每 5 分钟                           |

`volcengineAsset` 当前字段：

| 字段                 | 类型   | 说明                                                       |
| -------------------- | ------ | ---------------------------------------------------------- |
| `enabled`            | bool   | 是否开启火山素材审核                                       |
| `accessKey`          | string | 火山 Access Key，后台返回时隐藏                            |
| `secretKey`          | string | 火山 Secret Key，后台返回时隐藏                            |
| `projectName`        | string | 火山 ProjectName，默认 `default`                           |
| `region`             | string | 火山地域，默认 `cn-beijing`                                |
| `assetGroupId`       | string | 火山 Asset Group ID，配置后作为 `CreateAsset` 的 `GroupId` |
| `publicAssetBaseUrl` | string | 可被火山访问的公网素材基础地址                             |

后端请求模型时，先按模型名筛选启用且包含该模型的渠道，再按 `weight` 加权随机选择一个渠道。

### ai_tasks

后端云端 AI 代理任务账本表。当前记录生图、图生图、聊天和视频创建请求，用于把请求、扣费流水、上游任务 ID 和失败返还串起来。

| 字段                   | 类型   | 说明                                                                         |
| ---------------------- | ------ | ---------------------------------------------------------------------------- |
| `id`                   | string | 主键                                                                         |
| `user_id`              | string | 发起用户 ID                                                                  |
| `kind`                 | string | 任务大类：`image`、`chat`、`video`                                           |
| `task_type`            | string | 任务类型：`image_generation`、`image_edit`、`chat`、`video_create`           |
| `action_type`          | string | 任务动作：`generate`、`edit`、`extend`、`chat` 等                            |
| `provider`             | string | 命中的后台渠道名称                                                           |
| `protocol`             | string | 渠道协议：`openai`、`volcengine-ark`、`jimeng-cli`                           |
| `model`                | string | 请求模型                                                                     |
| `path`                 | string | 前端调用的 AI 代理路径                                                       |
| `status`               | string | 任务状态：`created`、`queued`、`running`、`succeeded`、`failed`、`cancelled` |
| `credits`              | number | 本次预扣算力点                                                               |
| `credits_refunded`     | number | 已返还算力点数量                                                             |
| `upstream_task_id`     | string | 上游任务 ID，当前主要用于 Ark / 即梦视频任务                                 |
| `raw_status`           | string | 上游原始状态，当前主要用于 Ark / 即梦视频任务                                |
| `video_url`            | text   | 上游返回的视频地址，当前主要用于 Ark / 即梦视频任务                          |
| `video_url_expires_at` | number | 视频地址过期时间戳                                                           |
| `error_code`           | string | 上游失败错误码                                                               |
| `request_json`         | text   | 脱敏后的请求 JSON；不会保存 API Key、base64、blob URL 或文件内容             |
| `response_json`        | text   | 脱敏后的响应 JSON；不会保存 base64 或 blob URL                               |
| `error_message`        | text   | 失败原因                                                                     |
| `finished_at`          | string | 结果内容成功下载或回填完成时间                                               |
| `refunded_at`          | string | 失败/取消任务完成返还时间，用于避免重复返还                                  |
| `created_at`           | string | 创建时间                                                                     |
| `updated_at`           | string | 更新时间                                                                     |

M8 起，前台追溯信息不新增数据库字段，统一放入已脱敏 JSON：

- `request_json._frontend_trace`：创建云端 AI 任务时由前端传入的追溯上下文，可能包含 `projectId`、`canvasId`、`nodeId`、`storyboardGroupId`、`storyboardShotId`、`shotGroupId`、`shotIds` 和 `source`。
- `response_json.frontendArtifacts`：生成结果自动入库“我的素材”后反写的前台产物数组，可能包含 `assetId`、`canvasId`、`nodeId`、`projectId`、`storyboardGroupId`、`storyboardShotId`、`shotGroupId`、`shotIds`、`kind` 和 `createdAt`。
- 上述 JSON 仍走统一脱敏逻辑，不保存 API Key、Authorization、token、secret、base64、`data:`、`blob:` 或 multipart 文件内容。

后台管理接口：

| 接口                                   | 说明                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/admin/ai-tasks`              | 管理员分页查询 AI 任务，支持用户、状态、类型、动作、模型、渠道、上游 taskId、时间范围和关键词筛选 |
| `GET /api/admin/ai-tasks/:id`          | 管理员查看任务详情、用户简要信息、关联算力点流水和脱敏请求/响应                                   |
| `POST /api/admin/ai-tasks/:id/refresh` | 管理员手动刷新 Ark 视频任务状态，并复用失败/取消幂等返还逻辑                                      |
| `GET /api/v1/ai-tasks/:id`             | 当前登录用户查看自己的 AI 任务账本摘要和关联算力点流水                                            |
| `POST /api/v1/ai-tasks/:id/frontend-artifact` | 当前登录用户把前台生成产物 `assetId / nodeId / canvasId` 等反写到任务响应 JSON             |
| `POST /api/admin/ai-tasks/:id/refund`  | 管理员对失败/取消或异常任务手动返还，已返还任务会拒绝重复返还                                     |

### agent_config_records

后端 Agent 配置表。用于把 Agent 中心的全局 / 项目 / 集数配置从浏览器本地存储逐步迁移到后端持久化。

| 字段          | 类型   | 说明                                |
| ------------- | ------ | ----------------------------------- |
| `id`          | string | 主键，由用户、作用域、项目、集数和 Agent 类型组成 |
| `user_id`     | string | 配置所属用户 ID                     |
| `scope`       | string | 配置作用域：`global`、`project`、`episode` |
| `project_id`  | string | 项目 ID，可为空                     |
| `episode_id`  | string | 集数 ID，可为空                     |
| `kind`        | string | Agent 类型，例如 `script_analyzer`、`asset_extractor` |
| `config_json` | text   | 前端 AgentConfig 原始 JSON          |
| `created_at`  | string | 创建时间                            |
| `updated_at`  | string | 更新时间                            |

用户接口：

| 接口                       | 说明                    |
| -------------------------- | ----------------------- |
| `GET /api/v1/agent-configs` | 当前登录用户查询配置    |
| `POST /api/v1/agent-configs` | 当前登录用户保存配置   |

### agent_runs

后端 Agent Run 表。用于保存视频工作流文本 Agent 的运行记录、阶段状态、审核结果和映射预览，替代云端主链路对浏览器 localforage、本机目录和 `.workflow-cache` 的依赖。

| 字段                    | 类型   | 说明                                                          |
| ----------------------- | ------ | ------------------------------------------------------------- |
| `id`                    | string | 主键                                                          |
| `user_id`               | string | 发起用户 ID                                                   |
| `project_id`            | string | 项目 ID 或项目 slug                                           |
| `episode_id`            | string | 集数 ID 或 `epXX`                                             |
| `workflow_run_id`       | string | 工作流运行 ID                                                 |
| `stage_id`              | string | 阶段 ID，例如 `stage1`、`stage2`、`stage3`                    |
| `agent_kind`            | string | Agent 类型                                                    |
| `executor`              | string | 冻结的执行器：`api` 或仅限本地开发的 `codex-cli`              |
| `skill_id`              | string | 冻结的 Skill 稳定 ID                                          |
| `skill_version_id`      | string | 冻结的 Skill 版本记录 ID                                      |
| `skill_version`         | string | 冻结的 Skill 语义版本                                         |
| `skill_content_hash`    | string | 冻结 Skill 文件与契约的内容哈希                               |
| `skill_snapshot_json`   | text   | 本次运行使用的只读 Skill 快照                                 |
| `image_manifest_json`   | text   | 本次运行使用的图片清单；不向用户接口返回服务器路径            |
| `model`                 | string | 实际请求模型                                                  |
| `target_model`          | string | 用户或 Agent 配置期望使用的模型                              |
| `channel_id`            | string | 实际命中的后台渠道 ID                                         |
| `target_channel_id`     | string | 用户或 Agent 配置期望使用的渠道 ID                            |
| `provider`              | string | 命中的后台模型渠道                                            |
| `protocol`              | string | 渠道协议                                                      |
| `allow_fallback`        | bool   | 本次运行是否允许 fallback                                     |
| `fallback_used`         | bool   | 是否实际使用 fallback 渠道                                    |
| `fallback_reason`       | string | fallback 原因                                                 |
| `estimated_credits`     | number | Agent 配置中的单次预估费用                                    |
| `timeout_seconds`       | number | 本次模型调用超时秒数                                          |
| `concurrency_limit`     | number | Agent 配置中的并发限制                                        |
| `allow_batch`           | bool   | Agent 配置是否允许批量运行                                    |
| `status`                | string | `created`、`queued`、`running`、`cancel_requested`、`needs_review`、`approved`、`rejected`、`applied`、`failed`、`cancelled` |
| `write_policy`          | string | 写入策略，默认 `confirm_before_write`                         |
| `requires_confirm`      | bool   | 是否需要用户确认后才能写入正式数据                            |
| `credits`               | number | 本次预扣算力点                                                |
| `idempotency_key`       | string | 同一用户创建任务的幂等键；数据库使用可空字段避免空键冲突      |
| `attempt`               | number | 已领取执行次数                                                |
| `max_attempts`          | number | 最大领取次数                                                  |
| `available_at`          | string | 队列中下一次允许领取的时间                                    |
| `lease_owner`           | string | 当前租约持有 Worker                                           |
| `lease_expires_at`      | string | 当前租约到期时间                                              |
| `heartbeat_at`          | string | Worker 最近续租时间                                           |
| `credits_reserved`      | number | 本任务已经预扣的算力点                                        |
| `credits_refunded`      | number | 本任务已经返还的算力点                                        |
| `request_json`          | text   | 模型请求快照                                                  |
| `raw_output`            | text   | 模型原始输出                                                  |
| `structured_draft_json` | text   | 从原始输出中解析出的 JSON 草案，可为空                        |
| `review_json`           | text   | 用户审核结果或质量门结果                                      |
| `mapping_preview_json`  | text   | 写入资产 / 分镜 / 视频生产包前的映射预览                      |
| `error_message`         | text   | 失败原因                                                      |
| `started_at`            | string | 模型调用开始时间                                              |
| `duration_ms`           | number | 模型调用耗时毫秒                                              |
| `confirmed_at`          | string | 用户确认或驳回时间                                            |
| `applied_at`            | string | 写入正式数据时间                                              |
| `finished_at`           | string | 模型调用完成时间                                              |
| `created_at`            | string | 创建时间                                                      |
| `updated_at`            | string | 更新时间                                                      |

用户接口：

| 接口                                 | 说明                                      |
| ------------------------------------ | ----------------------------------------- |
| `GET /api/v1/agent-runs`             | 当前登录用户按项目、集数、阶段等查询记录  |
| `POST /api/v1/agent-runs`            | 创建后端 Agent Run 并调用文本模型         |
| `POST /api/v1/agent-runs/:id/review` | 当前登录用户确认、驳回或标记已写入        |

### workflow_runs

项目/分集级视频工作流聚合。`user_id + project_id + episode_id + workflow_id + workflow_version + script_hash` 唯一，确保相同剧本快照和工作流版本只创建一个运行记录。`script_snapshot` 创建后不再修改。

| 字段 | 说明 |
| ---- | ---- |
| `id`、`user_id`、`project_id`、`episode_id` | 主键与用户、项目、分集作用域 |
| `workflow_id`、`workflow_version` | 工作流和合同版本 |
| `script_hash`、`script_snapshot` | 不可变剧本内容哈希与快照 |
| `current_stage_id` | 当前建议进入的阶段 |
| `status` | `active`、`completed`、`failed`、`cancelled` |
| `created_at`、`updated_at` | 创建与更新时间 |

### workflow_stage_runs

工作流阶段及其重试记录。每次尝试关联一个底层 `agent_run`，保存输入/输出产物、进度、审核哈希和浏览器本地写入回执。状态包括 `blocked`、`ready`、`queued`、`running`、`cancel_requested`、`needs_review`、`approved`、`rejected`、`applied`、`failed`、`cancelled`。

### workflow_artifacts

阶段产生的版本化结构化产物。`stage_run_id + version` 唯一；`content_hash` 用于确定性质量门、审核冲突和幂等写入检查。内容保存在 `content_json`，同时记录 schema 和模板版本。

### workflow_quality_gate_results

确定性质量门结果。记录所校验产物及哈希、校验器版本、是否通过和结构化问题列表；模型自评不能覆盖本表的阻断结果。

### workflow_events

工作流增量事件流。自增主键作为游标，按用户和 workflow 查询；只保存状态、进度、重试、取消、审核和写入回执等安全化元数据，不保存密钥、完整请求头或上游凭证。

### workflow_skills

六阶段 Skill 的稳定身份表。`stage_key` 唯一，当前阶段键固定为 `script`、`art`、`assets`、`storyboard`、`video`、`delivery`；这里只保存名称、说明和启用状态，不保存可变版本正文。

### workflow_skill_versions

Skill 的不可变版本表。`skill_id + version` 唯一；`files_json` 保存以 `SKILL.md` 为入口的逻辑文件，`contract_json` 保存输入、图片策略、输出结构和质量门契约，`content_hash` 对规范化文件与契约计算。状态为 `draft`、`published`、`archived`，发布后不能原地修改。

### workflow_stage_skill_bindings

阶段到 Skill 版本的生效指针。`stage_key + scope + scope_id` 唯一；`scope=project` 时优先于 `scope=global`，从而支持项目灰度、全局推广及两级独立回滚。

### workflow_skill_evaluations

Skill 发布前 dry-run 与同输入版本对比记录。冻结候选版、基线版、候选内容哈希、项目/分集、输入哈希、图片清单、结果、结构化差异和质量门；评测不创建正式工作流阶段、不写业务资产。

### workflow_skill_audit_logs

Skill 发布与回滚审计记录。保存管理员、动作、阶段、作用域、项目、目标版本和创建时间；项目灰度、全局推广及两级回滚与绑定更新在同一事务中完成，便于追溯线上实际生效版本。

### workflow_media_batches

本地多模态验证的一次性图片批次。批次绑定用户、工作流、阶段和启动幂等键，状态只在未使用的 `open` 与已绑定任务的 `claimed` 之间变化；过期或已绑定批次不能再次使用。

### workflow_media_items

一次性批次内最多 9 张图片的清单。保存资产 ID、角色/场景/道具类型、显示名称、版本、顺序、SHA-256、真实 MIME、大小与服务端私有路径；服务端路径不参与用户接口序列化。任务占用批次时固定按角色、场景、道具顺序写入 `agent_runs.image_manifest_json`。

### credit_logs

用户算力点变更流水表。当前记录后台手动调整、模型调用预扣和模型调用失败返还。

超级管理员直接调整普通管理员或普通用户时只改变目标账号余额。普通管理员调整普通用户时是双向额度转移：增加用户余额会等额扣减管理员余额，减少用户余额会等额返还管理员余额；双方余额和两条 `admin_adjust` 流水在同一事务内写入，并共享一个 `related_id`。超级管理员免扣调用不写入虚假的余额变动流水，用量从 AI 任务、Agent Run 与操作审计查询。

| 字段         | 类型   | 说明                                                    |
| ------------ | ------ | ------------------------------------------------------- |
| `id`         | string | 主键                                                    |
| `user_id`    | string | 关联用户 ID                                             |
| `type`       | string | 类型：`admin_adjust`、`ai_consume`、`ai_refund`         |
| `amount`     | number | 本次变动数量，增加为正，扣减为负                        |
| `balance`    | number | 变动后的用户算力点余额                                  |
| `related_id` | string | 关联业务 ID；AI 扣费/返还指向任务 ID，管理员转移时串联双方流水 |
| `remark`     | string | 备注                                                    |
| `extra`      | json   | 扩展信息                                                |
| `created_at` | string | 创建时间                                                |

`type` 当前取值：

| 值             | 说明                     |
| -------------- | ------------------------ |
| `admin_adjust` | 后台手动调整             |
| `ai_consume`   | 调用后端模型接口消费     |
| `ai_refund`    | 后端模型接口调用失败返还 |
