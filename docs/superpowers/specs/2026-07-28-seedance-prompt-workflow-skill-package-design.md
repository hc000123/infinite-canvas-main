# HC Seedance 提示词工作流 Skill 包设计

## 目标

将 `/Users/huangchi/Documents/hc-ai提示词工作流/docs/seedance-prompt-workflow/SKILL.md` 转换为一个适配当前画布 Skill Runtime 的独立 JSON 包。交付文件可作为后续 Skill 导入器或 `POST /api/v1/admin/skills` 的请求体，创建、评测、发布后可绑定到现有 `video` 工作流阶段。

本次只交付 Skill 包文件，不实现管理后台的文件上传按钮，不修改 Workflow Runtime、Artifact Schema 或画布交互。

## 源内容边界

唯一主源是现有 `seedance-prompt-workflow/SKILL.md`。按它的实际引用关系，只补充与最终 Seedance 提示词直接相关的必要内容：

- `workflow/stages/03-seedance-prompts.md`；
- `workflow/stages/04-qc-revision.md`；
- `workflow/stages/05-template-validation.md`；
- `workflow/profiles/official-template-01.md`；
- `knowledge/checklists/seedance-qc.md` 以及直接被它引用的提示词硬规则。

不把 `knowledge/cards/` 重新拆成多个 Skill，不复制历史 `outputs/`，不携带 Python 工具、CSV 生成、本地 Run 目录管理和绝对路径。

## 画布调用边界

该包作为当前 Workflow 的提示词阶段 Skill，不在一次 Invocation 中重新执行剧本解析、资产提取和分镜拆分。原 Skill 中的 `00`–`02B` 规则转为上游继承和输入检查约束：保留稳定 ID、对白、时长、镜头目标、连续性和参考资产职责，但不在最终提示词阶段重编已批准分镜。

能力与执行器：

- `workflow.stage.video`：允许发布后绑定到现有视频提示词阶段；
- `prompt.compose`：便于画布总控按通用提示词能力检索；
- `executorKind=text_model`，不声明额外工具；
- `sideEffects=["none"]`，运行本身只生成 Artifact，不直接生成视频或写回业务数据。

## 独立文件格式

交付一个 `seedance-prompt-workflow.skill.json`，顶层与当前 `CreateSkillInput` 一致：

```json
{
  "name": "HC Seedance 提示词工作流",
  "summary": "将已批准分镜与资产编译为可审核的 Seedance 视频提示词包。",
  "ownerType": "system",
  "ownerProjectId": "",
  "version": "1.0.0",
  "package": {}
}
```

`package.files` 在同一 JSON 中内嵌以下逻辑文件：

- `SKILL.md`：目标、输入理解顺序、执行流程、输出边界和禁止事项；
- `rules/domain-rules.md`：从原 Skill 及其直接依赖提炼的官方模板、时间轴、镜头、对白、声音、光线、资产和连续性规则；
- `templates/output-template.md`：严格对齐 `video_prompt_package` 的输出样例与提示词段落顺序；
- `examples/good-output.json`：不复制历史项目内容的最小合格样例。

`contentHash` 留空，由画布后端规范化并计算，避免离线文件携带错误哈希。

## 输入契约

使用画布现有核心 Artifact：

| 绑定名 | Artifact 类型 | 基数 | 要求 |
| --- | --- | --- | --- |
| `storyboard_package` | `storyboard_package` | 1 | 必需，使用已批准 `shotId/sourceScript/shotDraft` |
| `asset_catalog` | `asset_catalog` | 1 | 必需，只继承已确认资产事实 |
| `asset_rendition` | `asset_rendition` | 0–9 | 可选，按冻结顺序对应 `@图1`–`@图9` |

图片允许 `image/png`、`image/jpeg`、`image/webp`；没有实际图片时允许纯文本降级，但不得虚构 `@图N`。上游 Artifact 未批准或哈希不匹配时由现有 Invocation Preflight 阻断。

## 输出契约

输出一个 `video_prompt_package@1.0.0`：

- 顶层只有 `items`；
- 每项只有 `shotId`、`prompt`、`inputArtifactRefs`；
- `shotId` 必须来自上游分镜；
- `inputArtifactRefs` 的 `bindingName/artifactId/contentHash` 原样继承冻结输入；
- `prompt` 包含场景、声音、画面内容、限制以及从 0 秒开始的连续时间段；
- 最后时间段精确结束于分镜 `durationSeconds`。

输出 JSON Schema 直接内嵌当前 `service/artifact_schema_fixtures/video_prompt_package.json` 的结构，不另起一套字段。

## 原 Skill 规则的适配

保留并改写为画布可执行的规则：

1. 官方模板的场景、声音、画面内容和限制结构。
2. 每个生成单元不超过 15 秒，时间轴无跳秒、无重叠。
3. 用户固定的机位、景别、运镜、动作、对白和标点不得擅改。
4. 一个镜头只保留一个主视觉任务和一个主运镜，表演落到可见动作。
5. 参考图按实际冻结顺序使用 `@图1`–`@图9`，每张图只承担明确职责。
6. 上一镜尾帧只能作为 `continuity_reference` 普通参考图，用于理解剧情从上一画面之后继续；不得标记为首帧，不得要求第一帧复刻，不得重新诠释画风、材质或角色设定。
7. 输出前内部执行结构、时长、ID、参考、连续性和模板终检，但不把检查过程混入 Artifact。

排除或替换的原规则：

- 用 Artifact 输入代替本地 `outputs/{项目名}/.../RUN_*` 读写；
- 用严格 JSON 代替 CSV 和 `03_prompts/` 文件夹；
- 用服务端 `schema + media` 质量门代替 Python 校验命令；
- 不执行知识库自更新、历史 Run 回写、外部 CLI 或任意本地文件操作。

## 质量门与错误处理

`qualityGateProfile` 使用 `schema` 和 `media`。

- 缺少分镜包或资产目录：预检阻断，不创建计费执行尝试。
- 参考图超过 9 张或格式不支持：预检阻断并返回具体原因。
- 纯文本输入：允许继续，但输出不得出现 `@图N`。
- 输出 Schema 错误、时间轴不连续、`shotId` 不存在、Artifact 引用不匹配：产物可保留诊断，但不能批准或写回。
- 上一镜尾帧被当作首帧：由媒体质量门阻断。

## 验证方式

实施后执行以下定向验证，不运行全量构建：

1. JSON 语法解析成功，顶层与 `CreateSkillInput` 字段一致。
2. 将 `package` 交给现有 `NormalizeSkillPackage`、`ValidateInvocableSkillPackage` 和 `ValidateSkillArtifactContracts`，确认内容大小、路径、Manifest、Artifact 绑定、Schema 与质量门全部通过。
3. 校验 `examples/good-output.json` 通过包内输出 Schema 与核心 `video_prompt_package` Schema。
4. 搜索交付文件，确认不包含源仓库绝对路径、`RUN_*`、Python 命令、旧模板别名或历史项目输出。

## 文档影响

设计说明保存在 `docs/superpowers/specs/`。实施完成后必须检查 `docs/todo.md` 和 `docs/pending-test.md`：

- 这是新增的可测试 Skill 包交付，应在 `docs/pending-test.md` 记录导入、校验、评测、发布与 Workflow 绑定的待验收项；
- 仅当 `docs/todo.md` 存在相同待办时才移除或调整，不新增无关待办；
- 不更新 `docs/features.md`，直到用户确认真实工作流测试通过。

## 验收标准

- 交付物只需一个 JSON 文件，不依赖源提示词仓库的本地路径。
- 包内主指令能追溯到既有 `seedance-prompt-workflow/SKILL.md`，但运行方式已改为画布 Artifact Invocation。
- 文件可通过当前 Skill 包、Artifact 契约和 JSON Schema 校验。
- 输出与现有 `video_prompt_package` 完全兼容，不需要修改画布前端或 Workflow Runtime。
- 不虚构图片引用，不违反上一镜尾帧的 `continuity_reference` 边界。
- 当前管理后台没有 JSON 文件上传控件；本次的“可载入”指包内容与创建 Skill API 直接兼容，导入 UI 另行实现。
