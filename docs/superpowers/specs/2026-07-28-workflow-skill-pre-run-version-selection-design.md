# Workflow Skill 运行前版本选择与组合适配设计

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
- 不同 Skill 通过稳定 Artifact 契约组合，不通过互相改写业务指令适配。
- 上下游结构不一致时由独立、确定性 Adapter 转换，保留 Skill 的完整原生产物。
- 系统 Skill 和项目 Skill 使用同一 Registry，按 Owner 和项目边界隔离管理权限与可见范围。
- Workflow 和画布 Agent 只消费已发布 Skill，不在各自界面维护独立 Skill 副本。

## 3. 非目标

- 不在运行中动态替换 Skill。
- 不让 Skill 发布自动改写 Workflow Version。
- 不让推荐版本自动覆盖用户本次已确认的选择。
- 不为变更单个 Skill 重新发布整个 Workflow。
- 不在本阶段引入 Skill 自动升级、自动回滚或运行中热更新。
- 不为了满足某个下游 Skill，删减上游 Skill 的专业步骤、输出信息或质量标准。
- 不使用 Adapter 重写、摘要、推断或创作业务内容。
- 不允许 Workflow 编辑器、运行面板或画布 Agent 直接编辑已发布 Skill 内容。
- 不物理删除已发布、已引用或已产生历史运行快照的 Skill 和 Skill Version。

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

### 4.4 Skill 保持原生能力

Skill 只由自身的专业目标、输入契约和输出契约约束。下游 Skill 不得通过 Workflow 把自己的提示词格式、字段排列或专业规则反向注入上游 Skill。

每次 Skill 调用必须先产出一份完整原生 Artifact，并保留：

- Skill Version ID 和内容哈希。
- 原生 payload 和 Artifact Schema 版本。
- 输入 Artifact 父引用。
- Skill 自身质量门结果。
- 产生该 Artifact 的 Invocation 与 Attempt。

标准 Artifact Schema 不应是所有下游需求的“最小公共字段”，而应承载该业务产物可长期复用的完整语义。下游只需其中一部分时，由 Adapter 生成派生 Artifact，不覆盖或裁剪原 Artifact。

### 4.5 Workflow Adapter

当上游 Artifact 已直接满足下游 Skill 的输入契约时，Workflow 直接连接，不增加 Adapter。只有上游 Artifact 结构与下游输入绑定不匹配时，才在两个 Skill 节点之间插入独立 Adapter 节点。Adapter 是已注册、可版本化、确定性的数据转换，不是另一个创作 Agent。

Adapter 可以执行：

- 按明确 JSON Path 选取和重命名字段。
- 按明确规则拆分列表为多个 Artifact。
- 合并多个 Artifact，同时保留每个父 Artifact 引用。
- 映射稳定 ID、枚举值和引用关系。
- 对空白、顺序、数组包装等非语义结构做规范化。

Adapter 禁止执行：

- 调用语言模型或图像模型。
- 改写、缩写、摘要或美化业务内容。
- 推断原 Artifact 中没有的事实。
- 为下游需求删除或覆盖原 Artifact。
- 绕过上游 Skill 的专业质量门。

Adapter 输出是新的派生 Artifact。它必须记录 Adapter ID、Adapter Version、内容哈希、所有父 Artifact 引用和转换规则快照。Workflow Execution Revision 与 Skill Version 一样冻结 Adapter Version，保证恢复和重试可复现。

Workflow 中的 Adapter 节点使用独立 `executorType: "adapter"`，并至少声明：

```json
{
  "nodeKey": "script_for_storyboard",
  "executorType": "adapter",
  "adapterRef": {
    "adapterId": "production-script-to-storyboard-input",
    "adapterVersion": "1.0.0"
  },
  "inputBindings": [
    {
      "bindingName": "script",
      "artifactType": "production_script",
      "source": "node_output",
      "fromNodeKey": "script",
      "fromOutputBinding": "production_script",
      "required": true
    }
  ],
  "outputArtifactType": "storyboard_input"
}
```

Adapter Registry 中的每个版本必须声明可接受的 Artifact 类型与 Schema 范围、输出 Artifact 类型与 Schema 版本、确定性转换函数和规则内容哈希。Workflow 发布时解析精确 Adapter Version，运行时不使用“最新版”漂移。

典型组合为：

```text
剧本 Skill → production_script 原生 Artifact
             ├─→ 资产提取 Adapter → asset_extraction_input → 资产 Skill
             ├─→ 分镜输入 Adapter → storyboard_input → 分镜 Skill
             └─→ 分类输入 Adapter → classification_input → 分类 Skill
```

三个下游分支都复用同一份完整剧本 Artifact，不要求剧本 Skill 为任何一个分支特制或削弱输出。

### 4.6 三层契约

不同 Skill 的组合使用三层契约，避免下游要求渗透进上游业务规则：

1. **Skill 原生契约**：定义 Skill 要做什么、完整产物是什么、专业质量门是什么。
2. **Workflow 连接契约**：定义节点之间传递的 Artifact 类型、Schema 范围、数量和是否必需。
3. **Adapter 映射契约**：定义从哪些父 Artifact 读取哪些路径，如何生成派生 Artifact，以及如何验证没有丢失必需信息。

Skill 专业质量门先于 Adapter 执行；Adapter 完成后再执行 Schema、父引用、映射覆盖率和信息丢失检查。两类质量门独立记录，不互相替代。

下游 Skill 需要额外背景时，应通过新增必需或可选 Artifact 输入绑定传递，而不是让上游 Skill 把下游专用背景写进自己的原生产物。

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

### 8.5 统一管理入口

Skill 内容的新增、编辑、评测、发布、推荐、归档和停用都通过统一 Skill Registry 服务完成。不同界面只是同一 Registry 的不同权限视图：

- `/admin/skills`：系统 Skill 管理与全局审计入口。
- `/projects/:id/skills`：当前项目的项目 Skill 管理入口。
- Workflow 编辑器：只管理节点允许使用哪些 Skill 或 capability，不编辑 Skill 正文。
- Workflow 运行面板：只在运行前选择已发布兼容版本。
- 画布 Agent：只搜索和调用当前用户可见的已发布版本。

系统内置 Skill 的仓库文件只作为受版本控制的种子源和恢复源。它们被幂等导入后，Workflow、画布 Agent 和 API 运行时统一从数据库 Registry 解析精确已发布版本，不直接读取仓库中的 `SKILL.md`。

### 8.6 Owner 与权限

Skill Definition 保留两种 Owner：

1. **System Skill**
   - 只有管理员可以创建、编辑草稿、评测、发布、推荐、归档和停用。
   - 对所有有权限的项目可见，但项目用户只读。
   - 可作为 Workflow 和画布 Agent 的通用能力。
2. **Project Skill**
   - 项目负责人和管理员可以在指定项目内创建和维护。
   - 只在 Owner Project 中可见、可选和可调用。
   - 不能设为全局推荐版本或绑定到其他项目。
   - 如果项目需要修改 System Skill，应使用“复制为项目 Skill”创建新 Definition 和草稿，不直接修改系统版本。

所有写操作都必须在 service 层校验 Owner、项目权限和版本状态，不依赖前端隐藏按钮实现授权。管理员的全局审计视图可以查看 System Skill 和 Project Skill，但常规项目用户不能查看其他项目的 Skill 或草稿。

### 8.7 减少与删除规则

- **归档 Skill Version**：从新运行的选择列表移除，保留历史快照、Artifact 和重试能力。
- **停用 Skill Definition**：阻止所有新调用，但不修改已启动运行和历史数据。
- **删除 Skill Version 草稿**：只允许删除从未发布且没有评测、绑定或引用的草稿。
- **删除 Skill Definition**：只允许删除从未发布、不存在非草稿版本、没有 Workflow / Agent / Invocation 引用的非种子 Definition。
- **移出 Workflow**：只修改 Workflow 节点的候选范围或删除对应节点，不删除 Registry 中的 Skill。

归档、停用、删除草稿、复制为项目 Skill 和删除未发布 Definition 都写入 Skill Audit Log。

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
- Workflow 引用的 Adapter Version 未注册或哈希不一致：阻断预览与启动。
- Adapter 输出不符合目标 Schema：保留原 Artifact，将 Adapter 节点标记为失败，不启动下游 Skill。
- Adapter 缺失必需父引用或映射覆盖不完整：在 Workflow 发布或运行预览阶段阻断。

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
9. 上游 Skill 产物在 Adapter 执行后仍作为独立原生 Artifact 保留，派生 Artifact 不覆盖原 payload。
10. Adapter 不调用模型；相同 Adapter Version 对相同输入必须产生相同内容哈希。
11. Adapter 派生 Artifact 记录全部父 Artifact 引用、Adapter Version 和转换规则快照。
12. 更换下游 Skill 时，只允许调整该节点的版本选择、连接契约或 Adapter，不修改上游 Skill 的原生指令和质量门。
13. 管理员可在 `/admin/skills` 管理 System Skill 并审计全部 Skill，项目负责人只能在所属项目管理 Project Skill。
14. Project Skill 不会出现在其他项目的 Workflow 选择器、画布 Agent 搜索和 API 解析结果中。
15. 项目用户修改 System Skill 时必须创建项目副本，原 System Skill 的 Definition、Version 和推荐状态不变。
16. 已发布、已绑定或已产生历史快照的 Skill 不能物理删除，只能归档版本或停用 Definition。
17. Workflow 和画布 Agent 查询到的同一 Skill Version 具有相同的 Version ID、内容哈希和契约，不存在入口私有副本。

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
- 为 Workflow 增加独立 Adapter 节点类型和可版本化的服务端 Adapter Registry。
- 在 Workflow 预览时同时校验 Skill 契约和 Adapter 映射契约。
- 在 Execution Revision 中冻结 Adapter ID、版本、哈希与规则快照。
- 将 Adapter 结果保存为带完整父引用的新 Artifact，不改写原 Artifact。
- 保留 `/admin/skills` 作为 System Skill 和全局审计入口，新增项目 Skill 的用户端管理入口。
- 为所有 Skill 写操作增加 System / Project Owner、所属项目和当前用户权限校验。
- 增加归档 Version、停用 Definition、安全删除未发布草稿与复制 System Skill 为 Project Skill 的操作。
- 将 Workflow、画布 Agent 和独立 API 的 Skill 列表统一到同一个按用户、项目、capability 和 Artifact 契约过滤的查询服务。

不为本功能新增第二套 Skill Registry、第二套 Workflow 预览协议或前端本地 Skill 版本库。Adapter Registry 只注册安全的确定性转换，不存储 Skill 文本，也不承担 Agent 或 Skill 的业务创作职责。
