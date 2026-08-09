# Fixed Stage Manual Skill Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the project-facing free Workflow composer, organize project Skills by fixed production stage, and block independent Skill trials before submission when the required default model is missing.

**Architecture:** Keep the backend Workflow / Invocation / Artifact runtime unchanged, while simplifying the project UI to fixed-stage navigation and explicit Skill/version selection. Move stage classification into a shared Skill utility used by both admin and project pages. Read the raw published model defaults for trial preflight so the UI never silently falls back to the first available model.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Zustand, Node test runner, Go/GORM local settings storage.

---

### Task 1: Share Skill stage grouping

**Files:**
- Create: `web/src/components/skills/skill-stage-groups.ts`
- Create: `web/src/components/skills/skill-stage-groups.test.mts`
- Modify: `web/src/app/(admin)/admin/skills/skill-view.ts`
- Modify: `web/src/app/(admin)/admin/skills/skill-view.test.mts`
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`

- [ ] **Step 1: Write the failing shared grouping test**

```ts
assert.deepEqual(groupSkillItemsByStage(items).map(({ key }) => key), [
  "script", "asset-extraction", "asset-brief", "asset-rendition",
  "storyboard", "video", "delivery", "other",
]);
assert.deepEqual(resolveOpenSkillStageKeys(groups, "scene-image", false), ["asset-rendition"]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --experimental-strip-types --test src/components/skills/skill-stage-groups.test.mts`
Expected: FAIL because `skill-stage-groups.ts` does not exist.

- [ ] **Step 3: Move the stage types and functions into the shared module**

```ts
export type SkillStageGroupKey = "script" | "asset-extraction" | "asset-brief" | "asset-rendition" | "storyboard" | "video" | "delivery" | "other";
export function groupSkillItemsByStage(items: SkillAdminItem[]): SkillStageGroup[] { /* existing deterministic grouping */ }
export function resolveOpenSkillStageKeys(groups: SkillStageGroup[], activeSkillId: string, expandAll: boolean) { /* existing open-key rule */ }
```

Remove the duplicated definitions from `skill-view.ts`, import the shared functions in the admin page, and keep lifecycle/filter helpers in `skill-view.ts`.

- [ ] **Step 4: Run shared and admin tests**

Run: `cd web && node --experimental-strip-types --test src/components/skills/skill-stage-groups.test.mts 'src/app/(admin)/admin/skills/skill-view.test.mts'`
Expected: PASS.

### Task 2: Fold the project Skill registry by production stage

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/skills/project-skill-lifecycle-wiring.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/skills/page.tsx`

- [ ] **Step 1: Add failing project-page wiring assertions**

```ts
assert.match(page, /groupSkillItemsByStage/);
assert.match(page, /resolveOpenSkillStageKeys/);
assert.match(page, /activeKey=\{openStageKeys\}/);
assert.match(page, /group\.systemCount/);
assert.match(page, /group\.projectCount/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/skills/project-skill-lifecycle-wiring.test.mts'`
Expected: FAIL because the project registry is still flat.

- [ ] **Step 3: Wire shared grouping into the project page**

```tsx
const stageGroups = useMemo(() => groupSkillItemsByStage(items), [items]);
const hasActiveFilters = Boolean(search.trim() || ownerFilter);
useEffect(() => setOpenStageKeys(resolveOpenSkillStageKeys(stageGroups, activeItem?.skill.id || "", hasActiveFilters)), [activeItem?.skill.id, hasActiveFilters, stageGroups]);
```

Render one Ant Design `Collapse` item per non-empty stage, with total/System/Project counts and the existing Skill cards inside each drawer.

- [ ] **Step 4: Run the project Skill test**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/skills/project-skill-lifecycle-wiring.test.mts'`
Expected: PASS.

### Task 3: Replace the project Workflow entry with Skill management

**Files:**
- Modify: `web/src/app/(user)/projects/project-detail-navigation.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Replace: `web/src/app/(user)/projects/[id]/workflows/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/skills/page.tsx`

- [ ] **Step 1: Change navigation tests to the approved behavior**

```ts
assert.match(board, /Skill 管理/);
assert.match(board, /查看项目缓存/);
assert.doesNotMatch(board, /Workflow 中心/);
assert.match(workflowPage, /redirect\(`\/projects\/\$\{projectId\}\/skills`\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/project-detail-navigation.test.mts'`
Expected: FAIL on the current Workflow labels and composer page.

- [ ] **Step 3: Implement the simplified navigation and redirect**

```tsx
onOpenSkillManagement={() => router.push(`/projects/${project.id}/skills`)}
```

Rename the buttons to `Skill 管理` and `查看项目缓存`, remove the admin-only Workflow visibility condition, link the Skill page breadcrumb back to the project, and replace the old page with a server component using `redirect(`/projects/${projectId}/skills`)`.

- [ ] **Step 4: Run the navigation test**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/projects/project-detail-navigation.test.mts'`
Expected: PASS.

### Task 4: Preflight independent Skill trials against explicit model defaults

**Files:**
- Create: `web/src/components/skills/skill-trial-model-preflight.ts`
- Create: `web/src/components/skills/skill-trial-model-preflight.test.mts`
- Modify: `web/src/components/skills/skill-trial-panel.tsx`
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/skills/page.tsx`

- [ ] **Step 1: Write failing preflight tests**

```ts
assert.equal(skillTrialModelBlockReason("text_model", channelWithoutTextDefault), "缺少默认文本模型");
assert.equal(skillTrialModelBlockReason("image_model", channelWithoutImageDefault), "缺少默认图片模型");
assert.equal(skillTrialModelBlockReason("fixed_adapter", channelWithoutDefaults), "");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --experimental-strip-types --test src/components/skills/skill-trial-model-preflight.test.mts`
Expected: FAIL because the preflight module does not exist.

- [ ] **Step 3: Implement raw-default checking and UI wiring**

```ts
export function skillTrialModelBlockReason(executorKind: string | undefined, channel: AdminPublicModelChannelSettings | null | undefined) {
  if (executorKind === "text_model" && !channel?.defaultTextModel?.trim()) return "缺少默认文本模型";
  if (executorKind === "image_model" && !channel?.defaultImageModel?.trim()) return "缺少默认图片模型";
  return "";
}
```

Pass `detailQuery.data?.package.manifest.executorKind` into `SkillTrialPanel`, read `useConfigStore(state => state.publicSettings?.modelChannel)` directly, display an actionable warning, and disable the run button while blocked. Do not call `resolveEffectiveConfig`.

- [ ] **Step 4: Run the preflight and page wiring tests**

Run: `cd web && node --experimental-strip-types --test src/components/skills/skill-trial-model-preflight.test.mts 'src/app/(admin)/admin/skills/skill-view.test.mts' 'src/app/(user)/projects/[id]/skills/project-skill-lifecycle-wiring.test.mts'`
Expected: PASS.

### Task 5: Set the current local default text model and document acceptance

**Files:**
- Modify: `data/infinite-canvas.db` through a targeted SQLite update after inspecting the exact settings row
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Inspect the settings row and create a recoverable database backup**

Run: `sqlite3 data/infinite-canvas.db '.tables'` followed by a targeted `SELECT` for the public settings JSON.
Expected: the public model channel contains `gpt-5.6-sol` in `availableModels` and an empty `defaultTextModel`.

- [ ] **Step 2: Update only the explicit text default**

Use SQLite JSON functions to set `defaultTextModel` and the compatibility `defaultModel` to `gpt-5.6-sol`, preserving every other setting field.

- [ ] **Step 3: Verify the exact stored values**

Run the same targeted `SELECT`.
Expected: both text default fields equal `gpt-5.6-sol`; other published model settings are unchanged.

- [ ] **Step 4: Update pending-test documentation**

Record the project navigation simplification, shared stage drawers, trial preflight, and local default model adjustment in `docs/pending-test.md`. Confirm whether `docs/todo.md` contains a matching unfinished item; remove only an item completed by this implementation.

### Task 6: Focused verification

**Files:**
- Verify all files modified above

- [ ] **Step 1: Run focused frontend tests**

Run: `cd web && node --experimental-strip-types --test src/components/skills/skill-stage-groups.test.mts src/components/skills/skill-trial-model-preflight.test.mts 'src/app/(admin)/admin/skills/skill-view.test.mts' 'src/app/(user)/projects/[id]/skills/project-skill-lifecycle-wiring.test.mts' 'src/app/(user)/projects/project-detail-navigation.test.mts'`
Expected: PASS with no failures.

- [ ] **Step 2: Review the final diff**

Run: `git diff --check` and `git diff -- <changed paths>`.
Expected: no whitespace errors; no unrelated files changed by this task.

- [ ] **Step 3: Report manual checks**

Confirm that the user can test `/projects/:id`, `/projects/:id/skills`, the legacy `/projects/:id/workflows` redirect, `/cache?projectId=:id`, and both admin/project independent Skill trial dialogs.
