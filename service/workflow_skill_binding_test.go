package service

import (
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
	resolved, err := ResolveWorkflowStageSkill("art", "p1", exact.ID)
	if err != nil || resolved.Version.ID != exact.ID {
		t.Fatalf("exact=%+v err=%v", resolved, err)
	}
	resolved, err = ResolveWorkflowStageSkill("art", "p1", "")
	if err != nil || resolved.Version.ID != project.ID {
		t.Fatalf("project=%+v err=%v", resolved, err)
	}
	resolved, err = ResolveWorkflowStageSkill("art", "p2", "")
	if err != nil || resolved.Version.ID != "skill-version-system-workflow-art-3.0.1" {
		t.Fatalf("global=%+v err=%v", resolved, err)
	}
}

func TestResolveWorkflowStageSkillRejectsIncompatibleCapability(t *testing.T) {
	setupAITaskTestDB(t)
	version := publishCompatibleSkillTestVersion(t, "asset.character.rendition", "1.0.0")
	_, err := ResolveWorkflowStageSkill("storyboard", "p1", version.ID)
	if err == nil || !strings.Contains(err.Error(), "不支持") {
		t.Fatalf("err=%v", err)
	}
}

func TestUpdateWorkflowStageSkillBindingRequiresProjectCanaryBeforeGlobal(t *testing.T) {
	setupAITaskTestDB(t)
	draft := createSkillTestDraft(t, "workflow.stage.art", "4.0.0")
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
	resolved, err := ResolveWorkflowStageSkill("art", "p2", "")
	if err != nil || resolved.Version.ID != published.Version.ID {
		t.Fatalf("resolved=%+v err=%v", resolved, err)
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
