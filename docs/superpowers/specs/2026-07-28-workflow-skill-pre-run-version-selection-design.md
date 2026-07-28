# Workflow Skill 运行前版本选择设计

## 1. 背景

当前项目已具备通用 Skill Registry、不可变 Skill Version、Workflow 节点绑定、运行预览和 Invocation 快照能力。但标准 Workflow 的多数节点仍固定到某个精确 Skill Version。当某个 Skill 新增版本时，如果直接修改 Workflow 或全局绑定，容易让不相关项目和任务被动切换。

本设计将 Skill 更新定义为“为同一 Skill 增加一个可选版本”。用户只在 Workflow 运行前选择本次使用的版本；运行开始后冻结版本与内容快照，不再随后续发布变化。

## 2. 目标

- 同一 Skill 可以持续发布多个不可变版本。
- Workflow 节点可在运行前展示该 Skill 的已发布兼容版本。
- 用户只改变当前节点的 Skill Version 选择，不修改 Workflow 定义、其他 Skill 或全局绑定。
- Workflow 启动后冻结每个节点的 Skill Version ID、内容哈希和快照。
- 重试、恢复和刷新页面不改变已冻结的 Skill 版本。
- 不兼容版本不得进入可执行选择列表。

## 3. 非目标

- 不在运行中动态替换 Skill。
- 不让 Skill 发布自动改写 Workflow Version。
- 不让推荐版本自动覆盖用户本次已确认的选择。
- 不为变更单个 Skill 重新发布整个 Workflow。
- 不在本阶段引入 Skill 自动升级、自动回滚或运行中热更新。

## 4. 核心边界

### 4.1 Skill Definition 表示稳定能力

Skill Definition 的 ID 在能力语义不变时保持稳定。例如“剧本优化”仍然使用 `skill-system-workflow-script`，新规则作为该 Definition 下的新 Skill Version 发布。

只有当能力目标、输入产物类型或输出产物类型已经改变时，才创建新 Skill Definition。

### 4.2 Skill Version 发布后不可变

已发布版本的 Manifest、文件、输入契约、输出 Schema、质量门和内容哈希不可直接编辑。修改 Skill 时必须从现有版本创建新草稿，校验后发布为新版本。

### 4.3 Workflow 绑定 Skill，运行前选择 Version

需要用户选择版本的 Workflow Skill 节点使用 `manual_before_run` 绑定模式。Workflow Version 保存下列稳定边界：

- Skill Definition ID 或 capability。
- 允许的候选 Skill Definition 范围。
- 预期输出 Artifact 类型。
- 节点的输入绑定和下游依赖。

Workflow Version 不保存用户本次手动选择的精确 Skill Version ID。

## 5. 运行前选择流程

1. 用户打开 Workflow 运行面板。
2. 前端请求 Workflow 预览和每个 `manual_before_run` 节点的兼容版本。
3. 服务端只返回当前用户可见、已发布、已启用且契约兼容的版本。
4. 选择器默认使用以下优先级：
   1. 当前页面已选择值。
   2. Skill Definition 的推荐版本。
5. 用户选择版本后，前端通过 `manualSelections[nodeKey] = skillVersionId` 提交预览。
6. 服务端返回最终路由、内容哈希、预计成本、确认要求和阻断原因。
7. 只有所有必需节点都已解析且可执行时，“开始运行”才可用。

## 6. 启动与冻结

用户点击“开始运行”时，服务端必须重做一次预检，不直接信任前端预览结果。预检通过后创建 Workflow Execution Revision，并为每个 Skill 节点冻结：

- `nodeKey`
- `skillId`
- `skillVersionId`
- `skillVersion`
- `skillContentHash`
- 规范化 Skill 快照
- 输入、输出和质量门契约
- 输入 Artifact 引用及内容哈希

创建 Revision 后，运行不再解析 Skill Definition 的当前推荐版本。节点重试、Workflow 恢复和页面刷新都继续使用该 Revision 中冻结的版本和快照。

如果用户需要使用新 Skill 版本，必须回到运行前配置，创建新 Workflow Execution Revision 或新 Workflow Run。

## 7. 契约兼容性

同一 Workflow 节点的可选 Skill Version 必须同时满足：

- Manifest 包含节点要求的 capability。
- 每个必需输入 Artifact 都存在对应绑定。
- 输入 Schema 版本范围可以接受上游产物。
- 输出 Artifact 类型等于节点的 `expectedOutputArtifactType`。
- 输出 Schema 可以满足下游节点的输入约束。
- Skill 的执行器、必需工具、图片策略和副作用得到当前环境允许。

普通内容更新可以发布为同一 Skill Definition 的新版本，但不得删除下游必需字段、改变 Artifact 类型或放宽代码级安全限制。

如果输入输出契约发生破坏性变更，必须使用新 Schema 主版本；在下游节点明确支持前，该 Skill Version 不得出现在原 Workflow 节点的可执行列表中。

## 8. 编辑、发布与归档

### 8.1 编辑

管理员从已发布版本创建草稿，修改 Skill 文件、契约和质量门。草稿不出现在 Workflow 运行前选择器中。

### 8.2 发布

发布前完成包规范化、Schema 校验、Artifact 契约校验、质量门校验和必要评测。发布成功后，新版本成为可选项，但不更改任何 Workflow Version 或历史 Run。

### 8.3 推荐

将新版本设为推荐版本只改变新打开的运行前面板的默认选中值。当前页面已确认的选择和已启动任务不变。

### 8.4 归档

归档版本不再提供给新任务选择，但不删除版本数据和历史快照。已启动任务可以继续执行和重试。

## 9. 前端交互

Workflow 运行面板按节点展示 Skill 选择器，每个选项至少显示：

- Skill 名称。
- 语义版本号。
- 简短摘要。
- 是否为推荐版本。
- 内容哈希的简短标识。

不兼容或不可执行版本默认不进入可选列表。如果需要运维诊断，可在管理视图显示被排除版本及具体原因。

节点选择发生变化后立即重新请求预览；如果新版本导致下游不兼容、成本确认缺失或输入不足，页面就地显示阻断原因，不创建 Workflow Run。

## 10. 错误处理

- 选中版本在启动前被归档：启动预检失败，要求重新选择。
- 选中版本内容哈希不一致：视为版本损坏，阻断执行。
- 选中版本与上下游契约不兼容：预览和启动均阻断，返回具体节点、Artifact 类型和 Schema 原因。
- 启动后发布新版本：当前 Run 继续使用快照，无需报错。
- 已冻结版本后来被归档：当前 Run 仍可恢复和重试。

## 11. 当前剧本 Skill 接入规则

`workflow-skills/script/01-seedance2-dynamic-script/SKILL.md` 作为“剧本整理” Skill Definition 的新版本内容接入，不创建新 Workflow 阶段，也不覆盖已发布的 `3.1.0`。

接入后至少保留：

- Skill Definition：`skill-system-workflow-script`。
- capability：`workflow.stage.script`。
- 输入 Artifact：`source_text`。
- 输出 Artifact：`production_script`。
- 输出 payload：非空 `productionScript`。
- 副作用：`none`。

新版本号使用 `3.2.0`，与当前 Skill Definition 已发布的 `3.1.0` 形成明确升级关系。接入后两个版本都保持可选，是否将 `3.2.0` 标记为推荐版本由发布操作单独决定。

## 12. 验收标准

1. 同一 Skill Definition 同时存在两个已发布版本时，运行前选择器可同时显示它们。
2. 选择剧本 Skill `3.2.0` 不会改变其他节点已选择的 Skill Version ID。
3. 发布 `3.3.0` 不会改变已打开且已确认的本次选择，除非用户主动改选。
4. 启动后的 Workflow Execution Revision 记录每个节点的 Skill Version ID、内容哈希和快照。
5. 运行中将 Skill 推荐版本从 `3.2.0` 切换到 `3.3.0`，已启动任务和重试仍使用 `3.2.0`。
6. 输出 Artifact 类型错误、Schema 不兼容、未发布或已归档的版本不能启动。
7. 归档旧版本后，新任务不再显示该版本，历史运行仍可审计和重试。
8. 本功能不修改其他 Skill 内容、版本、推荐状态或 Workflow 节点契约。

## 13. 实施边界

实施时优先复用现有能力：

- `WorkflowSkillBindingManualBeforeRun`。
- `WorkflowPreviewInput.ManualSelections`。
- Workflow 路由预览和阻断原因。
- Invocation Revision 的 Skill Version ID、内容哈希与 Skill 快照。
- 现有 Skill 发布、评测、归档和审计机制。

新增范围限制为：

- 将指定 Workflow 节点改为运行前版本选择。
- 提供按节点查询兼容 Skill Version 的数据。
- 在 Workflow 运行面板展示选择器并把 `manualSelections` 传给预览和启动。
- 在启动边界对选择做最终复核并冻结。
- 将动态剧本 Skill 作为 `skill-system-workflow-script@3.2.0` 发布。

不为本功能新增第二套 Skill Registry、第二套 Workflow 预览协议或前端本地 Skill 版本库。
