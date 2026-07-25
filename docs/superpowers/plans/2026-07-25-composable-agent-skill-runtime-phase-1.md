# Composable Agent + Skill Runtime Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed six-stage Workflow Skill subsystem with a general Skill Registry while keeping the current production workflow operational through explicit stage-to-Skill-Version bindings.

**Architecture:** Store stable `SkillDefinition` records separately from immutable `SkillVersion` records, with a compact searchable `SkillManifest` and normalized package contracts. Keep workflow stage bindings as a consumer-owned relation that points to generic Skill versions, seed the existing 3.0.1 packages as system Skills, and expose one `/api/v1/admin/skills` center without retaining the old Workflow Skill model or API. Phase 1 reuses the current evaluation executor for admin trial runs; the general Artifact/Invocation Runtime remains Phase 2.

**Tech Stack:** Go, Gin, GORM, SQLite test databases, JSON Schema, Next.js App Router, React, TypeScript, Ant Design, TanStack Query, Node test runner.

---

## Locked file structure

Backend ownership after this phase:

- `model/skill.go`: generic Skill definition, immutable version, evaluation, and audit records.
- `model/workflow_skill_binding.go`: the only workflow-specific Skill model; maps a workflow stage and scope to a generic Skill version.
- `repository/skill.go`: generic Skill CRUD, version, recommendation, evaluation, and audit queries.
- `repository/workflow_skill_binding.go`: workflow-stage binding resolution only.
- `service/skill.go`: admin list, draft, publish, recommendation, and generic version resolution.
- `service/skill_manifest.go`: manifest and semantic-version validation.
- `service/skill_package.go`: package normalization, decoding, stable hashing, and instruction assembly.
- `service/skill_seed.go`: embeds the six 3.0.1 system packages and registers their manifests.
- `service/skill_evaluation.go`: current dry-run evaluator generalized to a Skill version.
- `service/workflow_skill_binding.go`: verifies stage capability and resolves an exact override before project/global stage bindings.
- `handler/admin_skill.go`: generic Skill Center HTTP handlers.
- `handler/skill.go`: authenticated read-only Skill options endpoint for workflow consumers.
- `web/src/services/api/admin-skills.ts`: generic Skill Center API types and calls.
- `web/src/app/(admin)/admin/skills/`: generic Skill Center page, editor, evaluation panel, and pure view helpers.

The following old fixed-stage files are removed only after all call sites use the new names:

- `model/workflow_skill.go`
- `repository/workflow_skill.go`
- `service/workflow_skill.go`
- `service/workflow_skill_contract.go`
- `service/workflow_skill_package.go`
- `service/workflow_skill_seed.go`
- `service/workflow_skill_evaluation.go`
- `handler/admin_workflow_skill.go`
- `web/src/services/api/admin-workflow-skills.ts`
- `web/src/app/(admin)/admin/workflow-skills/`

## Fixed domain contract

Use these exact generic concepts throughout all tasks:

```go
type SkillOwnerType string
type SkillVersionStatus string

const (
	SkillOwnerSystem  SkillOwnerType = "system"
	SkillOwnerProject SkillOwnerType = "project"

	SkillVersionDraft     SkillVersionStatus = "draft"
	SkillVersionPublished SkillVersionStatus = "published"
	SkillVersionArchived  SkillVersionStatus = "archived"
)
```

`SkillManifest` is the only routing/search document. Full instructions stay in `Files`; input and output validation stay in their contracts.

```go
type SkillManifest struct {
	Capabilities        []string          `json:"capabilities"`
	InputArtifactTypes  []string          `json:"inputArtifactTypes"`
	OutputArtifactTypes []string          `json:"outputArtifactTypes"`
	ProjectTags         []string          `json:"projectTags"`
	SchemaCompatibility map[string]string `json:"schemaCompatibility"`
	SideEffects         []string          `json:"sideEffects"`
	EstimatedCostClass  string            `json:"estimatedCostClass"`
}
```

Workflow compatibility is declared with one capability per production stage:

| Stage key | Required capability | Input artifact types | Output artifact type |
| --- | --- | --- | --- |
| `script` | `workflow.stage.script` | `source_text` | `production_script` |
| `art` | `workflow.stage.art` | `production_script` | `asset_catalog` |
| `assets` | `workflow.stage.assets` | `asset_catalog` | `asset_brief` |
| `storyboard` | `workflow.stage.storyboard` | `production_script`, `asset_catalog` | `storyboard_package` |
| `video` | `workflow.stage.video` | `storyboard_package`, `asset_catalog`, `asset_rendition` | `video_prompt_package` |
| `delivery` | `workflow.stage.delivery` | `video_prompt_package` | `delivery_report` |

Phase 1 deliberately does not create `Artifact`, `InvocationRun`, `AgentDefinition`, or `WorkflowDefinition` tables. It keeps the current workflow artifact payload and execution path unchanged while replacing only Skill identity, versioning, routing metadata, and management surfaces.

### Task 1: Add generic Skill models and migrate only the new tables

**Files:**
- Create: `model/skill.go`
- Create: `model/workflow_skill_binding.go`
- Modify: `repository/db.go:54-78`
- Create: `repository/skill_migration_test.go`

- [ ] **Step 1: Write the failing migration test**

```go
package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestSkillRegistryTablesMigrate(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []any{
		&model.SkillDefinition{},
		&model.SkillVersion{},
		&model.SkillEvaluation{},
		&model.SkillAuditLog{},
		&model.WorkflowStageSkillBinding{},
	} {
		if !db.Migrator().HasTable(item) {
			t.Fatalf("missing table %T", item)
		}
	}
}
```

- [ ] **Step 2: Run the migration test and verify the generic types are missing**

Run: `go test ./repository -run TestSkillRegistryTablesMigrate -count=1`

Expected: FAIL to compile with `undefined: model.SkillDefinition`.

- [ ] **Step 3: Add the generic records and isolate the workflow binding**

```go
package model

type SkillOwnerType string
type SkillVersionStatus string

const (
	SkillOwnerSystem  SkillOwnerType = "system"
	SkillOwnerProject SkillOwnerType = "project"
	SkillVersionDraft     SkillVersionStatus = "draft"
	SkillVersionPublished SkillVersionStatus = "published"
	SkillVersionArchived  SkillVersionStatus = "archived"
)

type SkillDefinition struct {
	ID                   string         `json:"id" gorm:"primaryKey"`
	Name                 string         `json:"name" gorm:"index;uniqueIndex:idx_skill_owner_name,priority:3"`
	Summary              string         `json:"summary" gorm:"type:text"`
	OwnerType            SkillOwnerType `json:"ownerType" gorm:"index;uniqueIndex:idx_skill_owner_name,priority:1"`
	OwnerProjectID       string         `json:"ownerProjectId" gorm:"index;uniqueIndex:idx_skill_owner_name,priority:2"`
	Enabled              bool           `json:"enabled" gorm:"index"`
	RecommendedVersionID string         `json:"recommendedVersionId" gorm:"index"`
	CreatedAt            string         `json:"createdAt"`
	UpdatedAt            string         `json:"updatedAt"`
}

type SkillVersion struct {
	ID                       string             `json:"id" gorm:"primaryKey"`
	SkillID                  string             `json:"skillId" gorm:"index;uniqueIndex:idx_skill_version,priority:1"`
	Version                  string             `json:"version" gorm:"uniqueIndex:idx_skill_version,priority:2"`
	Status                   SkillVersionStatus `json:"status" gorm:"index"`
	ManifestJSON             string             `json:"-" gorm:"type:text"`
	FilesJSON                string             `json:"-" gorm:"type:text"`
	InputContractJSON        string             `json:"-" gorm:"type:text"`
	OutputContractJSON       string             `json:"-" gorm:"type:text"`
	QualityGateProfileJSON   string             `json:"-" gorm:"type:text"`
	ContentHash              string             `json:"contentHash" gorm:"index"`
	EvaluationSummaryJSON    string             `json:"evaluationSummaryJson" gorm:"type:text"`
	CreatedBy                string             `json:"createdBy" gorm:"index"`
	PublishedAt              string             `json:"publishedAt"`
	CreatedAt                string             `json:"createdAt"`
	UpdatedAt                string             `json:"updatedAt"`
}

type SkillEvaluation struct {
	ID                string `json:"id" gorm:"primaryKey"`
	SkillVersionID    string `json:"skillVersionId" gorm:"index"`
	BaselineVersionID string `json:"baselineVersionId" gorm:"index"`
	ContentHash       string `json:"contentHash" gorm:"index"`
	ProjectID         string `json:"projectId" gorm:"index"`
	EpisodeID         string `json:"episodeId" gorm:"index"`
	InputHash         string `json:"inputHash" gorm:"index"`
	InputSnapshotJSON string `json:"-" gorm:"type:text"`
	ImageManifestJSON string `json:"-" gorm:"type:text"`
	ResultJSON        string `json:"resultJson" gorm:"type:text"`
	DiffJSON          string `json:"diffJson" gorm:"type:text"`
	GateJSON          string `json:"gateJson" gorm:"type:text"`
	Status            string `json:"status" gorm:"index"`
	ErrorMessage      string `json:"errorMessage" gorm:"type:text"`
	DurationMs        int64  `json:"durationMs"`
	CreatedBy         string `json:"createdBy" gorm:"index"`
	CreatedAt         string `json:"createdAt"`
	UpdatedAt         string `json:"updatedAt"`
}

type SkillAuditLog struct {
	ID             string `json:"id" gorm:"primaryKey"`
	AdminID        string `json:"adminId" gorm:"index"`
	Action         string `json:"action" gorm:"index"`
	Scope          string `json:"scope" gorm:"index"`
	ScopeID        string `json:"scopeId" gorm:"index"`
	SkillVersionID string `json:"skillVersionId" gorm:"index"`
	DetailJSON     string `json:"detailJson" gorm:"type:text"`
	CreatedAt      string `json:"createdAt" gorm:"index"`
}
```

In `model/workflow_skill_binding.go`, retain only:

```go
package model

const (
	WorkflowSkillScopeGlobal  = "global"
	WorkflowSkillScopeProject = "project"
)

type WorkflowStageSkillBinding struct {
	ID             string `json:"id" gorm:"primaryKey"`
	StageKey       string `json:"stageKey" gorm:"index;uniqueIndex:idx_workflow_skill_binding,priority:1"`
	Scope          string `json:"scope" gorm:"index;uniqueIndex:idx_workflow_skill_binding,priority:2"`
	ScopeID        string `json:"scopeId" gorm:"index;uniqueIndex:idx_workflow_skill_binding,priority:3"`
	SkillVersionID string `json:"skillVersionId" gorm:"index"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}
```

Replace the five old workflow Skill migration entries in `repository/db.go` with the five generic/binding entries from the test. Do not add table-copy or old-table cleanup logic because the project is not released and system Skills are rebuilt from seeds.

- [ ] **Step 4: Run the migration test and all repository tests**

Run: `go test ./repository -run 'TestSkillRegistryTablesMigrate|TestWorkflow' -count=1`

Expected: PASS; existing workflow repository tests may still compile against old types until Task 2 removes them.

- [ ] **Step 5: Commit the model boundary**

```bash
git add model/skill.go model/workflow_skill_binding.go repository/db.go repository/skill_migration_test.go
git commit -m "feat: add generic skill registry models"
```

### Task 2: Implement generic Skill repository queries

**Files:**
- Create: `repository/skill.go`
- Create: `repository/skill_test.go`
- Create: `repository/workflow_skill_binding.go`
- Modify: `repository/workflow_skill_test.go`

- [ ] **Step 1: Write failing tests for owner filtering, recommendation, and binding precedence**

```go
func TestListVisibleSkillDefinitionsIncludesSystemAndProject(t *testing.T) {
	setupRepositoryTestDB(t)
	for _, skill := range []model.SkillDefinition{
		{ID: "system", Name: "系统技能", OwnerType: model.SkillOwnerSystem, Enabled: true},
		{ID: "project-1", Name: "项目技能", OwnerType: model.SkillOwnerProject, OwnerProjectID: "p1", Enabled: true},
		{ID: "project-2", Name: "其他项目", OwnerType: model.SkillOwnerProject, OwnerProjectID: "p2", Enabled: true},
	} {
		if err := CreateSkillDefinition(skill); err != nil { t.Fatal(err) }
	}
	items, err := ListVisibleSkillDefinitions("p1")
	if err != nil { t.Fatal(err) }
	if len(items) != 2 || items[0].ID != "system" || items[1].ID != "project-1" {
		t.Fatalf("items=%+v", items)
	}
}

func TestSetRecommendedSkillVersionIsAtomic(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "skill-1", Name: "分镜", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{ID: "version-1", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
	if err := CreateSkillAggregate(skill, version); err != nil { t.Fatal(err) }
	version.Status = model.SkillVersionPublished
	if err := PublishSkillVersionWithAudit(version, model.SkillAuditLog{ID: "audit-publish"}); err != nil { t.Fatal(err) }
	if err := SetRecommendedSkillVersionWithAudit(skill.ID, version.ID, version.UpdatedAt, model.SkillAuditLog{ID: "audit-recommend"}); err != nil { t.Fatal(err) }
	stored, ok, err := GetSkillDefinition(skill.ID)
	if err != nil || !ok || stored.RecommendedVersionID != version.ID { t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err) }
}
```

Rename the old binding test to `TestWorkflowStageSkillBindingPrecedence`, create a generic `SkillDefinition` and `SkillVersion`, then retain the existing project-first assertion for `ResolveWorkflowStageSkillBinding("art", "project-1")`.

- [ ] **Step 2: Run repository tests and verify missing functions**

Run: `go test ./repository -run 'Test(ListVisibleSkillDefinitions|SetRecommendedSkillVersion|WorkflowStageSkillBindingPrecedence)' -count=1`

Expected: FAIL to compile with `undefined: CreateSkillDefinition`, `undefined: PublishSkillVersionWithAudit`, and `undefined: SetRecommendedSkillVersionWithAudit`.

- [ ] **Step 3: Implement focused generic queries and transactions**

`repository/skill.go` must expose these exact functions:

```go
func CreateSkillDefinition(skill model.SkillDefinition) error
func CreateSkillAggregate(skill model.SkillDefinition, version model.SkillVersion) error
func GetSkillDefinition(id string) (model.SkillDefinition, bool, error)
func ListSkillDefinitions() ([]model.SkillDefinition, error)
func ListVisibleSkillDefinitions(projectID string) ([]model.SkillDefinition, error)
func SaveSkillDefinition(skill model.SkillDefinition) error
func CreateSkillVersion(version model.SkillVersion) error
func SaveSkillVersion(version model.SkillVersion) error
func GetSkillVersion(id string) (model.SkillVersion, bool, error)
func GetSkillWithVersion(versionID string) (model.SkillDefinition, model.SkillVersion, bool, error)
func ListSkillVersions(skillID string) ([]model.SkillVersion, error)
func PublishSkillVersionWithAudit(version model.SkillVersion, audit model.SkillAuditLog) error
func SetRecommendedSkillVersionWithAudit(skillID, versionID, updatedAt string, audit model.SkillAuditLog) error
func CreateSkillEvaluation(evaluation model.SkillEvaluation) error
func CreateSkillEvaluationAndUpdateSummary(evaluation model.SkillEvaluation, summaryJSON, updatedAt string) error
func GetSkillEvaluation(id string) (model.SkillEvaluation, bool, error)
func ListSkillEvaluations(versionID string) ([]model.SkillEvaluation, error)
func HasPassingSkillEvaluation(versionID, contentHash string) (bool, error)
func HasSkillProjectCanary(versionID, contentHash string) (bool, error)
func CreateSkillAuditLog(audit model.SkillAuditLog) error
func ListSkillAuditLogs(skillVersionIDs []string) ([]model.SkillAuditLog, error)
```

Use this visibility query and transaction boundary:

```go
func ListVisibleSkillDefinitions(projectID string) ([]model.SkillDefinition, error) {
	db, err := DB()
	if err != nil { return nil, err }
	var items []model.SkillDefinition
	err = db.Where("owner_type = ? OR (owner_type = ? AND owner_project_id = ?)",
		model.SkillOwnerSystem, model.SkillOwnerProject, strings.TrimSpace(projectID)).
		Order("owner_type desc, name asc").Find(&items).Error
	return items, err
}

func PublishSkillVersionWithAudit(version model.SkillVersion, audit model.SkillAuditLog) error {
	db, err := DB()
	if err != nil { return err }
	return db.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.SkillVersion{}).Where("id = ? AND status = ?", version.ID, model.SkillVersionDraft).
			Updates(map[string]any{"status": model.SkillVersionPublished, "published_at": version.PublishedAt, "updated_at": version.UpdatedAt})
		if result.Error != nil { return result.Error }
		if result.RowsAffected != 1 { return errors.New("Skill 版本状态已变化") }
		return tx.Create(&audit).Error
	})
}

func SetRecommendedSkillVersionWithAudit(skillID, versionID, updatedAt string, audit model.SkillAuditLog) error {
	db, err := DB()
	if err != nil { return err }
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.SkillDefinition{}).Where("id = ?", skillID).
			Updates(map[string]any{"recommended_version_id": versionID, "updated_at": updatedAt}).Error; err != nil { return err }
		return tx.Create(&audit).Error
	})
}
```

Move binding-only functions into `repository/workflow_skill_binding.go`: `SaveWorkflowStageSkillBinding`, `UpsertWorkflowStageSkillBinding`, `ResolveWorkflowStageSkillBinding`, `ListWorkflowStageSkillBindings`, and the audited upsert transaction.

- [ ] **Step 4: Run repository tests**

Run: `go test ./repository -run 'Test(Skill|WorkflowStageSkillBindingPrecedence)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit repository generalization**

```bash
git add repository/skill.go repository/skill_test.go repository/workflow_skill_binding.go repository/workflow_skill_test.go
git commit -m "feat: add generic skill repository"
```

### Task 3: Normalize Manifest, contracts, package files, and content hashes

**Files:**
- Create: `service/skill_manifest.go`
- Create: `service/skill_package.go`
- Create: `service/skill_package_test.go`

- [ ] **Step 1: Write failing package-contract tests**

```go
func TestNormalizeSkillPackageProducesStableHash(t *testing.T) {
	input := SkillPackage{
		Manifest: SkillManifest{
			Capabilities: []string{"asset.character.rendition"},
			InputArtifactTypes: []string{"asset_record"},
			OutputArtifactTypes: []string{"asset_brief"},
			SchemaCompatibility: map[string]string{"asset_record": ">=1.0 <2.0"},
			SideEffects: []string{"none"}, EstimatedCostClass: "text_low",
		},
		Files: map[string]string{"rules/domain-rules.md": "规则", "SKILL.md": "主说明"},
		InputContract: SkillInputContract{RequiredInputs: []string{"asset_record"}},
		OutputContract: SkillOutputContract{SchemaVersion: "1.0.0", Schema: map[string]any{"type": "object"}},
		QualityGateProfile: []string{"schema", "asset"},
	}
	first, err := NormalizeSkillPackage(input)
	if err != nil { t.Fatal(err) }
	second, err := NormalizeSkillPackage(input)
	if err != nil { t.Fatal(err) }
	if first.ContentHash == "" || first.ContentHash != second.ContentHash { t.Fatalf("first=%q second=%q", first.ContentHash, second.ContentHash) }
}

func TestNormalizeSkillPackageRejectsInvalidManifest(t *testing.T) {
	input := validSkillTestPackage()
	input.Manifest.Capabilities = nil
	if _, err := NormalizeSkillPackage(input); err == nil || !strings.Contains(err.Error(), "capabilities") { t.Fatalf("err=%v", err) }
	input = validSkillTestPackage()
	input.Manifest.SchemaCompatibility = map[string]string{"asset_record": "latest"}
	if _, err := NormalizeSkillPackage(input); err == nil || !strings.Contains(err.Error(), "兼容范围") { t.Fatalf("err=%v", err) }
}

func validSkillTestPackage() SkillPackage {
	return SkillPackage{
		Manifest: SkillManifest{
			Capabilities: []string{"workflow.stage.art"},
			InputArtifactTypes: []string{"production_script"},
			OutputArtifactTypes: []string{"asset_catalog"},
			SchemaCompatibility: map[string]string{"production_script": ">=1.0 <2.0"},
			SideEffects: []string{"none"}, EstimatedCostClass: "text_low",
		},
		Files: map[string]string{"SKILL.md": "生成结构化资产目录。"},
		InputContract: SkillInputContract{RequiredInputs: []string{"workflow", "script"}},
		OutputContract: SkillOutputContract{SchemaVersion: "1.0.0", Schema: map[string]any{"type": "object"}},
		QualityGateProfile: []string{"schema", "asset"},
	}
}
```

Retain the existing traversal, unsupported-extension, invalid JSON example, package-size, image-count, and invalid JSON Schema cases under the new generic names.

- [ ] **Step 2: Run the package tests and verify the generic package is missing**

Run: `go test ./service -run 'TestNormalizeSkillPackage' -count=1`

Expected: FAIL to compile with `undefined: SkillPackage`.

- [ ] **Step 3: Implement the exact package types and validators**

```go
type SkillImagePolicy struct {
	Required bool `json:"required"`
	Min int `json:"min"`
	Max int `json:"max"`
	AllowTextFallback bool `json:"allowTextFallback"`
	AllowedTypes []string `json:"allowedTypes"`
}

type SkillInputContract struct {
	RequiredInputs []string `json:"requiredInputs"`
	ImagePolicy SkillImagePolicy `json:"imagePolicy"`
}

type SkillOutputContract struct {
	SchemaVersion string `json:"schemaVersion"`
	Schema map[string]any `json:"schema"`
}

type SkillPackage struct {
	Manifest SkillManifest `json:"manifest"`
	Files map[string]string `json:"files"`
	InputContract SkillInputContract `json:"inputContract"`
	OutputContract SkillOutputContract `json:"outputContract"`
	QualityGateProfile []string `json:"qualityGateProfile"`
	ContentHash string `json:"contentHash"`
}
```

`NormalizeSkillPackage` must trim, deduplicate, and sort Manifest list fields; require at least one capability, input Artifact type, output Artifact type, and side effect; accept cost classes `none`, `text_low`, `text_high`, `image`, and `video`; accept compatibility ranges matching `^(>=|>|=)?[0-9]+\.[0-9]+(\.[0-9]+)?(\s+(<|<=)[0-9]+\.[0-9]+(\.[0-9]+)?)?$`; require `SKILL.md`; preserve the current safe relative paths, extension allowlist, JSON example validation, byte limits, image policy, and JSON Schema validation.

Serialize normalized `Manifest`, `Files`, `InputContract`, `OutputContract`, and `QualityGateProfile` in that order before SHA-256 hashing. Add `DecodeSkillPackage(model.SkillVersion)` that unmarshals all five JSON columns, normalizes again, and rejects a hash mismatch. Add `SkillInstructions(ResolvedSkill)` using the current stable file ordering logic.

- [ ] **Step 4: Run all generic package tests**

Run: `go test ./service -run 'Test(NormalizeSkillPackage|SkillInstructions|DecodeSkillPackage)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit package normalization**

```bash
git add service/skill_manifest.go service/skill_package.go service/skill_package_test.go
git commit -m "feat: add skill manifests and package contracts"
```

### Task 4: Register the six 3.0.1 packages as system Skills

**Files:**
- Create: `service/skill_seed.go`
- Modify: `main.go:31`
- Move: `service/workflow_skill_seeds/` to `service/skill_seeds/`
- Move: `service/workflow_skill_real_eval_test.go` to `service/skill_real_eval_test.go`
- Create: `service/skill_seed_test.go`
- Create: `service/skill_test_helpers_test.go`

- [ ] **Step 1: Write failing seed registration tests**

```go
func TestEnsureSkillSeedsRegistersPublishedSystemSkills(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil { t.Fatal(err) }
	for _, stageKey := range workflowSkillSeedStageKeys {
		skill, ok, err := repository.GetSkillDefinition("skill-system-workflow-" + stageKey)
		if err != nil || !ok { t.Fatalf("stage=%s ok=%v err=%v", stageKey, ok, err) }
		version, ok, err := repository.GetSkillVersion(skill.RecommendedVersionID)
		if err != nil || !ok { t.Fatalf("stage=%s ok=%v err=%v", stageKey, ok, err) }
		packageValue, err := DecodeSkillPackage(version)
		if err != nil { t.Fatalf("stage=%s err=%v", stageKey, err) }
		if skill.OwnerType != model.SkillOwnerSystem || version.Version != "3.0.1" { t.Fatalf("skill=%+v version=%+v", skill, version) }
		if !slices.Contains(packageValue.Manifest.Capabilities, "workflow.stage."+stageKey) { t.Fatalf("manifest=%+v", packageValue.Manifest) }
	}
}

func TestEnsureSkillSeedsKeepsCustomWorkflowBinding(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil { t.Fatal(err) }
	custom := createSkillTestDraft(t, "workflow.stage.art", "9.0.0")
	custom.Status = model.SkillVersionPublished
	if err := repository.SaveSkillVersion(custom); err != nil { t.Fatal(err) }
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "custom", StageKey: "art", Scope: model.WorkflowSkillScopeGlobal, SkillVersionID: custom.ID}); err != nil { t.Fatal(err) }
	if err := EnsureSkillSeeds(); err != nil { t.Fatal(err) }
	binding, ok, err := repository.ResolveWorkflowStageSkillBinding("art", "")
	if err != nil || !ok || binding.SkillVersionID != custom.ID { t.Fatalf("binding=%+v ok=%v err=%v", binding, ok, err) }
}
```

- [ ] **Step 2: Run seed tests and verify `EnsureSkillSeeds` is missing**

Run: `go test ./service -run 'TestEnsureSkillSeeds' -count=1`

Expected: FAIL to compile with `undefined: EnsureSkillSeeds`.

- [ ] **Step 3: Implement idempotent generic seeds with explicit manifests**

Define each seed with stable IDs `skill-system-workflow-<stage>` and `skill-version-system-workflow-<stage>-3.0.1`. Use `OwnerType: system`, blank `OwnerProjectID`, and `RecommendedVersionID` pointing to 3.0.1. Preserve the existing embedded file contents and strict output schemas.

Use the following manifest mapping exactly:

```go
var workflowSkillSeedArtifacts = map[string]struct {
	Inputs  []string
	Outputs []string
}{
	"script":     {[]string{"source_text"}, []string{"production_script"}},
	"art":        {[]string{"production_script"}, []string{"asset_catalog"}},
	"assets":     {[]string{"asset_catalog"}, []string{"asset_brief"}},
	"storyboard": {[]string{"production_script", "asset_catalog"}, []string{"storyboard_package"}},
	"video":      {[]string{"storyboard_package", "asset_catalog", "asset_rendition"}, []string{"video_prompt_package"}},
	"delivery":   {[]string{"video_prompt_package"}, []string{"delivery_report"}},
}
```

Each Manifest uses capability `workflow.stage.<stage>`, `SideEffects: []string{"none"}`, compatibility `>=1.0 <2.0` for every input Artifact, and cost class `none` for delivery or `text_high` for the other five. Seed the global stage binding only when it is absent or currently points to a system seed version for the same stage; never replace a custom binding.

Replace the startup call in `main.go` with `service.EnsureSkillSeeds()` so a clean database is ready before workers and HTTP traffic start.

In `service/skill_real_eval_test.go`, keep the environment-gated real Codex evaluation, but load `skill_seeds`, build `SkillPackage`, and assemble instructions from `ResolvedSkill`. The test remains opt-in and is not run by automated acceptance without explicit API-cost confirmation.

Add this shared test helper so later tasks create complete, valid generic drafts without relying on deleted Workflow Skill fixtures:

```go
func createSkillTestDraft(t *testing.T, capability, versionName string) model.SkillVersion {
	t.Helper()
	packageValue := validSkillTestPackage()
	packageValue.Manifest.Capabilities = []string{capability}
	normalized, err := NormalizeSkillPackage(packageValue)
	if err != nil { t.Fatal(err) }
	manifestJSON, _ := json.Marshal(normalized.Manifest)
	filesJSON, _ := json.Marshal(normalized.Files)
	inputJSON, _ := json.Marshal(normalized.InputContract)
	outputJSON, _ := json.Marshal(normalized.OutputContract)
	gatesJSON, _ := json.Marshal(normalized.QualityGateProfile)
	stamp := now()
	skill := model.SkillDefinition{ID: newID("skill"), Name: capability + " test", OwnerType: model.SkillOwnerProject, OwnerProjectID: newID("project"), Enabled: true, CreatedAt: stamp, UpdatedAt: stamp}
	version := model.SkillVersion{ID: newID("skillversion"), SkillID: skill.ID, Version: versionName, Status: model.SkillVersionDraft, ManifestJSON: string(manifestJSON), FilesJSON: string(filesJSON), InputContractJSON: string(inputJSON), OutputContractJSON: string(outputJSON), QualityGateProfileJSON: string(gatesJSON), ContentHash: normalized.ContentHash, CreatedBy: "admin-1", CreatedAt: stamp, UpdatedAt: stamp}
	if err := repository.CreateSkillAggregate(skill, version); err != nil { t.Fatal(err) }
	return version
}
```

- [ ] **Step 4: Verify package quality and idempotency**

Run: `go test ./service -run 'Test(EnsureSkillSeeds|SkillSeedsContainProductionPackages|SkillSeedsExcludeLocalCodexOperations)' -count=1`

Expected: PASS; each stage resolves 3.0.1, each good example passes its output schema, and running the seed twice does not duplicate records.

- [ ] **Step 5: Commit system Skill seeds**

```bash
git add main.go service/skill_seed.go service/skill_seed_test.go service/skill_test_helpers_test.go service/skill_real_eval_test.go service/skill_seeds
git add -u -- service/workflow_skill_real_eval_test.go service/workflow_skill_seeds
git commit -m "feat: register production skills in generic registry"
```

### Task 5: Generalize draft, publish, recommendation, rollback, and evaluation services

**Files:**
- Create: `service/skill.go`
- Create: `service/skill_evaluation.go`
- Create: `service/skill_test.go`
- Create: `service/skill_evaluation_test.go`

- [ ] **Step 1: Write failing lifecycle and trial-run tests**

```go
func TestPublishSkillVersionRequiresMatchingPassingEvaluation(t *testing.T) {
	setupAITaskTestDB(t)
	draft := createSkillTestDraft(t, "workflow.stage.storyboard", "1.1.0")
	_, err := PublishSkillVersion("admin-1", draft.ID)
	if err == nil || !strings.Contains(err.Error(), "通过评测") { t.Fatalf("err=%v", err) }
	if err := repository.CreateSkillEvaluation(model.SkillEvaluation{ID: "eval", SkillVersionID: draft.ID, ContentHash: draft.ContentHash, InputHash: "sample", Status: "passed"}); err != nil { t.Fatal(err) }
	published, err := PublishSkillVersion("admin-1", draft.ID)
	if err != nil { t.Fatal(err) }
	if published.Version.Status != model.SkillVersionPublished || published.Skill.RecommendedVersionID != "" { t.Fatalf("published=%+v", published) }
	recommended, err := RecommendPublishedSkillVersion("admin-1", draft.SkillID, draft.ID)
	if err != nil || recommended.Skill.RecommendedVersionID != draft.ID { t.Fatalf("recommended=%+v err=%v", recommended, err) }
}

func TestEvaluateSkillUsesFrozenCandidateWithoutBusinessWrites(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	draft := createSkillTestDraft(t, "workflow.stage.art", "1.2.0")
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{"items":[{"logicalAssetId":"CHAR-001","kind":"character","name":"阿宁","scriptEvidence":"阿宁进入房间","description":"进入房间的年轻角色"}]}`})
	defer restore()
	beforeStages, beforeArtifacts := skillEvaluationBusinessCounts(t)
	result, err := EvaluateSkill("admin-1", draft.ID, SkillEvaluationInput{WorkflowRunID: detail.Run.ID, ConfirmAPICost: true})
	if err != nil || result.Evaluation.ContentHash != draft.ContentHash || result.Evaluation.Status != "passed" { t.Fatalf("result=%+v err=%v", result, err) }
	afterStages, afterArtifacts := skillEvaluationBusinessCounts(t)
	if beforeStages != afterStages || beforeArtifacts != afterArtifacts { t.Fatalf("business writes before=%d/%d after=%d/%d", beforeStages, beforeArtifacts, afterStages, afterArtifacts) }
}
```

- [ ] **Step 2: Run lifecycle tests and verify generic services are missing**

Run: `go test ./service -run 'Test(PublishSkillVersion|EvaluateSkill)' -count=1`

Expected: FAIL to compile with `undefined: PublishSkillVersion` and `undefined: EvaluateSkill`.

- [ ] **Step 3: Implement the generic service surface**

Use these exact public types and functions:

```go
type ResolvedSkill struct {
	Skill model.SkillDefinition `json:"skill"`
	Version model.SkillVersion `json:"version"`
	Package SkillPackage `json:"package"`
}

type SkillDraftInput struct {
	Version string `json:"version"`
	Package SkillPackage `json:"package"`
}

type SkillAdminItem struct {
	Skill model.SkillDefinition `json:"skill"`
	Versions []model.SkillVersion `json:"versions"`
	RecommendedPackage *SkillPackage `json:"recommendedPackage"`
	Evaluations []model.SkillEvaluation `json:"evaluations"`
	Audits []model.SkillAuditLog `json:"audits"`
}

type SkillEvaluationInput struct {
	WorkflowRunID string `json:"workflowRunId"`
	SourceAgentRunID string `json:"sourceAgentRunId"`
	BaselineVersionID string `json:"baselineVersionId"`
	ConfirmAPICost bool `json:"confirmApiCost"`
}

type SkillEvaluationResult struct {
	Evaluation model.SkillEvaluation `json:"evaluation"`
	ImageCount int `json:"imageCount"`
	Candidate map[string]any `json:"candidate"`
	Baseline map[string]any `json:"baseline"`
	Diff map[string]any `json:"diff"`
}

type SkillOptionFilter struct {
	Capability string
	InputArtifactType string
	OutputArtifactType string
}

type SkillOption struct {
	SkillID string `json:"skillId"`
	SkillName string `json:"skillName"`
	Summary string `json:"summary"`
	OwnerType model.SkillOwnerType `json:"ownerType"`
	OwnerProjectID string `json:"ownerProjectId"`
	SkillVersionID string `json:"skillVersionId"`
	Version string `json:"version"`
	IsRecommended bool `json:"isRecommended"`
	Manifest SkillManifest `json:"manifest"`
}

func ListSkillAdminItems() ([]SkillAdminItem, error)
func CreateProjectSkill(userID, projectID, name, summary string, draft SkillDraftInput) (ResolvedSkill, error)
func UpdateSkillDefinition(id, name, summary string, enabled *bool) (model.SkillDefinition, error)
func CreateSkillDraft(userID, skillID string, input SkillDraftInput) (model.SkillVersion, error)
func UpdateSkillDraft(versionID string, input SkillDraftInput) (model.SkillVersion, error)
func GetSkillVersionPackage(versionID string) (model.SkillVersion, SkillPackage, error)
func ResolveRecommendedSkill(skillID string) (ResolvedSkill, error)
func ResolveExactSkillVersion(versionID string) (ResolvedSkill, error)
func PublishSkillVersion(adminID, versionID string) (ResolvedSkill, error)
func RecommendPublishedSkillVersion(adminID, skillID, versionID string) (ResolvedSkill, error)
func ListSkillOptions(projectID string, filter SkillOptionFilter) ([]SkillOption, error)
```

Validate semantic versions with `^[0-9]+\.[0-9]+\.[0-9]+$`. Published versions are immutable. `PublishSkillVersion` requires a matching passed evaluation unless `EstimatedCostClass == "none"`, atomically publishes the immutable version, and writes a publish audit without changing recommendation. `RecommendPublishedSkillVersion` accepts only a published version belonging to the same Skill, atomically updates `RecommendedVersionID`, and writes a `recommend` or `rollback_recommendation` audit. This separation prevents a project canary publication from changing direct-call resolution.

Rename evaluation types and functions to `SkillEvaluationInput`, `SkillEvaluationResult`, and `EvaluateSkill`; rename the executor factory and test doubles to `skillEvaluationExecutorFactory`, `useSkillEvaluationExecutor`, and `fakeSkillExecutor`. Rename `workflowEvaluationBusinessCounts` to `skillEvaluationBusinessCounts`. Derive the sample stage from the single `workflow.stage.<stage>` capability instead of a field on the Skill definition. Persist the evaluation and a compact `{evaluationId,status,contentHash,durationMs}` summary on `SkillVersion` in one transaction; this summary is metadata and must not participate in `ContentHash`. Preserve explicit API-cost confirmation, frozen input and image manifest, same-input candidate/baseline comparison, deterministic output schema gate, no formal stage creation, and no asset/workflow writes. This is the Phase 1 independent trial entry for workflow-compatible Skills; non-workflow Skills return `当前试运行需要工作流样本` until Phase 2 accepts generic Artifact inputs.

- [ ] **Step 4: Run lifecycle and evaluation tests**

Run: `go test ./service -run 'Test(Skill|PublishSkillVersion|EvaluateSkill)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit generic Skill services**

```bash
git add service/skill.go service/skill_test.go service/skill_evaluation.go service/skill_evaluation_test.go
git commit -m "feat: generalize skill lifecycle and evaluation"
```

### Task 6: Point the production workflow at generic Skill versions

**Files:**
- Create: `service/workflow_skill_binding.go`
- Create: `service/workflow_skill_binding_test.go`
- Modify: `service/video_workflow.go:185-232`
- Modify: `service/video_workflow.go:316-323`
- Modify: `service/video_workflow_skill_snapshot_test.go`
- Modify: `service/video_workflow_storyboard_prompt_test.go`
- Move: `service/workflow_skill_options_test.go` to `service/skill_options_test.go`

- [ ] **Step 1: Write failing stage resolver tests**

```go
func TestResolveWorkflowStageSkillPrefersExactThenProjectThenGlobal(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil { t.Fatal(err) }
	project := publishCompatibleSkillTestVersion(t, "workflow.stage.art", "2.0.0")
	exact := publishCompatibleSkillTestVersion(t, "workflow.stage.art", "3.0.0")
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "project", StageKey: "art", Scope: model.WorkflowSkillScopeProject, ScopeID: "p1", SkillVersionID: project.ID}); err != nil { t.Fatal(err) }
	resolved, err := ResolveWorkflowStageSkill("art", "p1", exact.ID)
	if err != nil || resolved.Version.ID != exact.ID { t.Fatalf("exact=%+v err=%v", resolved, err) }
	resolved, err = ResolveWorkflowStageSkill("art", "p1", "")
	if err != nil || resolved.Version.ID != project.ID { t.Fatalf("project=%+v err=%v", resolved, err) }
}

func TestResolveWorkflowStageSkillRejectsIncompatibleCapability(t *testing.T) {
	setupAITaskTestDB(t)
	version := publishCompatibleSkillTestVersion(t, "asset.character.rendition", "1.0.0")
	_, err := ResolveWorkflowStageSkill("storyboard", "p1", version.ID)
	if err == nil || !strings.Contains(err.Error(), "不支持阶段") { t.Fatalf("err=%v", err) }
}

func publishCompatibleSkillTestVersion(t *testing.T, capability, versionName string) model.SkillVersion {
	t.Helper()
	draft := createSkillTestDraft(t, capability, versionName)
	if err := repository.CreateSkillEvaluation(model.SkillEvaluation{ID: newID("eval"), SkillVersionID: draft.ID, ContentHash: draft.ContentHash, InputHash: "sample", Status: "passed"}); err != nil { t.Fatal(err) }
	resolved, err := PublishSkillVersion("admin-1", draft.ID)
	if err != nil { t.Fatal(err) }
	return resolved.Version
}
```

- [ ] **Step 2: Run resolver tests and verify the new resolver is missing**

Run: `go test ./service -run 'TestResolveWorkflowStageSkill' -count=1`

Expected: FAIL to compile with `undefined: ResolveWorkflowStageSkill`.

- [ ] **Step 3: Implement stage capability validation and preserve snapshots**

```go
const (
	WorkflowSkillStageScript = "script"
	WorkflowSkillStageArt = "art"
	WorkflowSkillStageAssets = "assets"
	WorkflowSkillStageStoryboard = "storyboard"
	WorkflowSkillStageVideo = "video"
	WorkflowSkillStageDelivery = "delivery"
)

var workflowSkillStages = map[string]bool{
	WorkflowSkillStageScript: true,
	WorkflowSkillStageArt: true,
	WorkflowSkillStageAssets: true,
	WorkflowSkillStageStoryboard: true,
	WorkflowSkillStageVideo: true,
	WorkflowSkillStageDelivery: true,
}

func ResolveWorkflowStageSkill(stageKey, projectID, exactVersionID string) (ResolvedSkill, error) {
	stageKey = strings.TrimSpace(stageKey)
	if !workflowSkillStages[stageKey] { return ResolvedSkill{}, safeMessageError{message: "未知工作流阶段"} }
	if strings.TrimSpace(exactVersionID) != "" {
		resolved, err := ResolveExactSkillVersion(exactVersionID)
		if err != nil { return resolved, err }
		return requireWorkflowStageCapability(resolved, stageKey)
	}
	binding, ok, err := repository.ResolveWorkflowStageSkillBinding(stageKey, projectID)
	if err != nil { return ResolvedSkill{}, err }
	if !ok { return ResolvedSkill{}, safeMessageError{message: "工作流阶段尚未绑定 Skill"} }
	resolved, err := ResolveExactSkillVersion(binding.SkillVersionID)
	if err != nil { return resolved, err }
	return requireWorkflowStageCapability(resolved, stageKey)
}

func requireWorkflowStageCapability(resolved ResolvedSkill, stageKey string) (ResolvedSkill, error) {
	if !slices.Contains(resolved.Package.Manifest.Capabilities, "workflow.stage."+stageKey) {
		return ResolvedSkill{}, safeMessageError{message: "Skill 不支持当前工作流阶段"}
	}
	return resolved, nil
}

type WorkflowStageSkillBindingInput struct {
	Scope string `json:"scope"`
	ScopeID string `json:"scopeId"`
	SkillVersionID string `json:"skillVersionId"`
}

func UpdateWorkflowStageSkillBinding(adminID, stageKey string, input WorkflowStageSkillBindingInput) (ResolvedSkill, error) {
	resolved, err := ResolveExactSkillVersion(input.SkillVersionID)
	if err != nil { return resolved, err }
	if _, err := requireWorkflowStageCapability(resolved, stageKey); err != nil { return ResolvedSkill{}, err }
	scope, scopeID := strings.TrimSpace(input.Scope), strings.TrimSpace(input.ScopeID)
	if scope == model.WorkflowSkillScopeGlobal {
		scopeID = ""
		passed, err := repository.HasSkillProjectCanary(resolved.Version.ID, resolved.Version.ContentHash)
		if err != nil { return ResolvedSkill{}, err }
		if !passed { return ResolvedSkill{}, safeMessageError{message: "全局绑定前必须完成项目灰度评测"} }
	} else if scope != model.WorkflowSkillScopeProject || scopeID == "" {
		return ResolvedSkill{}, safeMessageError{message: "Skill 绑定范围无效"}
	}
	stamp := now()
	binding := model.WorkflowStageSkillBinding{ID: newID("skillbinding"), StageKey: stageKey, Scope: scope, ScopeID: scopeID, SkillVersionID: resolved.Version.ID, CreatedAt: stamp, UpdatedAt: stamp}
	detail, _ := json.Marshal(map[string]string{"stageKey": stageKey, "bindingId": binding.ID})
	audit := model.SkillAuditLog{ID: newID("skillaudit"), AdminID: adminID, Action: "bind_workflow_" + scope, Scope: scope, ScopeID: scopeID, SkillVersionID: resolved.Version.ID, DetailJSON: string(detail), CreatedAt: stamp}
	if err := repository.UpsertWorkflowStageSkillBindingWithAudit(binding, audit); err != nil { return ResolvedSkill{}, err }
	return resolved, nil
}
```

`UpdateWorkflowStageSkillBinding` accepts already published versions only. A project binding is the canary step. A global binding requires a passed evaluation for the same version/content hash and an existing project binding recorded by `HasSkillProjectCanary`; overwriting either scope is the rollback path and is audited in the same transaction as the binding update.

Update `video_workflow.go` to call `EnsureSkillSeeds`, `ResolveWorkflowStageSkill`, `SkillInstructions`, and generic snapshot decode helpers. The snapshot JSON must still freeze the exact Skill ID, Skill Version ID, semantic version, content hash, Manifest, files, contracts, and quality gates. Do not change workflow run status, artifact payloads, quality gates, retries, reviews, Apply behavior, or the `skill_version_id`/`skill_snapshot_json` database fields.

- [ ] **Step 4: Run resolver, snapshot, and workflow tests**

Run: `go test ./service -run 'Test(ResolveWorkflowStageSkill|WorkflowSkillSnapshot|StartWorkflow|CompleteWorkflow)' -count=1`

Expected: PASS; changing a recommendation or binding after task start does not change frozen instructions or contract validation.

- [ ] **Step 5: Commit the workflow consumer switch**

```bash
git add service/workflow_skill_binding.go service/workflow_skill_binding_test.go service/video_workflow.go service/video_workflow_skill_snapshot_test.go service/video_workflow_storyboard_prompt_test.go service/skill_options_test.go
git add -u -- service/workflow_skill_options_test.go
git commit -m "refactor: resolve workflow stages through skill registry"
```

### Task 7: Replace fixed Workflow Skill HTTP APIs with generic Skill APIs

**Files:**
- Create: `handler/admin_skill.go`
- Create: `handler/skill.go`
- Create: `handler/admin_skill_test.go`
- Modify: `router/router.go:45`
- Modify: `router/router.go:179-213`
- Move: `router/workflow_skill_test.go` to `router/skill_test.go`

- [ ] **Step 1: Write failing route and immutability tests**

```go
func TestSkillAdminEndpointsRejectAnonymousUser(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/admin/skills", nil)
	recorder := httptest.NewRecorder()
	New().ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), "未登录或权限不足") || strings.Contains(recorder.Body.String(), "接口不存在") { t.Fatalf("body=%s", recorder.Body.String()) }
}

func TestPublishedSkillVersionCannotBePatched(t *testing.T) {
	setupSkillHandlerTestDB(t)
	if err := service.EnsureSkillSeeds(); err != nil { t.Fatal(err) }
	resolved, err := service.ResolveWorkflowStageSkill("art", "", "")
	if err != nil { t.Fatal(err) }
	request := httptest.NewRequest(http.MethodPatch, "/api/v1/admin/skill-versions/"+resolved.Version.ID, strings.NewReader(`{"package":{"files":{"SKILL.md":"changed"}}}`))
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}))
	recorder := httptest.NewRecorder()
	AdminUpdateSkillVersion(recorder, request, resolved.Version.ID)
	if !strings.Contains(recorder.Body.String(), `"code":1`) || !strings.Contains(recorder.Body.String(), "已发布版本不可修改") { t.Fatalf("body=%s", recorder.Body.String()) }
}
```

- [ ] **Step 2: Run handler and router tests and verify `/skills` is not registered**

Run: `go test ./handler ./router -run 'Test(SkillAdminEndpoints|PublishedSkillVersion)' -count=1`

Expected: FAIL because the route returns `接口不存在` and the generic handler is undefined.

- [ ] **Step 3: Implement generic handlers and exact routes**

Register:

```go
v1.GET("/skill-options", gin.WrapF(handler.SkillOptions))

skillAdmin := api.Group("/v1/admin", middleware.AdminAuth)
skillAdmin.GET("/skills", gin.WrapF(handler.AdminSkills))
skillAdmin.POST("/skills", gin.WrapF(handler.AdminCreateSkill))
skillAdmin.PATCH("/skills/:id", func(c *gin.Context) { handler.AdminUpdateSkill(c.Writer, c.Request, c.Param("id")) })
skillAdmin.POST("/skills/:id/versions", func(c *gin.Context) { handler.AdminCreateSkillVersion(c.Writer, c.Request, c.Param("id")) })
skillAdmin.GET("/skill-versions/:id", func(c *gin.Context) { handler.AdminSkillVersion(c.Writer, c.Request, c.Param("id")) })
skillAdmin.PATCH("/skill-versions/:id", func(c *gin.Context) { handler.AdminUpdateSkillVersion(c.Writer, c.Request, c.Param("id")) })
skillAdmin.POST("/skill-versions/:id/validate", func(c *gin.Context) { handler.AdminValidateSkillVersion(c.Writer, c.Request, c.Param("id")) })
skillAdmin.POST("/skill-versions/:id/evaluations", func(c *gin.Context) { handler.AdminEvaluateSkillVersion(c.Writer, c.Request, c.Param("id")) })
skillAdmin.GET("/skill-evaluations/:id", func(c *gin.Context) { handler.AdminSkillEvaluation(c.Writer, c.Request, c.Param("id")) })
skillAdmin.POST("/skill-versions/:id/publish", func(c *gin.Context) { handler.AdminPublishSkillVersion(c.Writer, c.Request, c.Param("id")) })
skillAdmin.PUT("/skills/:id/recommended-version", func(c *gin.Context) { handler.AdminRecommendSkillVersion(c.Writer, c.Request, c.Param("id")) })
skillAdmin.GET("/workflow-stage-skill-bindings/:stageKey", func(c *gin.Context) { handler.AdminWorkflowStageSkillBindings(c.Writer, c.Request, c.Param("stageKey")) })
skillAdmin.PUT("/workflow-stage-skill-bindings/:stageKey", func(c *gin.Context) { handler.AdminUpdateWorkflowStageSkillBinding(c.Writer, c.Request, c.Param("stageKey")) })
```

All handlers use the existing `{ code, data, msg }` helpers. `GET /skill-options` accepts `projectId`, `capability`, `inputArtifactType`, and `outputArtifactType`; it returns only enabled, published, visible system/project versions and never returns full files. Project Skill create/update/publish must call the existing project ownership check. Admin system Skill routes retain `AdminAuth`.

- [ ] **Step 4: Run HTTP tests**

Run: `go test ./handler ./router -run 'Skill' -count=1`

Expected: PASS; old `/api/v1/admin/workflow-skills` is no longer registered and `/api/v1/admin/skills` requires admin authentication.

- [ ] **Step 5: Commit generic Skill APIs**

```bash
git add handler/admin_skill.go handler/skill.go handler/admin_skill_test.go router/router.go router/skill_test.go
git add -u -- router/workflow_skill_test.go
git commit -m "feat: expose generic skill registry APIs"
```

### Task 8: Add generic frontend API types and view logic

**Files:**
- Create: `web/src/services/api/admin-skills.ts`
- Create: `web/src/app/(admin)/admin/skills/skill-view.ts`
- Create: `web/src/app/(admin)/admin/skills/skill-view.test.mts`

- [ ] **Step 1: Write failing pure view tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { SkillAdminItem, SkillOwnerType } from "@/services/api/admin-skills.ts";
import { canPublishSkill, filterSkillItems, nextPatchVersion } from "./skill-view.ts";

function skillItem(id: string, ownerType: SkillOwnerType, capabilities: string[], inputArtifactTypes: string[], outputArtifactTypes: string[], projectTags: string[]): SkillAdminItem {
    return {
        skill: { id, name: id, summary: id, ownerType, ownerProjectId: ownerType === "project" ? "p1" : "", enabled: true, recommendedVersionId: `${id}-v1`, createdAt: "", updatedAt: "" },
        versions: [], evaluations: [], audits: [],
        recommendedPackage: {
            manifest: { capabilities, inputArtifactTypes, outputArtifactTypes, projectTags, schemaCompatibility: {}, sideEffects: ["none"], estimatedCostClass: "text_low" },
            files: { "SKILL.md": "test" }, inputContract: { requiredInputs: [], imagePolicy: { required: false, min: 0, max: 0, allowTextFallback: true, allowedTypes: [] } },
            outputContract: { schemaVersion: "1.0.0", schema: { type: "object" } }, qualityGateProfile: ["schema"], contentHash: "hash",
        },
    };
}

test("filters skills by capability, artifact type, tag, and owner", () => {
    const items = [
        skillItem("system-storyboard", "system", ["workflow.stage.storyboard"], ["production_script"], ["storyboard_package"], ["vertical"]),
        skillItem("project-image", "project", ["asset.character.rendition"], ["asset_record"], ["asset_brief"], ["short_drama"]),
    ];
    assert.deepEqual(filterSkillItems(items, { search: "", capability: "asset.character.rendition", inputArtifactType: "asset_record", outputArtifactType: "asset_brief", projectTag: "short_drama", ownerType: "project" }).map((item) => item.skill.id), ["project-image"]);
});

test("publish requires a same-hash passing evaluation for paid skills", () => {
    const version = { id: "v1", status: "draft", contentHash: "new" } as never;
    const packageValue = { manifest: { estimatedCostClass: "text_high" } } as never;
    assert.equal(canPublishSkill({ version, packageValue, evaluations: [{ skillVersionId: "v1", contentHash: "old", status: "passed" }] as never }), false);
});

test("increments semantic patch version", () => {
    assert.equal(nextPatchVersion("2.4.9"), "2.4.10");
});
```

- [ ] **Step 2: Run the view test and verify the generic helper is missing**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `skill-view.ts`.

- [ ] **Step 3: Define generic API types and deterministic helper behavior**

`admin-skills.ts` must mirror `SkillDefinition`, `SkillVersion`, `SkillManifest`, `SkillInputContract`, `SkillOutputContract`, `SkillPackage`, `SkillEvaluation`, `SkillAuditLog`, and `SkillAdminItem`. Export calls for every Task 7 route, using `/api/v1/admin/skills` and `/api/v1/admin/skill-versions` only.

Implement:

```ts
export function canPublishSkill(input: { version: SkillVersion; packageValue: SkillPackage; evaluations: SkillEvaluation[] }) {
    if (input.version.status !== "draft") return false;
    if (input.packageValue.manifest.estimatedCostClass === "none") return true;
    return input.evaluations.some((item) => item.skillVersionId === input.version.id && item.status === "passed" && item.contentHash === input.version.contentHash);
}

export function filterSkillItems(items: SkillAdminItem[], filter: SkillFilter) {
    const search = filter.search.trim().toLowerCase();
    return items.filter(({ skill, recommendedPackage }) => {
        const manifest = recommendedPackage?.manifest;
        return (!search || `${skill.name} ${skill.summary}`.toLowerCase().includes(search))
            && (!filter.ownerType || skill.ownerType === filter.ownerType)
            && (!filter.capability || manifest?.capabilities.includes(filter.capability))
            && (!filter.inputArtifactType || manifest?.inputArtifactTypes.includes(filter.inputArtifactType))
            && (!filter.outputArtifactType || manifest?.outputArtifactTypes.includes(filter.outputArtifactType))
            && (!filter.projectTag || manifest?.projectTags.includes(filter.projectTag));
    });
}
```

Also implement `nextPatchVersion`, `shortSkillHash`, `latestPassingEvaluation`, and `resolveRecommendationLabel`. Do not reintroduce a hard-coded six-stage sort; generic Skills sort by owner, name, then updated time.

- [ ] **Step 4: Run the pure TypeScript test**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'`

Expected: PASS with three passing tests.

- [ ] **Step 5: Commit the frontend API contract**

```bash
git add web/src/services/api/admin-skills.ts 'web/src/app/(admin)/admin/skills/skill-view.ts' 'web/src/app/(admin)/admin/skills/skill-view.test.mts'
git commit -m "feat: add generic skill center client contract"
```

### Task 9: Replace the fixed six-card admin page with the Skill Center

**Files:**
- Create: `web/src/app/(admin)/admin/skills/page.tsx`
- Create: `web/src/app/(admin)/admin/skills/components/skill-editor.tsx`
- Create: `web/src/app/(admin)/admin/skills/components/skill-evaluation.tsx`
- Modify: `web/src/app/(admin)/admin/layout.tsx:27-82`

- [ ] **Step 1: Add a failing page-source contract test**

Append to `skill-view.test.mts`:

```ts
import fs from "node:fs";

test("skill center is generic and exposes manifest filters", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    for (const text of ["Skill 中心", "Capability", "输入 Artifact", "输出 Artifact", "所有者", "项目标签"]) {
        assert.ok(page.includes(text), `missing ${text}`);
    }
    assert.equal(page.includes("workflowSkillStageNumbers"), false);
});
```

- [ ] **Step 2: Run the page-source test and verify `page.tsx` is missing**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'`

Expected: FAIL with `ENOENT` for `admin/skills/page.tsx`.

- [ ] **Step 3: Build the generic Skill Center page**

Reuse the current admin studio theme and Ant Design patterns. The page must contain:

```tsx
<Space wrap>
    <Input.Search placeholder="搜索 Skill 名称或说明" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
    <Select aria-label="Capability" placeholder="Capability" allowClear options={capabilityOptions} value={filters.capability || undefined} onChange={(capability) => setFilters({ ...filters, capability: capability || "" })} />
    <Select aria-label="输入 Artifact" placeholder="输入 Artifact" allowClear options={inputArtifactOptions} value={filters.inputArtifactType || undefined} onChange={(inputArtifactType) => setFilters({ ...filters, inputArtifactType: inputArtifactType || "" })} />
    <Select aria-label="输出 Artifact" placeholder="输出 Artifact" allowClear options={outputArtifactOptions} value={filters.outputArtifactType || undefined} onChange={(outputArtifactType) => setFilters({ ...filters, outputArtifactType: outputArtifactType || "" })} />
    <Select aria-label="项目标签" placeholder="项目标签" allowClear options={tagOptions} value={filters.projectTag || undefined} onChange={(projectTag) => setFilters({ ...filters, projectTag: projectTag || "" })} />
    <Segmented aria-label="所有者" options={[{ label: "全部", value: "" }, { label: "系统", value: "system" }, { label: "项目", value: "project" }]} value={filters.ownerType} onChange={(ownerType) => setFilters({ ...filters, ownerType: ownerType as SkillFilter["ownerType"] })} />
</Space>
```

The header includes `新建 Skill`; the creation modal requires name, summary, owner type, and project ID when owner type is `project`, then creates the definition and initial draft through `POST /api/v1/admin/skills`. The left list shows name, summary, owner, enabled state, recommended version, capabilities, and input/output types. The version rail shows immutable published versions and editable drafts. The editor has separate tabs for Manifest, `SKILL.md`/supporting files, input contract, output JSON Schema, and quality gates. Keep same-input evaluation, validate, publish/recommend, and recommendation rollback actions. Show workflow stage bindings only in a secondary “使用位置” panel; do not make stages the Skill identity or primary navigation.

Update `layout.tsx` menu key and title from `/admin/workflow-skills` / `工作流 Skill` to `/admin/skills` / `Skill 中心`.

- [ ] **Step 4: Run view tests and TypeScript checking**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts' && npm run typecheck`

Expected: PASS; TypeScript reports no errors in the generic API, page, editor, or evaluation panel.

- [ ] **Step 5: Commit the Skill Center UI**

```bash
git add 'web/src/app/(admin)/admin/skills' 'web/src/app/(admin)/admin/layout.tsx'
git commit -m "feat: replace workflow skill page with skill center"
```

### Task 10: Remove the old subsystem, update project docs, and run full Phase 1 acceptance

**Files:**
- Delete: `model/workflow_skill.go`
- Delete: `repository/workflow_skill.go`
- Delete: `service/workflow_skill.go`
- Delete: `service/workflow_skill_contract.go`
- Delete: `service/workflow_skill_package.go`
- Delete: `service/workflow_skill_seed.go`
- Delete: `service/workflow_skill_evaluation.go`
- Delete: `service/workflow_skill_test.go`
- Delete: `service/workflow_skill_evaluation_test.go`
- Delete: `handler/admin_workflow_skill.go`
- Delete: `handler/admin_workflow_skill_test.go`
- Delete: `web/src/services/api/admin-workflow-skills.ts`
- Delete: `web/src/app/(admin)/admin/workflow-skills/`
- Modify: `docs/backend-database.md:451-470`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Prove no runtime imports or routes still depend on the fixed subsystem**

Run:

```bash
rg -n 'model\.WorkflowSkill|model\.WorkflowSkillVersion|WorkflowSkillContract|WorkflowSkillPackage|EnsureWorkflowSkillSeeds|ResolvePublishedWorkflowSkill|admin-workflow-skills|/admin/workflow-skills|/workflow-skills|/workflow-skill-versions' --glob '!docs/**' --glob '!service/workflow_skill.go' --glob '!service/workflow_skill_contract.go' --glob '!service/workflow_skill_package.go' --glob '!service/workflow_skill_seed.go' --glob '!service/workflow_skill_evaluation.go' --glob '!service/workflow_skill_test.go' --glob '!service/workflow_skill_evaluation_test.go' --glob '!repository/workflow_skill.go' --glob '!handler/admin_workflow_skill.go' --glob '!handler/admin_workflow_skill_test.go'
```

Expected: no output. If any production call site remains, replace it with the exact generic type or function introduced in Tasks 1–9 before deleting files.

- [ ] **Step 2: Delete old fixed-stage files and run focused regression tests**

Delete only the files listed for this task, then run:

```bash
go test ./repository -run 'TestSkill' -count=1
go test ./service -run 'Test(Skill|WorkflowStageSkill|WorkflowSkillSnapshot)' -count=1
go test ./handler ./router -run 'Skill' -count=1
cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/skills/skill-view.test.mts'
```

Expected: all commands PASS; no missing symbol references to fixed `WorkflowSkill` types remain.

Then run the same `rg` command without any legacy-file exclusions. Expected: no output.

- [ ] **Step 3: Update database and release-tracking documentation**

Replace the old database sections with:

```markdown
### skill_definitions

通用 Skill 稳定身份表。记录名称、说明、`system`/`project` 所有者、项目归属、启用状态和当前推荐版本；不保存版本正文。

### skill_versions

Skill 不可变版本表。`skill_id + version` 唯一；分别保存 Manifest、逻辑文件、输入契约、输出契约、质量门、内容哈希和评测摘要。发布后不可原地修改。

### workflow_stage_skill_bindings

生产工作流阶段到通用 Skill Version 的消费端绑定。项目绑定优先于全局绑定；解析时还会验证 `workflow.stage.<stage>` capability。

### skill_evaluations / skill_audit_logs

通用 Skill 的冻结试运行、同输入对比、发布、推荐与回滚记录。试运行不写正式工作流阶段或业务资产。
```

In `docs/todo.md`, mark only Phase 1 registry work complete and retain Phase 2–6 as pending. In `docs/pending-test.md`, add the generic registry, six seed packages, production workflow resolver, Skill Center, and exact commands available for user verification. In `CHANGELOG.md` `Unreleased`, add one version-level bullet: `将固定六阶段 Workflow Skill 中心泛化为可搜索、可版本化、可评测和可独立管理的 Skill Registry。`

- [ ] **Step 4: Run the complete automated acceptance suite**

Run:

```bash
go test ./...
cd web && npm test
cd web && npm run typecheck
cd web && npm run build
```

Expected: all Go packages PASS; frontend test suite PASS; TypeScript reports no errors; Next.js production build completes successfully. Do not perform real paid model calls in this automated suite.

- [ ] **Step 5: Run the Phase 1 functional smoke test against the local app**

Start the existing backend and web development commands documented in the repository, then verify:

1. `/admin/skills` lists all six 3.0.1 system Skills with manifests and recommended versions.
2. Capability, input/output Artifact, owner, and tag filters change the result list.
3. A new draft validates but cannot publish without a same-hash passing evaluation when its cost class is not `none`.
4. A passing trial evaluation permits publishing and recommendation.
5. Recommendation rollback changes future resolution only.
6. A workflow stage can select a compatible generic Skill version and rejects an incompatible capability.
7. A started stage retains its frozen Skill Version ID, content hash, files, and contracts after recommendation changes.
8. One mocked full six-stage workflow reaches its existing final state with unchanged review and Apply semantics.

Expected: all eight checks pass with no browser console error and no request to the removed `/workflow-skills` endpoints.

- [ ] **Step 6: Commit the Phase 1 cutover**

Stage only Phase 1 files; do not stage unrelated user changes already present in the worktree.

```bash
git add model repository service handler router web/src/services/api/admin-skills.ts 'web/src/app/(admin)/admin/skills' 'web/src/app/(admin)/admin/layout.tsx' docs/backend-database.md docs/todo.md docs/pending-test.md CHANGELOG.md
git add -u -- model/workflow_skill.go repository/workflow_skill.go service/workflow_skill.go service/workflow_skill_contract.go service/workflow_skill_package.go service/workflow_skill_seed.go service/workflow_skill_evaluation.go service/workflow_skill_test.go service/workflow_skill_evaluation_test.go handler/admin_workflow_skill.go handler/admin_workflow_skill_test.go web/src/services/api/admin-workflow-skills.ts 'web/src/app/(admin)/admin/workflow-skills'
git commit -m "feat: cut over to generic skill registry"
```

## Phase 1 acceptance boundary

Phase 1 is complete only when:

- There is one Skill model, one Skill API namespace, and one Skill Center.
- The six production packages are normal system Skill versions, not special records with identity tied to `StageKey`.
- Workflow stage bindings point to generic Skill Version IDs and enforce compatibility through Manifest capabilities.
- Admin trial evaluation, publish, recommendation, project/global stage binding, and rollback remain usable.
- Existing workflow runs continue freezing exact Skill contents and preserve current quality gate/review/Apply behavior.
- No Agent Registry, general Artifact schema registry, Invocation Run, Workflow Composer, or canvas/image consumer duplication is introduced early.
- The complete Go suite, frontend suite, typecheck, production build, and eight-check functional smoke test pass.
