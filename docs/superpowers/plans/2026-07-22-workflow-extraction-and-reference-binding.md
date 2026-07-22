# Workflow Extraction and Reference Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a low-confirmation episode workflow where editable scripts feed selectable asset/storyboard Skills, assets and shot references can be imported and typed, storyboards are Skill-generated then edited, and prompts autosave before final video delivery.

**Architecture:** Extend the existing durable workflow stage start contract with an optional published Skill version override, while retaining frozen Agent Run snapshots. Keep user production data in the existing localforage-backed script, asset, and video-package stores; reuse the existing asset picker, image storage, version-history, background task, and Codex CLI worker paths. Move orchestration into focused workflow hooks/components and keep pure validation/mapping in colocated utilities with node tests.

**Tech Stack:** Go, Gin, GORM, Next.js App Router, React, TypeScript, Ant Design, Tailwind, Zustand, localforage, Node test runner, Docker Compose, Codex CLI worker, enterprise video API.

---

### Task 1: Runtime Skill catalogue and stage override

**Files:**
- Create: `service/workflow_skill_options_test.go`
- Modify: `service/workflow_skill.go`
- Modify: `service/video_workflow_contracts.go`
- Modify: `service/video_workflow.go`
- Modify: `handler/workflow.go`
- Modify: `router/router.go`
- Modify: `web/src/services/api/workflow-runs-contract.ts`
- Modify: `web/src/services/api/workflow-runs.ts`
- Modify: `web/src/services/api/workflow-runs-contract.test.mts`
- Modify: `docs/api-response.md`

- [ ] **Step 1: Write failing service tests for visible published options and explicit override validation**

```go
func TestListWorkflowSkillOptionsReturnsPublishedVersionsForStage(t *testing.T) {
    options, err := ListWorkflowSkillOptions(WorkflowStageAssetExtraction, "project-1")
    if err != nil || len(options) == 0 { t.Fatalf("options=%v err=%v", options, err) }
    if options[0].SkillVersionID == "" || options[0].StageID != WorkflowStageAssetExtraction { t.Fatalf("invalid option: %#v", options[0]) }
}

func TestResolveWorkflowSkillOverrideRejectsWrongStage(t *testing.T) {
    _, err := ResolveWorkflowSkillForStage(WorkflowStageShotBreakdown, "project-1", "asset-version-id")
    if err == nil { t.Fatal("expected stage mismatch") }
}
```

- [ ] **Step 2: Run the service tests and verify the missing functions fail**

Run: `go test ./service -run 'Test(ListWorkflowSkillOptions|ResolveWorkflowSkillOverride)'`

Expected: FAIL because `ListWorkflowSkillOptions` and `ResolveWorkflowSkillForStage` do not exist.

- [ ] **Step 3: Add the public option DTO and override resolver**

```go
type WorkflowSkillOption struct {
    StageID       string `json:"stageId"`
    SkillID       string `json:"skillId"`
    SkillName     string `json:"skillName"`
    Description   string `json:"description"`
    SkillVersionID string `json:"skillVersionId"`
    Version       string `json:"version"`
    IsDefault     bool   `json:"isDefault"`
}

func ResolveWorkflowSkillForStage(stageID, projectID, versionID string) (ResolvedWorkflowSkill, error) {
    if strings.TrimSpace(versionID) == "" { return ResolvePublishedWorkflowSkill(workflowSkillStageForRun(stageID), projectID) }
    skill, version, ok, err := repository.GetWorkflowSkillWithVersion(strings.TrimSpace(versionID))
    if err != nil || !ok || version.Status != model.WorkflowSkillVersionPublished || skill.StageKey != workflowSkillStageForRun(stageID) || !skill.Enabled {
        return ResolvedWorkflowSkill{}, safeMessageError{message: "所选 Skill 版本不可用于当前阶段"}
    }
    packageValue, err := DecodeWorkflowSkillPackage(version)
    return ResolvedWorkflowSkill{Skill: skill, Version: version, Package: packageValue}, err
}
```

- [ ] **Step 4: Extend stage start with `skillVersionId` and freeze the selected version**

```go
type WorkflowStageStartInput struct {
    IdempotencyKey string          `json:"idempotencyKey"`
    MediaBatchID   string          `json:"mediaBatchId"`
    SkillVersionID string          `json:"skillVersionId"`
    Context        json.RawMessage `json:"context"`
}
```

Use `ResolveWorkflowSkillForStage(stageID, detail.Run.ProjectID, input.SkillVersionID)` in the non-retry branch. Retry keeps using `frozenRun.SkillSnapshotJSON`.

- [ ] **Step 5: Add authenticated read endpoint and frontend contract**

```ts
export type WorkflowSkillOption = {
    stageId: string;
    skillId: string;
    skillName: string;
    description: string;
    skillVersionId: string;
    version: string;
    isDefault: boolean;
};

export type WorkflowStageStartOptions = { mediaBatchId?: string; skillVersionId?: string; context?: unknown };
```

Expose `GET /api/v1/workflow-skill-options?stageId=asset-extraction&projectId=...` and include `skillVersionId` in `workflowRunRequest.startStage`.

- [ ] **Step 6: Run backend and contract tests**

Run: `go test ./service ./handler`

Run: `cd web && node --import tsx --test src/services/api/workflow-runs-contract.test.mts`

Expected: PASS.

- [ ] **Step 7: Commit the runtime Skill support**

```bash
git add service handler router web/src/services/api docs/api-response.md
git commit -m "feat: allow per-run workflow skill selection"
```

### Task 2: Editable original script and new workflow version

**Files:**
- Create: `web/src/app/(user)/projects/[id]/project-episode-script-edit.ts`
- Create: `web/src/app/(user)/projects/[id]/project-episode-script-edit.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/canvas/utils/canvas-episode-context.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-episode-context.test.mts`

- [ ] **Step 1: Write failing tests for editing original text and invalidating optimized output**

```ts
test("saves edited original text and invalidates optimized script", () => {
    assert.deepEqual(originalScriptEditPatch(" 新正文 "), {
        sourceSummary: "新正文",
        summary: "",
        structuredScript: undefined,
    });
});

test("uses source script when optimized summary is empty", () => {
    assert.match(buildEpisodeScriptSnapshot(episode({ summary: "", sourceSummary: "新正文" })), /新正文/);
});
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/project-episode-script-edit.test.mts' 'src/app/(user)/canvas/utils/canvas-episode-context.test.mts'`

Expected: FAIL because `originalScriptEditPatch` is missing and source fallback is absent.

- [ ] **Step 3: Implement the pure edit patch and snapshot fallback**

```ts
export function originalScriptEditPatch(value: string) {
    const sourceSummary = value.trim();
    if (!sourceSummary) throw new Error("剧本正文不能为空");
    return { sourceSummary, summary: "", structuredScript: undefined };
}
```

Change `buildEpisodeScriptSnapshot` to use `episode.summary.trim() || episode.sourceSummary?.trim()` as the body.

- [ ] **Step 4: Add read/edit state to the project episode board**

Add props `onSaveEpisodeScript(episodeId, value)` and an editor draft keyed by selected episode. “编辑剧本” enters an Ant Design `Input.TextArea`; “保存修改” calls the prop and returns to read mode. No confirmation modal is shown.

```tsx
const [editingScript, setEditingScript] = useState(false);
const [scriptDraft, setScriptDraft] = useState(selectedScript);
useEffect(() => { setEditingScript(false); setScriptDraft(selectedScript); }, [selectedEpisode?.id, selectedScript]);

const saveScript = () => {
    if (!selectedEpisode || !scriptDraft.trim()) return;
    onSaveEpisodeScript(selectedEpisode.id, scriptDraft);
    setEditingScript(false);
};
```

- [ ] **Step 5: Wire persistence in project page**

```ts
const saveEpisodeScript = (episodeId: string, value: string) => {
    updateEpisode(episodeId, originalScriptEditPatch(value));
    message.success("原剧本已保存，下游旧结果已标记为过期");
};
```

- [ ] **Step 6: Run targeted tests and typecheck**

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/project-episode-script-edit.test.mts' 'src/app/(user)/canvas/utils/canvas-episode-context.test.mts'`

Run: `cd web && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit script editing**

```bash
git add web/src/app/'(user)'/projects web/src/app/'(user)'/canvas/utils
git commit -m "feat: edit episode source scripts"
```

### Task 3: Script-page information extraction and direct storyboard loading

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-script-extraction-panel.tsx`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-shot-automation.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-automation.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-automation.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-workflow-stage-actions.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-actions.ts`
- Modify: `service/video_workflow.go`
- Modify: `service/video_workflow_operations.go`
- Modify: `service/video_workflow_test.go`

- [ ] **Step 1: Write failing tests for parallel extraction readiness and automatic storyboard sync eligibility**

```ts
test("shot breakdown can start from confirmed script without asset images", () => {
    const actions = workflowStageActions({ status: "ready", hasArtifact: false }, false);
    assert.equal(actions.canStart, true);
});

test("loads a passing storyboard artifact without a manual review gate", () => {
    assert.equal(shouldAutoLoadStoryboard({ stageStatus: "needs_review", gatePassed: true, shotCount: 4 }), true);
});
```

- [ ] **Step 2: Run tests and verify current dependency/manual-review behavior fails**

Run: `go test ./service -run 'TestWorkflow.*ShotBreakdown'`

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-automation.test.mts'`

Expected: FAIL.

- [ ] **Step 3: Make `shot-breakdown` consume the immutable script artifact directly**

Update backend dependency and input-artifact resolution so both `asset-extraction` and `shot-breakdown` become ready after script confirmation. Keep `asset-image-prompt` dependent on asset extraction and `shot-prompt` dependent on an applied storyboard plus per-shot context.

```go
func workflowStageDependency(stageID string) string {
    switch stageID {
    case WorkflowStageAssetExtraction, WorkflowStageShotBreakdown:
        return WorkflowStageScriptAdaptation
    case WorkflowStageAssetImagePrompt:
        return WorkflowStageAssetExtraction
    case WorkflowStageShotPrompt:
        return WorkflowStageShotBreakdown
    default:
        return ""
    }
}
```

- [ ] **Step 4: Add the script extraction panel**

The panel loads options for `asset-extraction` and `shot-breakdown`, shows two Select controls, and starts both stages without a confirm modal:

```ts
await Promise.allSettled([
    extraction.start({ skillVersionId: assetSkillVersionId }),
    breakdown.start({ skillVersionId: shotSkillVersionId }),
]);
```

Each row shows queued/running/succeeded/failed state and its frozen Skill version. A failed row has its own “重新提取”.

```tsx
<ExtractionRow label="资产提取" options={assetOptions} value={assetSkillVersionId} status={extraction.stage?.status} onChange={setAssetSkillVersionId} onRetry={() => extraction.start({ skillVersionId: assetSkillVersionId })} />
<ExtractionRow label="分镜提取" options={shotOptions} value={shotSkillVersionId} status={breakdown.stage?.status} onChange={setShotSkillVersionId} onRetry={() => breakdown.start({ skillVersionId: shotSkillVersionId })} />
```

- [ ] **Step 5: Auto-approve and load passing storyboard artifacts**

`useWorkflowShotAutomation` watches `breakdown.gate?.passed`. It approves a `needs_review` result and upserts parsed shots into the scoped video-package store once per artifact content hash. Invalid output leaves existing packages untouched and shows the parser error.

```ts
export function shouldAutoLoadStoryboard(input: { stageStatus?: string; gatePassed?: boolean; shotCount: number }) {
    return input.stageStatus === "needs_review" && input.gatePassed === true && input.shotCount > 0;
}
```

- [ ] **Step 6: Remove the old raw stage review/load sequence from the empty video page**

The video empty state shows background extraction status and “重新生成分镜” only. It no longer renders raw JSON approval or a separate “载入分镜” button.

```tsx
{!workbench.packages.length ? (
    <StoryboardExtractionState state={breakdown} onRetry={() => breakdown.start({ skillVersionId: selectedShotSkillVersionId })} />
) : null}
```

- [ ] **Step 7: Run backend, targeted frontend, and type tests**

Run: `go test ./service`

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-shot-automation.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-stage-actions.test.mts'`

Run: `cd web && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit extraction orchestration**

```bash
git add service web/src/app/'(user)'/projects/'[id]'/episodes/'[episodeId]'/workflow
git commit -m "feat: extract assets and storyboards from scripts"
```

### Task 4: Import images into workflow asset cards

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-import.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-import.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-card.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-asset-panel.tsx`

- [ ] **Step 1: Write failing tests for source-aware import patches**

```ts
test("reuses a local library image as a new version on the target asset", () => {
    const patch = workflowAssetLibraryImportPatch(targetTextAsset, sourceImageAsset);
    assert.equal(patch.kind, "image");
    assert.equal(patch.metadata?.matchedAssetId, sourceImageAsset.id);
    assert.equal(assetVersionRecords({ ...targetTextAsset, ...patch } as Asset).length, 1);
});
```

- [ ] **Step 2: Run the import test and verify RED**

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-import.test.mts'`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement local-file and library-payload normalization**

For an existing local image asset use `buildWorkflowMatchedImagePatch`. For a remote library payload or file, upload the blob with `uploadImage`, then use `buildWorkflowUploadedImagePatch`. Return the original target asset ID in all cases.

```ts
export function workflowAssetLibraryImportPatch(target: Asset, source: Asset) {
    if (source.kind !== "image") throw new Error("请选择图片素材");
    return buildWorkflowMatchedImagePatch(target, source);
}

export async function workflowAssetFileImportPatch(target: Asset, file: Blob, fileName: string) {
    return buildWorkflowUploadedImagePatch(target, await uploadImage(file), { fileName });
}
```

- [ ] **Step 4: Add per-card import entry**

Each variant card gets an “导入资产” button. It opens a small source menu: “本地图片” triggers the hidden file input; “素材库” opens the existing `AssetPickerModal` with `allowedKinds={["image"]}`.

```tsx
<Dropdown menu={{ items: [
    { key: "local", label: "本地图片" },
    { key: "library", label: "素材库" },
], onClick: ({ key }) => props.onImport(asset, key as "local" | "library") }}>
    <Button icon={<Upload className="size-4" />}>导入资产</Button>
</Dropdown>
```

- [ ] **Step 5: Bind imports and preserve version history**

`WorkflowAssetPanel` owns the active target asset, import busy state, file input, and picker. On success it calls `updateAsset(target.id, patch)`, deselects that asset from generation, and reports “已导入并绑定 ASSET-ID”。

```ts
const applyImport = (target: Asset, patch: Partial<Asset>, logicalAssetId: string) => {
    updateAsset(target.id, patch);
    setSelectedIds((ids) => ids.filter((id) => id !== logicalAssetId));
    message.success(`已导入并绑定 ${logicalAssetId}`);
};
```

- [ ] **Step 6: Run targeted tests and typecheck**

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-import.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-asset-card-model.test.mts'`

Run: `cd web && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit asset importing**

```bash
git add web/src/app/'(user)'/projects/'[id]'/episodes/'[episodeId]'/workflow
git commit -m "feat: import images into workflow assets"
```

### Task 5: Typed, per-shot reference image binding

**Files:**
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-bindings.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-bindings.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-images.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-reference-image-panel.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/page.tsx`
- Modify: `web/src/app/(user)/video/use-video-package-store.ts`
- Modify: `service/video_workflow_contracts.go`

- [ ] **Step 1: Write failing tests for six reference roles and nine-image limit**

```ts
test("reserves one of nine slots for continuity", () => {
    const result = limitShotReferences(images(10), continuityReference);
    assert.equal(result.assetReferences.length, 8);
    assert.equal(result.references.at(-1)?.role, "continuity_reference");
});

test("requires asset ids except for blocking references", () => {
    assert.equal(validateReferenceDefinition({ role: "blocking", shotId: "shot-1" }), "");
    assert.match(validateReferenceDefinition({ role: "character", logicalAssetId: "" }), /资产编号/);
});
```

- [ ] **Step 2: Run the binding tests and verify RED**

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-bindings.test.mts'`

Expected: FAIL because the binding model is missing.

- [ ] **Step 3: Define persistent reference roles**

```ts
export type WorkflowReferenceRole = "character" | "character_variant" | "scene" | "prop" | "blocking" | "continuity_reference";
export type WorkflowReferenceBinding = {
    role: WorkflowReferenceRole;
    label: string;
    logicalAssetId?: string;
    parentLogicalAssetId?: string;
    variantName?: string;
    libraryAssetId: string;
    version: string;
    sourceShotId?: string;
    usage: string;
};
```

- [ ] **Step 4: Refactor the panel into a current-shot selector and definition editor**

Place it after the structured storyboard. Existing workflow assets display their extracted definition. “导入参考图” offers local and library sources, then opens a definition form with role and target-asset Select fields. `blocking` binds current shot; `continuity_reference` is system-managed and read-only.

```tsx
<Select value={definition.role} options={referenceRoleOptions} onChange={(role) => setDefinition((current) => ({ ...current, role }))} />
{requiresAssetTarget(definition.role) ? <Select value={definition.logicalAssetId} options={assetTargetOptions} onChange={(logicalAssetId) => setDefinition((current) => ({ ...current, logicalAssetId }))} /> : null}
<Button type="primary" disabled={Boolean(validateReferenceDefinition(definition))} onClick={saveDefinition}>绑定到本镜</Button>
```

- [ ] **Step 5: Persist locally imported shot references**

Upload the image, add it to “我的素材” with project/episode/shot/role metadata, then append its frozen version binding to the current `ProductionPackage.referenceBindings`. Library selections keep `sourceAssetId` and version reference.

```ts
const binding: WorkflowReferenceBinding = {
    role: definition.role,
    label: definition.label,
    logicalAssetId: definition.logicalAssetId,
    parentLogicalAssetId: definition.parentLogicalAssetId,
    variantName: definition.variantName,
    libraryAssetId: importedAsset.id,
    version: buildAssetVersionReference(importedAsset).assetVersionId || importedAsset.updatedAt,
    usage: referenceUsage(definition.role),
};
updatePackage(item, { referenceBindings: upsertReferenceBinding(item.referenceBindings || [], binding) });
```

- [ ] **Step 6: Build prompt inputs only from the current shot bindings**

Replace the page-wide `selectedReferenceIds` state with `item.referenceBindings`. Map roles to explicit usage text. The continuity reference remains a normal final reference with usage “上一镜尾帧剧情连续性参考，不作为首帧”.

```ts
const { assetReferences, references } = limitShotReferences(resolveBoundReferences(item.referenceBindings || [], assets), continuity);
const context = {
    shotId: item.id,
    sourceScript: item.sourceScript || item.segment,
    shotDraft: item.shotDraft,
    references: references.map(toWorkflowReferenceContext),
};
```

- [ ] **Step 7: Run targeted tests and typecheck**

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-bindings.test.mts' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/workflow-reference-images.test.mts'`

Run: `cd web && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit reference binding**

```bash
git add service/video_workflow_contracts.go web/src/app/'(user)'/projects/'[id]'/episodes/'[episodeId]'/workflow web/src/app/'(user)'/video/use-video-package-store.ts
git commit -m "feat: define per-shot reference image roles"
```

### Task 6: Simplify the shot editor and prompt confirmation

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-editor.tsx`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-shot-prompt-draft.ts`
- Create: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-shot-prompt-draft.test.mts`

- [ ] **Step 1: Write failing tests for autosave-before-confirm and autosave-before-switch**

```ts
test("confirm persists a dirty prompt before marking it confirmed", async () => {
    const result = await promptDraftTransition({ status: "dirty", action: "confirm" });
    assert.deepEqual(result, ["save", "confirm"]);
});
```

- [ ] **Step 2: Run the prompt draft tests and verify RED**

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-shot-prompt-draft.test.mts'`

Expected: FAIL because the transition helper/test seam is missing.

- [ ] **Step 3: Remove the redundant shot summary card**

Delete the first editor section containing shot ID, scene slug, status, and previous/next buttons. Keep the source-script section first; the left queue remains the only shot navigation control.

```tsx
return <div className="space-y-3">
    <section>对应原剧本：{props.item.sourceScript || "暂无原剧本片段"}</section>
    <section>结构化分镜编辑表单</section>
    {props.referencePanel}
    <section>多模态视频提示词</section>
</div>;
```

- [ ] **Step 4: Put `referencePanel` between storyboard and prompt sections**

Add `referencePanel?: React.ReactNode` to `WorkflowShotEditor` and render it immediately after the structured storyboard section.

```tsx
export function WorkflowShotEditor(props: {
    item: ProductionPackage;
    packages: ProductionPackage[];
    referencePanel?: React.ReactNode;
    onGeneratePrompt?: (item: ProductionPackage) => void;
}) {
    // existing draft state
    return <div>{/* source and storyboard */}{props.referencePanel}{/* prompt */}</div>;
}
```

- [ ] **Step 5: Remove the explicit prompt Save button**

Keep the 900 ms autosave status label and “确认提示词”. `confirm()` awaits `save()` before updating the prompt input hash and status. Failed saves display “自动保存失败” and do not confirm.

```tsx
<span>{promptStatusLabels[promptDraft.status]} · {promptDraft.prompt.length} 字</span>
<Button type="primary" icon={<Check className="size-4" />} disabled={!promptDraft.prompt.trim()} onClick={() => void promptDraft.confirm()}>
    确认提示词
</Button>
```

- [ ] **Step 6: Run tests, lint, and typecheck**

Run: `cd web && node --import tsx --test 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-shot-prompt-draft.test.mts'`

Run: `cd web && npx eslint 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/components/workflow-shot-editor.tsx' 'src/app/(user)/projects/[id]/episodes/[episodeId]/workflow/use-shot-prompt-draft.ts'`

Run: `cd web && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the simplified editor**

```bash
git add web/src/app/'(user)'/projects/'[id]'/episodes/'[episodeId]'/workflow
git commit -m "refactor: streamline shot review and prompt editing"
```

### Task 7: Documentation, production build, and supplied-story acceptance loop

**Files:**
- Modify: `docs/backend-database.md` only if schema changes were required during implementation
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run the complete automated suite**

Run: `go test ./...`

Run: `cd web && npm test`

Run: `cd web && npm run typecheck`

Run: `git diff --check`

Expected: all commands exit 0 with no failing tests.

- [ ] **Step 2: Rebuild and health-check the local production app**

Run: `docker compose up -d --build app`

Run: `docker compose ps app`

Run: `curl -fsS http://localhost:3000/api/health`

Expected: container healthy and response `ok`.

- [ ] **Step 3: Import the supplied mermaid-palace scene as a fresh episode**

Create a new episode using the exact script supplied by the user. Verify the saved source text survives refresh and creates a workflow run whose `scriptSnapshot` contains 楚和笙、楚云汐、黑色灵力、鲛珠 and the OS line.

- [ ] **Step 4: Run both extraction stages through Codex CLI**

Select the recommended published asset and storyboard Skills, start both without blocking dialogs, and wait for durable Agent Runs. Verify `executor=codex-cli`, frozen Skill IDs/versions, valid asset cards, and storyboard drafts tied to exact source lines.

- [ ] **Step 5: Complete assets to production standard**

Reuse the existing 楚云汐房间 scene image when available. Generate or import the smallest required set of character/variant/prop images, verify each stable asset number and version, and confirm asset extraction contains no invented plot facts.

- [ ] **Step 6: Review and correct storyboards**

Ensure shots cover: injured collapse and black spiritual energy; 楚云汐 healing; calm warning; 楚和笙 awakening and grievance; escalating accusation; silent observation and OS; final trembling fist. Correct shot size, movement, emotion, dialogue, duration, and continuity, then confirm each shot.

- [ ] **Step 7: Bind and define references after each storyboard**

Bind character base/variant, reused room scene, relevant props or blocking reference to each applicable shot. Verify the current shot stores explicit roles and versions; continuity tail frames remain normal `continuity_reference` inputs and never appear as first-frame controls.

- [ ] **Step 8: Generate and confirm multimodal prompts through Codex CLI**

For each accepted shot, verify the prompt run includes source script, confirmed storyboard, image observations, binding roles, and continuity usage. Edit any prompt that invents characters, changes dialogue meaning, or loses palace/room consistency; allow autosave, then confirm.

- [ ] **Step 9: Generate exactly one lowest-cost enterprise video**

Choose the simplest suitable confirmed shot, use the currently available enterprise model with minimum supported duration and resolution, run preflight, then submit one real generation. Do not batch-generate the remaining shots. Verify the request uses reference images plus the confirmed prompt and archives the result/version.

- [ ] **Step 10: Complete delivery review and iterate to the 95% stop condition**

Review screenplay coverage, asset bindings, storyboard completeness, prompt/reference consistency, video result, history, and delivery blockers. For each reproducible issue: add a failing test, implement the smallest fix, rebuild, and repeat the affected flow. Stop when no P0/P1 blockers remain, the full non-video workflow passes, the one video succeeds or has a clearly external provider failure, and the estimated user satisfaction reaches at least 95%.

- [ ] **Step 11: Update project documentation**

Move completed user-testable work into `docs/pending-test.md`, remove completed entries from `docs/todo.md`, and summarize the version-level change under `CHANGELOG.md` `Unreleased`. Update `docs/backend-database.md` only if the implemented design added or changed a table.

- [ ] **Step 12: Run fresh final verification and commit**

Run: `go test ./... && cd web && npm test && npm run typecheck`

Run: `git diff --check && docker compose ps app && curl -fsS http://localhost:3000/api/health`

Expected: all tests pass, no whitespace errors, healthy app, health response `ok`.

```bash
git add CHANGELOG.md docs web service handler router model repository
git commit -m "feat: complete skill-driven video production workflow"
```
