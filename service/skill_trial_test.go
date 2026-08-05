package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestTrialSkillRunsWithoutWorkflowAndPersistsRawAndStandardResults(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	snapshot, _ := ParseSkillFolder("剧本优化", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# 保留台词")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{"productionScript":"  原台词\n动作不改  "}`})
	defer restore()
	beforeStages, beforeArtifacts := skillEvaluationBusinessCounts(t)
	result, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{InputText: "原始剧本", ConfirmAPICost: true})
	if err != nil || result.Evaluation.Status != "passed" || result.StageKey != WorkflowSkillStageScript {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	if result.Raw["productionScript"] != "  原台词\n动作不改  " || result.Standard["productionScript"] != "原台词\n动作不改" {
		t.Fatalf("raw=%+v standard=%+v", result.Raw, result.Standard)
	}
	afterStages, afterArtifacts := skillEvaluationBusinessCounts(t)
	if beforeStages != afterStages || beforeArtifacts != afterArtifacts {
		t.Fatalf("trial wrote workflow business data before=%d/%d after=%d/%d", beforeStages, beforeArtifacts, afterStages, afterArtifacts)
	}
	stored, ok, err := repository.GetSkillEvaluation(result.Evaluation.ID)
	if err != nil || !ok || stored.ProjectID != "" || stored.EpisodeID != "" || stored.InputSnapshotJSON == "" {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
	var storedResult map[string]any
	if json.Unmarshal([]byte(stored.ResultJSON), &storedResult) != nil || storedResult["raw"] == nil || storedResult["standard"] == nil {
		t.Fatalf("stored result=%s", stored.ResultJSON)
	}
}

func TestTrialSkillRequiresInputAndExplicitAPICostConfirmation(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	snapshot, _ := ParseSkillFolder("剧本优化", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# 保留台词")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{"productionScript":"结果"}`})
	defer restore()
	if _, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{}); err == nil || !strings.Contains(err.Error(), "输入") {
		t.Fatalf("missing input err=%v", err)
	}
	if _, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{InputText: "原稿"}); err == nil || !strings.Contains(err.Error(), "显式确认") {
		t.Fatalf("cost confirmation err=%v", err)
	}
}
