# Global System Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove project-exclusive Skills so every published Skill is administrator-managed and globally available to every authenticated account and project.

**Architecture:** Keep the existing Skill Definition / Version / Manifest / Artifact runtime, but make `system` the only creatable and resolvable Skill owner. Move the remaining lifecycle endpoints under the admin route group, remove project-side management surfaces, and convert current project-owned definitions in place without changing Skill or Version IDs.

**Tech Stack:** Go, Gin, GORM, SQLite, Next.js App Router, React, TypeScript, Ant Design, TanStack Query.

---

## File map

- `model/skill.go`: retain the persisted owner field while making `system` the only active owner value.
- `repository/skill.go`: query the runtime catalog from system definitions only.
- `service/skill.go`: create and resolve only system Skills; preserve existing runtime method signatures where project context is still used by callers.
- `service/skill_management.go`: require administrator authority for every lifecycle mutation.
- `service/skill_folder_import.go`: always create system definitions and remove project-owner input handling.
- `service/invocation_resolver.go`, `service/agent_registry.go`, `service/canvas_orchestrator_seed.go`, `service/workflow_skill_binding.go`: remove project-owner routing and policy branches while preserving project-scoped workflow bindings.
- `handler/admin_skill.go`, `router/router.go`: complete the admin lifecycle API and remove project Skill management routes.
- `handler/project_skill.go`: delete the obsolete project management handler.
- `web/src/services/api/admin-skills.ts`: expose only system Skill ownership and use admin lifecycle endpoints.
- `web/src/services/api/skill-folder-form.ts`: remove owner and project fields from the folder-upload form contract.
- `web/src/services/api/project-skills.ts`: delete the obsolete project management client.
- `web/src/components/skills/skill-folder-import.tsx`, `skill-source-browser.tsx`, `skill-trial-panel.tsx`, `skill-stage-groups.ts`: collapse dual admin/project behavior to admin-only management.
- `web/src/app/(admin)/admin/skills/page.tsx`: remove owner filters and project counts.
- `web/src/app/(user)/projects/[id]/page.tsx`, `components/project-episode-board.tsx`, `skills/page.tsx`: remove the project management entry and redirect old links back to the project.
- `data/infinite-canvas.db`: convert existing project definitions to system definitions in place.
- `docs/backend-database.md`, `docs/todo.md`, `docs/pending-test.md`, `CHANGELOG.md`: document the new global-only behavior and retire superseded project-Skill checks.

### Task 1: Make the Skill catalog system-only

**Files:**
- Modify: `model/skill.go`
- Modify: `repository/skill.go`
- Modify: `repository/skill_test.go`
- Modify: `repository/skill_migration_test.go`
- Modify: `service/skill.go`
- Modify: `service/skill_test.go`

- [ ] **Step 1: Replace repository visibility tests with a system-only catalog test**

```go
func TestListSystemSkillDefinitionsExcludesLegacyProjectOwners(t *testing.T) {
	setupRepositoryTestDB(t)
	for _, skill := range []model.SkillDefinition{
		{ID: "system", Name: "系统技能", OwnerType: model.SkillOwnerSystem, Enabled: true},
		{ID: "legacy-project", Name: "旧项目技能", OwnerType: model.SkillOwnerType("project"), OwnerUserID: "user-1", OwnerProjectID: "project-1", Enabled: true},
	} {
		if err := CreateSkillDefinition(skill); err != nil { t.Fatal(err) }
	}
	items, err := ListSystemSkillDefinitions()
	if err != nil || len(items) != 1 || items[0].ID != "system" {
		t.Fatalf("items=%+v err=%v", items, err)
	}
}
```

- [ ] **Step 2: Add service tests proving project context no longer changes global options**

```go
func TestListSkillOptionsAreGlobalAcrossAccountsAndProjects(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil { t.Fatal(err) }
	filter := SkillOptionFilter{Capability: "workflow.stage.script", InputArtifactType: "source_text", OutputArtifactType: "production_script"}
	first, err := ListSkillOptions("user-1", "project-1", filter)
	if err != nil { t.Fatal(err) }
	second, err := ListSkillOptions("user-2", "project-2", filter)
	if err != nil { t.Fatal(err) }
	if !reflect.DeepEqual(first, second) || len(first) == 0 {
		t.Fatalf("first=%+v second=%+v", first, second)
	}
}

func TestExactResolutionRejectsLegacyProjectOwner(t *testing.T) {
	setupAITaskTestDB(t)
	skill, version := seedInvocationSkill(t, invocationSkillSeed{ID: "legacy-project", VersionID: "legacy-project-v1", Version: "1.0.0", OwnerType: model.SkillOwnerType("project"), Recommended: true})
	if _, err := ResolveExactSkillVersion("user-1", "project-1", version.ID); err == nil {
		t.Fatalf("legacy owner resolved: %+v", skill)
	}
}
```

- [ ] **Step 3: Implement the system-only repository query**

```go
func ListSystemSkillDefinitions() ([]model.SkillDefinition, error) {
	db, err := DB()
	if err != nil { return nil, err }
	var items []model.SkillDefinition
	err = db.Where("owner_type = ?", model.SkillOwnerSystem).Order("name asc").Find(&items).Error
	return items, err
}
```

Replace both runtime calls to `ListVisibleSkillDefinitions(userID, projectID)` with `ListSystemSkillDefinitions()` and delete the old visibility query.

- [ ] **Step 4: Make creation and exact resolution system-only**

```go
func CreateSystemSkill(userID, name, summary string, draft SkillDraftInput) (ResolvedSkill, error) {
	name = strings.TrimSpace(name)
	if name == "" { return ResolvedSkill{}, safeMessageError{message: "缺少 Skill 名称"} }
	versionName, packageValue, err := normalizeSkillDraftInput(draft)
	if err != nil { return ResolvedSkill{}, err }
	stamp := now()
	skill := model.SkillDefinition{ID: newID("skill"), Name: name, Summary: strings.TrimSpace(summary), OwnerType: model.SkillOwnerSystem, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp}
	version := skillVersionFromPackage(newID("skillversion"), skill.ID, versionName, userID, stamp, packageValue)
	if err := repository.CreateSkillAggregate(skill, version); err != nil { return ResolvedSkill{}, err }
	return ResolvedSkill{Skill: skill, Version: version, Package: packageValue}, nil
}

func skillVisibleTo(skill model.SkillDefinition, _, _ string) bool {
	return skill.OwnerType == model.SkillOwnerSystem
}
```

Update system creation callers to use `CreateSystemSkill`; delete `CreateProjectSkill` and the project-owner branches from `CreateSkill`.

Replace `SkillOwnerProject` in the legacy database-index fixtures with `model.SkillOwnerType("project")`; these fixtures only verify old rows do not enter the active catalog. Remove the exported `SkillOwnerProject` constant after production callers and valid test fixtures no longer use it.

- [ ] **Step 5: Record the targeted verification commands without running them yet**

Per `AGENTS.md`, do not execute tests unless the user explicitly requests verification. The exact targeted commands are:

```bash
go test ./repository -run 'TestListSystemSkillDefinitions' -count=1
go test ./service -run 'Test(ListSkillOptionsAreGlobal|ExactResolutionRejectsLegacy)' -count=1
```

Expected when authorized: both commands exit `0`.

### Task 2: Restrict all Skill lifecycle mutations to admin routes

**Files:**
- Modify: `service/skill_management.go`
- Modify: `service/skill_folder_import.go`
- Modify: `service/skill_management_test.go`
- Modify: `handler/admin_skill.go`
- Modify: `handler/admin_skill_test.go`
- Delete: `handler/project_skill.go`
- Delete: `handler/project_skill_test.go`
- Modify: `router/router.go`
- Modify: `router/router_test.go`

- [ ] **Step 1: Add service tests for administrator-only mutation and forced system ownership**

```go
func TestSkillManagementRequiresAdminAndCreatesSystemOwner(t *testing.T) {
	setupInvocationServiceTest(t)
	pkg := validSkillTestPackage()
	if _, err := CreateManagedSystemSkill("user-1", false, "禁止创建", "", SkillDraftInput{Version: "1.0.0", Package: pkg}); err == nil {
		t.Fatal("ordinary user created a global Skill")
	}
	created, err := CreateManagedSystemSkill("admin-1", true, "全局剧本", "", SkillDraftInput{Version: "1.0.0", Package: pkg})
	if err != nil { t.Fatal(err) }
	if created.Skill.OwnerType != model.SkillOwnerSystem || created.Skill.OwnerUserID != "" || created.Skill.OwnerProjectID != "" {
		t.Fatalf("created=%+v", created.Skill)
	}
	if _, err := UpdateOwnedSkillDefinition("user-1", false, created.Skill.ID, "越权修改", "", nil); err == nil {
		t.Fatal("ordinary user modified a global Skill")
	}
}
```

- [ ] **Step 2: Collapse create/import services to system-only inputs**

```go
func CreateManagedSystemSkill(userID string, isAdmin bool, name, summary string, draft SkillDraftInput) (ResolvedSkill, error) {
	if !isAdmin { return ResolvedSkill{}, safeMessageError{message: "只有管理员可以创建 Skill"} }
	result, err := CreateSystemSkill(userID, name, summary, draft)
	if err != nil { return result, err }
	if err := repository.CreateSkillAuditLog(skillAudit(userID, "create_skill", result.Skill, result.Version.ID, now())); err != nil { return ResolvedSkill{}, err }
	return result, nil
}
```

Remove `OwnerType` and `ProjectID` from `SkillFolderImportInput`. `ImportManagedSkillFolder` must return `只有管理员可以导入 Skill` when `isAdmin` is false and construct the definition with `OwnerType: model.SkillOwnerSystem`, empty owner IDs, and a system-scoped audit.

Change `editableSkill` to reject every non-admin caller and every non-system definition:

```go
if !ok || !isAdmin || skill.OwnerType != model.SkillOwnerSystem {
	return skill, safeMessageError{message: "Skill 不存在或无权操作"}
}
```

Delete `ListVisibleSkillItems`, `ListManagedSkillItems`, `GetVisibleSkillVersionPackage`, `CreateOwnedProjectSkill`, and `CopySystemSkillToProject` after their project handlers are removed.

- [ ] **Step 3: Complete admin archive and delete endpoints**

Add handlers:

```go
func AdminDeleteSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok { Fail(w, "未登录或权限不足"); return }
	if err := service.DeleteOwnedSkillVersion(admin.ID, true, id); err != nil { FailError(w, err); return }
	OK(w, map[string]bool{"deleted": true})
}

func AdminArchiveSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok { Fail(w, "未登录或权限不足"); return }
	result, err := service.ArchiveOwnedSkillVersion(admin.ID, true, id)
	if err != nil { FailError(w, err); return }
	OK(w, result)
}
```

Register under `skillAdmin`:

```go
skillAdmin.DELETE("/skill-versions/:id", func(c *gin.Context) { handler.AdminDeleteSkillVersion(c.Writer, c.Request, c.Param("id")) })
skillAdmin.POST("/skill-versions/:id/archive", func(c *gin.Context) { handler.AdminArchiveSkillVersion(c.Writer, c.Request, c.Param("id")) })
```

- [ ] **Step 4: Remove project Skill routes and handler files**

Remove `/api/v1/skills`, `/api/v1/skills/*`, `/api/v1/skill-versions/*`, `/api/v1/skill-trials/*`, and `/api/v1/skill-stage-templates` management registrations from the ordinary authenticated `v1` group. Keep `/api/v1/skill-options` because it is the authenticated runtime catalog.

Replace `TestProjectSkillRoutesRequireAuth` with a route-removal assertion:

```go
func TestProjectSkillManagementRoutesAreRemoved(t *testing.T) {
	app := New()
	for _, path := range []string{"/api/v1/skills", "/api/v1/skills/import-folder", "/api/v1/skill-versions/version-1"} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		response := httptest.NewRecorder()
		app.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound { t.Fatalf("path=%s status=%d", path, response.Code) }
	}
}
```

- [ ] **Step 5: Record targeted backend verification commands**

```bash
go test ./service -run 'TestSkillManagementRequiresAdmin' -count=1
go test ./handler -run 'TestAdminSkill' -count=1
go test ./router -run 'TestProjectSkillManagementRoutesAreRemoved' -count=1
```

Expected when explicitly authorized: all commands exit `0`.

### Task 3: Remove project Skill management from the frontend

**Files:**
- Modify: `web/src/services/api/admin-skills.ts`
- Modify: `web/src/services/api/skill-folder-form.ts`
- Delete: `web/src/services/api/project-skills.ts`
- Delete: `web/src/services/api/project-skills.test.mts`
- Modify: `web/src/components/skills/skill-folder-import.tsx`
- Modify: `web/src/components/skills/skill-folder-import-view.test.mts`
- Modify: `web/src/components/skills/skill-source-browser.tsx`
- Modify: `web/src/components/skills/skill-trial-panel.tsx`
- Modify: `web/src/components/skills/skill-stage-groups.ts`
- Modify: `web/src/components/skills/skill-stage-groups.test.mts`
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`
- Modify: `web/src/app/(admin)/admin/skills/skill-view.ts`
- Modify: `web/src/app/(admin)/admin/skills/skill-view.test.mts`
- Modify: `web/src/app/(user)/projects/[id]/page.tsx`
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Replace: `web/src/app/(user)/projects/[id]/skills/page.tsx`
- Delete: `web/src/app/(user)/projects/[id]/skills/components/project-skill-editor.tsx`
- Delete: `web/src/app/(user)/projects/[id]/skills/project-skill-lifecycle-wiring.test.mts`
- Modify: `web/src/app/(user)/projects/script-skill-selection.test.mts`

- [ ] **Step 1: Add static wiring tests for the new admin-only surface**

Update `skill-folder-import-view.test.mts` to assert only admin APIs remain:

```ts
assert.ok(source.includes("fetchAdminSkillSourceFiles"));
assert.ok(source.includes("importAdminSkillFolder"));
assert.doesNotMatch(source, /fetchProjectSkill|importProjectSkill|scope === "admin"/);
```

Update stage-group tests so the expected shape is `{ totalCount }` with no `systemCount` or `projectCount`.

- [ ] **Step 2: Make the TypeScript contract system-only**

```ts
export type SkillOwnerType = "system";
export type CreateSkillInput = SkillDraftInput & Pick<SkillDefinition, "name" | "summary">;
```

Move delete/archive calls to admin paths:

```ts
export function deleteAdminSkillVersion(token: string, id: string) {
    return apiDelete<void>(`${base}/skill-versions/${encodeURIComponent(id)}`, token);
}

export function archiveAdminSkillVersion(token: string, id: string) {
    return apiPost<SkillVersion>(`${base}/skill-versions/${encodeURIComponent(id)}/archive`, {}, token);
}
```

Simplify the upload fields so neither the browser nor multipart request can send ownership:

```ts
export type SkillFolderImportFields = {
    stageKey: string;
    name?: string;
    summary?: string;
    version?: string;
};
```

Delete `project-skills.ts` after all imports are gone.

- [ ] **Step 3: Collapse shared management components to admin APIs**

Change `SkillFolderImportProps` to:

```ts
type SkillFolderImportProps = { open: boolean; token: string; skillId?: string; previousVersionId?: string; onCancel: () => void; onImported: (skillId?: string, versionId?: string) => void };
```

Use `fetchAdminSkillStageTemplates`, `fetchAdminSkillSourceFiles`, `importAdminSkillFolder`, and `importAdminSkillFolderVersion` directly. Send new imports as:

```ts
importAdminSkillFolder(token, files, { stageKey, name: fields.name.trim(), summary: fields.summary.trim(), version: fields.version.trim() })
```

Apply the same admin-only simplification to `SkillSourceBrowser` and `SkillTrialPanel`.

- [ ] **Step 4: Remove owner filters and project badges from the admin Skill center**

Set the admin filter model to omit `ownerType`, remove the owner `Segmented`, remove project/system count tags, and render each card without an ownership badge. Simplify `SkillStageGroup` to:

```ts
export type SkillStageGroup = (typeof skillStageDefinitions)[number] & {
    items: SkillAdminItem[];
    totalCount: number;
};
```

The page header should explain the global scope:

```tsx
<Typography.Text type="secondary">全部 Skill 由管理员统一维护，发布后供所有账号和项目使用。</Typography.Text>
```

- [ ] **Step 5: Remove the project management entry and redirect old links**

Delete `onOpenSkillManagement` from `ProjectEpisodeBoardProps`, its caller in the project page, and the `Skill 管理` dropdown item. Keep the cache menu item.

Replace the old client page with a server redirect:

```tsx
import { redirect } from "next/navigation";

export default async function ProjectSkillsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/projects/${id}`);
}
```

Delete its private editor and obsolete lifecycle wiring test.

- [ ] **Step 6: Update script selection fixtures**

Keep the compatibility test focused on capability and Artifact contracts; replace the `projectSkill` fixture with a second `system` option and assert both compatible system versions are returned.

- [ ] **Step 7: Record frontend verification commands**

```bash
cd web && node --experimental-strip-types --test src/components/skills/skill-folder-import-view.test.mts src/components/skills/skill-stage-groups.test.mts src/app/'(admin)'/admin/skills/skill-view.test.mts src/app/'(user)'/projects/script-skill-selection.test.mts
cd web && npm run typecheck
```

Expected when explicitly authorized: tests and typecheck exit `0`. Do not run them by default under this repository's `AGENTS.md`.

### Task 4: Remove project-owner assumptions from workflow and agent routing

**Files:**
- Modify: `service/invocation_resolver.go`
- Modify: `service/invocation_resolver_test.go`
- Modify: `service/agent_registry.go`
- Modify: `service/agent_registry_test.go`
- Modify: `service/canvas_orchestrator_seed.go`
- Modify: `service/canvas_orchestrator_seed_test.go`
- Modify: `service/workflow_skill_binding.go`
- Modify: `service/workflow_skill_binding_test.go`
- Modify: `service/skill_test_helpers_test.go`
- Modify: `service/invocation_test_helpers_test.go`
- Modify: `service/invocation_preflight_test.go`
- Modify: `service/agent_plan_preflight_test.go`
- Modify: `service/workflow_route_preview_test.go`
- Modify: `service/skill_test.go`
- Modify: `service/skill_management_test.go`

- [ ] **Step 1: Add policy tests that reject the retired owner value**

```go
func TestAgentSkillAccessPolicyOnlyAcceptsSystemOwner(t *testing.T) {
	value, err := normalizeAgentAccessPolicy(AgentSkillAccessPolicy{AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerSystem}})
	if err != nil || len(value.AllowedOwnerTypes) != 1 { t.Fatalf("value=%+v err=%v", value, err) }
	if _, err := normalizeAgentAccessPolicy(AgentSkillAccessPolicy{AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerType("project")}}); err == nil {
		t.Fatal("retired project owner accepted")
	}
}
```

Update workflow binding tests to prove a system Skill can still bind to either `global` or a project-scoped consumer binding, while a legacy project-owned definition is rejected.

- [ ] **Step 2: Simplify invocation scoring**

Remove the project-owner bonus. Keep tag matching and recommendation preference:

```go
func invocationCandidateScore(input InvocationResolutionInput, candidate invocationCandidate) int {
	score := 0
	for _, tag := range input.ProjectTags {
		if containsInvocationString(candidate.manifest.ProjectTags, tag) { score += 100 }
	}
	if candidate.version.ID == candidate.skill.RecommendedVersionID { score += 20 }
	return score
}
```

Convert resolver test fixtures that represent valid candidates to `SkillOwnerSystem`; retain one explicit `model.SkillOwnerType("project")` fixture only to assert rejection.

- [ ] **Step 3: Restrict Agent policy normalization and seed a new immutable orchestrator version**

```go
if owner != model.SkillOwnerSystem {
	return value, safeMessageError{message: "Agent Skill 所有者范围无效"}
}
```

Change the canvas orchestrator seed constants to a new immutable version:

```go
const canvasOrchestratorVersionID = "agent-version-system-canvas-orchestrator-1.1.0"
```

Create it as version `1.1.0` with:

```go
SkillAccessPolicy: AgentSkillAccessPolicy{AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerSystem}},
```

The existing seed function will create and recommend the new version without mutating the old immutable package.

- [ ] **Step 4: Simplify workflow binding owner validation**

Preserve consumer binding scopes but require the selected Skill itself to be system-owned:

```go
if resolved.Skill.OwnerType != model.SkillOwnerSystem {
	return ResolvedSkill{}, safeMessageError{message: "Skill 所有者类型无效"}
}
```

Do not change `WorkflowStageSkillScopeProject`; it controls where a global Skill is selected as default, not Skill ownership.

- [ ] **Step 5: Record targeted routing verification commands**

```bash
go test ./service -run 'Test(AgentSkillAccessPolicyOnlyAcceptsSystemOwner|CanvasOrchestrator|WorkflowStageSkillBinding|InvocationResolver)' -count=1
```

Expected when explicitly authorized: exit `0`.

### Task 5: Convert current data without changing stable IDs

**Files:**
- Modify operationally: `data/infinite-canvas.db`

- [ ] **Step 1: Capture the exact rows to convert**

```bash
sqlite3 -header -column data/infinite-canvas.db "SELECT id,name,owner_type,owner_user_id,owner_project_id,recommended_version_id FROM skill_definitions WHERE owner_type <> 'system';"
```

Expected before conversion: `全家穿越-剧本优化` is listed with owner type `project`.

- [ ] **Step 2: Convert definitions in one transaction**

```bash
sqlite3 data/infinite-canvas.db "BEGIN IMMEDIATE; UPDATE skill_definitions SET owner_type='system', owner_user_id='', owner_project_id='', updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE owner_type <> 'system'; COMMIT;"
```

Do not change `skill_versions`, evaluations, workflow bindings, invocation records, or audit rows.

- [ ] **Step 3: Verify stable identities and the target contract**

```bash
sqlite3 -header -column data/infinite-canvas.db "SELECT d.id,d.name,d.owner_type,d.owner_user_id,d.owner_project_id,d.recommended_version_id,v.id AS version_id,v.version,v.status FROM skill_definitions d LEFT JOIN skill_versions v ON v.id=d.recommended_version_id WHERE d.name='全家穿越-剧本优化'; SELECT COUNT(*) AS non_system_count FROM skill_definitions WHERE owner_type <> 'system';"
```

Expected: owner type `system`, both owner IDs empty, original Skill/Version IDs unchanged, recommended version still `published`, and `non_system_count = 0`.

### Task 6: Update current documentation and pending-test scope

**Files:**
- Modify: `docs/backend-database.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update database semantics**

Replace the `skill_definitions` description with:

```markdown
通用 Skill 稳定身份表。当前只允许 `system` 所有者；`owner_user_id` 与 `owner_project_id` 保持为空。所有 Skill 由管理员统一管理，已启用、已发布且契约匹配的版本对所有登录账号和项目可见。Definition、Version、评测、审计与运行引用继续以稳定 ID 关联。
```

- [ ] **Step 2: Retire superseded todo and pending-test language**

In `docs/todo.md`, replace Project Skill copy/management claims in Phase 1 and Phase 5 with administrator-only global Skill management and project-side version selection.

In `docs/pending-test.md`, remove or rewrite active checks that instruct users to create, copy, edit, delete, or isolate Project Skills. Add one consolidated pending-test item:

```markdown
- Skill 取消项目专属归属：后台 Skill 中心是唯一管理入口，所有已启用、已发布且契约匹配的系统 Skill 对所有账号和项目可见；项目详情不再提供 Skill 管理入口，旧 `/projects/:id/skills` 地址返回项目详情。
- 当前“全家穿越-剧本优化”已保留原 Skill ID、推荐 Version ID、评测和运行引用并转换为系统 Skill，可在任意项目的剧本优化选择框中使用。
- 人工验收：分别用两个账号打开两个项目，确认剧本优化候选一致且包含“全家穿越-剧本优化”；普通用户无法调用旧项目 Skill 写接口；管理员仍可在后台导入、试跑、发布、推荐、停用和删除符合条件的草稿版本。
```

- [ ] **Step 3: Add an Unreleased version-level summary**

```markdown
+ [调整] Skill 取消项目专属归属，统一由管理员全局维护并供所有账号和项目使用；项目侧管理入口和写接口同步移除。
```

Do not update `docs/features.md` until the user confirms the behavior in the running application.

### Task 7: Final consistency review and optional verification

**Files:**
- Review only: all files changed by Tasks 1–6

- [ ] **Step 1: Search for active project-Skill product language**

```bash
rg -n "SkillOwnerProject|项目 Skill|Project Skill|copySystemSkillToProject|project-skills" model repository service handler router web/src docs/todo.md docs/pending-test.md docs/backend-database.md CHANGELOG.md
```

Expected: no production-code hits; historical specs/plans and retained historical audit values may still mention the retired concept.

- [ ] **Step 2: Review the exact diff without modifying unrelated dirty files**

```bash
git diff -- model/skill.go repository/skill.go repository/skill_test.go service/skill.go service/skill_management.go service/skill_folder_import.go service/invocation_resolver.go service/agent_registry.go service/canvas_orchestrator_seed.go service/workflow_skill_binding.go handler/admin_skill.go handler/project_skill.go router/router.go web/src/services/api/admin-skills.ts web/src/services/api/project-skills.ts web/src/components/skills web/src/app/'(admin)'/admin/skills web/src/app/'(user)'/projects/'[id]' docs/backend-database.md docs/todo.md docs/pending-test.md CHANGELOG.md
```

Expected: only global Skill changes plus pre-existing user edits in overlapping files; no unrelated reformat or rollback.

- [ ] **Step 3: If the user explicitly requests comprehensive verification, run the full checks**

```bash
go test ./...
cd web && npm test
cd web && npm run typecheck
```

Expected: all commands exit `0`. Do not run build or these full checks without explicit user authorization, per `AGENTS.md`.

- [ ] **Step 4: Restart services and perform focused browser verification**

After implementation, restart the existing Go and Next.js development processes. Open the current project and verify the “剧本优化 Skill” selector contains `全家穿越-剧本优化`; open `/admin/skills` and verify there is no project owner filter or badge; open the old `/projects/VQo7X056iuIyr6KOjsn2Y/skills` URL and verify it returns to the project page.
