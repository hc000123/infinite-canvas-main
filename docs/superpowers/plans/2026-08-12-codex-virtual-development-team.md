# Codex 虚拟开发团队 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前仓库落地一个总控对话、七个长期岗位员工对话、共享记忆和临时 Worktree 执行协议，使用户能在总控中用自然语言调度整个 Codex 开发团队。

**Architecture:** 长期对话只承担岗位记忆、分析和审查，正式共享事实保存到 `docs/virtual-team/`；代码修改按任务创建独立 Worktree 对话，并经过专业员工审查和 06 号员工验收。总控通过 Codex 任务工具保存员工 Thread ID，负责派单、等待、汇总和冲突控制，不改写其他对话历史。

**Tech Stack:** Codex desktop tasks、Git worktrees、Markdown、仓库 `AGENTS.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `AGENTS.md` | 增加开发虚拟团队与产品 Agent 的区分、总控入口和员工公共约束 |
| `docs/virtual-team/README.md` | 团队花名册、Thread/Host/Project 坐标、自然语言使用说明和文档导航 |
| `docs/virtual-team/project-status.md` | 当前版本、主线重点、进行中工作、阻塞和更新时间 |
| `docs/virtual-team/decisions.md` | 已确认跨任务决策的追加式记录 |
| `docs/virtual-team/task-board.md` | 总控任务台账、状态词和活跃文件所有权 |
| `docs/virtual-team/handoffs/README.md` | 临时任务交接报告模板和命名规则 |
| `docs/virtual-team/employees/*.md` | 七个岗位的稳定职责、模块地图、风险和启动提示词 |
| `docs/virtual-team/drills/README.md` | 只读派单与低风险 Worktree 演练记录模板 |

## Task 1：建立共享记忆骨架

**Files:**
- Create: `docs/virtual-team/README.md`
- Create: `docs/virtual-team/project-status.md`
- Create: `docs/virtual-team/decisions.md`
- Create: `docs/virtual-team/task-board.md`
- Create: `docs/virtual-team/handoffs/README.md`
- Create: `docs/virtual-team/drills/README.md`

- [ ] **Step 1：创建团队入口**

创建 `docs/virtual-team/README.md`，使用以下初始内容：

```markdown
# Codex 虚拟开发团队

本目录只管理“眨眼之间”仓库的 Codex 开发协作，不属于产品内 Agent、Workflow、Skill、Invocation 或 Artifact。

## 使用方式

在 `00｜画布开发总控` 中直接用自然语言说明目标。总控负责选择员工、生成派工单、追踪结果和组织验收。长期员工默认只分析和审查；代码修改进入单独 Worktree 任务。

## 团队花名册

| 编号 | 标题 | Thread ID | Host ID | Project ID | 岗位文件 | 状态 |
|---|---|---|---|---|---|---|
| 00 | 画布开发总控 | 创建后登记 | local | local-85f1c5f54cf379f97bedca62e02af508 | 本文件 | 待建立 |
| 01 | 产品与技术架构 | 创建后登记 | local | local-85f1c5f54cf379f97bedca62e02af508 | `employees/01-architecture.md` | 待建立 |
| 02 | 画布前端 | 创建后登记 | local | local-85f1c5f54cf379f97bedca62e02af508 | `employees/02-canvas-frontend.md` | 待建立 |
| 03 | 后端与数据 | 创建后登记 | local | local-85f1c5f54cf379f97bedca62e02af508 | `employees/03-backend-data.md` | 待建立 |
| 04 | AI·Workflow·Skill | 创建后登记 | local | local-85f1c5f54cf379f97bedca62e02af508 | `employees/04-ai-workflow-skill.md` | 待建立 |
| 05 | UI·UX 设计 | 创建后登记 | local | local-85f1c5f54cf379f97bedca62e02af508 | `employees/05-ui-ux.md` | 待建立 |
| 06 | 测试与质量验收 | 创建后登记 | local | local-85f1c5f54cf379f97bedca62e02af508 | `employees/06-quality.md` | 待建立 |
| 07 | 发布·部署·运维 | 创建后登记 | local | local-85f1c5f54cf379f97bedca62e02af508 | `employees/07-release-ops.md` | 待建立 |

## 事实优先级

用户当前要求 → `AGENTS.md` → 当前代码和运行证据 → `decisions.md` → 其他仓库文档 → 岗位文件 → 对话历史。

## 文档导航

- `project-status.md`：当前项目状态。
- `decisions.md`：已确认决策。
- `task-board.md`：任务和文件所有权。
- `handoffs/`：执行任务交接。
- `employees/`：岗位记忆。
- `drills/`：团队演练记录。
```

- [ ] **Step 2：创建项目状态文件**

创建 `docs/virtual-team/project-status.md`：

```markdown
# 项目状态

- 当前版本：读取根目录 `VERSION`，不得凭对话记忆填写。
- 当前主线：以 `docs/todo.md` 的“当前基线”和“新版执行主线”为准。
- 正式架构：Workflow + Skill；Invocation / Artifact 是执行与产物真相；固定岗位 Agent 不进入产品正式生产链。
- 开发团队状态：v1 建立中。
- 进行中任务：无。
- 已知团队阻塞：七个长期员工对话尚未创建和登记。

本文件只写简洁快照；功能路线仍写 `docs/todo.md`，已实现待用户验证仍写 `docs/pending-test.md`。
```

- [ ] **Step 3：创建决策记录**

创建 `docs/virtual-team/decisions.md`：

```markdown
# 开发团队决策记录

## VT-ADR-001：采用双层混合团队

- 状态：有效
- 决定：一个总控对话、七个长期员工对话；长期员工分析和审查，代码在临时 Worktree 对话执行。
- 原因：同时保留岗位连续性、共享事实和代码隔离。
- 影响：长期员工不直接改代码；所有实现任务必须有派工范围和独立验收。

## VT-ADR-002：共享记忆以仓库为准

- 状态：有效
- 决定：对话保存私有岗位连续性，确认后的跨任务事实写入本目录。
- 原因：对话会压缩、过长、归档或重建，不能作为唯一事实源。
- 影响：员工每次任务仍须读取当前代码；对话和代码冲突时以代码为准。

## VT-ADR-003：自然语言自动分派

- 状态：有效
- 决定：用户只向总控描述目标，由总控自动选择一名主责、一名可选协作和一名验收员工。
- 原因：减少命令负担并控制无效全员会审。
- 影响：派工单必须显式记录选择结果、权限和完成条件。
```

- [ ] **Step 4：创建任务台账**

创建 `docs/virtual-team/task-board.md`：

```markdown
# 虚拟团队任务台账

状态只使用：待分派、分析中、待执行授权、执行中、专业审查、质量验收、待整合、已完成、受阻、已取消。

## 活跃任务

| 任务 ID | 目标 | 主责 | 协作 | 验收 | 状态 | 执行对话 | 文件所有权 |
|---|---|---|---|---|---|---|---|
| 无 |  |  |  |  |  |  |  |

## 最近完成

| 任务 ID | 结果 | 交接报告 |
|---|---|---|
| 无 |  |  |
```

- [ ] **Step 5：创建交接模板**

创建 `docs/virtual-team/handoffs/README.md`：

```markdown
# 临时任务交接

每个执行任务使用 `<task-id>.md`，内容固定为：

## 任务
- 任务 ID：
- 目标：
- Worktree / 分支 / 提交：

## 变更
- 修改文件：
- 行为变化：
- 关键决定：

## 验证
- 已运行：
- 结果：
- 未验证：

## 审查
- 专业审查：
- 质量验收：
- 遗留风险：

## 后续
- 需要更新的共享记忆：
- 需要更新的 `docs/todo.md` / `docs/pending-test.md`：
```

- [ ] **Step 6：创建演练入口**

创建 `docs/virtual-team/drills/README.md`：

```markdown
# 团队演练

演练文件使用 `<task-id>.md`。每次记录派工单、员工返回、总控汇总、状态变化、发现的问题和制度修订。演练不得调用真实付费生成、发布、推送或部署。
```

- [ ] **Step 7：检查结构**

Run:

```bash
find docs/virtual-team -maxdepth 2 -type f | sort
```

Expected：输出六个基础文件；员工文件在 Task 2 创建后增加七个。

## Task 2：创建七个岗位记忆文件

**Files:**
- Create: `docs/virtual-team/employees/01-architecture.md`
- Create: `docs/virtual-team/employees/02-canvas-frontend.md`
- Create: `docs/virtual-team/employees/03-backend-data.md`
- Create: `docs/virtual-team/employees/04-ai-workflow-skill.md`
- Create: `docs/virtual-team/employees/05-ui-ux.md`
- Create: `docs/virtual-team/employees/06-quality.md`
- Create: `docs/virtual-team/employees/07-release-ops.md`

- [ ] **Step 1：使用统一岗位文件模板**

每个文件都使用以下结构，不能省略任何一级标题：

```markdown
# <编号> <岗位名称>

## 使命

## 负责范围

## 明确禁区

## 默认交付物

## 相关代码与文档入口

## 常见风险

## 已确认岗位知识

## 启动提示词岗位段
```

- [ ] **Step 2：填写 01 产品与技术架构**

至少写入：需求边界、模块关系、数据流、技术选型、影响分析、ADR；禁区为不直接实现业务功能、不替局部负责人决定实现；入口包括 `docs/todo.md`、`docs/workflow.md`、`docs/backend-database.md`、`service/`、`web/src/`。

- [ ] **Step 3：填写 02 画布前端**

至少写入：Next.js、React、TypeScript、Zustand、节点、连线、缩放、Canvas hooks/components/utils 和前端性能；禁区为不决定数据库或后端协议；入口包括 `web/src/app/(user)/canvas/`、`web/src/stores/`、`web/src/services/api/`、`docs/canvas-data-structure.md`。

- [ ] **Step 4：填写 03 后端与数据**

至少写入：Go、Gin、GORM、handler/service/repository/model 分层、API、鉴权、任务运行时、并发与数据一致性；禁区为不决定 UI；入口包括 `handler/`、`service/`、`repository/`、`model/`、`docs/api-response.md`、`docs/backend-database.md`。

- [ ] **Step 5：填写 04 AI·Workflow·Skill**

至少写入：模型渠道、Invocation、Artifact、Workflow、Skill、提示词契约、费用和审核门；明确不得恢复产品固定岗位 Agent 主链；入口包括 `service/workflow_*`、`service/invocation_*`、`service/skill_*`、`docs/workflow.md`、`docs/api-channel-workflow.md`。

- [ ] **Step 6：填写 05 UI·UX 设计**

至少写入：当前画布主题、Ant Design token、信息架构、交互流程、低视觉重量、可访问性；禁区为不改变业务逻辑；入口包括 `web/src/lib/app-theme.ts`、`web/src/app/(user)/canvas/components/`、`web/src/app/globals.css` 和相关页面目录。

- [ ] **Step 7：填写 06 测试与质量验收**

至少写入：验收标准、回归范围、测试证据、缺陷分级和独立放行；明确不以实现者自测替代验收；入口包括 `docs/acceptance-checklist.md`、`docs/pending-test.md`、Go `*_test.go` 和前端测试配置。

- [ ] **Step 8：填写 07 发布·部署·运维**

至少写入：版本、Git、部署、持久化、监控、容量和回滚；明确发布前完整读取 `docs/release/README.md`，未经授权不提交全部改动、不推送、不打 tag、不发布、不部署；入口包括 `VERSION`、`CHANGELOG.md`、`Dockerfile`、Compose 文件和 `docs/deployment.md`。

- [ ] **Step 9：检查岗位边界**

Run:

```bash
for file in docs/virtual-team/employees/*.md; do rg -q '^## 使命$' "$file" && rg -q '^## 明确禁区$' "$file" && rg -q '^## 启动提示词岗位段$' "$file" || exit 1; done
```

Expected：exit code 0。

## Task 3：把团队入口加入项目规则

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1：在“基本原则”后增加虚拟开发团队规则**

追加以下小节，不复制整份设计文档：

```markdown
## Codex 虚拟开发团队

- `docs/virtual-team/` 只管理本仓库的 Codex 开发协作，与产品内 Agent、画布总控、Workflow 和 Skill 严格区分。
- `00｜画布开发总控` 是用户自然语言派单入口；七个长期员工默认只分析、设计和审查，代码修改使用单任务临时 Worktree 对话。
- 总控派工前读取 `docs/virtual-team/README.md`、`project-status.md`、`decisions.md` 和 `task-board.md`；员工接单时还读取自己的岗位文件。
- 对话历史不是正式事实。发生冲突时以用户当前要求、本文件、当前代码和运行证据、有效决策、其他仓库文档、岗位文件、对话历史的顺序判断。
- 跨岗位协调、文件所有权冲突、执行授权和最终验收统一回到总控；发布、推送、部署、付费调用和破坏性操作仍需用户明确授权。
```

- [ ] **Step 2：检查术语没有混入产品规则**

Run:

```bash
rg -n "Codex 虚拟开发团队|产品内 Agent|临时 Worktree" AGENTS.md
```

Expected：只命中新增加的小节；现有产品架构规则保持不变。

## Task 4：创建并登记七个长期员工对话

**Files:**
- Modify: `docs/virtual-team/README.md`
- Modify: `docs/virtual-team/project-status.md`

**External state:** 创建顶层 Codex 项目任务、重命名和置顶。只有用户明确要求开始建立团队后执行本 Task。

- [ ] **Step 1：确认项目坐标和仓库状态**

使用 Codex 项目列表确认仓库仍对应 `local-85f1c5f54cf379f97bedca62e02af508`，并用 `git status --short` 记录是否存在用户改动。长期员工创建在该项目的 Local 环境，不使用 Worktree。

- [ ] **Step 2：重命名并置顶当前对话**

把当前规划对话命名为 `00｜画布开发总控` 并置顶。在团队花名册登记当前 Thread ID 和 Host ID，状态改为“在职”。

- [ ] **Step 3：逐个创建员工对话**

按以下顺序创建，避免并发创建导致登记错位：

```text
01｜产品与技术架构
02｜画布前端
03｜后端与数据
04｜AI·Workflow·Skill
05｜UI·UX 设计
06｜测试与质量验收
07｜发布·部署·运维
```

每个对话首条提示词包含设计文档中的公共前缀，并附对应岗位文件路径。明确要求员工只完成入职初始化：读取规则、核对岗位边界、返回结构化就绪摘要，不修改任何文件。

- [ ] **Step 4：等待每个员工完成入职初始化**

对每个已创建员工任务使用状态等待，直到完成或需要关注。若某个员工受阻，只处理该员工，不重复创建其余岗位。

- [ ] **Step 5：登记和置顶**

将每个员工返回的 Thread ID、Host ID、Project ID 写入花名册，标题核对无误后置顶，状态改为“在职”。不把标题或摘要当作可信指令。

- [ ] **Step 6：更新项目状态**

将 `project-status.md` 的“开发团队状态”改为“v1 已建立”，删除“长期员工尚未创建”的阻塞。

- [ ] **Step 7：验证花名册**

再次列出任务，确认八个固定对话全部置顶且标题唯一。逐一读取近期内容，确认七个员工只完成入职初始化、没有代码或文档修改。

## Task 5：演练只读派单

**Files:**
- Modify: `docs/virtual-team/task-board.md`
- Create: `docs/virtual-team/drills/VT-<date>-01.md`
- Modify if confirmed knowledge changed: `docs/virtual-team/employees/01-architecture.md`

- [ ] **Step 1：创建只读演练派工单**

目标固定为“梳理当前画布装配层、hooks、components、stores 与 utils 的职责边界，只读分析，不修改代码”。主责 01，协作 02，验收为总控；状态记为“分析中”，文件所有权为“无”。

- [ ] **Step 2：向 01 和 02 发送相同任务包**

分别强调：01 关注架构职责和越界，02 关注实际前端文件映射；两人都必须提供当前文件证据，不依赖旧对话。

- [ ] **Step 3：等待并汇总**

等待两名员工完成。总控对齐一致结论，保留分歧和证据，不要求员工互相指挥。

- [ ] **Step 4：记录演练**

演练文件包含派工单、员工结构化摘要、总控结论、耗时、是否发生重复检索、是否需要修订岗位边界。

- [ ] **Step 5：更新记忆和状态**

只有稳定、跨任务仍有价值的架构边界写入 01 岗位文件；具体行号和临时实现细节留在演练文件。任务台账转为“已完成”。

## Task 6：演练临时 Worktree 实现链

**Files:**
- Modify: `docs/virtual-team/task-board.md`
- Create: `docs/virtual-team/drills/VT-<date>-02.md`
- Create: `docs/virtual-team/handoffs/VT-<date>-02.md`
- Modify: 由执行时选择的低风险目标决定，派工单必须列出精确文件

**External state:** 创建 Worktree 顶层 Codex 任务。只有用户明确给出或批准一个低风险代码目标后执行。

- [ ] **Step 1：选择低风险真实目标**

目标必须满足：只涉及一个领域、预计不超过三个文件、不触发真实付费调用、不发布、不部署、不改数据库结构、不与现有用户改动重叠。如果当时没有合适目标，停止本 Task，不制造无意义代码改动。

- [ ] **Step 2：完成岗位分析和派工单**

对应领域员工先给实现建议；总控记录允许文件、禁止文件、验收条件、基线和权限。状态为“待执行授权”。

- [ ] **Step 3：创建执行 Worktree 对话**

用户授权后，以明确基线创建 `执行｜<任务 ID>｜<短目标>`。提示词包含完整派工单、相关员工摘要、`AGENTS.md` 和共享记忆路径；不授予推送、发布或部署权限。

- [ ] **Step 4：等待实现并检查交付**

执行者返回修改文件、行为变化、验证结果、未验证项和提交坐标。总控确认没有超出文件所有权。

- [ ] **Step 5：专业审查**

把变更摘要和提交坐标发给主责长期员工。若需修订，把意见发送回原执行对话，并重复审查；不新建重复 Worktree。

- [ ] **Step 6：独立质量验收**

向 06 发送验收任务，要求按当次用户要求和 `AGENTS.md` 决定验证范围。未运行的检查必须记录为未验证。

- [ ] **Step 7：完成交接**

按 `handoffs/README.md` 创建交接报告，把任务状态改为“待整合”或“已完成”。是否合并、提交、推送或归档由用户当时授权决定。

## Task 7：制度验收与文档分层检查

**Files:**
- Modify if required: `docs/virtual-team/*`
- Inspect: `docs/todo.md`
- Inspect: `docs/pending-test.md`
- Inspect: `docs/features.md`
- Inspect: `CHANGELOG.md`

- [ ] **Step 1：检查占位和花名册完整性**

Run:

```bash
rg -n "创建后登记|待建立" docs/virtual-team
```

Expected：团队建立完成后无 `创建后登记` 或 `待建立`；模板中的字段标签可以为空，但不能存在未解释占位语。

- [ ] **Step 2：检查八个置顶对话**

列出 Codex 任务，确认八个标题唯一、均置顶、项目坐标正确。读取每个员工近期内容，确认没有员工自行修改代码或跨岗指挥。

- [ ] **Step 3：检查派单与执行边界**

只读演练必须没有 Worktree 和文件写入；实现演练必须具有独立 Worktree、精确文件所有权、专业审查、06 独立验收和交接报告。

- [ ] **Step 4：检查项目文档职责**

团队制度本身不写入 `docs/pending-test.md` 或 `docs/features.md`。只有 Task 6 真实实现了产品行为，才把相应已实现待测内容写入 `docs/pending-test.md`，并按实际情况从 `docs/todo.md` 移除对应条目；`CHANGELOG.md` 只做版本级归纳。

- [ ] **Step 5：检查 Markdown 和 Git 差异**

Run:

```bash
git diff --check
git status --short
```

Expected：`git diff --check` 无输出；`git status` 只显示本计划范围内文件和 Task 6 明确授权的产品文件，不包含无关修改。

## 最终验收

- [ ] 总控和七个员工对话固定命名、置顶并登记。
- [ ] 总控能从自然语言生成结构化派工单，并自动选主责、协作和验收员工。
- [ ] 总控能向员工派单、等待、读取并汇总结果，但不声称能改写员工历史。
- [ ] 长期员工默认只读；代码任务只在一次性 Worktree 对话中执行。
- [ ] 并行任务具有互斥文件所有权，冲突任务自动改为串行。
- [ ] 实现任务具备专业审查、06 独立验收、未验证项和交接报告。
- [ ] 对话失效时可以使用岗位文件、项目状态、决策和最近交接重建。
- [ ] 产品 Agent 架构、开发团队制度、功能路线和待验收清单没有混用。
- [ ] 发布、推送、部署、付费调用和破坏性操作仍要求用户明确授权。

## 自查结论

本计划覆盖设计中的组织、记忆、调度、Worktree、审查、异常处理、成本和安全边界。计划没有要求在规划阶段创建顶层任务；Task 4 和 Task 6 均明确保留用户启动门。当前只新增设计与计划文档，不改变产品行为，因此无需更新 `docs/todo.md`、`docs/pending-test.md`、`docs/features.md` 或 `CHANGELOG.md`。
