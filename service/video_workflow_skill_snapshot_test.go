package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestWorkflowStageFreezesPublishedSkillSnapshot(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageArtDesign, "start-with-skill")
	if err != nil {
		t.Fatal(err)
	}
	run, ok, err := repository.GetAgentRun(stage.AgentRunID)
	if err != nil || !ok {
		t.Fatalf("run ok=%v err=%v", ok, err)
	}
	if run.SkillID != "workflow-skill-art" || run.SkillVersion != "1.0.0" || run.SkillContentHash == "" || run.SkillSnapshotJSON == "" {
		t.Fatalf("run skill snapshot=%+v", run)
	}
	if !strings.Contains(run.RequestJSON, "当前阶段 Skill") || !strings.Contains(run.RequestJSON, run.SkillContentHash) {
		t.Fatalf("request did not freeze skill instructions: %s", run.RequestJSON)
	}
}

func TestWorkflowStageRetryKeepsOriginalSkillSnapshot(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageArtDesign, "start-before-binding-change")
	if err != nil {
		t.Fatal(err)
	}
	original, _, _ := repository.GetAgentRun(stage.AgentRunID)
	baseVersion, packageValue, err := GetWorkflowSkillVersionPackage(original.SkillVersionID)
	if err != nil {
		t.Fatal(err)
	}
	packageValue.Files["SKILL.md"] = "这是替换版本。"
	packageValue, err = NormalizeWorkflowSkillPackage(packageValue.Files, packageValue.Contract)
	if err != nil {
		t.Fatal(err)
	}
	filesJSON, _ := json.Marshal(packageValue.Files)
	contractJSON, _ := json.Marshal(packageValue.Contract)
	replacement := model.WorkflowSkillVersion{
		ID: "workflow-skill-version-art-2.0.0", SkillID: baseVersion.SkillID, Version: "2.0.0",
		Status: model.WorkflowSkillVersionPublished, FilesJSON: string(filesJSON), ContractJSON: string(contractJSON),
		ContentHash: packageValue.ContentHash, CreatedAt: now(), UpdatedAt: now(), PublishedAt: now(),
	}
	if err := repository.CreateWorkflowSkillVersion(replacement); err != nil {
		t.Fatal(err)
	}
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{
		ID: "binding-art-project-new", StageKey: WorkflowSkillStageArt, Scope: model.WorkflowSkillScopeProject,
		ScopeID: detail.Run.ProjectID, SkillVersionID: replacement.ID, CreatedAt: now(), UpdatedAt: now(),
	}); err != nil {
		t.Fatal(err)
	}
	original.Status = model.AgentRunStatusFailed
	original.ErrorMessage = "test failure"
	if _, err := repository.SaveAgentRun(original); err != nil {
		t.Fatal(err)
	}
	if err := SyncWorkflowStageFromAgentRun(original); err != nil {
		t.Fatal(err)
	}
	retried, err := RetryWorkflowStage("user-1", stage.ID, "retry-after-binding-change")
	if err != nil {
		t.Fatal(err)
	}
	retryRun, _, _ := repository.GetAgentRun(retried.AgentRunID)
	if retryRun.SkillVersionID != original.SkillVersionID || retryRun.SkillContentHash != original.SkillContentHash {
		t.Fatalf("retry skill=%+v original=%+v", retryRun, original)
	}
}
