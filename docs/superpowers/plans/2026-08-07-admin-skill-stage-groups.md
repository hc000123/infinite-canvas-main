# Admin Skill Stage Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `/admin/skills` registry list with production-stage Collapse groups while preserving all existing Skill card actions and filters.

**Architecture:** Keep grouping as pure display logic in `skill-view.ts`; it classifies by `stageKey` first and manifest signals second, then returns only non-empty groups in a fixed order. `page.tsx` owns only the controlled Collapse state, expanding the active Skill stage normally and every matching stage while filters are active.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Ant Design 6 `Collapse`, Node test runner.

---

## File map

- Modify `web/src/app/(admin)/admin/skills/skill-view.ts`: stage keys, classification, grouping, counts, and default-open pure functions.
- Modify `web/src/app/(admin)/admin/skills/skill-view.test.mts`: classification, ordering, counts, default-open behavior, and page wiring tests.
- Modify `web/src/app/(admin)/admin/skills/page.tsx`: controlled stage Collapse rendering and existing Skill card reuse.
- Modify `docs/pending-test.md`: add the new admin Skill registry behavior and manual acceptance steps.
- Inspect `docs/todo.md`: no roadmap item is moved because this request was not previously listed as a todo.

### Task 1: Add tested stage classification and grouping

**Files:**
- Modify: `web/src/app/(admin)/admin/skills/skill-view.test.mts`
- Modify: `web/src/app/(admin)/admin/skills/skill-view.ts`

- [ ] **Step 1: Write failing classification and grouping tests**

Update the test import and make `stageKey` an optional final fixture argument:

```ts
import { canPublishSkill, filterSkillItems, groupSkillItemsByStage, nextDraftVersion, nextPatchVersion, resolveOpenSkillStageKeys, skillLifecycleLabel } from "./skill-view.ts";

function skillItem(id: string, ownerType: SkillOwnerType, capabilities: string[], inputArtifactTypes: string[], outputArtifactTypes: string[], projectTags: string[], stageKey = ""): SkillAdminItem {
    return {
        skill: { id, name: id, summary: id, ownerType, ownerUserId: "", ownerProjectId: ownerType === "project" ? "p1" : "", stageKey, enabled: true, recommendedVersionId: `${id}-v1`, createdAt: "", updatedAt: "" },
        versions: [],
        bindings: [],
        evaluations: [],
        audits: [],
        recommendedPackage: {
            manifest: { capabilities, inputArtifactTypes, outputArtifactTypes, projectTags, schemaCompatibility: {}, sideEffects: ["none"], estimatedCostClass: "text_low" },
            files: { "SKILL.md": "test" },
            inputContract: { requiredInputs: [], artifactInputs: [], imagePolicy: { required: false, min: 0, max: 0, allowTextFallback: true, allowedTypes: [] } },
            outputContract: { schemaVersion: "1.0.0", schema: { type: "object" }, artifactOutputs: [] },
            qualityGateProfile: ["schema"],
            contentHash: "hash",
        },
    };
}
```

Add these tests:

```ts
test("groups skills by explicit stage before manifest fallback", () => {
    const groups = groupSkillItemsByStage([
        skillItem("explicit-rendition", "system", ["workflow.stage.script"], [], ["production_script"], [], "asset-rendition-scene"),
        skillItem("content", "system", ["content.classify"], ["production_script"], ["content_profile"], []),
        skillItem("extract", "project", ["workflow.stage.art"], ["production_script"], ["asset_catalog"], []),
        skillItem("brief", "system", ["asset.scene.brief"], ["asset_catalog"], ["asset_brief"], []),
        skillItem("storyboard", "project", ["storyboard.vertical.short"], [], ["storyboard_package"], []),
        skillItem("video", "system", [], [], ["video_prompt_package"], []),
        skillItem("delivery", "system", [], [], ["delivery_report"], []),
        skillItem("unknown", "project", ["custom.general"], [], ["custom_result"], []),
    ]);

    assert.deepEqual(groups.map((group) => [group.key, group.items.map((item) => item.skill.id)]), [
        ["script", ["content"]],
        ["asset-extraction", ["extract"]],
        ["asset-brief", ["brief"]],
        ["asset-rendition", ["explicit-rendition"]],
        ["storyboard", ["storyboard"]],
        ["video", ["video"]],
        ["delivery", ["delivery"]],
        ["other", ["unknown"]],
    ]);
});

test("stage groups expose visible owner counts and default open keys", () => {
    const groups = groupSkillItemsByStage([
        skillItem("system-script", "system", ["workflow.stage.script"], [], ["production_script"], []),
        skillItem("project-script", "project", ["content.classify"], [], ["content_profile"], []),
        skillItem("scene-image", "system", ["asset.rendition.generate"], [], ["asset_rendition"], []),
    ]);

    assert.deepEqual(groups.map(({ key, totalCount, systemCount, projectCount }) => ({ key, totalCount, systemCount, projectCount })), [
        { key: "script", totalCount: 2, systemCount: 1, projectCount: 1 },
        { key: "asset-rendition", totalCount: 1, systemCount: 1, projectCount: 0 },
    ]);
    assert.deepEqual(resolveOpenSkillStageKeys(groups, "scene-image", false), ["asset-rendition"]);
    assert.deepEqual(resolveOpenSkillStageKeys(groups, "", false), ["script"]);
    assert.deepEqual(resolveOpenSkillStageKeys(groups, "scene-image", true), ["script", "asset-rendition"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'
```

Expected: FAIL because `groupSkillItemsByStage` and `resolveOpenSkillStageKeys` are not exported.

- [ ] **Step 3: Implement minimal pure grouping functions**

Append to `skill-view.ts`:

```ts
export type SkillStageGroupKey = "script" | "asset-extraction" | "asset-brief" | "asset-rendition" | "storyboard" | "video" | "delivery" | "other";

const skillStageDefinitions: Array<{ key: SkillStageGroupKey; label: string }> = [
    { key: "script", label: "剧本与内容分析" },
    { key: "asset-extraction", label: "资产提取" },
    { key: "asset-brief", label: "资产设计 / Brief" },
    { key: "asset-rendition", label: "资产成图" },
    { key: "storyboard", label: "分镜" },
    { key: "video", label: "镜头提示词 / 视频" },
    { key: "delivery", label: "成片交付" },
    { key: "other", label: "其他" },
];

export type SkillStageGroup = (typeof skillStageDefinitions)[number] & {
    items: SkillAdminItem[];
    totalCount: number;
    systemCount: number;
    projectCount: number;
};

function skillStageGroupKey(item: SkillAdminItem): SkillStageGroupKey {
    const stageKey = item.skill.stageKey.trim().toLowerCase();
    if (stageKey === "script" || stageKey === "content-classifier") return "script";
    if (stageKey === "art") return "asset-extraction";
    if (stageKey === "assets" || stageKey.startsWith("asset-brief-")) return "asset-brief";
    if (stageKey.startsWith("asset-rendition-")) return "asset-rendition";
    if (stageKey === "storyboard" || stageKey.startsWith("storyboard-")) return "storyboard";
    if (stageKey === "video") return "video";
    if (stageKey === "delivery") return "delivery";

    const manifest = item.recommendedPackage?.manifest;
    const capabilities = manifest?.capabilities || [];
    const outputs = manifest?.outputArtifactTypes || [];
    if (capabilities.some((value) => value === "workflow.stage.script" || value === "content.classify") || outputs.some((value) => value === "production_script" || value === "content_profile")) return "script";
    if (capabilities.includes("workflow.stage.art") || outputs.includes("asset_catalog")) return "asset-extraction";
    if (capabilities.some((value) => value === "asset.brief.compose" || value.includes(".brief")) || outputs.includes("asset_brief")) return "asset-brief";
    if (capabilities.some((value) => value === "asset.rendition.generate" || value.includes(".rendition")) || outputs.includes("asset_rendition")) return "asset-rendition";
    if (capabilities.some((value) => value === "workflow.stage.storyboard" || value.startsWith("storyboard.")) || outputs.includes("storyboard_package")) return "storyboard";
    if (capabilities.includes("workflow.stage.video") || outputs.includes("video_prompt_package")) return "video";
    if (capabilities.includes("workflow.stage.delivery") || outputs.includes("delivery_report")) return "delivery";
    return "other";
}

export function groupSkillItemsByStage(items: SkillAdminItem[]): SkillStageGroup[] {
    const buckets = new Map<SkillStageGroupKey, SkillAdminItem[]>(skillStageDefinitions.map(({ key }) => [key, []]));
    for (const item of items) buckets.get(skillStageGroupKey(item))!.push(item);
    return skillStageDefinitions.flatMap((definition) => {
        const groupItems = buckets.get(definition.key)!;
        if (!groupItems.length) return [];
        return [{
            ...definition,
            items: groupItems,
            totalCount: groupItems.length,
            systemCount: groupItems.filter((item) => item.skill.ownerType === "system").length,
            projectCount: groupItems.filter((item) => item.skill.ownerType === "project").length,
        }];
    });
}

export function resolveOpenSkillStageKeys(groups: SkillStageGroup[], activeSkillId: string, expandAll: boolean) {
    if (expandAll) return groups.map((group) => group.key);
    const activeGroup = groups.find((group) => group.items.some((item) => item.skill.id === activeSkillId));
    return activeGroup ? [activeGroup.key] : groups[0] ? [groups[0].key] : [];
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'
```

Expected: all tests in `skill-view.test.mts` PASS.

### Task 2: Render the controlled stage Collapse

**Files:**
- Modify: `web/src/app/(admin)/admin/skills/skill-view.test.mts`
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`

- [ ] **Step 1: Add a failing page wiring test**

Add:

```ts
test("admin registry renders production-stage collapse groups", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    for (const text of ["groupSkillItemsByStage", "resolveOpenSkillStageKeys", "openStageKeys", "group.systemCount", "group.projectCount", "group.items.map"]) {
        assert.ok(page.includes(text), `missing stage group wiring ${text}`);
    }
    assert.equal(page.includes("visibleItems.map((item) => <SkillCard"), false);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'
```

Expected: FAIL with `missing stage group wiring groupSkillItemsByStage`.

- [ ] **Step 3: Wire group state and automatic expansion**

Extend the `skill-view` import:

```ts
import { canPublishSkill, filterSkillItems, groupSkillItemsByStage, latestPassingEvaluation, resolveOpenSkillStageKeys, shortSkillHash, skillLifecycleLabel, type SkillFilter } from "./skill-view";
```

Add page state after `trialOpen`:

```ts
const [openStageKeys, setOpenStageKeys] = useState<string[]>([]);
```

Add derived grouping after `activeItem`:

```ts
const stageGroups = useMemo(() => groupSkillItemsByStage(visibleItems), [visibleItems]);
const hasActiveFilters = Object.values(filters).some(Boolean);
```

Add this effect after the effect that synchronizes `activeSkillId`:

```ts
useEffect(() => {
    setOpenStageKeys(resolveOpenSkillStageKeys(stageGroups, activeItem?.skill.id || "", hasActiveFilters));
}, [activeItem?.skill.id, hasActiveFilters, stageGroups]);
```

- [ ] **Step 4: Replace the flat registry body with stage panels**

Replace the direct `visibleItems.map` block with:

```tsx
<Collapse
    ghost
    activeKey={openStageKeys}
    onChange={(keys) => setOpenStageKeys(Array.isArray(keys) ? keys : [keys])}
    items={stageGroups.map((group) => ({
        key: group.key,
        label: (
            <Flex justify="space-between" align="center" gap={8} wrap>
                <Typography.Text strong>{group.label}</Typography.Text>
                <Space size={4} wrap>
                    <Tag>{group.totalCount} 个</Tag>
                    {group.systemCount ? <Tag color="blue">系统 {group.systemCount}</Tag> : null}
                    {group.projectCount ? <Tag color="gold">项目 {group.projectCount}</Tag> : null}
                </Space>
            </Flex>
        ),
        children: (
            <Flex vertical gap={8}>
                {group.items.map((item) => (
                    <SkillCard key={item.skill.id} item={item} active={item.skill.id === activeItem.skill.id} onClick={() => { setActiveSkillId(item.skill.id); setActiveVersionId(""); }} />
                ))}
            </Flex>
        ),
    }))}
/>
```

- [ ] **Step 5: Run focused tests and TypeScript**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'
cd web && npm run typecheck
```

Expected: focused tests PASS and TypeScript exits 0.

### Task 3: Record acceptance scope and verify the diff

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Add the pending manual acceptance item**

Insert under `## 当前版本验收清单`:

```md
### Skill 注册表生产阶段折叠

- 后台 `/admin/skills` 注册表按剧本与内容分析、资产提取、资产设计 / Brief、资产成图、分镜、镜头提示词 / 视频、成片交付和其他分组，只展示非空阶段。
- 默认展开当前 Skill 所在阶段；搜索或筛选时展开全部匹配阶段。阶段标题显示当前结果的 Skill 总数、系统数量和项目数量，原卡片选择、编辑、启停、删除、版本和导入操作保持不变。
- 人工验收：打开 `/admin/skills`，逐组展开并确认每个 Skill 只出现一次；选择“场景资产成图”后确认“资产成图”保持展开；搜索一个跨阶段关键词并清空，确认匹配阶段自动展开且清空后回到选中 Skill 阶段。
```

- [ ] **Step 2: Confirm no todo entry moves**

Inspect `docs/todo.md`; leave it unchanged because this request is a new UI correction, not an existing roadmap item.

- [ ] **Step 3: Run deterministic verification**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'
cd web && npm run typecheck
git diff --check
```

Expected: focused tests PASS, TypeScript exits 0, and `git diff --check` has no output.

- [ ] **Step 4: Review only task-scoped changes**

Run:

```bash
git diff -- 'web/src/app/(admin)/admin/skills/skill-view.ts' 'web/src/app/(admin)/admin/skills/skill-view.test.mts' 'web/src/app/(admin)/admin/skills/page.tsx' docs/pending-test.md docs/todo.md
```

Expected: only stage grouping, Collapse wiring, tests, and the pending acceptance note are added; existing unrelated user edits remain intact.
