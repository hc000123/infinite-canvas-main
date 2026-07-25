package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestListVisibleSkillDefinitionsIncludesSystemAndProject(t *testing.T) {
	setupRepositoryTestDB(t)
	for _, skill := range []model.SkillDefinition{
		{ID: "system", Name: "系统技能", OwnerType: model.SkillOwnerSystem, Enabled: true},
		{ID: "project-1", Name: "项目技能", OwnerType: model.SkillOwnerProject, OwnerProjectID: "p1", Enabled: true},
		{ID: "project-2", Name: "其他项目", OwnerType: model.SkillOwnerProject, OwnerProjectID: "p2", Enabled: true},
	} {
		if err := CreateSkillDefinition(skill); err != nil {
			t.Fatal(err)
		}
	}
	items, err := ListVisibleSkillDefinitions("p1")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items[0].ID != "system" || items[1].ID != "project-1" {
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
