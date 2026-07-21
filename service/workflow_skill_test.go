package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestPublishWorkflowSkillRequiresPassingEvaluation(t *testing.T) {
	setupAITaskTestDB(t)
	draft := createWorkflowSkillTestDraft(t, WorkflowSkillStageStoryboard, "1.1.0")
	_, err := PublishWorkflowSkillVersion("admin-1", draft.ID, WorkflowSkillPublishInput{Scope: model.WorkflowSkillScopeProject, ScopeID: "project-1"})
	if err == nil || !strings.Contains(err.Error(), "通过评测") {
		t.Fatalf("err=%v", err)
	}
}

func TestResolveWorkflowSkillPrefersProjectBinding(t *testing.T) {
	setupAITaskTestDB(t)
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	draft := createWorkflowSkillTestDraft(t, WorkflowSkillStageArt, "2.0.0")
	evaluation := model.WorkflowSkillEvaluation{
		ID: newID("skilleval"), SkillVersionID: draft.ID, ContentHash: draft.ContentHash,
		InputHash: "input-1", Status: "passed", CreatedBy: "admin-1", CreatedAt: now(), UpdatedAt: now(),
	}
	if err := repository.CreateWorkflowSkillEvaluation(evaluation); err != nil {
		t.Fatal(err)
	}
	if _, err := PublishWorkflowSkillVersion("admin-1", draft.ID, WorkflowSkillPublishInput{Scope: model.WorkflowSkillScopeProject, ScopeID: "project-1"}); err != nil {
		t.Fatal(err)
	}
	resolved, err := ResolvePublishedWorkflowSkill(WorkflowSkillStageArt, "project-1")
	if err != nil || resolved.Version.ID != draft.ID {
		t.Fatalf("resolved=%+v err=%v", resolved, err)
	}
	global, err := ResolvePublishedWorkflowSkill(WorkflowSkillStageArt, "project-2")
	if err != nil || global.Version.ID == draft.ID {
		t.Fatalf("global=%+v err=%v", global, err)
	}
}

func TestValidateWorkflowSkillPackageRejectsUnsafeFilesAndTooManyImages(t *testing.T) {
	contract := validWorkflowSkillTestContract()
	contract.ImagePolicy.Max = 10
	_, err := NormalizeWorkflowSkillPackage(map[string]string{"SKILL.md": "ok", "../run.sh": "bad"}, contract)
	if err == nil {
		t.Fatal("expected invalid package")
	}
}

func createWorkflowSkillTestDraft(t *testing.T, stageKey string, versionName string) model.WorkflowSkillVersion {
	t.Helper()
	if err := EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	skill, ok, err := repository.FindWorkflowSkillByStage(stageKey)
	if err != nil || !ok {
		t.Fatalf("skill ok=%v err=%v", ok, err)
	}
	contract := validWorkflowSkillTestContract()
	contract.ApplyTargets = []string{stageKey}
	packageValue, err := NormalizeWorkflowSkillPackage(map[string]string{"SKILL.md": "生成可审核的结构化结果。"}, contract)
	if err != nil {
		t.Fatal(err)
	}
	filesJSON, _ := json.Marshal(packageValue.Files)
	contractJSON, _ := json.Marshal(packageValue.Contract)
	draft := model.WorkflowSkillVersion{
		ID: newID("skillversion"), SkillID: skill.ID, Version: versionName,
		Status: model.WorkflowSkillVersionDraft, FilesJSON: string(filesJSON), ContractJSON: string(contractJSON),
		ContentHash: packageValue.ContentHash, CreatedBy: "admin-1", CreatedAt: now(), UpdatedAt: now(),
	}
	if err := repository.CreateWorkflowSkillVersion(draft); err != nil {
		t.Fatal(err)
	}
	return draft
}

func validWorkflowSkillTestContract() WorkflowSkillContract {
	contract := WorkflowSkillContract{
		RequiredInputs:      []string{"script"},
		OutputSchemaVersion: "1.0.0",
		OutputSchema:        map[string]any{"type": "object"},
		QualityGateProfile:  []string{"schema"},
		ApplyTargets:        []string{WorkflowSkillStageArt},
	}
	contract.ImagePolicy.Max = 9
	contract.ImagePolicy.AllowedTypes = []string{"image/png", "image/jpeg", "image/webp"}
	contract.ImagePolicy.AllowTextFallback = true
	return contract
}
