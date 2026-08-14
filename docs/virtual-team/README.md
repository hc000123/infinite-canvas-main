# Codex 虚拟开发团队

本目录只管理“眨眼之间”仓库的 Codex 开发协作，不属于产品内 Agent、Workflow、Skill、Invocation 或 Artifact。

## 使用方式

在 `00｜画布开发总控` 中直接用自然语言说明目标。总控负责选择员工、生成派工单、追踪结果和组织验收。长期员工默认只分析和审查；代码修改进入单独 Worktree 任务。

## 团队花名册

| 编号 | 标题 | Thread ID | Host ID | Project ID | 岗位文件 | 状态 |
|---|---|---|---|---|---|---|
| 00 | 画布开发总控 | `019ff65e-96bc-7032-92d1-dfd7b6777af4` | `local` | 当前本地 cwd | 本文件 | 在职 |
| 01 | 产品与技术架构 | `019ff676-c33b-7c93-8649-f0d945eb93ef` | `local` | `local-85f1c5f54cf379f97bedca62e02af508` | `employees/01-architecture.md` | 在职 |
| 02 | 画布前端 | `019ff676-c62b-7853-b808-1959d01cf2bd` | `local` | `local-85f1c5f54cf379f97bedca62e02af508` | `employees/02-canvas-frontend.md` | 在职 |
| 03 | 后端与数据 | `019ff676-c8d9-75c3-88c6-3f87f571af52` | `local` | `local-85f1c5f54cf379f97bedca62e02af508` | `employees/03-backend-data.md` | 在职 |
| 04 | AI·Workflow·Skill | `019ff676-cb99-7b33-ac5b-f7a562f34ec8` | `local` | `local-85f1c5f54cf379f97bedca62e02af508` | `employees/04-ai-workflow-skill.md` | 在职 |
| 05 | UI·UX 设计 | `019ff676-ce52-7a71-a15d-1b0c1c2558e0` | `local` | `local-85f1c5f54cf379f97bedca62e02af508` | `employees/05-ui-ux.md` | 在职 |
| 06 | 测试与质量验收 | `019ff676-d162-73a1-9d43-8eb0e7f0db36` | `local` | `local-85f1c5f54cf379f97bedca62e02af508` | `employees/06-quality.md` | 在职 |
| 07 | 发布·部署·运维 | `019ff676-d46e-7281-b7d0-5f0f8efab106` | `local` | `local-85f1c5f54cf379f97bedca62e02af508` | `employees/07-release-ops.md` | 在职 |

## 事实优先级

用户当前要求 → `AGENTS.md` → 当前代码和运行证据 → `decisions.md` → 其他仓库文档 → 岗位文件 → 对话历史。

## 文档导航

- `project-status.md`：当前项目状态。
- `decisions.md`：已确认决策。
- `task-board.md`：任务和文件所有权。
- `handoffs/`：执行任务交接。
- `employees/`：岗位记忆。
- `drills/`：团队演练记录。

## 公共员工协议

员工每次接单都重新读取当前代码和相关文档。返回内容固定包含任务 ID、结论、证据、风险、建议动作和状态；未验证内容必须明确标记。跨岗位问题返回总控，不自行扩大范围。
