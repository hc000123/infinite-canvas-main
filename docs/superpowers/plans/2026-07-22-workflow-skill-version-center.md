# Workflow Skill Version Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a database-backed six-stage Skill registry with immutable versions, contracts, dry-run evaluation, project canary bindings, global promotion, rollback, and Agent Run snapshots.

**Architecture:** Go owns Skill content, validation, stage resolution, publication transactions, evaluation records, and immutable run snapshots. The Next.js admin page calls authenticated admin APIs; workflow users only receive active Skill summaries. Existing hard quality gates remain code-owned and cannot be overridden by Skill text.

**Tech Stack:** Go, Gin, GORM, SQLite, Next.js App Router, React, TypeScript, Ant Design.

---

### Task 1: Persist Skill packages, versions, bindings, evaluations, and run snapshots

**Files:**
- Create: `model/workflow_skill.go`
- Modify: `model/agent_run.go`
- Modify: `repository/db.go`
- Modify: `docs/backend-database.md`
- Test: `repository/workflow_skill_test.go`

- [ ] **Step 1: Write the failing repository test**

```go
func TestWorkflowSkillVersionAndScopedBinding(t *testing.T) {
    resetRepositoryTestDB(t)
    skill := model.WorkflowSkill{ID: "skill-art", Name: "服化道", StageKey: "art", Enabled: true}
    version := model.WorkflowSkillVersion{ID: "skillver-art-1", SkillID: skill.ID, Version: "1.0.0", Status: model.WorkflowSkillVersionPublished, ContentHash: "hash-1"}
    if err := CreateWorkflowSkillAggregate(skill, version); err != nil { t.Fatal(err) }
    if err := SaveWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "binding-project", StageKey: "art", Scope: "project", ScopeID: "project-1", SkillVersionID: version.ID}); err != nil { t.Fatal(err) }
    resolved, ok, err := ResolveWorkflowStageSkillBinding("art", "project-1")
    if err != nil || !ok || resolved.SkillVersionID != version.ID { t.Fatalf("resolved=%+v ok=%v err=%v", resolved, ok, err) }
}
```

- [ ] **Step 2: Run the test and verify the missing types fail**

Run: `go test ./repository -run TestWorkflowSkillVersionAndScopedBinding -count=1`
Expected: FAIL because the workflow Skill models and repository functions do not exist.

- [ ] **Step 3: Add the exact persisted records**

```go
type WorkflowSkillVersionStatus string
const (
    WorkflowSkillVersionDraft WorkflowSkillVersionStatus = "draft"
    WorkflowSkillVersionPublished WorkflowSkillVersionStatus = "published"
    WorkflowSkillVersionArchived WorkflowSkillVersionStatus = "archived"
)
type WorkflowSkill struct { ID, Name, Description, StageKey, CreatedAt, UpdatedAt string; Enabled bool }
type WorkflowSkillVersion struct { ID, SkillID, Version, Status, FilesJSON, ContractJSON, ContentHash, CreatedBy, PublishedAt, CreatedAt, UpdatedAt string }
type WorkflowStageSkillBinding struct { ID, StageKey, Scope, ScopeID, SkillVersionID, CreatedAt, UpdatedAt string }
type WorkflowSkillEvaluation struct { ID, SkillVersionID, BaselineVersionID, ProjectID, EpisodeID, InputHash, InputSnapshotJSON, ImageManifestJSON, ResultJSON, DiffJSON, GateJSON, Status, ErrorMessage, CreatedBy, CreatedAt, UpdatedAt string; DurationMs int64 }
```

Add `Executor`, `SkillID`, `SkillVersionID`, `SkillVersion`, `SkillContentHash`, `SkillSnapshotJSON`, and `ImageManifestJSON` string fields to `model.AgentRun`. Auto-migrate all new records in `repository/db.go` and document every column in `docs/backend-database.md`.

- [ ] **Step 4: Implement scoped resolution**

`ResolveWorkflowStageSkillBinding(stageKey, projectID)` must first query `(stageKey, project, projectID)`, then `(stageKey, global, "")`. Add unique indexes for `(stage_key, scope, scope_id)` and `(skill_id, version)`.

- [ ] **Step 5: Run repository tests**

Run: `go test ./repository -run 'TestWorkflowSkill' -count=1`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add model/workflow_skill.go model/agent_run.go repository/db.go repository/workflow_skill_test.go docs/backend-database.md
git commit -m "feat: persist workflow skill versions"
```

### Task 2: Validate contracts, publish immutably, resolve bindings, and seed six stages

**Files:**
- Create: `repository/workflow_skill.go`
- Create: `service/workflow_skill.go`
- Create: `service/workflow_skill_seed.go`
- Test: `service/workflow_skill_test.go`

- [ ] **Step 1: Write service tests for publication and rollback**

```go
func TestPublishWorkflowSkillRequiresPassingEvaluation(t *testing.T) {
    fixture := newWorkflowSkillFixture(t, "storyboard")
    _, err := PublishWorkflowSkillVersion("admin-1", fixture.draft.ID, WorkflowSkillPublishInput{Scope: "project", ScopeID: "project-1"})
    if err == nil || !strings.Contains(err.Error(), "通过评测") { t.Fatalf("err=%v", err) }
}
func TestResolveWorkflowSkillPrefersProjectBinding(t *testing.T) {
    fixture := newPublishedWorkflowSkillFixture(t, "art")
    resolved, err := ResolvePublishedWorkflowSkill("art", fixture.projectID)
    if err != nil || resolved.Version.ID != fixture.projectVersion.ID { t.Fatalf("resolved=%+v err=%v", resolved, err) }
}
```

- [ ] **Step 2: Run and verify failure**

Run: `go test ./service -run 'TestPublishWorkflowSkill|TestResolveWorkflowSkill' -count=1`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the contract type and validator**

```go
type WorkflowSkillContract struct {
    RequiredInputs []string `json:"requiredInputs"`
    ImagePolicy struct { Required bool `json:"required"`; Min int `json:"min"`; Max int `json:"max"`; AllowTextFallback bool `json:"allowTextFallback"`; AllowedTypes []string `json:"allowedTypes"` } `json:"imagePolicy"`
    OutputSchemaVersion string `json:"outputSchemaVersion"`
    OutputSchema map[string]any `json:"outputSchema"`
    QualityGateProfile []string `json:"qualityGateProfile"`
    ApplyTargets []string `json:"applyTargets"`
}
```

Reject unknown stage keys, image max above 9, executable file extensions, absolute or parent-relative logical paths, unknown quality gates, unknown apply targets, missing `SKILL.md`, and incompatible schema majors.

- [ ] **Step 4: Implement immutable publication**

Publication must re-hash normalized files and contract, require a passed evaluation with the same content hash for `script`, `art`, and `storyboard`, then transactionally mark the draft published, update the scoped binding, and save an admin audit log. Published and archived versions must reject edits.

- [ ] **Step 5: Seed six global bindings**

Create idempotent initial packages for `script`, `art`, `assets`, `storyboard`, `video`, and `delivery` from the current server prompt rules. Seed only when the stable Skill ID/version is missing; never overwrite an administrator-published version.

- [ ] **Step 6: Run tests and commit**

Run: `go test ./service -run 'Test.*WorkflowSkill' -count=1`
Expected: PASS.

```bash
git add repository/workflow_skill.go service/workflow_skill.go service/workflow_skill_seed.go service/workflow_skill_test.go
git commit -m "feat: add workflow skill publication rules"
```

### Task 3: Expose admin Skill and binding APIs

**Files:**
- Create: `handler/admin_workflow_skill.go`
- Modify: `router/router.go`
- Modify: `service/admin_audit.go`
- Test: `handler/admin_workflow_skill_test.go`
- Test: `router/router_test.go`

- [ ] **Step 1: Write authorization and immutable-version tests**

```go
func TestWorkflowSkillAdminEndpointsRejectNonAdmin(t *testing.T) {
    request := authenticatedRequest(t, http.MethodGet, "/api/v1/admin/workflow-skills", "user-token", nil)
    response := serveRequest(request)
    if response.Code != http.StatusForbidden { t.Fatalf("status=%d", response.Code) }
}
func TestPublishedWorkflowSkillCannotBePatched(t *testing.T) {
    response := adminJSON(t, http.MethodPatch, "/api/v1/admin/workflow-skill-versions/published-1", map[string]any{"files": map[string]string{"SKILL.md":"changed"}})
    assertAPIErrorContains(t, response, "已发布版本不可修改")
}
```

- [ ] **Step 2: Add admin routes**

Register the exact endpoints from the design under the existing admin middleware. Handlers only decode bounded JSON, call service methods, and return `OK` / `FailError`.

- [ ] **Step 3: Run handler and router tests**

Run: `go test ./handler ./router -run 'Test.*WorkflowSkill' -count=1`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add handler/admin_workflow_skill.go handler/admin_workflow_skill_test.go router/router.go router/router_test.go service/admin_audit.go
git commit -m "feat: expose workflow skill admin api"
```

### Task 4: Freeze Skill snapshots into Agent Runs

**Files:**
- Modify: `service/video_workflow.go`
- Modify: `service/agent_run.go`
- Modify: `service/agent_run_worker.go`
- Modify: `service/video_workflow_operations.go`
- Test: `service/video_workflow_skill_snapshot_test.go`

- [ ] **Step 1: Write snapshot stability tests**

```go
func TestWorkflowStageFreezesPublishedSkillSnapshot(t *testing.T) {
    fixture := newWorkflowStageFixture(t, "art")
    first, err := StartWorkflowStage(fixture.userID, fixture.workflowID, "art", "start-1", "")
    if err != nil { t.Fatal(err) }
    publishReplacementSkill(t, "art", fixture.projectID, "2.0.0")
    run := mustAgentRun(t, first.AgentRunID)
    if run.SkillVersion != "1.0.0" || run.SkillContentHash == "" { t.Fatalf("run=%+v", run) }
}
```

- [ ] **Step 2: Resolve and freeze Skill before enqueue**

Extend `StartWorkflowStage` to resolve the project/global binding, normalize the package, append its instructions to the server prompt, and populate the new Agent Run snapshot fields. Retry keeps the snapshot; a new explicit restart flag resolves the newest version.

- [ ] **Step 3: Include read-only summaries**

Workflow detail and Worker events may return Skill ID, name, version, and hash, but must omit full draft content and server file paths.

- [ ] **Step 4: Run tests and commit**

Run: `go test ./service -run 'TestWorkflowStage.*Skill|TestAgentRunWorker' -count=1`
Expected: PASS.

```bash
git add service/video_workflow.go service/agent_run.go service/agent_run_worker.go service/video_workflow_operations.go service/video_workflow_skill_snapshot_test.go
git commit -m "feat: freeze workflow skill snapshots"
```

### Task 5: Add dry-run evaluation, comparison, project canary, and global promotion

**Files:**
- Create: `service/workflow_skill_evaluation.go`
- Create: `repository/workflow_skill_evaluation.go`
- Modify: `handler/admin_workflow_skill.go`
- Test: `service/workflow_skill_evaluation_test.go`

- [ ] **Step 1: Write dry-run isolation and comparison tests**

```go
func TestWorkflowSkillEvaluationNeverWritesBusinessData(t *testing.T) {
    fixture := newWorkflowSkillEvaluationFixture(t)
    before := fixture.businessCounts(t)
    evaluation, err := EvaluateWorkflowSkill("admin-1", fixture.version.ID, fixture.input())
    if err != nil || evaluation.Status != "passed" { t.Fatalf("evaluation=%+v err=%v", evaluation, err) }
    if after := fixture.businessCounts(t); after != before { t.Fatalf("before=%+v after=%+v", before, after) }
}
func TestWorkflowSkillComparisonUsesSameInputHash(t *testing.T) {
    comparison := mustCompareWorkflowSkills(t)
    if comparison.CandidateInputHash != comparison.BaselineInputHash { t.Fatalf("comparison=%+v", comparison) }
}
```

- [ ] **Step 2: Implement evaluation records and structured diff**

Freeze script, upstream artifact, image manifest, candidate, and baseline under one input hash. Execute both sides without WorkflowStageRun creation or apply calls. Diff schema keys, item counts, durations, image references, quality gates, and new blockers.

- [ ] **Step 3: Implement canary and promotion transaction**

Project publication writes a project binding. Global promotion requires a passed canary evaluation for the same content hash and writes only the global binding. Project and global rollback update their own binding independently.

- [ ] **Step 4: Run tests and commit**

Run: `go test ./service ./repository -run 'TestWorkflowSkillEvaluation|TestWorkflowSkillComparison|TestWorkflowSkill.*Canary' -count=1`
Expected: PASS.

```bash
git add service/workflow_skill_evaluation.go repository/workflow_skill_evaluation.go handler/admin_workflow_skill.go service/workflow_skill_evaluation_test.go
git commit -m "feat: evaluate and canary workflow skills"
```

### Task 6: Build the admin Workflow Skill page

**Files:**
- Create: `web/src/services/api/admin-workflow-skills.ts`
- Create: `web/src/app/(admin)/admin/workflow-skills/page.tsx`
- Create: `web/src/app/(admin)/admin/workflow-skills/components/workflow-skill-editor.tsx`
- Create: `web/src/app/(admin)/admin/workflow-skills/components/workflow-skill-evaluation.tsx`
- Modify: `web/src/app/(admin)/admin/layout.tsx`
- Test: `web/src/app/(admin)/admin/workflow-skills/workflow-skill-view.test.mts`

- [ ] **Step 1: Add pure view-state tests**

```ts
test("project binding wins over global binding", () => {
  assert.equal(resolveBindingLabel({ global: "1.0.0", project: "1.1.0" }), "项目灰度 · 1.1.0");
});
test("publish is blocked when content hash has no passed evaluation", () => {
  assert.equal(canPublishSkill({ stageKey: "art", contentHash: "new", passedEvaluationHash: "old" }), false);
});
```

- [ ] **Step 2: Implement the API client and page**

The page contains six stage cards, a version list, Markdown/JSON text-file editor, contract form, validation results, dry-run project/episode selector, baseline comparison, project publish, global promotion, and scoped rollback. Use the existing admin theme and Ant Design components; do not add model settings controls.

- [ ] **Step 3: Add navigation and run checks**

Run: `cd web && npm test && npm run typecheck`
Expected: all tests and TypeScript pass.

- [ ] **Step 4: Commit**

```bash
git add web/src/services/api/admin-workflow-skills.ts web/src/app/'(admin)'/admin/workflow-skills web/src/app/'(admin)'/admin/layout.tsx
git commit -m "feat: add workflow skill admin center"
```
