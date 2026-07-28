# 管理员系统 Agent 与项目 Skill 选择设计

## 背景

项目分集页当前固定读取 `agent-system-script` 的推荐发布版本，但数据库只有启动种子生成的 `v1.0.0`。项目 Agent 中心将系统 Agent 设为只读，管理后台又没有 Agent 管理入口，因此系统 Agent 无法由管理员迭代，前台只能一直显示最原始版本。

本次调整明确职责边界：系统 Agent 由管理员维护，制作人员不修改 Agent；制作人员只在项目分集页选择 Agent 已授权的 Skill 精确版本。

## 目标

1. 管理员可以在管理后台维护系统 Agent 的版本并设置推荐发布版。
2. 项目 Agent 中心提供明确的“返回项目”入口，系统 Agent 继续只读。
3. 项目分集页固定使用“系统剧本制作 Agent”，但允许制作人员选择兼容的剧本 Skill 版本。
4. Agent 与 Skill 的选择都在运行前冻结，已启动任务不随后台推荐版本变化。

## 非目标

- 不允许制作人员在分集页编辑、复制或覆盖系统 Agent。
- 不改变画布对话中的自由 Agent 编排能力。
- 不新增项目级默认 Skill、团队同步偏好或旧数据迁移。
- 不改变现有 Artifact、人工审核和 Invocation 执行链。

## 管理后台的系统 Agent 管理

管理后台新增 `/admin/agents`，并在后台导航中增加“Agent 中心”。页面只管理 `ownerType=system` 的 Agent。

管理员可以：

- 查看系统 Agent 及其全部版本；
- 基于任一发布版本创建新草稿；
- 编辑岗位职责、Skill 调度链、Skill 访问范围、模型策略、工具策略和执行策略；
- 校验草稿、发布版本、把已发布版本设为推荐版。

已发布版本保持不可变。管理员必须先创建草稿再修改。项目制作端只读取推荐发布版，不读取草稿。

后端新增管理员专用 Agent API，并使用现有管理员权限中间件。普通项目 Agent API 继续拒绝修改系统 Agent。管理员发布的新版本使用独立版本 ID；服务重启时的种子逻辑只补齐缺失的初始版本，不覆盖管理员设置的非种子推荐版本。

## 项目 Agent 中心

项目 Agent 中心页头增加带左箭头的“返回项目”按钮，目标为 `/projects/{projectId}`。系统 Agent 保持只读，项目 Agent 的现有编辑能力不变。

## 分集页 Skill 选择

“系统剧本制作 Agent”标签保留，用来说明固定的调度主体。标签旁增加紧凑的 Skill 版本选择器。

候选项必须同时满足：

- Skill 版本状态为已发布；
- 对当前用户和项目可见；
- 接受 `source_text`，产出 `production_script`；
- Skill ID、Owner Type、Capability 和所需工具满足系统 Agent 推荐版的访问策略；
- 与系统 Agent 剧本步骤的输入、输出绑定兼容。

默认选择系统 Agent 推荐版中剧本步骤当前引用的 Skill Version。制作人员的选择只作为本次 Agent Plan 的 `skillOverrides`，不修改 Agent 定义和推荐版。

每个已有分集使用 `localforage` 记住最近一次选择；新建分集使用当前导入表单的临时选择。若已保存版本被停用、退役或不再授权，页面回退到 Agent 默认 Skill，并提示制作人员重新确认。

## 运行数据流

1. 分集页读取系统剧本 Agent 的推荐发布版及可用 Skill 版本。
2. 页面解析 Agent 默认剧本步骤，并筛选其允许的兼容 Skill。
3. 制作人员选择 Skill 版本并运行剧本优化。
4. 前端创建 `source_text` Artifact。
5. 前端创建 Agent Plan，同时提交完整的 `AgentSkillRef` override。
6. Preflight 校验权限、契约与内容哈希，冻结 Agent Version 和 Skill Version。
7. Invocation 产出 `production_script`，继续沿用现有人工审核流程。

## 错误处理

- 系统 Agent 没有推荐发布版：禁用运行并提示管理员先发布和推荐版本。
- 没有兼容 Skill：禁用运行并提示管理员检查 Agent 的 Skill 权限或 Skill 契约。
- 已保存 Skill 不再可用：自动回退 Agent 默认 Skill并显示提示。
- Runtime override 校验失败：保留用户选择，展示后端返回的明确错误，不静默改用其他 Skill。

## 测试

- 后端服务测试覆盖：普通用户不能编辑系统 Agent；管理员可以创建草稿、校验、发布和推荐；种子重跑不会覆盖管理员推荐版。
- 前端单元测试覆盖：系统 Agent 与兼容 Skill 筛选、默认选择、失效回退、Agent Plan `skillOverrides` 请求。
- 页面接线测试覆盖：Agent 中心返回按钮、分集页固定 Agent 标签与 Skill 选择器、后台 Agent 导航和管理页面。
- 针对性回归验证现有剧本人工审核链、项目 Agent 编辑链和后台 Skill 中心不受影响。

## 验收标准

- 管理员能在后台发布系统剧本 Agent 新版本并设为推荐版，刷新项目页后使用新推荐版。
- 制作人员无法编辑系统 Agent，但能在分集页选择该 Agent 授权的不同剧本 Skill 版本。
- 创建的 Agent Plan 中包含所选 Skill 的精确版本，执行记录可追溯。
- 页面刷新后已有分集保留上次 Skill 选择；选择失效时安全回退。
- Agent 中心可一键返回当前项目。
