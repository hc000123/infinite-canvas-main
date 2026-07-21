# 本地 Codex CLI 工作流验证模式设计

## 目标

在不改变统一视频工作台页面、不恢复用户可见执行方式开关、也不削弱生产安全边界的前提下，为本地开发环境增加 Codex CLI 文本执行器。开发者可以用真实 Codex 登录态验证“阶段启动 → 队列 → 运行 → 质量门 → 审核 → 应用 → 下游解锁”的完整工作流；上线前和生产部署始终使用后台文本 API / 云端 Worker。

Codex CLI 只替代导演与美术、分镜提示词等文本 Agent 的上游调用。视频生成仍使用后台发布的视频渠道；真实视频付费、素材加白和对象存储不由 Codex CLI 模拟。

## 方案选择

采用环境自动隔离，不在页面或后台模型设置中提供手动切换。

- 本地宿主机显式设置 `WORKFLOW_TEXT_EXECUTOR=codex-cli` 与 `WORKFLOW_LOCAL_CODEX_ENABLED=true` 后启用 Codex CLI。
- 默认值和正式部署固定为 `WORKFLOW_TEXT_EXECUTOR=api`、`WORKFLOW_LOCAL_CODEX_ENABLED=false`。
- `APP_ENV`、`GIN_MODE`、`GO_ENV` 或 `NODE_ENV` 任一表示 `production` / `release` 时，只要检测到 CLI 执行器或本地开关，服务启动立即失败。
- 正式 Docker 配置继续显式写入 API 模式，镜像不安装 Codex CLI，形成配置校验、运行时代码和镜像内容三重门禁。

不采用页面手动切换，因为它会把开发能力暴露给普通用户并增加误上线风险；也不维护两套工作流页面，因为状态、审核与应用逻辑会产生分叉。

## 架构

### 1. 统一执行器边界

在 Go Worker 内抽出仅负责文本调用的执行器接口。队列领取、租约续期、取消、重试、阶段状态、artifact、质量门、人工审核、应用回执和事件记录继续使用现有实现，不因上游不同而分叉。

执行器提供两种实现：

- API 执行器：封装当前模型渠道选择、OpenAI 兼容请求、重试分类和计费逻辑。
- Codex CLI 执行器：在宿主机启动 `codex exec`，读取当前 Codex 登录态，将最终文本转换为现有 `agentRunCallResult`。

`AgentRun` 新增 `Executor` 审计字段，值为 `api` 或 `codex-cli`。任务创建时写死执行器类型，排队后即使环境变量变化也不会改走另一条通道。

### 2. CLI 调用方式

CLI 执行器只接受 Worker 已生成的系统提示词和用户提示词，不接受浏览器传入的命令、工作目录或额外参数。调用形式固定为：

```text
codex exec --ephemeral --sandbox read-only --color never
  --cd <服务端固定工作目录>
  --output-last-message <受控临时文件>
  [--model <服务端可选模型>]
  -
```

- Prompt 通过标准输入传入，避免 shell 拼接和参数注入。
- 使用 `exec.CommandContext`，停止任务或服务退出时终止子进程。
- 使用临时目录保存最终消息，读取后立即删除；stdout / stderr 只保留限制长度的诊断，不写入密钥或完整环境变量。
- 固定 `read-only` 与 `--ephemeral`，不允许 CLI 修改代码、工作流文件或用户素材。
- 工作目录只来自 `WORKFLOW_CODEX_WORKDIR` 或服务启动目录，不接受项目、分集或请求参数覆盖。
- CLI 默认单并发，超时沿用 Agent Run 的受控范围。

### 3. 任务创建与计费

API 模式维持当前行为：创建任务时解析后台文本模型与渠道，计算预估算力点；Worker 领取后预扣，失败按现有规则退款。

Codex CLI 模式不要求后台存在文本模型渠道，任务记录使用：

- `Executor=codex-cli`
- `Provider=local-codex-cli`
- `Protocol=codex-cli`
- `Model=WORKFLOW_CODEX_MODEL`，未指定时显示“当前 Codex 登录态”
- `EstimatedCredits=0`、`Credits=0`

CLI 模式不操作应用算力点账本，但保留耗时、尝试次数、错误、状态、artifact 和审核记录。CLI 失败仍走同一停止 / 重试状态机，不自动回退 API；API 模式也不自动回退 CLI。

### 4. 健康状态与页面表达

Worker 健康接口增加 `executor` 与 `executorLabel`。API 模式检查文本渠道可用性；CLI 模式检查：

- 当前不是生产环境；
- 本地开关已开启；
- `codex` 可执行文件可定位；
- 固定工作目录存在；
- `codex --version` 能在短超时内完成。

统一工作台仍只展示只读摘要：本地显示“Codex CLI（本地验证）”，生产显示后台 API 模型。页面不提供切换、路径、登录态、密钥或命令参数编辑。

### 5. 本地运行方式

Codex CLI 依赖宿主机登录态，因此推荐用宿主机启动 Go API 与 Next.js 开发服务：

```dotenv
APP_ENV=development
WORKFLOW_TEXT_EXECUTOR=codex-cli
WORKFLOW_LOCAL_CODEX_ENABLED=true
WORKFLOW_CODEX_BIN=codex
WORKFLOW_CODEX_WORKDIR=/absolute/path/to/infinite-canvas-main
# 可选：WORKFLOW_CODEX_MODEL=<model>
```

`docker-compose.local.yml` 继续保持 API 模式，不挂载宿主机 Codex 凭证和二进制，避免把个人登录态复制进容器。需要验证 Docker 上线形态时，使用当前 API / Worker 路径。

## 数据流

1. 用户在统一工作台启动阶段。
2. 后端根据启动时已经验证的服务端执行器模式创建 Agent Run，并写入 `Executor`。
3. Worker 领取任务并续租；API 任务选择后台渠道并计费，CLI 任务启动受控子进程且不计应用算力点。
4. 两种执行器都返回同一格式的文本与结构化草案。
5. 现有 artifact、质量门、审核哈希、映射预览、应用本地和回执流程继续执行。
6. 停止、超时、重试、刷新恢复和服务退出使用同一状态机。

## 错误处理

- 未安装 CLI：健康状态显示不可用，任务启动前返回“本地未找到 Codex CLI”。
- 未登录或 CLI 返回非零：保存安全化错误摘要，任务进入失败；不回退 API。
- 超时 / 取消：终止子进程并按现有规则进入失败或已停止。
- 输出为空：按可重试上游错误处理。
- 输出不是 JSON：保留 `RawOutput`，沿用现有文本解析和人工审核能力。
- 生产误配置：服务启动失败，不等待第一个任务才发现风险。

## 测试与验收

### 自动测试

- 配置：开发环境显式开启成功；默认使用 API；四种生产环境标记均拒绝 CLI；CLI 路径和工作目录只从服务端读取。
- 任务：CLI 模式无需模型渠道、费用为零、任务记录执行器；API 模式行为和计费不变。
- 执行器：成功、空输出、非零退出、超时、取消、临时文件清理、stderr 截断、模型参数可选、固定只读参数。
- Worker：CLI 成功进入待审核并生成 artifact；失败 / 停止 / 重试 / 租约恢复保持一致；API 回归全部通过。
- 健康：分别报告 API 与 CLI 可用性，不暴露本地绝对路径和登录凭证。

### 真实本地验收

使用宿主机 Codex 登录态，从统一页面完成一次导演与美术阶段和一次分镜提示词阶段，检查队列、日志、质量门、审核、资产 / 生产包映射、刷新恢复、停止与重试。该验收可能消耗 Codex 账户额度，但不扣应用算力点。

### 上线门禁

- 生产配置加载测试必须拒绝 CLI。
- `docker-compose.yml`、`docker-compose.local.yml` 和 `.env.example` 的部署示例保持 API 模式。
- 生产镜像确认没有 `codex` 可执行文件。
- Docker 内创建 CLI 类型任务必须被拒绝；API Worker 健康、队列和主路径继续通过。
- 发布前扫描用户界面，不能出现执行器切换、CLI 路径或本地凭证配置。

## 不做事项

- 不恢复旧 `/original-workflow` 本地文件 Runner、`.workflow-cache`、Python 脚本或 Next API 执行链。
- 不允许浏览器指定 `codex-cli`、命令、工作目录或执行参数。
- 不把 Codex CLI 当作生产 fallback。
- 不让 CLI 直接修改素材、分镜、画布或数据库。
- 不用 CLI 替代真实视频渠道或声称视频付费链路已经被验证。
