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
- `agent_definitions`
- `agent_versions`
- `agent_plans`
- `agent_plan_revisions`
- `agent_plan_steps`
- `agent_plan_confirmations`
- `workflow_definitions`
- `workflow_versions`
- `workflow_executions`
- `workflow_execution_revisions`
- `workflow_node_executions`
- `workflow_execution_confirmations`
- `workflow_runs`
- `workflow_stage_runs`
- `workflow_local_apply_receipts`
- `workflow_events`
- `skill_definitions`
- `skill_versions`
- `skill_evaluations`
- `skill_audit_logs`
- `workflow_stage_skill_bindings`
- `artifact_schemas`
- `artifacts`
- `invocation_runs`
- `invocation_preflight_revisions`
- `invocation_attempts`
- `invocation_artifact_refs`
- `invocation_events`
- `invocation_gate_results`
- `invocation_reviews`
- `invocation_apply_attempts`
- `invocation_test_sink_receipts`
- `workflow_media_batches`
- `workflow_media_items`
- `prompts`
- `asset_projects`
- `asset_folders`
- `assets`
- `settings`

后续新增表时再同步补充本文档，未实际使用的规划表不提前写入。

### Artifact 与 Invocation Runtime

Artifact 与 Invocation Runtime 使用以下 10 张正式业务表：

| 表 | 说明 |
| ---- | ---- |
| `artifact_schemas` | 按 Artifact 类型与版本登记规范化 JSON Schema、核心 Schema 标记和内容哈希，用于冻结输入/输出校验契约。 |
| `artifacts` | 通用不可变产物外壳，保存所有者、类型、Schema 版本/哈希、项目/分集坐标、父 Artifact 引用、生产 Invocation/attempt/Skill、payload、extensions 和内容哈希。 |
| `invocation_runs` | Invocation 聚合头，记录当前状态、最新 revision / attempt 和已审核 Artifact 集哈希。状态包含 `planned`、`preflight`、`awaiting_confirmation`、`queued`、`running`、`cancel_requested`、`needs_review`、`approved`、`applied`、`blocked`、`failed`、`partial`、`rejected` 和 `cancelled`。 |
| `invocation_preflight_revisions` | 追加式预检版本，冻结 Skill、Schema、输入、参数、执行策略、路由 Trace 和确认要求。 |
| `invocation_attempts` | 执行尝试、原始/结构化输出、费用与错误。`retry_plan_json` 冻结重试坐标和保留产物；失败或取消不会把保留产物复制到当前 attempt，后续重试精确继承已有非空计划，修正成功后才重新校验并挂回保留产物。`correction_trace_json` 单独记录人工校正，不改写原始输出或模型 Tool Trace。 |
| `invocation_artifact_refs` | 按 revision、attempt、binding 和 ordinal 记录输入/输出 Artifact 引用。 |
| `invocation_events` | 追加式生命周期事件和 Trace。 |
| `invocation_gate_results` | 按 Artifact、校验层、校验器和执行组保存质量门结果；唯一索引固定覆盖 `invocation_id / attempt / execution_ordinal / layer / validator_id / binding_name / output_ordinal / artifact_hash` 的完整顺序。item gate 显式记录 `binding_name / output_ordinal`，新写入的 global gate 使用空 binding 和 `-1`。 |
| `invocation_reviews` | 基于有序 Artifact 集哈希的追加式批准/驳回记录。 |
| `invocation_apply_attempts` | 按 Invocation 和幂等键保存 Apply 预留、请求哈希、目标、回执与失败原因。 |

`invocation_test_sink_receipts` 不属于生产业务模型，是服务端 `test_sink` Apply 适配器使用的测试基础设施表，仅用来验证业务写入、Apply 回执和 Invocation 状态的同事务与幂等语义。

### Agent Registry 与 Agent Plan Runtime

Agent Registry 当前主要承载唯一“画布总控”和历史兼容数据。画布总控只保存职责、可访问 Skill Catalog 范围和执行策略，不复制 Skill 正文、Schema 或质量门；它使用 `catalog_plan`，发布版本可以没有默认 Step，但运行时必须提交 1–32 个真实 Skill Step。已确认 Agent Plan 通过现有 Invocation / Artifact Runtime 逐步执行。

| 表 | 说明 | 关键索引 / 约束 |
| ---- | ---- | ---- |
| `agent_definitions` | Agent 身份、系统 / 项目所有权、标签、启用状态和推荐版本。正式入口只使用系统“画布总控”；其他系统 / 项目 Agent 作为兼容或管理数据保留。 | 所有者类型、用户、项目和名称组成唯一索引；推荐版本 ID、项目 ID、启用状态有查询索引。 |
| `agent_versions` | Agent 不可变发布版本或可编辑草稿，保存 Role Prompt、`configured_chain` / `catalog_plan`、默认 Skill 引用、Skill 访问策略、模型 / 工具 / 执行策略和内容哈希。 | `agent_id + version` 唯一；状态和内容哈希有索引；只有 `draft` 可原位更新。 |
| `agent_plans` | 一次 Agent 运行的聚合头，保存项目 / 分集、精确 Agent 版本、当前 revision、状态、额度上限和确认指纹。 | `user_id + idempotency_key` 唯一；用户、项目、状态、Agent / 版本和确认指纹有索引。 |
| `agent_plan_revisions` | 追加式 Plan Revision，冻结 Agent 内容哈希、来源 Artifact 引用、顺序 Step 快照、确认指纹与预计额度。 | `agent_plan_id + revision` 唯一；用户、Agent 版本和内容哈希有索引。 |
| `agent_plan_steps` | 冻结每一步 Skill ID / 版本 / 哈希、符号输入 Binding、参数、预期输出、Invocation ID、状态和输出 Artifact 引用。 | `agent_plan_id + revision + ordinal` 和 `agent_plan_id + revision + step_key` 唯一；Invocation、Skill 版本和状态有索引。 |
| `agent_plan_confirmations` | 对精确 Plan revision、指纹、额度和 requirement code 集合的追加式确认凭证。 | `agent_plan_id + revision` 唯一；用户和指纹有索引。 |

Plan 状态包括 `draft`、`preflight`、`awaiting_confirmation`、`running`、`needs_review`、`completed`、`blocked`、`failed` 和 `cancelled`。预检解析并冻结精确 Agent / Skill / Artifact 哈希；确认必须完整匹配 revision、指纹和 requirement code 集合。执行时只为当前 Step 创建一个 Invocation，审核批准的输出 Artifact 通过符号 Binding 成为下一步输入；取消和失败不会创建下游任务。

管理员通过 `/api/v1/admin/agents` 管理兼容 Agent 版本；普通项目 API 仍禁止修改系统 Agent。服务启动只确保 `agent-system-canvas-orchestrator` / `agent-version-system-canvas-orchestrator-1.0.0` 存在并被推荐，不再加载固定剧本、资产、分镜等岗位 Agent 种子。

`invocation_runs` 通过 `agent_plan_id / agent_plan_revision / agent_plan_step_key / confirmation_source` 记录委托来源。外部调用方不能伪造 Plan 确认；只有冻结的 Agent、Skill、Artifact、参数、额度和确认项全部匹配时，内部委托确认才可进入队列。

### Workflow Registry 与 Composer Runtime

Workflow 只保存 DAG、路由、条件、审批、确定性 Adapter 引用和重试策略。正式生产版本与新建节点只引用独立发布的 Skill，不复制其正文、Schema 或质量门；历史 Agent 节点仍可读取，但项目编辑器不再新增或修改。发布版本不可修改；运行前先解析用户手选的精确 Skill Version，再由预检冻结 Workflow 内容哈希、节点解析结果、输入 Artifact、手选版本、Adapter 快照、参数、额度和确认指纹。

| 表 | 说明 | 关键索引 / 约束 |
| ---- | ---- | ---- |
| `workflow_definitions` | Workflow 稳定身份、系统 / 项目所有权、标签、启用状态和推荐版本。系统 Workflow 可见但只读，项目 Workflow 按用户与项目隔离。 | 所有者类型、用户、项目和名称组成唯一索引；推荐版本、项目和启用状态有查询索引。 |
| `workflow_versions` | 可编辑草稿或不可变发布版本，保存完整 DAG Package 与规范内容哈希。 | `workflow_id + version` 唯一；状态和内容哈希有索引；只有 `draft` 可更新。 |
| `workflow_executions` | 一次 Workflow 运行的聚合头，保存精确版本、项目 / 分集、当前 revision、状态、预计额度、幂等键和确认指纹。 | `user_id + idempotency_key` 唯一；Workflow、版本、项目、分集和状态有查询索引。 |
| `workflow_execution_revisions` | 追加式执行 Revision，冻结路由预览、输入 Artifact、手选 Skill 版本、Adapter ID / 版本 / 内容哈希 / 规则快照、参数、确认项和额度。 | `workflow_execution_id + revision` 唯一；用户、版本、内容哈希和指纹有索引。 |
| `workflow_node_executions` | 每个 DAG 节点的运行投影，记录拓扑序、Skill 执行器、Invocation、状态、输出 Artifact 和稳定错误码；Agent Plan 坐标仅为历史兼容字段。 | `workflow_execution_id + revision + node_key` 唯一；Invocation、Agent Plan、节点和状态有索引。 |
| `workflow_execution_confirmations` | 对精确 revision、指纹、额度和 requirement code 集合的确认凭证。 | `workflow_execution_id + revision` 唯一；用户和指纹有索引。 |

Workflow 状态包括 `preflight`、`awaiting_confirmation`、`running`、`needs_review`、`completed`、`blocked`、`partial`、`failed` 和 `cancelled`。节点只有在依赖 Artifact 已批准且确定性条件通过后才会启动；正式节点统一委托 Invocation Runtime。刷新页面只读取已有 execution / revision / node 坐标，不创建新的运行记录。

Workflow Adapter 不新增数据库表，也不调用模型。Adapter 定义保存在服务端版本化代码 Registry 中，预检把精确规则快照冻结进 `workflow_execution_revisions.route_preview_json`；执行产出的派生 Artifact 保留全部父引用，并在 `artifacts.extensions_json` 的 `workflow.adapter` 下记录 Adapter ID、版本、内容哈希、输入 / 输出契约和规则。相同快照与相同父 Artifact 重试得到相同内容哈希，Schema 失败不会修改原 Artifact。

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

`superadmin` 可管理管理员账号；普通 `admin` 只能管理 `user`。超级管理员可执行 `user → admin` 和 `admin → user` 角色转换；转换事务只更新 `role` 与 `updated_at`，账号 ID、密码哈希、资料、算力余额、IP 策略以及关联的用量、流水、操作和登录记录全部保留，并在同一事务写入 `security.admin_role_changed` 安全审计。系统禁止超级管理员修改或删除自己，也禁止降级、禁用或删除最后一个有效超级管理员。只有 `superadmin` 调用 AI 时不校验或扣减 `credits`，任务仍保留本次折算用量；普通 `admin` 与 `user` 均持有并消耗真实余额。

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

角色转换审计归属发生转换的目标账号，`metadata` 记录 `actorId`、`fromRole` 和 `toRole`；请求 IP、会话和设备信息由服务端上下文写入。角色更新或审计写入失败时整个事务回滚。

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
| `kind`       | string   | 记录类型：`template` 普通模板、`standard` 公司标准                                    |
| `policy`     | string   | 公司标准策略：`required` 必选、`recommended` 默认推荐、`optional` 手动使用            |
| `slot`       | string   | 配方位置：`style`、`camera`、`lighting`、`quality`、`negative`、`format`、`constraint` |
| `enabled`    | bool     | 公司标准是否参与生产；仅 `kind=standard` 时生效                                      |

模板变量使用 `{变量名}` 形式写在 `prompt` 中，前端会按 `metadata.variables` 展示说明并替换为最终提示词。

旧提示词缺少以上公司标准字段时，前端按 `kind=template`、`policy=optional`、`enabled=true` 解释，只作为可选模板展示，不会自动加入图片或视频提示词。

### asset_projects

后台公共素材库的独立项目，不绑定浏览器本地项目中心。

| 字段         | 类型   | 说明             |
| ------------ | ------ | ---------------- |
| `id`         | string | 主键             |
| `name`       | string | 唯一项目名称     |
| `created_at` | string | 创建时间         |
| `updated_at` | string | 项目最近变更时间 |

### asset_folders

素材项目内的多级文件夹。

| 字段         | 类型   | 说明                                         |
| ------------ | ------ | -------------------------------------------- |
| `id`         | string | 主键                                         |
| `project_id` | string | 所属素材项目                                 |
| `parent_id`  | string | 上级文件夹；为空表示项目根目录               |
| `name`       | string | 文件夹名称；同一项目、同一父目录下保持唯一   |
| `created_at` | string | 创建时间                                     |
| `updated_at` | string | 更新时间                                     |

### assets

素材表。当前用于后台素材库。

| 字段                      | 类型   | 说明                                              |
| ------------------------- | ------ | ------------------------------------------------- |
| `id`                      | string | 主键                                              |
| `project_id`              | string | 所属后台素材项目                                  |
| `folder_id`               | string | 所属文件夹；为空表示项目根目录                    |
| `title`                   | string | 标题                                              |
| `type`                    | string | 素材类型：`text`、`image`、`video`、`audio` 等    |
| `cover_url`               | string | 封面图                                            |
| `tags`                    | json   | 标签列表                                          |
| `category`                | string | 分类标识                                          |
| `description`             | string | 描述                                              |
| `content`                 | text   | 文本或 Markdown 内容                              |
| `url`                     | string | 图片、视频等媒体地址                              |
| `episode_numbers`         | json   | 适用集数，可同时标记多集                          |
| `all_episodes`            | bool   | 是否全剧通用；为真时不保留具体集数                |
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
| `modelCosts`         | object[] | 模型单位算力点配置                                                 |
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
| `credits` | number | 语言按每次调用、图片按每张、视频按每秒配置的单位算力点 |

后端在创建 AI 任务时按调用次数、请求图片张数或请求视频秒数计算实际预扣；失败任务按实际预扣数返还，未配置默认不扣除。

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

后端旧 Agent 配置表。用于兼容早期 Agent 中心的全局 / 项目 / 集数配置；当前 Workflow + Skill 正式生产链和画布总控不读取该表。

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

后端执行任务表。表名沿用历史 `agent_runs`，当前由 Invocation Worker 记录具体模型执行、阶段状态、审核结果和映射预览；它不是岗位 Agent 编排入口。

| 字段                    | 类型   | 说明                                                          |
| ----------------------- | ------ | ------------------------------------------------------------- |
| `id`                    | string | 主键                                                          |
| `user_id`               | string | 发起用户 ID                                                   |
| `project_id`            | string | 项目 ID 或项目 slug                                           |
| `episode_id`            | string | 集数 ID 或 `epXX`                                             |
| `workflow_run_id`       | string | 工作流运行 ID                                                 |
| `stage_id`              | string | 阶段 ID，例如 `stage1`、`stage2`、`stage3`                    |
| `agent_kind`            | string | Agent 类型                                                    |
| `executor`              | string | 冻结的执行器；当前固定为 `api`                                |
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

工作流阶段及其重试投影。每个可执行阶段通过 `invocation_id` 关联唯一 Invocation；`agent_run_id`、输入/输出 ID、状态、进度、审核哈希和回执字段只为现有工作台提供投影，不是第二份执行真相。重试追加阶段记录但保持同一冻结 Invocation revision，状态由最新 Invocation attempt 映射。

### workflow_artifacts

旧版阶段产物表。新数据库不再自动迁移，新 Workflow 不再写入；现有接口中的同名结构只是把权威 Invocation Artifact-set 临时投影为兼容 DTO。`content_hash / artifactSetHash` 等于完整有序 Artifact-set 哈希，`artifactIds` 保存该集合内的标准 Artifact ID。

### workflow_quality_gate_results

旧版工作流质量门表。新数据库不再自动迁移，新 Workflow 不再写入；工作台质量门响应来自 `invocation_gate_results` 的权威投影，模型自评不能覆盖系统业务门。

### workflow_local_apply_receipts

Workflow 对浏览器本地素材、分镜或生产包完成受控 Apply 后的服务端回执。记录用户、Invocation、Apply attempt、Workflow / Stage、目标、目标 ID、应用/跳过数量、版本、错误和安全元数据；与 `invocation_apply_attempts` 在同一事务内幂等写入，不复制 Artifact 内容。

### workflow_events

工作流增量事件流。自增主键作为游标，按用户和 workflow 查询；只保存状态、进度、重试、取消、审核和写入回执等安全化元数据，不保存密钥、完整请求头或上游凭证。

### skill_definitions

通用 Skill 稳定身份表。记录名称、说明、`system` / `project` 所有者、创建用户、项目归属、启用状态和当前推荐版本；不保存版本正文。System Skill 只允许管理员写，Project Skill 按创建用户与项目隔离；复制 System Skill 会创建新的 Project Definition 和 Draft，不改变源记录。

### skill_versions

Skill 不可变版本表。`skill_id + version` 唯一；分别保存 Manifest、逻辑文件、输入契约、输出契约、质量门、内容哈希和评测摘要。只有 Draft 可原地编辑；发布、推荐、归档和停用相互独立，运行只冻结精确 Version ID 与内容哈希。未引用 Draft 和从未发布的 Definition 可安全删除，已发布、已归档、已评测、已绑定或被 Workflow / Agent / Invocation 引用的记录禁止物理删除。

### workflow_stage_skill_bindings

生产工作流阶段到通用 Skill Version 的消费端绑定。项目绑定优先于全局绑定；解析时还会验证 `workflow.stage.<stage>` capability。

### skill_evaluations / skill_audit_logs

通用 Skill 的冻结试运行、同输入对比，以及创建、复制、编辑、发布、推荐、回滚、归档、停用和安全删除审计。试运行不写正式工作流阶段或业务资产。

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
