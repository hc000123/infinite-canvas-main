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
| `role`          | string | 角色：`user`、`admin`                                |
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

### prompts

提示词表。用于保存管理员手动维护的公开提示词、分类和预览内容；旧版内置 GitHub 远程提示词会在启动时清理。

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
| `provider`   | string   | 推荐供应商，例如 `openai`、`volcengine-ark`，可为空                                  |
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
| `defaultModel`       | string   | 默认模型                                                           |
| `defaultImageModel`  | string   | 默认图片模型                                                       |
| `defaultVideoModel`  | string   | 默认视频模型                                                       |
| `defaultTextModel`   | string   | 默认文本模型                                                       |
| `systemPrompt`       | string   | 系统提示词                                                         |
| `allowCustomChannel` | bool     | 是否允许用户自定义渠道，默认允许，关闭后前端只提供走后端渠道的模式 |

`modelCosts` 每项字段：

| 字段      | 类型   | 说明                                                 |
| --------- | ------ | ---------------------------------------------------- |
| `model`   | string | 模型名称                                             |
| `credits` | number | 每次后端模型接口调用前预扣的算力点，未配置默认不扣除 |

`private.value` 当前字段：

| 字段              | 类型     | 说明                                                         |
| ----------------- | -------- | ------------------------------------------------------------ |
| `channels`        | object[] | 模型渠道配置列表                                             |
| `promptSync`      | object   | 历史 GitHub 远程提示词定时同步配置；当前没有内置远程提示词源 |
| `auth`            | object   | 私有登录配置，当前不包含第三方登录配置                       |
| `volcengineAsset` | object   | 火山素材审核私有配置                                         |

`channels` 每项字段：

| 字段       | 类型     | 说明                                       |
| ---------- | -------- | ------------------------------------------ |
| `protocol` | string   | 协议，当前支持 `openai`、`volcengine-ark`  |
| `name`     | string   | 渠道名称                                   |
| `baseUrl`  | string   | 渠道接口地址                               |
| `apiKey`   | string   | 渠道密钥                                   |
| `models`   | string[] | 渠道可用模型列表                           |
| `weight`   | number   | 渠道权重，同一模型命中多个渠道时按权重随机 |
| `enabled`  | bool     | 是否启用                                   |
| `remark`   | string   | 备注                                       |

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
| `protocol`             | string | 渠道协议：`openai`、`volcengine-ark`                                         |
| `model`                | string | 请求模型                                                                     |
| `path`                 | string | 前端调用的 AI 代理路径                                                       |
| `status`               | string | 任务状态：`created`、`queued`、`running`、`succeeded`、`failed`、`cancelled` |
| `credits`              | number | 本次预扣算力点                                                               |
| `credits_refunded`     | number | 已返还算力点数量                                                             |
| `upstream_task_id`     | string | 上游任务 ID，当前主要用于 Ark 视频任务                                       |
| `raw_status`           | string | 上游原始状态，当前主要用于 Ark 视频任务                                      |
| `video_url`            | text   | 上游返回的视频地址，当前主要用于 Ark 视频任务                                |
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

### credit_logs

用户算力点变更流水表。当前记录后台手动调整、模型调用预扣和模型调用失败返还。

| 字段         | 类型   | 说明                                                    |
| ------------ | ------ | ------------------------------------------------------- |
| `id`         | string | 主键                                                    |
| `user_id`    | string | 关联用户 ID                                             |
| `type`       | string | 类型：`admin_adjust`、`ai_consume`、`ai_refund`         |
| `amount`     | number | 本次变动数量，增加为正，扣减为负                        |
| `balance`    | number | 变动后的用户算力点余额                                  |
| `related_id` | string | 关联业务 ID；后端 AI 代理扣费和返还时指向 `ai_tasks.id` |
| `remark`     | string | 备注                                                    |
| `extra`      | json   | 扩展信息                                                |
| `created_at` | string | 创建时间                                                |

`type` 当前取值：

| 值             | 说明                     |
| -------------- | ------------------------ |
| `admin_adjust` | 后台手动调整             |
| `ai_consume`   | 调用后端模型接口消费     |
| `ai_refund`    | 后端模型接口调用失败返还 |
