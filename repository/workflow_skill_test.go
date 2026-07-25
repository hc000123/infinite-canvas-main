package repository

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestWorkflowStageSkillBindingPrecedence(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "skill-art", Name: "美术设计", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{
		ID: "skillver-art-1", SkillID: skill.ID, Version: "1.0.0",
		Status: model.SkillVersionPublished, ContentHash: "hash-1",
	}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	if err := SaveWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{
		ID: "binding-global", StageKey: "art", Scope: model.WorkflowSkillScopeGlobal,
		SkillVersionID: version.ID,
	}); err != nil {
		t.Fatal(err)
	}
	if err := SaveWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{
		ID: "binding-project", StageKey: "art", Scope: model.WorkflowSkillScopeProject,
		ScopeID: "project-1", SkillVersionID: version.ID,
	}); err != nil {
		t.Fatal(err)
	}

	resolved, ok, err := ResolveWorkflowStageSkillBinding("art", "project-1")
	if err != nil || !ok || resolved.ID != "binding-project" {
		t.Fatalf("resolved=%+v ok=%v err=%v", resolved, ok, err)
	}
	global, ok, err := ResolveWorkflowStageSkillBinding("art", "project-2")
	if err != nil || !ok || global.ID != "binding-global" {
		t.Fatalf("global=%+v ok=%v err=%v", global, ok, err)
	}
}

func TestWorkflowSkillTablesMigrate(t *testing.T) {
	setupRepositoryTestDB(t)
	db, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []any{
		&model.WorkflowSkill{},
		&model.WorkflowSkillVersion{},
		&model.WorkflowStageSkillBinding{},
		&model.WorkflowSkillEvaluation{},
		&model.WorkflowSkillAuditLog{},
	} {
		if !db.Migrator().HasTable(item) {
			t.Fatalf("missing table %T", item)
		}
	}
}
