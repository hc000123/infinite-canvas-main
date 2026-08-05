package repository

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestSkillFolderSourceRoundTripsWithoutSerializingArchive(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "folder-skill", Name: "剧本优化", StageKey: "script", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{
		ID: "folder-version", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft,
		SourceKind: "folder_import", SourceHash: "sha256:test", SourceArchiveBlob: []byte("private-zip"),
		SourceFileIndexJSON: `[{"path":"SKILL.md"}]`, ImportMetadataJSON: `{"folderName":"script"}`,
	}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	storedSkill, ok, err := GetSkillDefinition(skill.ID)
	if err != nil || !ok || storedSkill.StageKey != "script" {
		t.Fatalf("skill=%+v ok=%v err=%v", storedSkill, ok, err)
	}
	storedVersion, ok, err := GetSkillVersion(version.ID)
	if err != nil || !ok || !bytes.Equal(storedVersion.SourceArchiveBlob, version.SourceArchiveBlob) || storedVersion.SourceHash != version.SourceHash || storedVersion.SourceFileIndexJSON != version.SourceFileIndexJSON {
		t.Fatalf("version=%+v ok=%v err=%v", storedVersion, ok, err)
	}
	encoded, err := json.Marshal(storedVersion)
	if err != nil || bytes.Contains(encoded, []byte("private-zip")) || bytes.Contains(encoded, []byte("folderName")) {
		t.Fatalf("json=%s err=%v", encoded, err)
	}
}

func TestListVisibleSkillDefinitionsIncludesSystemAndProject(t *testing.T) {
	setupRepositoryTestDB(t)
	for _, skill := range []model.SkillDefinition{
		{ID: "system", Name: "系统技能", OwnerType: model.SkillOwnerSystem, Enabled: true},
		{ID: "project-1", Name: "项目技能", OwnerType: model.SkillOwnerProject, OwnerUserID: "user-1", OwnerProjectID: "p1", Enabled: true},
		{ID: "project-2", Name: "其他项目", OwnerType: model.SkillOwnerProject, OwnerUserID: "user-1", OwnerProjectID: "p2", Enabled: true},
	} {
		if err := CreateSkillDefinition(skill); err != nil {
			t.Fatal(err)
		}
	}
	items, err := ListVisibleSkillDefinitions("user-1", "p1")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items[0].ID != "system" || items[1].ID != "project-1" {
		t.Fatalf("items=%+v", items)
	}
}

func TestListVisibleSkillDefinitionsKeepsSystemSkillsGlobal(t *testing.T) {
	setupRepositoryTestDB(t)
	if err := CreateSkillDefinition(model.SkillDefinition{
		ID: "system", Name: "系统技能", OwnerType: model.SkillOwnerSystem, Enabled: true,
	}); err != nil {
		t.Fatal(err)
	}
	items, err := ListVisibleSkillDefinitions("any-user", "any-project")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != "system" {
		t.Fatalf("items=%+v", items)
	}
}

func TestListVisibleSkillDefinitionsRequiresProjectOwnerUser(t *testing.T) {
	setupRepositoryTestDB(t)
	if err := CreateSkillDefinition(model.SkillDefinition{
		ID: "project-user-1", Name: "用户一项目技能", OwnerType: model.SkillOwnerProject,
		OwnerUserID: "user-1", OwnerProjectID: "project-1", Enabled: true,
	}); err != nil {
		t.Fatal(err)
	}
	items, err := ListVisibleSkillDefinitions("user-2", "project-1")
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.ID == "project-user-1" {
			t.Fatal("project id alone must not grant visibility")
		}
	}
}

func TestSetRecommendedSkillVersionIsAtomic(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "skill-1", Name: "分镜", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{ID: "version-1", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	version.Status = model.SkillVersionPublished
	version.PublishedAt = "2026-07-25T00:00:00Z"
	version.UpdatedAt = version.PublishedAt
	if err := PublishSkillVersionWithAudit(version, model.SkillAuditLog{ID: "audit-publish"}); err != nil {
		t.Fatal(err)
	}
	if err := SetRecommendedSkillVersionWithAudit(skill.ID, version.ID, version.UpdatedAt, model.SkillAuditLog{ID: "audit-recommend"}); err != nil {
		t.Fatal(err)
	}
	stored, ok, err := GetSkillDefinition(skill.ID)
	if err != nil || !ok || stored.RecommendedVersionID != version.ID {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
	storedVersion, ok, err := GetSkillVersion(version.ID)
	if err != nil || !ok || storedVersion.Status != model.SkillVersionPublished {
		t.Fatalf("version=%+v ok=%v err=%v", storedVersion, ok, err)
	}
}

func TestCreateSkillEvaluationUpdatesVersionSummary(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "skill-1", Name: "资产", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{ID: "version-1", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	evaluation := model.SkillEvaluation{ID: "eval-1", SkillVersionID: version.ID, Status: "passed"}
	if err := CreateSkillEvaluationAndUpdateSummary(evaluation, `{"evaluationId":"eval-1","status":"passed"}`, "now"); err != nil {
		t.Fatal(err)
	}
	stored, ok, err := GetSkillVersion(version.ID)
	if err != nil || !ok || stored.EvaluationSummaryJSON == "" || stored.UpdatedAt != "now" {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
}

func TestListSkillRegistryRelationsInBatches(t *testing.T) {
	setupRepositoryTestDB(t)
	for _, skill := range []model.SkillDefinition{{ID: "skill-1", Name: "一", OwnerType: model.SkillOwnerSystem}, {ID: "skill-2", Name: "二", OwnerType: model.SkillOwnerSystem}} {
		if err := CreateSkillDefinition(skill); err != nil {
			t.Fatal(err)
		}
	}
	for _, version := range []model.SkillVersion{
		{ID: "version-1", SkillID: "skill-1", Version: "1.0.0", Status: model.SkillVersionDraft, CreatedAt: "1"},
		{ID: "version-2", SkillID: "skill-2", Version: "1.0.0", Status: model.SkillVersionPublished, CreatedAt: "2"},
	} {
		if err := CreateSkillVersion(version); err != nil {
			t.Fatal(err)
		}
	}
	if err := CreateSkillEvaluation(model.SkillEvaluation{ID: "evaluation-1", SkillVersionID: "version-1", CreatedAt: "1"}); err != nil {
		t.Fatal(err)
	}
	if err := CreateSkillAuditLog(model.SkillAuditLog{ID: "audit-1", SkillVersionID: "version-2", CreatedAt: "1"}); err != nil {
		t.Fatal(err)
	}
	if err := SaveWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "binding-1", StageKey: "script", Scope: model.WorkflowStageSkillScopeGlobal, SkillVersionID: "version-2"}); err != nil {
		t.Fatal(err)
	}
	versions, err := ListSkillVersionsBySkillIDs([]string{"skill-1", "skill-2"})
	if err != nil || len(versions) != 2 {
		t.Fatalf("versions=%+v err=%v", versions, err)
	}
	evaluations, err := ListSkillEvaluationsByVersionIDs([]string{"version-1", "version-2"})
	if err != nil || len(evaluations) != 1 || evaluations[0].ID != "evaluation-1" {
		t.Fatalf("evaluations=%+v err=%v", evaluations, err)
	}
	audits, err := ListSkillAuditLogsByVersionIDs([]string{"version-1", "version-2"})
	if err != nil || len(audits) != 1 || audits[0].ID != "audit-1" {
		t.Fatalf("audits=%+v err=%v", audits, err)
	}
	bindings, err := ListWorkflowStageSkillBindingsByVersionIDs([]string{"version-1", "version-2"})
	if err != nil || len(bindings) != 1 || bindings[0].ID != "binding-1" {
		t.Fatalf("bindings=%+v err=%v", bindings, err)
	}
}
