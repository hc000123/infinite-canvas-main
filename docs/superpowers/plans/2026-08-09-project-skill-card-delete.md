# Project Skill Card Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an immediately visible, confirmed delete action to each editable Project Skill card without exposing project-side deletion for System Skills.

**Architecture:** Reuse the existing `deleteProjectSkill` API and React Query mutation in the project Skill page. Change the mutation to accept the clicked Skill ID, pass a delete callback only to Project Skill cards, and render the action as a sibling of the card's main button to avoid nested interactive elements.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, TanStack Query, Node test runner.

---

### Task 1: Lock the card-delete wiring with a failing test

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/skills/project-skill-lifecycle-wiring.test.mts`

- [ ] **Step 1: Write the failing source-wiring test**

```ts
test("project Skill cards expose a confirmed delete action only for project-owned Skills", () => {
    assert.match(page, /mutationFn: \(skillId: string\) => deleteProjectSkill\(token, skillId\)/);
    assert.ok(page.includes('onDelete={item.skill.ownerType === "project"'));
    assert.ok(page.includes('title={`删除“${item.skill.name}”？`}'));
    assert.ok(page.includes('aria-label={`删除 Skill ${item.skill.name}`}'));
    assert.ok(page.includes("onClick={(event) => event.stopPropagation()}"));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --input-type=module --eval "await import('./src/app/(user)/projects/[id]/skills/project-skill-lifecycle-wiring.test.mts')"
```

Expected: FAIL because the mutation still reads `activeItem` and `SkillCard` has no card-level delete action.

### Task 2: Add the Project Skill card delete action

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/skills/page.tsx`

- [ ] **Step 1: Make the existing mutation target the clicked Skill**

Use a mutation variable instead of closing over `activeItem`:

```ts
const deleteSkillMutation = useMutation({
    mutationFn: (skillId: string) => deleteProjectSkill(token, skillId),
    onSuccess: async (_, deletedSkillId) => {
        if (activeSkillId === deletedSkillId) {
            setActiveSkillId("");
            setActiveVersionId("");
        }
        await invalidate();
        message.success("从未发布的 Skill 已删除");
    },
    onError: mutationError,
});
```

- [ ] **Step 2: Pass deletion only to Project Skill cards**

```tsx
<SkillCard
    key={item.skill.id}
    item={item}
    active={item.skill.id === activeItem.skill.id}
    onClick={() => { setActiveSkillId(item.skill.id); setActiveVersionId(""); }}
    onDelete={item.skill.ownerType === "project" ? () => deleteSkillMutation.mutate(item.skill.id) : undefined}
    deleting={deleteSkillMutation.isPending && deleteSkillMutation.variables === item.skill.id}
/>
```

- [ ] **Step 3: Render an accessible sibling delete button with confirmation**

Change `SkillCard` to use a relative container, keep the full card selection button, and render this sibling action only when `onDelete` exists:

```tsx
<Popconfirm
    title={`删除“${item.skill.name}”？`}
    description="只有从未发布、没有引用的 Skill 才能删除。"
    okText="确认删除"
    cancelText="取消"
    okButtonProps={{ danger: true }}
    onConfirm={onDelete}
>
    <Button
        aria-label={`删除 Skill ${item.skill.name}`}
        danger
        type="text"
        size="small"
        icon={<DeleteOutlined />}
        loading={deleting}
        onClick={(event) => event.stopPropagation()}
    />
</Popconfirm>
```

- [ ] **Step 4: Keep the lifecycle delete action on the shared mutation**

```tsx
onConfirm={() => deleteSkillMutation.mutate(activeItem.skill.id)}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the Task 1 command again. Expected: all tests in the file PASS.

### Task 3: Verify the live development page and record handoff

**Files:**
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`

- [ ] **Step 1: Check TypeScript and focused test**

```bash
cd web && npm run typecheck
cd web && node --experimental-strip-types --input-type=module --eval "await import('./src/app/(user)/projects/[id]/skills/project-skill-lifecycle-wiring.test.mts')"
```

Expected: both commands exit successfully.

- [ ] **Step 2: Inspect the development page**

Open `http://localhost:3000/projects/VQo7X056iuIyr6KOjsn2Y/skills`, confirm Project cards show the delete icon, System cards do not, and opening the icon shows the named confirmation without changing the selected card.

- [ ] **Step 3: Update pending-test documentation**

Add a concise entry under the current Skill management section describing the Project-card delete shortcut and its unchanged backend restrictions. Only adjust `docs/todo.md` if a matching todo already exists.
