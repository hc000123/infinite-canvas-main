# Seedance 提示词工作流 SKILL.md 提取设计

## 目标

将 `/Users/huangchi/Documents/hc-ai提示词工作流/docs/seedance-prompt-workflow/SKILL.md` 提取到当前项目 `skills/seedance-prompt-workflow/SKILL.md`，作为后续可直接加载的真正 Skill 文件。

## 内容边界

- 保持源 `SKILL.md` 字节级一致，不改写、压缩或重新组织规则。
- 完整保留原工作流阶段、历史文件名、CSV 合同和 Run 目录行为。
- 完整保留 `02A` 镜头技法门禁、`02B` 生成包规划、`03` Seedance 提示词、`04` 质检和 `05` 模板验证。
- 完整保留官方六段正文模板，不转换为画布四段 Artifact 格式。
- 不生成 JSON Skill 包，不改动画布、Workflow Runtime 或 Artifact Schema。

## 验证

1. 使用字节比对确认提取文件与源 `SKILL.md` 完全一致。
2. 使用标准 Skill 校验器检查 YAML frontmatter、名称和目录结构。
3. 确认没有产生 JSON 交付物或其他附属技能文件。

## 验收标准

- `skills/seedance-prompt-workflow/SKILL.md` 存在。
- 文件可通过标准 Skill 格式校验。
- 文件与源 `seedance-prompt-workflow/SKILL.md` 完全一致。
- 原有阶段、字段、模板和质检规则零变更。
