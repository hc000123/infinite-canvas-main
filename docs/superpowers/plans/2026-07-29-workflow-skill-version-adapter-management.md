# Workflow Skill 版本、Adapter 与项目管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有统一 Skill Registry 上补齐剧本 Skill 3.2.0、运行前兼容版本选择、确定性 Workflow Adapter，以及 System / Project Skill 的权限化生命周期管理。

**Architecture:** 保留 Skill、Workflow、画布 Agent 与直接 API 已共用的 Registry 和 Invocation Runtime，只扩展已有模型与服务。Skill Version 发布后不可变；Workflow Execution Revision 冻结 Skill 路由预览与 Adapter 快照；Adapter 由代码注册、精确版本化并只生成带父引用的派生 Artifact；项目管理接口沿用 Agent Registry 的 `OwnerUserID + OwnerProjectID` 隔离方式，管理员保留全局入口。

**Tech Stack:** Go、Gin、GORM、JSON Schema、Next.js App Router、React、TypeScript、TanStack Query、Ant Design、Node test runner。

---

## 文件结构

- `service/skill_seed.go` 与 `service/skill_seeds/script/`：幂等导入同一 Definition 下的剧本 Skill `3.2.0`，不替换 `3.1.0` 推荐状态。
- `service/workflow_seed.go`：新增不可变标准 Workflow `2.3.0`，把剧本节点切换为 `manual_before_run`。
- `service/workflow_adapter.go`：确定性 Adapter Registry、精确解析、规则哈希、转换与派生 Artifact 创建。
- `service/workflow_graph.go`、`service/workflow_route_preview.go`、`service/workflow_execution.go`：Adapter 节点规范化、预览冻结、运行与恢复。
- `service/skill_management.go`、`repository/skill.go`、`handler/project_skill.go`：项目 Skill 权限、复制、归档、停用和安全删除。
- `web/src/services/api/project-skills.ts`、`web/src/app/(user)/projects/[id]/skills/`：项目 Skill 管理页。
- `web/src/app/(user)/projects/[id]/workflows/components/workflow-route-preview.tsx`：按节点契约过滤运行前版本候选。
- `docs/` 与 `CHANGELOG.md`：数据库、待办和可测试变更收尾。

### Task 1: 发布剧本 Skill 3.2.0 且保持 3.1.0 推荐不漂移

**Files:**
- Create: `service/skill_seeds/script/dynamic-script-3.2.0.md`
- Modify: `service/skill_seed.go`
- Modify: `service/skill_seed_test.go`

- [x] **Step 1: 写失败测试**

在 `service/skill_seed_test.go` 新增测试，先执行 `EnsureSkillSeeds()`，再断言两个版本均已发布、属于同一 Definition、契约一致，而且推荐版本仍为 3.1.0：

```go
func TestEnsureSkillSeedsPublishesDynamicScriptAsOptionalVersion(t *testing.T) {
    setupSkillServiceTest(t)
    if err := EnsureSkillSeeds(); err != nil { t.Fatal(err) }
    skill, ok, err := repository.GetSkillDefinition("skill-system-workflow-script")
    if err != nil || !ok { t.Fatalf("script skill missing: %v", err) }
    oldVersion, oldOK, _ := repository.GetSkillVersion("skill-version-system-workflow-script-3.1.0")
    dynamic, newOK, _ := repository.GetSkillVersion("skill-version-system-workflow-script-3.2.0")
    if !oldOK || !newOK || oldVersion.Status != model.SkillVersionPublished || dynamic.Status != model.SkillVersionPublished { t.Fatal("both versions must remain published") }
    if skill.RecommendedVersionID != oldVersion.ID { t.Fatalf("publishing an option must not change recommendation: %s", skill.RecommendedVersionID) }
    oldPackage, _ := DecodeSkillPackage(oldVersion)
    dynamicPackage, err := DecodeSkillPackage(dynamic)
    if err != nil { t.Fatal(err) }
    if !reflect.DeepEqual(oldPackage.Manifest.Capabilities, dynamicPackage.Manifest.Capabilities) || !reflect.DeepEqual(oldPackage.InputContract.ArtifactInputs, dynamicPackage.InputContract.ArtifactInputs) || !reflect.DeepEqual(oldPackage.OutputContract.ArtifactOutputs, dynamicPackage.OutputContract.ArtifactOutputs) { t.Fatal("3.2.0 changed the stable invocation contract") }
    if !strings.Contains(dynamicPackage.Files["SKILL.md"], "Seedance 2.0 短剧动态剧本转写") { t.Fatal("dynamic instructions were not imported") }
}
```

- [x] **Step 2: 运行测试确认失败**

Run: `go test ./service -run TestEnsureSkillSeedsPublishesDynamicScriptAsOptionalVersion -count=1`

Expected: FAIL，提示 `skill-version-system-workflow-script-3.2.0` 不存在。

- [x] **Step 3: 嵌入并幂等创建 3.2.0**

将 `workflow-skills/script/01-seedance2-dynamic-script/SKILL.md` 的完整内容复制到嵌入目录 `service/skill_seeds/script/dynamic-script-3.2.0.md`。在 `ensureSkillSeed` 中仅对 `script` 构建额外包：以 3.1.0 invocation 包为基底，只替换 `Files["SKILL.md"]` 后重新调用 `ValidateInvocableSkillPackage`，再创建固定 ID 的已发布版本与通过的嵌入评测：

```go
const dynamicScriptSkillVersion = "3.2.0"

func ensureDynamicScriptSkillVersion(skillID string, base SkillPackage, stamp string) error {
    content, err := skillSeedFS.ReadFile("skill_seeds/script/dynamic-script-3.2.0.md")
    if err != nil { return err }
    files := maps.Clone(base.Files)
    files["SKILL.md"] = string(content)
    base.Files = files
    packageValue, err := ValidateInvocableSkillPackage(base)
    if err != nil { return err }
    versionID := "skill-version-system-workflow-script-" + dynamicScriptSkillVersion
    if _, exists, err := repository.GetSkillVersion(versionID); err != nil { return err } else if !exists {
        if err := repository.CreateSkillVersion(publishedSeedSkillVersion(versionID, skillID, dynamicScriptSkillVersion, stamp, packageValue)); err != nil { return err }
    }
    return ensureSeedSkillEvaluation("skill-evaluation-system-workflow-script-"+dynamicScriptSkillVersion, versionID, packageValue.ContentHash, stamp)
}
```

抽出 `ensureSeedSkillEvaluation` 复用现有 3.1.0 逻辑。不得改写 `skill.RecommendedVersionID` 为 3.2.0。

- [x] **Step 4: 运行测试并提交**

Run: `go test ./service -run 'TestEnsureSkillSeedsPublishesDynamicScriptAsOptionalVersion|TestEnsureSkillSeeds' -count=1`

Expected: PASS。

```bash
git add service/skill_seed.go service/skill_seed_test.go service/skill_seeds/script/dynamic-script-3.2.0.md
git commit -m "feat: publish dynamic script skill 3.2.0"
```

### Task 2: 标准 Workflow 运行前选择兼容版本

**Files:**
- Modify: `service/workflow_seed.go`
- Modify: `service/workflow_seed_test.go`
- Modify: `service/workflow_route_preview_test.go`
- Create: `web/src/app/(user)/projects/[id]/workflows/workflow-skill-options.ts`
- Create: `web/src/app/(user)/projects/[id]/workflows/workflow-skill-options.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/workflows/components/workflow-route-preview.tsx`

- [x] **Step 1: 写标准 Workflow 与候选过滤失败测试**

Go 测试要求新标准 Workflow 是 `2.3.0`，`script` 节点不保存精确版本而保存稳定 Definition/capability：

```go
if version.Version != "2.3.0" { t.Fatalf("unexpected version %s", version.Version) }
script := packageValue.Nodes[0]
if script.SkillBinding.Mode != WorkflowSkillBindingManualBeforeRun || script.SkillBinding.SkillID != "skill-system-workflow-script" || script.SkillBinding.Capability != "workflow.stage.script" || script.SkillBinding.SkillVersionID != "" { t.Fatalf("script must be selected before run: %+v", script.SkillBinding) }
```

前端纯函数测试覆盖 capability、candidate Skill ID、必需输入和输出 Artifact：

```ts
assert.deepEqual(compatibleWorkflowSkillOptions(node, options).map((item) => item.skillVersionId), ["script-3.1", "script-3.2"]);
assert.equal(defaultWorkflowSkillVersionId(node, options, {}), "script-3.1");
assert.equal(defaultWorkflowSkillVersionId(node, options, { script: "script-3.2" }), "script-3.2");
```

- [x] **Step 2: 运行测试确认失败**

Run: `go test ./service -run 'TestEnsureWorkflowSeedsPublishesComposableProductionTemplate|TestManualWorkflowSelection' -count=1 && cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/workflows/workflow-skill-options.test.mts'`

Expected: FAIL，标准 Workflow 仍为 2.2.0 且过滤模块不存在。

- [x] **Step 3: 发布不可变 Workflow 2.3.0**

更新系统种子常量为新版本 ID，不修改已存在的 2.2.0。只把剧本节点改为：

```go
func manualSkillWorkflowNode(key, name, stageKey, outputType string, inputs []WorkflowNodeInputBinding) WorkflowNodeSpec {
    return WorkflowNodeSpec{
        NodeKey: key, Name: name, ExecutorType: WorkflowExecutorSkill,
        SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingManualBeforeRun, SkillID: "skill-system-workflow-" + stageKey, Capability: "workflow.stage." + stageKey, ExpectedOutputArtifactType: outputType, CandidateSkillIDs: []string{"skill-system-workflow-" + stageKey}},
        InputBindings: inputs, OutputArtifactType: outputType,
        ConfirmationPolicy: WorkflowConfirmationPolicy{RequireBeforeRun: true, RequireReview: true}, RetryPolicy: WorkflowRetryPolicy{MaxAttempts: 2},
    }
}
```

3.1.0 与 3.2.0 都通过同一 `ListSkillOptions` 查询出现；其他节点的绑定与版本保持不变。

- [x] **Step 4: 实现节点级候选过滤与默认值**

`workflow-skill-options.ts` 导出：

```ts
export function compatibleWorkflowSkillOptions(node: WorkflowNodeSpec, options: SkillOption[]) {
  const binding = node.skillBinding;
  if (!binding) return [];
  const requiredInputs = new Set(node.inputBindings.filter((item) => item.required).map((item) => item.artifactType));
  return options.filter((option) =>
    (!binding.capability || option.manifest.capabilities.includes(binding.capability)) &&
    (!binding.candidateSkillIds.length || binding.candidateSkillIds.includes(option.skillId)) &&
    option.manifest.outputArtifactTypes.includes(binding.expectedOutputArtifactType || node.outputArtifactType) &&
    [...requiredInputs].every((type) => option.manifest.inputArtifactTypes.includes(type))
  );
}

export function defaultWorkflowSkillVersionId(node: WorkflowNodeSpec, options: SkillOption[], selected: Record<string, string>) {
  const compatible = compatibleWorkflowSkillOptions(node, options);
  if (compatible.some((item) => item.skillVersionId === selected[node.nodeKey])) return selected[node.nodeKey];
  return compatible.find((item) => item.isRecommended)?.skillVersionId || compatible[0]?.skillVersionId || "";
}
```

在运行面板中每个节点只映射 `compatibleWorkflowSkillOptions(node, skillOptions)`；选择器标签增加摘要与 `contentHash` 短值（为此在 `SkillOption` 响应补充 `contentHash` 字段）。初始化时只填充空节点的推荐值，不覆盖用户现有选择。

- [x] **Step 5: 验证冻结不随推荐变化**

在 `service/workflow_route_preview_test.go` 预检选择 3.2.0 后，把 Definition 推荐改成 3.1.0，再确认执行；断言 `detail.Preview.Nodes[0].SkillVersionID` 和创建的 Invocation Revision 仍为 3.2.0。

Run: `go test ./service -run 'TestEnsureWorkflowSeeds|TestManualWorkflowSelection|TestWorkflowExecution.*Frozen' -count=1 && cd web && node --experimental-strip-types --test 'src/app/(user)/projects/[id]/workflows/workflow-skill-options.test.mts'`

Expected: PASS。

- [x] **Step 6: 提交**

```bash
git add service/workflow_seed.go service/workflow_seed_test.go service/workflow_route_preview_test.go service/skill.go web/src/services/api/admin-skills.ts 'web/src/app/(user)/projects/[id]/workflows/workflow-skill-options.ts' 'web/src/app/(user)/projects/[id]/workflows/workflow-skill-options.test.mts' 'web/src/app/(user)/projects/[id]/workflows/components/workflow-route-preview.tsx'
git commit -m "feat: select compatible workflow skill versions"
```

### Task 3: 增加确定性 Workflow Adapter Runtime

**Files:**
- Create: `service/workflow_adapter.go`
- Create: `service/workflow_adapter_test.go`
- Modify: `service/workflow_registry_contracts.go`
- Modify: `service/workflow_graph.go`
- Modify: `service/workflow_route_preview.go`
- Modify: `service/workflow_execution.go`
- Modify: `service/workflow_registry_test.go`
- Modify: `web/src/services/api/workflow-registry.ts`

- [x] **Step 1: 写 Adapter Registry 与执行失败测试**

测试注册一个 `production-script-envelope@1.0.0`，输入完整 `production_script`，输出相同 Schema 的派生副本，用它验证精确版本、哈希、父引用、规则扩展和相同输入内容哈希稳定：

```go
func TestWorkflowAdapterCreatesDeterministicDerivedArtifact(t *testing.T) {
    setupWorkflowRegistryTest(t)
    parent := mustCreateApprovedProductionScript(t, "user-1", "project-1", "episode-1")
    adapter, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: "production-script-envelope", AdapterVersion: "1.0.0"})
    if err != nil { t.Fatal(err) }
    first, err := ExecuteWorkflowAdapter("user-1", "project-1", "episode-1", adapter, []ArtifactRefInput{{BindingName: "production_script", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}})
    if err != nil { t.Fatal(err) }
    second, err := ExecuteWorkflowAdapter("user-1", "project-1", "episode-1", adapter, []ArtifactRefInput{{BindingName: "production_script", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}})
    if err != nil { t.Fatal(err) }
    if first.Artifact.ContentHash != second.Artifact.ContentHash { t.Fatal("adapter output drifted") }
    if !reflect.DeepEqual(first.ParentArtifactIds, []string{parent.Artifact.ID}) { t.Fatalf("missing provenance: %+v", first.ParentArtifactIds) }
    metadata := first.Extensions["workflow.adapter"].(map[string]any)
    if metadata["adapterId"] != adapter.ID || metadata["adapterVersion"] != adapter.Version || metadata["contentHash"] != adapter.ContentHash { t.Fatalf("missing frozen adapter metadata: %+v", metadata) }
}
```

另写三项测试：未注册精确版本阻断 Workflow 校验；输入 Schema 不接受时阻断预览；转换结果不符合输出 Schema 时节点失败且原 Artifact 未变化。

- [x] **Step 2: 运行测试确认失败**

Run: `go test ./service -run 'TestWorkflowAdapter|TestNormalizeWorkflowAdapterNode' -count=1`

Expected: FAIL，Adapter 类型和 Registry 尚不存在。

- [x] **Step 3: 定义独立 Adapter 契约和代码 Registry**

在 contracts 中加入：

```go
const WorkflowExecutorAdapter = "adapter"
type WorkflowAdapterRef struct { AdapterID string `json:"adapterId"`; AdapterVersion string `json:"adapterVersion"` }
// WorkflowNodeSpec.AdapterRef *WorkflowAdapterRef `json:"adapterRef,omitempty"`
// WorkflowNodeRoutePreview.AdapterID/AdapterVersion/AdapterContentHash/AdapterSnapshot
```

`workflow_adapter.go` 使用只读注册表：

```go
type WorkflowAdapterDefinition struct {
    ID string `json:"adapterId"`
    Version string `json:"adapterVersion"`
    ContentHash string `json:"contentHash"`
    InputContracts []ArtifactInputSpec `json:"inputContracts"`
    Output ArtifactOutputSpec `json:"output"`
    Rules json.RawMessage `json:"rules"`
    Transform func([]ResolvedArtifactBinding) (json.RawMessage, error) `json:"-"`
}

func ResolveWorkflowAdapter(ref WorkflowAdapterRef) (WorkflowAdapterDefinition, error)
func ExecuteWorkflowAdapter(userID, projectID, episodeID string, adapter WorkflowAdapterDefinition, refs []ArtifactRefInput) (ArtifactEnvelope, error)
```

`ContentHash` 必须由规范化的 ID、version、输入输出契约与 `Rules` 计算，不能包含函数地址。唯一内置示例只做 `productionScript` 字段的恒等结构映射，不调用模型、不摘要、不改写。

- [x] **Step 4: 创建内部派生 Artifact**

在 `workflow_adapter.go` 调用 `buildArtifacts(..., false)` 构造 Artifact，extensions 仅允许固定命名空间：

```go
metadata, _ := json.Marshal(map[string]any{"adapterId": adapter.ID, "adapterVersion": adapter.Version, "contentHash": adapter.ContentHash, "rules": json.RawMessage(adapter.Rules)})
items, envelopes, err := buildArtifacts(userID, []CreateArtifactInput{{ArtifactType: adapter.Output.ArtifactType, SchemaVersion: adapter.Output.SchemaVersion, ProjectID: projectID, EpisodeID: episodeID, ParentArtifactRefs: refs, Payload: payload, Extensions: map[string]json.RawMessage{"workflow.adapter": metadata}}}, false)
if err != nil { return ArtifactEnvelope{}, err }
_, err = repository.CreateArtifact(items[0])
return envelopes[0], err
```

相同重试可以产生不同 Artifact ID，但必须产生相同 payload、metadata、父引用和 `ContentHash`；Workflow 节点已有输出时不得再次执行。

- [x] **Step 5: 接入 Workflow 规范化、预览与执行**

`normalizeWorkflowNode` 增加 adapter 分支，要求只能声明 `AdapterRef`，且输出类型等于 Registry 输出类型。Workflow 发布校验和预览精确解析 Adapter，并把完整序列化快照放入 `WorkflowNodeRoutePreview.AdapterSnapshot`；Revision 已冻结 `RoutePreviewJSON`，无需新增数据库字段。

`startReadyWorkflowNodes` 在 Skill/Agent 分支之前执行：

```go
if node.ExecutorType == WorkflowExecutorAdapter {
    if strings.TrimSpace(node.OutputArtifactRefsJSON) != "" && node.OutputArtifactRefsJSON != "[]" { continue }
    frozen, err := decodeFrozenWorkflowAdapter(preview.AdapterSnapshot, preview.AdapterContentHash)
    if err != nil { return err }
    output, err := ExecuteWorkflowAdapter(detail.Run.UserID, detail.Run.ProjectID, detail.Run.EpisodeID, frozen, refs)
    if err != nil { node.Status, node.ErrorCode, node.ErrorMessage = model.WorkflowNodeExecutionFailed, "adapter_execution_failed", err.Error() } else {
        raw, _ := json.Marshal([]ArtifactRefInput{{BindingName: spec.OutputArtifactType, ArtifactID: output.Artifact.ID, ContentHash: output.Artifact.ContentHash}})
        node.OutputArtifactRefsJSON, node.Status = string(raw), model.WorkflowNodeExecutionCompleted
    }
    node.UpdatedAt = now()
    continue
}
```

`unlockWorkflowNodes` 已将 `Completed` 视为完成，保持原逻辑。前端类型增加 `"adapter"` 和只读 adapter 字段，不在编辑器提供任意代码配置入口。

- [x] **Step 6: 运行测试并提交**

Run: `go test ./service -run 'TestWorkflowAdapter|TestNormalizeWorkflowAdapterNode|TestWorkflowExecution.*Adapter' -count=1`

Expected: PASS。

```bash
git add service/workflow_adapter.go service/workflow_adapter_test.go service/workflow_registry_contracts.go service/workflow_graph.go service/workflow_route_preview.go service/workflow_execution.go service/workflow_registry_test.go web/src/services/api/workflow-registry.ts
git commit -m "feat: add deterministic workflow adapters"
```

### Task 4: 项目 Skill 权限与安全生命周期 API

**Files:**
- Create: `service/skill_management.go`
- Create: `service/skill_management_test.go`
- Modify: `service/skill.go`
- Modify: `repository/skill.go`
- Create: `handler/project_skill.go`
- Create: `handler/project_skill_test.go`
- Modify: `router/router.go`
- Modify: `router/router_test.go`

- [x] **Step 1: 写越权、复制、归档与删除失败测试**

覆盖以下断言：项目创建者可以创建/更新草稿/发布/推荐/归档；其他用户得到“Skill 不存在或无权操作”；普通用户不能修改 System Skill；管理员可以管理全部 Skill；复制 System Skill 只创建 Project Definition + Draft，不改变源 Definition、Version、推荐状态；已发布或被引用记录无法物理删除。

```go
if _, err := UpdateOwnedSkillDefinition("user-other", false, projectSkill.ID, "改名", "", nil); err == nil { t.Fatal("foreign project user mutated skill") }
copied, err := CopySystemSkillToProject("user-owner", false, systemSkill.ID, "project-1", "项目剧本 Skill", "1.0.0")
if err != nil || copied.Skill.OwnerType != model.SkillOwnerProject || copied.Skill.OwnerUserID != "user-owner" || copied.Skill.OwnerProjectID != "project-1" || copied.Version.Status != model.SkillVersionDraft { t.Fatalf("invalid copy: %+v %v", copied, err) }
if _, err := DeleteOwnedSkillVersion("user-owner", false, published.ID); err == nil { t.Fatal("published version was deleted") }
```

- [x] **Step 2: 运行测试确认失败**

Run: `go test ./service ./handler ./router -run 'TestProjectSkill|TestSkillLifecycle' -count=1`

Expected: FAIL，项目写接口和生命周期函数不存在。

- [x] **Step 3: 把权限校验放在 service 层**

新增统一守卫，管理员由 handler 传入 `isAdmin`，普通用户必须匹配 OwnerUserID：

```go
func editableSkill(userID string, isAdmin bool, skillID string) (model.SkillDefinition, error) {
    skill, ok, err := repository.GetSkillDefinition(strings.TrimSpace(skillID))
    if err != nil { return skill, err }
    if !ok || (!isAdmin && (skill.OwnerType != model.SkillOwnerProject || skill.OwnerUserID != strings.TrimSpace(userID))) { return skill, safeMessageError{message: "Skill 不存在或无权操作"} }
    return skill, nil
}
```

所有用户端写函数必须先调用该守卫；现有 admin handler 继续用管理员权限。项目用户不能把 OwnerProjectID 改为其他项目，Definition 的 Owner 在创建后不可改。

- [x] **Step 4: 实现归档、停用、复制与安全删除**

新增接口：

```go
func ListVisibleSkillItems(userID, projectID string) ([]SkillAdminItem, error)
func CopySystemSkillToProject(userID string, isAdmin bool, systemSkillID, projectID, name, version string) (ResolvedSkill, error)
func ArchiveOwnedSkillVersion(userID string, isAdmin bool, versionID string) (model.SkillVersion, error)
func DeleteOwnedSkillVersion(userID string, isAdmin bool, versionID string) error
func DeleteOwnedSkillDefinition(userID string, isAdmin bool, skillID string) error
```

归档只允许 Published → Archived，并清除指向该版本的推荐值；停用通过 `UpdateOwnedSkillDefinition`；安全删除在 repository 事务中检查 evaluation、workflow stage binding，以及 Workflow/Agent package JSON 和 Invocation Revision 对 Version ID 的引用。System seed ID（`skill-system-` 前缀）禁止删除 Definition。每个操作写 `SkillAuditLog`，项目操作的 `AdminID` 字段记录当前 actor ID。

- [x] **Step 5: 添加用户端 REST 路由**

新增：

```text
GET    /api/v1/skills?projectId=:id
POST   /api/v1/skills
PATCH  /api/v1/skills/:id
DELETE /api/v1/skills/:id
POST   /api/v1/skills/:id/copy
POST   /api/v1/skills/:id/versions
GET    /api/v1/skill-versions/:id
PATCH  /api/v1/skill-versions/:id
DELETE /api/v1/skill-versions/:id
POST   /api/v1/skill-versions/:id/validate
POST   /api/v1/skill-versions/:id/evaluations
POST   /api/v1/skill-versions/:id/publish
POST   /api/v1/skill-versions/:id/archive
PUT    /api/v1/skills/:id/recommended-version
```

handler 只解析认证用户、`model.IsAdminRole(user.Role)`、输入并调用 service。读取 System Skill 允许但其写操作只允许 admin。

- [x] **Step 6: 运行定向测试并提交**

Run: `go test ./service ./handler ./router -run 'TestProjectSkill|TestSkillLifecycle|TestRouterExposes.*Skill' -count=1`

Expected: PASS。

```bash
git add service/skill.go service/skill_management.go service/skill_management_test.go repository/skill.go handler/project_skill.go handler/project_skill_test.go router/router.go router/router_test.go
git commit -m "feat: manage project skill lifecycle"
```

### Task 5: 项目 Skill 管理页面与统一入口

**Files:**
- Create: `web/src/services/api/project-skills.ts`
- Create: `web/src/services/api/project-skills.test.mts`
- Create: `web/src/app/(user)/projects/[id]/skills/page.tsx`
- Create: `web/src/app/(user)/projects/[id]/skills/components/project-skill-editor.tsx`
- Modify: `web/src/app/(user)/projects/[id]/workflows/page.tsx`

- [x] **Step 1: 写 API 合约失败测试**

使用依赖注入 client，验证项目列表、复制系统 Skill、创建版本、发布、推荐、归档和删除路径：

```ts
assert.deepEqual(calls, [
  ["GET", "/api/v1/skills", { projectId: "project-1" }],
  ["POST", "/api/v1/skills/system-1/copy", { projectId: "project-1", name: "项目副本", version: "1.0.0" }],
  ["POST", "/api/v1/skill-versions/version-1/archive", undefined],
]);
```

- [x] **Step 2: 运行测试确认失败**

Run: `cd web && node --experimental-strip-types --test src/services/api/project-skills.test.mts`

Expected: FAIL，client 文件不存在。

- [x] **Step 3: 实现 API client 和项目页**

API 类型复用 `admin-skills.ts` 的 `SkillPackage`、`SkillVersion`、`SkillAdminItem`。页面从路由读取 `projectId`，用 TanStack Query 加载 `/api/v1/skills`；System Skill 卡片只展示版本并提供“复制为项目 Skill”，Project Skill 提供新增版本、编辑草稿、校验/评测、发布、推荐、归档、停用和符合条件时删除。

编辑器只提交 Registry 的 `SkillDraftInput`，不得把 Skill 正文存到浏览器本地。所有危险删除使用 Ant Design `Popconfirm`，后端拒绝时直接展示服务端原因。

- [x] **Step 4: 增加可发现入口**

在项目 Workflow 页面头部加入低视觉重量链接按钮：

```tsx
<Button type="text" icon={<Library className="size-4" />} onClick={() => router.push(`/projects/${projectId}/skills`)}>项目 Skills</Button>
```

遵循画布主题 token，不添加页面私有全局 CSS。

- [x] **Step 5: 运行测试并提交**

Run: `cd web && node --experimental-strip-types --test src/services/api/project-skills.test.mts 'src/app/(user)/projects/[id]/workflows/workflow-skill-options.test.mts'`

Expected: PASS。

```bash
git add web/src/services/api/project-skills.ts web/src/services/api/project-skills.test.mts 'web/src/app/(user)/projects/[id]/skills/page.tsx' 'web/src/app/(user)/projects/[id]/skills/components/project-skill-editor.tsx' 'web/src/app/(user)/projects/[id]/workflows/page.tsx'
git commit -m "feat: add project skill management"
```

### Task 6: 跨入口一致性、文档与最终验证

**Files:**
- Modify: `service/skill_test.go`
- Modify: `service/workflow_route_preview_test.go`
- Modify: `service/canvas_orchestrator_seed_test.go`
- Modify: `docs/backend-database.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: 写跨入口一致性回归测试**

同一项目中用 `ListSkillOptions`、`ResolveExactSkillVersion`、Workflow preview 和画布总控 Catalog 解析同一个已发布版本，断言 Version ID、ContentHash、capability 和输入输出契约一致；另建其他用户/项目的 Project Skill，断言不出现在当前项目查询、Workflow 手选和直接 Invocation 解析中。

```go
if workflowNode.SkillVersionID != option.SkillVersionID || workflowNode.SkillContentHash != option.ContentHash || resolved.Version.ContentHash != option.ContentHash { t.Fatal("registry entry drifted across consumers") }
if _, err := ResolveExactSkillVersion("user-other", "project-other", projectVersion.ID); err == nil { t.Fatal("project skill leaked") }
```

- [x] **Step 2: 运行服务端和前端定向验证**

Run: `go test ./service ./handler ./router -run 'Skill|WorkflowAdapter|WorkflowExecution|WorkflowRoute|CanvasOrchestrator' -count=1`

Expected: PASS。

Run: `cd web && node --experimental-strip-types --test src/services/api/project-skills.test.mts 'src/app/(user)/projects/[id]/workflows/workflow-skill-options.test.mts' src/services/api/workflow-registry.test.mts`

Expected: PASS。

- [x] **Step 3: 更新文档且保留用户现有修改**

`docs/backend-database.md` 说明不新增 Adapter 表：Adapter 快照冻结在 `workflow_execution_revisions.route_preview_json`，派生来源在 Artifact 父引用和 `workflow.adapter` extension。将已完成事项从 `docs/todo.md` 移入 `docs/pending-test.md`，只追加本版本可测试行为，不覆盖当前未提交内容；`CHANGELOG.md` 的 `Unreleased` 只做版本级归纳。

- [x] **Step 4: 检查不可变性与工作区边界**

Run: `git diff --check && git status --short`

Expected: 无空白错误；原有用户修改 `docs/superpowers/specs/2026-07-28-seedance-prompt-workflow-skill-package-design.md` 与 `skills/` 保持未暂存且内容未被改写。

- [x] **Step 5: 提交文档与回归测试**

```bash
git add service/skill_test.go service/workflow_route_preview_test.go service/canvas_orchestrator_seed_test.go docs/backend-database.md docs/todo.md docs/pending-test.md CHANGELOG.md
git commit -m "docs: finalize unified workflow skill management"
```

## 自检结论

- 规格覆盖：3.2.0 可选版本、运行前选择与冻结、契约过滤、Adapter 的确定性/来源/快照、System/Project Owner 权限、复制/归档/停用/安全删除、统一 Registry 与跨项目隔离均有对应任务。
- 非目标保持：没有运行中热更新、没有第二套 Registry、没有 Adapter 模型调用、没有更改上游 Skill 指令来适配下游。
- 数据一致性：Skill 使用 `SkillVersionID + ContentHash`；Adapter 使用 `AdapterID + AdapterVersion + ContentHash + Snapshot`；两者都冻结进现有 Execution Revision。
- 占位符扫描：计划不包含 TBD、后补实现或未定义的核心接口。
