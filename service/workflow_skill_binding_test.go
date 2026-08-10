package service

import (
	"errors"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestResolveWorkflowStageSkillPrefersExactThenProjectThenGlobal(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	project := publishCompatibleSkillTestVersion(t, "workflow.stage.art", "2.0.0")
	exact := publishCompatibleSkillTestVersion(t, "workflow.stage.art", "3.0.0")
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "project", StageKey: "art", Scope: model.WorkflowStageSkillScopeProject, ScopeID: "p1", SkillVersionID: project.ID}); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolveWorkflowStageSkill("admin-1", "art", "p1", exact.ID)
	if err != nil || resolved.Version.ID != exact.ID {
		t.Fatalf("exact=%+v err=%v", resolved, err)
	}
	resolved, err = ResolveWorkflowStageSkill("admin-1", "art", "p1", "")
	if err != nil || resolved.Version.ID != project.ID {
		t.Fatalf("project=%+v err=%v", resolved, err)
	}
	resolved, err = ResolveWorkflowStageSkill("admin-1", "art", "p2", "")
	if err != nil || resolved.Version.ID != "skill-version-system-workflow-art-3.0.1" {
		t.Fatalf("global=%+v err=%v", resolved, err)
	}
}

func TestResolveWorkflowStageSkillRejectsIncompatibleCapability(t *testing.T) {
	setupAITaskTestDB(t)
	version := publishCompatibleSkillTestVersion(t, "asset.character.rendition", "1.0.0")
	_, err := ResolveWorkflowStageSkill("admin-1", "storyboard", "p1", version.ID)
	if err == nil || !strings.Contains(err.Error(), "不支持") {
		t.Fatalf("err=%v", err)
	}
}

func TestUpdateWorkflowStageSkillBindingRequiresProjectCanaryBeforeGlobal(t *testing.T) {
	setupAITaskTestDB(t)
	draft := createSkillTestDraft(t, "workflow.stage.art", "4.0.0")
	setSkillTestSystem(t, draft)
	if err := repository.CreateSkillEvaluation(model.SkillEvaluation{ID: "eval", SkillVersionID: draft.ID, ContentHash: draft.ContentHash, InputHash: "input", ProjectID: "p1", Status: "passed"}); err != nil {
		t.Fatal(err)
	}
	published, err := PublishSkillVersion("admin-1", draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = UpdateWorkflowStageSkillBinding("admin-1", "art", WorkflowStageSkillBindingInput{Scope: model.WorkflowStageSkillScopeGlobal, SkillVersionID: published.Version.ID})
	if err == nil || !strings.Contains(err.Error(), "项目灰度") {
		t.Fatalf("err=%v", err)
	}
	if _, err := UpdateWorkflowStageSkillBinding("admin-1", "art", WorkflowStageSkillBindingInput{Scope: model.WorkflowStageSkillScopeProject, ScopeID: "p1", SkillVersionID: published.Version.ID}); err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateWorkflowStageSkillBinding("admin-1", "art", WorkflowStageSkillBindingInput{Scope: model.WorkflowStageSkillScopeGlobal, SkillVersionID: published.Version.ID}); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolveWorkflowStageSkill("admin-1", "art", "p2", "")
	if err != nil || resolved.Version.ID != published.Version.ID {
		t.Fatalf("resolved=%+v err=%v", resolved, err)
	}
}

func TestUpdateWorkflowStageSkillBindingRestrictsProjectSkillScopeAndOwner(t *testing.T) {
	setupAITaskTestDB(t)
	version := publishCompatibleSkillTestVersion(t, "workflow.stage.art", "4.1.0")
	setSkillTestScope(t, version, "admin-1", "project-1")

	for _, item := range []struct {
		name    string
		adminID string
		scope   string
		scopeID string
	}{
		{name: "global", adminID: "admin-1", scope: model.WorkflowStageSkillScopeGlobal},
		{name: "same project", adminID: "admin-1", scope: model.WorkflowStageSkillScopeProject, scopeID: "project-1"},
		{name: "cross project", adminID: "admin-1", scope: model.WorkflowStageSkillScopeProject, scopeID: "project-2"},
		{name: "foreign admin", adminID: "admin-2", scope: model.WorkflowStageSkillScopeProject, scopeID: "project-1"},
	} {
		t.Run(item.name, func(t *testing.T) {
			if _, err := UpdateWorkflowStageSkillBinding(item.adminID, "art", WorkflowStageSkillBindingInput{
				Scope: item.scope, ScopeID: item.scopeID, SkillVersionID: version.ID,
			}); err == nil || !strings.Contains(err.Error(), "Skill 版本不存在") {
				t.Fatalf("expected project Skill binding rejection, err=%v", err)
			}
		})
	}
}

func TestResolveWorkflowStageSkillRejectsProjectSkillExactAndBinding(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	version := publishCompatibleSkillTestVersion(t, "workflow.stage.art", "5.0.0")
	setSkillTestScope(t, version, "user-1", "project-1")
	if _, err := ResolveWorkflowStageSkillForRun("user-1", WorkflowStageAssetExtraction, "project-1", version.ID); err == nil {
		t.Fatal("project Skill resolved through exact version")
	}
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{
		ID: "foreign-user-binding", StageKey: "art", Scope: model.WorkflowStageSkillScopeProject,
		ScopeID: "project-1", SkillVersionID: version.ID,
	}); !errors.Is(err, repository.ErrSkillReferenceTargetUnavailable) {
		t.Fatalf("binding err=%v", err)
	}
}

func TestListWorkflowStageSkillBindingsRejectsUnknownStage(t *testing.T) {
	setupAITaskTestDB(t)
	if _, err := ListWorkflowStageSkillBindings("unknown"); err == nil || !strings.Contains(err.Error(), "未知") {
		t.Fatalf("err=%v", err)
	}
}

func publishCompatibleSkillTestVersion(t *testing.T, capability, versionName string) model.SkillVersion {
	t.Helper()
	draft := createSkillTestDraft(t, capability, versionName)
	if err := repository.CreateSkillEvaluation(model.SkillEvaluation{ID: newID("eval"), SkillVersionID: draft.ID, ContentHash: draft.ContentHash, InputHash: "sample", Status: "passed"}); err != nil {
		t.Fatal(err)
	}
	resolved, err := PublishSkillVersion("admin-1", draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	return resolved.Version
}

func setSkillTestScope(t *testing.T, version model.SkillVersion, userID, projectID string) {
	t.Helper()
	skill, ok, err := repository.GetSkillDefinition(version.SkillID)
	if err != nil || !ok {
		t.Fatalf("skill=%+v ok=%v err=%v", skill, ok, err)
	}
	skill.OwnerType = model.SkillOwnerProject
	skill.OwnerUserID = userID
	skill.OwnerProjectID = projectID
	skill.Name += " " + version.ID
	if err := repository.SaveSkillDefinition(skill); err != nil {
		t.Fatal(err)
	}
}

func setSkillTestSystem(t *testing.T, version model.SkillVersion) {
	t.Helper()
	skill, ok, err := repository.GetSkillDefinition(version.SkillID)
	if err != nil || !ok {
		t.Fatalf("skill=%+v ok=%v err=%v", skill, ok, err)
	}
	skill.OwnerType = model.SkillOwnerSystem
	skill.OwnerUserID = ""
	skill.OwnerProjectID = ""
	skill.Name += " " + version.ID
	if err := repository.SaveSkillDefinition(skill); err != nil {
		t.Fatal(err)
	}
}
