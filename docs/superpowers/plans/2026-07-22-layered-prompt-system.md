# Layered Prompt System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the prompt library into a layered production recipe system that combines company standards, project styles, personal habits, and the current image or video task.

**Architecture:** Keep administrator-managed company templates in the existing backend `prompts` table by extending its JSON metadata. Store personal and project profiles in a user-scoped `localforage` Zustand store, and combine all layers through a pure TypeScript composer that produces both final text and source-attributed sections. Existing prompt insertion remains available as “template only”; full recipe insertion is opt-in except for locked company rules.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Zustand, localforage, TanStack Query, Go/Gin/GORM existing prompt API.

---

## File map

- Create `web/src/components/prompts/prompt-profile.ts`: profile types, normalization, active-key helpers, and pure layered composer.
- Create `web/src/components/prompts/prompt-profile.test.mts`: normalization, activation, ordering, deduplication, and warning cases.
- Create `web/src/stores/use-prompt-profile-store.ts`: user-scoped local profile persistence and actions.
- Create `web/src/components/prompts/use-prompt-recipe-context.ts`: query company standards and resolve active local layers for a media/project context.
- Create `web/src/components/prompts/prompt-profile-manager.tsx`: edit active personal and project image/video profiles and preview effective layers.
- Modify `web/src/services/api/prompts.ts`: add company-standard metadata fields and labels.
- Modify `web/src/components/prompts/prompt-template.ts`: normalize the new optional metadata without changing old records.
- Modify `web/src/app/(admin)/admin/prompts/page.tsx`: edit and display company standard metadata.
- Modify `web/src/components/prompts/prompt-detail-dialog.tsx`: show composed sections and expose “full recipe” versus “template only”.
- Modify `web/src/components/prompts/prompt-select-dialog.tsx`: resolve recipe context and pass it to prompt details.
- Modify `web/src/app/(user)/prompts/page.tsx`: add current-effective configuration before the existing template library.
- Modify `web/src/app/(user)/image/page.tsx`: pass imported project context into the picker.
- Modify `docs/backend-database.md`: document new JSON metadata fields.
- Modify `docs/pending-test.md`: record the user-testable first-stage behavior.

## Project verification constraint

The project `AGENTS.md` says routine development must not run syntax checks, builds, or tests unless the user explicitly requests them. This plan adds focused pure-function tests for later use but does not execute them during this task. The commands listed below are handoff commands only.

### Task 1: Define prompt layers and pure composition

**Files:**

- Create: `web/src/components/prompts/prompt-profile.ts`
- Create: `web/src/components/prompts/prompt-profile.test.mts`
- Modify: `web/src/services/api/prompts.ts`
- Modify: `web/src/components/prompts/prompt-template.ts`

- [ ] **Step 1: Extend public prompt metadata**

Add optional values while keeping all existing fields:

```ts
export type PromptKind = "template" | "standard";
export type PromptPolicy = "required" | "recommended" | "optional";
export type PromptSlot = "style" | "camera" | "lighting" | "quality" | "negative" | "format" | "constraint";

export type PromptMetadata = {
    // existing fields
    kind?: PromptKind | string;
    policy?: PromptPolicy | string;
    slot?: PromptSlot | string;
    enabled?: boolean;
};
```

Add option arrays and label functions in `prompt-template.ts`. `normalizePromptMetadata` must return `kind: "template"`, `policy: "optional"`, and `enabled: true` when fields are absent.

- [ ] **Step 2: Define local profile types and normalization**

Implement these exported contracts in `prompt-profile.ts`:

```ts
export type PromptProfileScope = "personal" | "project";

export type PromptProfileBlock = {
    id: string;
    title: string;
    slot: PromptSlot;
    content: string;
    enabled: boolean;
};

export type PromptProfile = {
    id: string;
    name: string;
    scope: PromptProfileScope;
    projectId?: string;
    nodeGroup: "image" | "video";
    blocks: PromptProfileBlock[];
    createdAt: string;
    updatedAt: string;
};

export function promptProfileActiveKey(scope: PromptProfileScope, nodeGroup: "image" | "video", projectId?: string) {
    return scope === "project" ? `project:${projectId || ""}:${nodeGroup}` : `personal:${nodeGroup}`;
}
```

`normalizePromptProfile` must trim text, remove empty blocks, deduplicate exact block content, default missing titles to the slot label, and remove `projectId` from personal profiles.

- [ ] **Step 3: Implement the composer**

Use source-attributed output:

```ts
export type PromptRecipeSection = {
    id: string;
    source: "task" | "template" | "project" | "personal" | "company";
    title: string;
    slot?: PromptSlot | string;
    content: string;
    locked: boolean;
};

export type PromptRecipe = {
    text: string;
    sections: PromptRecipeSection[];
    warnings: string[];
};

export function composePromptRecipe(input: {
    task?: string;
    template?: string;
    companyStandards?: Prompt[];
    projectProfile?: PromptProfile;
    personalProfile?: PromptProfile;
    companyAvailable?: boolean;
}): PromptRecipe;
```

Ordering is task, template, project, personal, company. Include only enabled profile blocks. Include enabled company standards with `policy=required` or `recommended`; `required` sections use `locked=true`. Deduplicate exact normalized content. Warn when company data is unavailable or an unresolved `{变量}` remains.

- [ ] **Step 4: Add focused tests without executing them**

Cover these exact cases:

```ts
test("legacy prompt metadata stays optional template", () => {
    assert.deepEqual(normalizePromptMetadata({}), {
        nodeGroup: "", type: "", scenario: "", provider: "", model: "",
        inputKind: "", outputKind: "", variables: [], favorite: false,
        kind: "template", policy: "optional", slot: "", enabled: true,
    });
});

test("recipe preserves layer order and locks required company rules", () => {
    const result = composePromptRecipe(sampleRecipeInput());
    assert.deepEqual(result.sections.map((item) => item.source), ["task", "project", "personal", "company"]);
    assert.equal(result.sections.at(-1)?.locked, true);
});

test("recipe removes duplicate exact blocks and warns about unresolved variables", () => {
    const result = composePromptRecipe({ task: "生成 {角色}", template: "统一风格", personalProfile: duplicateProfile("统一风格"), companyAvailable: true });
    assert.equal(result.sections.filter((item) => item.content === "统一风格").length, 1);
    assert.match(result.warnings.join(" "), /变量/);
});
```

- [ ] **Step 5: Commit the pure model**

```bash
git add web/src/services/api/prompts.ts web/src/components/prompts/prompt-template.ts web/src/components/prompts/prompt-profile.ts web/src/components/prompts/prompt-profile.test.mts
git commit -m "feat: add layered prompt recipe model"
```

### Task 2: Persist personal and project profiles

**Files:**

- Create: `web/src/stores/use-prompt-profile-store.ts`

- [ ] **Step 1: Add the user-scoped Zustand store**

Use the existing `localForageStorage` adapter and the key `infinite-canvas:prompt_profile_store`:

```ts
type PromptProfileStore = {
    hydrated: boolean;
    profiles: PromptProfile[];
    activeProfileIds: Record<string, string>;
    addProfile: (input: Omit<PromptProfile, "id" | "createdAt" | "updatedAt">) => string;
    updateProfile: (id: string, patch: Partial<PromptProfile>) => void;
    removeProfile: (id: string) => void;
    setActiveProfile: (scope: PromptProfileScope, nodeGroup: "image" | "video", profileId: string, projectId?: string) => void;
};
```

Generate IDs with `nanoid`. Every write must call `normalizePromptProfile`. Removing a profile must also delete active bindings that point to it. A project binding must reject a profile from another project; personal bindings must reject project profiles.

- [ ] **Step 2: Export pure selectors**

```ts
export function activePromptProfile(state: Pick<PromptProfileStore, "profiles" | "activeProfileIds">, scope: PromptProfileScope, nodeGroup: "image" | "video", projectId?: string) {
    const id = state.activeProfileIds[promptProfileActiveKey(scope, nodeGroup, projectId)];
    return state.profiles.find((profile) => profile.id === id);
}
```

- [ ] **Step 3: Commit profile persistence**

```bash
git add web/src/stores/use-prompt-profile-store.ts
git commit -m "feat: persist prompt profiles locally"
```

### Task 3: Resolve company, project, and personal context

**Files:**

- Create: `web/src/components/prompts/use-prompt-recipe-context.ts`

- [ ] **Step 1: Fetch all company standards for the active media**

Use TanStack Query with `fetchPrompts({ nodeGroup, page: 1, pageSize: 500 })`. Filter records whose normalized metadata has `kind === "standard"` and `enabled !== false`. Do not silently treat legacy templates as standards.

- [ ] **Step 2: Resolve active local profiles**

The hook signature must be:

```ts
export function usePromptRecipeContext(nodeGroup: "image" | "video", projectId?: string) {
    return {
        hydrated,
        companyStandards,
        companyAvailable: !query.isError,
        companyLoading: query.isLoading,
        projectProfile,
        personalProfile,
        compose: (task: string, template?: string) => composePromptRecipe(...),
    };
}
```

Do not compose until local hydration is complete or the company query has finished. If the company query errors, return local layers plus `companyAvailable=false` so the composer produces a visible warning.

- [ ] **Step 3: Commit context resolution**

```bash
git add web/src/components/prompts/use-prompt-recipe-context.ts
git commit -m "feat: resolve effective prompt recipe context"
```

### Task 4: Let administrators define company standards

**Files:**

- Modify: `web/src/app/(admin)/admin/prompts/page.tsx`

- [ ] **Step 1: Add the company metadata controls**

Extend the existing edit modal with:

```tsx
<Form.Item name={["metadata", "kind"]} label="记录类型">
    <Select options={promptKindOptions} />
</Form.Item>
<Form.Item noStyle shouldUpdate={(before, after) => before.metadata?.kind !== after.metadata?.kind}>
    {({ getFieldValue }) => getFieldValue(["metadata", "kind"]) === "standard" ? (
        <>
            <Form.Item name={["metadata", "policy"]} label="执行策略"><Select options={promptPolicyOptions} /></Form.Item>
            <Form.Item name={["metadata", "slot"]} label="内容位置"><Select options={promptSlotOptions} /></Form.Item>
            <Form.Item name={["metadata", "enabled"]} label="启用" valuePropName="checked"><Checkbox>参与生产</Checkbox></Form.Item>
        </>
    ) : null}
</Form.Item>
```

New records default to `kind=template`, `policy=optional`, `enabled=true`. Saving must preserve `enabled=false` rather than converting it to an absent value.

- [ ] **Step 2: Show standard state in table and detail views**

Add tags for “公司标准”, “必选/推荐/可选”, slot label, and “已停用”. Do not label old templates as company standards.

- [ ] **Step 3: Commit admin support**

```bash
git add web/src/app/'(admin)'/admin/prompts/page.tsx
git commit -m "feat: manage company prompt standards"
```

### Task 5: Add the active-configuration workspace

**Files:**

- Create: `web/src/components/prompts/prompt-profile-manager.tsx`
- Modify: `web/src/app/(user)/prompts/page.tsx`

- [ ] **Step 1: Build profile editing as a focused component**

`PromptProfileManager` accepts `projectId?: string` and renders media tabs for image/video. Each media tab contains:

- company standards summary with locked/recommended tags;
- one active project profile selector and editor when `projectId` exists;
- one active personal profile selector and editor;
- a final recipe preview using placeholder task text, with every section labeled by source.

Profile creation requires only a name and scope. Block editing supports title, slot, content, enabled, add, and delete. Save through store actions; keep local draft state inside the component.

- [ ] **Step 2: Add project selection to the prompt center**

Read projects from `useCreativeProjectStore`. Resolve an optional `projectId` query parameter first, otherwise show “未选择项目”. Do not auto-select an arbitrary project because that could apply the wrong style.

- [ ] **Step 3: Put “当前生效” before “全部模板”**

Use Ant Design `Tabs` with `active` and `library` keys. The existing search/filter/card UI moves under the library tab without behavior changes. The active tab mounts `PromptProfileManager`.

- [ ] **Step 4: Commit the workspace**

```bash
git add web/src/components/prompts/prompt-profile-manager.tsx web/src/app/'(user)'/prompts/page.tsx
git commit -m "feat: add active prompt configuration workspace"
```

### Task 6: Apply full recipes from existing prompt pickers

**Files:**

- Modify: `web/src/components/prompts/prompt-detail-dialog.tsx`
- Modify: `web/src/components/prompts/prompt-select-dialog.tsx`
- Modify: `web/src/app/(user)/image/page.tsx`

- [ ] **Step 1: Add composition to prompt details**

Add optional props:

```ts
buildRecipe?: (template: string) => PromptRecipe;
onUseTemplate?: (prompt: string) => void;
```

After variables are rendered, call `buildRecipe(finalPrompt)`. Show each section with source label and a lock mark for required company rules. Show warnings above the action row. Disable “应用完整配方” when unresolved variables remain; keep “仅插入模板” available.

- [ ] **Step 2: Wire the picker to recipe context**

Resolve media as `nodeGroup === "video" ? "video" : "image"`. Call `usePromptRecipeContext(media, projectId)`, then pass `buildRecipe={(template) => context.compose("", template)}` to the detail dialog. Rename the primary action from “插入提示词” to “应用完整配方” and add “仅插入模板”.

- [ ] **Step 3: Preserve the old failure behavior**

When company standards fail to load, the detail must show “公司标准读取失败，本次结果未验证公司规则”. Users may still choose “仅插入模板”; applying a full recipe remains available only as an explicitly warned draft so work is not lost.

- [ ] **Step 4: Pass project context from the image workbench**

Change the picker call to:

```tsx
<PromptSelectDialog
    open={promptDialogOpen}
    projectId={sourceContext.projectId || undefined}
    nodeGroup="image"
    onOpenChange={setPromptDialogOpen}
    onSelect={setPrompt}
/>
```

Canvas call sites already pass `projectId` and need no architecture change.

- [ ] **Step 5: Commit integration**

```bash
git add web/src/components/prompts/prompt-detail-dialog.tsx web/src/components/prompts/prompt-select-dialog.tsx web/src/app/'(user)'/image/page.tsx
git commit -m "feat: apply layered recipes from prompt picker"
```

### Task 7: Document and hand off verification

**Files:**

- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Review: `docs/todo.md`

- [ ] **Step 1: Document metadata fields**

Add `kind`, `policy`, `slot`, and `enabled` to the `prompts.metadata` table. State that missing values mean optional template behavior and never auto-apply.

- [ ] **Step 2: Add pending user tests**

Record these test paths in `docs/pending-test.md`:

1. Admin creates required image standard and recommended video standard.
2. User creates one personal image habit and one project image style.
3. Prompt center switches between no project and a selected project.
4. Image picker shows four attributed layers and supports full recipe/template only.
5. Canvas video picker reads the video profile but does not mutate an existing confirmed production package.
6. Reload confirms profiles persist for the active user.
7. Company endpoint failure produces an explicit unverified warning.

No completed todo item is associated with this feature, so `docs/todo.md` requires no change unless a matching item is found during implementation.

- [ ] **Step 3: Review changed-file scope without running tests**

Use `git diff --name-only` and confirm only prompt-related files plus the two documentation files changed for this feature. Do not run build, lint, syntax checks, or tests unless the user later requests them.

- [ ] **Step 4: Optional verification commands for later explicit approval**

```bash
cd web
node --test --experimental-strip-types src/components/prompts/prompt-profile.test.mts
npm run build
```

Expected when explicitly run later: all prompt profile tests pass, followed by a successful Next.js build.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/backend-database.md docs/pending-test.md
git commit -m "docs: describe layered prompt workflows"
```

