# Skill 注册表仅名称列表实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将后台 Skill 中心左侧注册表收口为仅显示 Skill 名称的紧凑选择列表。

**Architecture:** 保留现有 `SkillCard` 组件、阶段分组和选中状态，只删除卡片内重复的摘要、Capability 与输入输出展示。通过现有源码契约测试锁定左侧列表的展示边界，详细信息继续由右侧详情承接。

**Tech Stack:** Next.js App Router、React、TypeScript、Ant Design、Tailwind CSS、Node test runner

---

### Task 1: 精简 Skill 注册表选择项

**Files:**
- Modify: `web/src/app/(admin)/admin/skills/skill-view.test.mts`
- Modify: `web/src/app/(admin)/admin/skills/page.tsx:237-240`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: 将旧标签防溢出测试改为仅名称契约测试**

```ts
test("admin skill registry cards only show the skill name", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const skillCard = page.slice(page.indexOf("function SkillCard"), page.indexOf("function VersionButton"));
    assert.match(skillCard, /item\.skill\.name/);
    for (const detail of ["item.skill.summary", "manifest?.capabilities", "inputArtifactTypes", "outputArtifactTypes"]) assert.equal(skillCard.includes(detail), false);
});
```

- [ ] **Step 2: 运行定向测试并确认失败**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'
```

Expected: `admin skill registry cards only show the skill name` 失败，因为当前 `SkillCard` 仍渲染摘要、Capability 与输入输出。

- [ ] **Step 3: 精简 SkillCard**

将 `SkillCard` 改为仅渲染名称，保留按钮、选中态和主题样式：

```tsx
function SkillCard({ item, active, onClick }: { item: ReturnType<typeof filterSkillItems>[number]; active: boolean; onClick: () => void }) {
    return <button type="button" onClick={onClick} className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] hover:border-[var(--studio-border-strong)]"}`}><Typography.Text strong className="block break-words">{item.skill.name}</Typography.Text></button>;
}
```

- [ ] **Step 4: 更新待验收说明**

把 `docs/pending-test.md` 中“Skill 卡片长能力标签防溢出”改为“Skill 注册表仅显示名称”，记录以下验收内容：

```markdown
### Skill 注册表仅显示名称

- 后台 Skill 中心左侧注册表的选择项只显示 Skill 名称；摘要、Capability 和输入输出契约继续在右侧详情查看。
- 阶段分组、数量、选中态、点击切换和搜索筛选保持不变，长名称可在卡片内换行。
- 人工验收：打开 `/admin/skills`，展开多个阶段并切换 Skill，确认左侧只显示名称、右侧详情正常更新且列表无横向溢出。
```

- [ ] **Step 5: 运行定向测试并确认通过**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'
```

Expected: 全部测试通过，失败数为 0。

- [ ] **Step 6: 检查差异范围**

Run:

```bash
git diff --check -- 'web/src/app/(admin)/admin/skills/page.tsx' 'web/src/app/(admin)/admin/skills/skill-view.test.mts' docs/pending-test.md
```

Expected: 命令退出码为 0，且没有修改 Skill 数据、分组、筛选或详情组件。
