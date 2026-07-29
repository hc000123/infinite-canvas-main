# 本地 Codex Workflow 清理报告

## SAFE：已删除

- 后端 Codex CLI Agent Run 执行器、配置项、执行器分流及专属测试。
- 旧 `/api/original-workflow*` 文件型 Workflow API、阶段提示词与执行模式门禁。
- 前端仅服务于旧本地 Workflow 的 Zustand store、preset、readiness、imports、next-step 和 chain-health 模块。
- Compose、`.env.example`、部署与发布文档中的本地 Codex 执行开关。

这些路径已有统一 Invocation / Artifact Runtime 与 API Worker 替代，删除后不影响正式 Workflow 或 Skill 运行。

## CAUTION：保留并去耦

- `/original-workflow` 页面保留为项目分集 Workflow 的兼容跳转，不再执行本地 Workflow。
- `agent_runs` 历史表名、Invocation Policy 和媒体上下文继续保留，但执行器固定为 `api`。
- 画布 Agent、统一 Skill Registry、Workflow Composer、Invocation / Artifact Runtime 和后端 API Worker 完整保留。
- Dreamina / Jimeng CLI 是独立受控的视频渠道，不属于本地 Codex Workflow，保持不变。

## DANGER：未执行

- 未删除 `.agents/skills` 或项目 Workflow Skill。
- 未修改 Skill 内容、版本冻结、上下游 Artifact 合同或画布 Agent 调用能力。
- 未清理数据库历史记录或用户本地素材，避免不可恢复的数据操作。

## 验证

- 新增架构门禁测试，阻止 Codex 执行器、旧环境变量和旧本地 Workflow API 回归。
- 完成生产代码残留扫描、Go 测试、前端测试、TypeScript 检查与差异格式检查。
