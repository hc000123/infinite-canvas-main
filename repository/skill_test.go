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

func TestCreateImportedSkillAggregateRollsBackWhenAuditFails(t *testing.T) {
	setupRepositoryTestDB(t)
	if err := CreateSkillAuditLog(model.SkillAuditLog{ID: "duplicate-audit"}); err != nil {
		t.Fatal(err)
	}
	skill := model.SkillDefinition{ID: "atomic-folder-skill", Name: "剧本优化", OwnerType: model.SkillOwnerSystem}
	sourceIdentity := "sha256:atomic"
	version := model.SkillVersion{ID: "atomic-folder-version", SkillID: skill.ID, Version: "1.0.0", SourceKind: "folder_import", SourceHash: sourceIdentity, SourceIdentity: &sourceIdentity}
	if err := CreateSkillAggregateWithAudit(skill, version, model.SkillAuditLog{ID: "duplicate-audit"}); err == nil {
		t.Fatal("duplicate audit should fail the aggregate")
	}
	if _, ok, _ := GetSkillDefinition(skill.ID); ok {
		t.Fatal("definition survived failed audit transaction")
	}
	if _, ok, _ := GetSkillVersion(version.ID); ok {
		t.Fatal("version survived failed audit transaction")
	}
}

func TestCreateImportedSkillVersionWithAuditIsAtomicAndDeduplicatesSource(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "source-unique-skill", Name: "剧本优化", OwnerType: model.SkillOwnerSystem}
	if err := CreateSkillDefinition(skill); err != nil {
		t.Fatal(err)
	}
	sourceIdentity := "sha256:same-folder"
	first := model.SkillVersion{ID: "source-version-1", SkillID: skill.ID, Version: "1.0.0", SourceKind: "folder_import", SourceHash: sourceIdentity, SourceIdentity: &sourceIdentity}
	if err := CreateSkillVersionWithAudit(first, model.SkillAuditLog{ID: "source-audit-1"}); err != nil {
		t.Fatal(err)
	}
	duplicate := first
	duplicate.ID, duplicate.Version = "source-version-2", "1.0.1"
	if err := CreateSkillVersionWithAudit(duplicate, model.SkillAuditLog{ID: "source-audit-2"}); err == nil {
		t.Fatal("same source content should be rejected for one Skill")
	}
	if _, ok, _ := GetSkillVersion(duplicate.ID); ok {
		t.Fatal("duplicate source version was persisted")
	}
	database, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	var auditCount int64
	if err := database.Model(&model.SkillAuditLog{}).Where("id = ?", "source-audit-2").Count(&auditCount).Error; err != nil || auditCount != 0 {
		t.Fatalf("duplicate source audit count=%d err=%v", auditCount, err)
	}

	if err := CreateSkillAuditLog(model.SkillAuditLog{ID: "duplicate-version-audit"}); err != nil {
		t.Fatal(err)
	}
	otherIdentity := "sha256:other-folder"
	other := model.SkillVersion{ID: "source-version-3", SkillID: skill.ID, Version: "1.0.2", SourceKind: "folder_import", SourceHash: otherIdentity, SourceIdentity: &otherIdentity}
	if err := CreateSkillVersionWithAudit(other, model.SkillAuditLog{ID: "duplicate-version-audit"}); err == nil {
		t.Fatal("duplicate audit should fail version creation")
	}
	if _, ok, _ := GetSkillVersion(other.ID); ok {
		t.Fatal("version survived failed audit transaction")
	}
}

func TestListSystemSkillDefinitionsExcludesLegacyProjectOwners(t *testing.T) {
	setupRepositoryTestDB(t)
	for _, skill := range []model.SkillDefinition{
		{ID: "system", Name: "系统技能", OwnerType: model.SkillOwnerSystem, Enabled: true},
		{ID: "legacy-project", Name: "遗留项目技能", OwnerType: model.SkillOwnerType("project"), OwnerUserID: "user-1", OwnerProjectID: "project-1", Enabled: true},
	} {
		if err := CreateSkillDefinition(skill); err != nil {
			t.Fatal(err)
		}
	}
	items, err := ListSystemSkillDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != "system" {
		t.Fatalf("items=%+v", items)
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
