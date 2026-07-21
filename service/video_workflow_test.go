package service

import (
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestEnsureWorkflowRunIsIdempotent(t *testing.T) {
	setupVideoWorkflowTest(t)
	input := EnsureWorkflowRunInput{
		ProjectID:       "project-1",
		EpisodeID:       "episode-1",
		ScriptSnapshot:  "第一场：人物进入房间。",
		ScriptConfirmed: true,
	}
	first, err := EnsureWorkflowRun("user-1", input)
	if err != nil {
		t.Fatalf("EnsureWorkflowRun returned error: %v", err)
	}
	second, err := EnsureWorkflowRun("user-1", input)
	if err != nil || first.Run.ID != second.Run.ID {
		t.Fatalf("second=%#v err=%v", second, err)
	}
	if stage := workflowTestStage(first, WorkflowStageScriptAdaptation); stage.Status != model.WorkflowStageRunStatusApproved {
		t.Fatalf("script stage=%#v", stage)
	}
}

func TestStoryboardStageRequiresApprovedArtDesign(t *testing.T) {
	setupVideoWorkflowTest(t)
	run := ensureVideoWorkflowTestRun(t)
	_, err := StartWorkflowStage("user-1", run.Run.ID, WorkflowStageSeedanceStoryboard, "idem-storyboard")
	if err == nil || !strings.Contains(err.Error(), "美术") {
		t.Fatalf("err=%v", err)
	}
}

func TestReviewRejectsArtifactHashMismatch(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageArtDesign, "idem-art")
	if err != nil {
		t.Fatalf("StartWorkflowStage returned error: %v", err)
	}
	agentRun, ok, err := repository.GetAgentRun(stage.AgentRunID)
	if err != nil || !ok {
		t.Fatalf("GetAgentRun ok=%v err=%v", ok, err)
	}
	agentRun.Status = model.AgentRunStatusNeedsReview
	agentRun.StructuredDraftJSON = `{"directorSummary":"室内压迫感","items":[{"id":"character-1","kind":"character","name":"阿宁","prompt":"三视图角色设定"}]}`
	if _, err := repository.SaveAgentRun(agentRun); err != nil {
		t.Fatalf("SaveAgentRun returned error: %v", err)
	}
	if err := CompleteWorkflowStageAgentRun(agentRun); err != nil {
		t.Fatalf("CompleteWorkflowStageAgentRun returned error: %v", err)
	}
	stage, _, err = repository.GetUserWorkflowStageRun("user-1", stage.ID)
	if err != nil {
		t.Fatalf("GetUserWorkflowStageRun returned error: %v", err)
	}
	_, err = ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: "old"})
	if err == nil || !strings.Contains(err.Error(), "已变化") {
		t.Fatalf("err=%v", err)
	}
}

func TestReviewBlocksFailedQualityGate(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageArtDesign, "idem-art-invalid")
	if err != nil {
		t.Fatalf("StartWorkflowStage returned error: %v", err)
	}
	agentRun, _, _ := repository.GetAgentRun(stage.AgentRunID)
	agentRun.Status = model.AgentRunStatusNeedsReview
	agentRun.StructuredDraftJSON = `{"summary":"missing items"}`
	_, _ = repository.SaveAgentRun(agentRun)
	if err := CompleteWorkflowStageAgentRun(agentRun); err != nil {
		t.Fatalf("CompleteWorkflowStageAgentRun returned error: %v", err)
	}
	stage, _, _ = repository.GetUserWorkflowStageRun("user-1", stage.ID)
	artifact, _, _ := repository.GetUserWorkflowArtifact("user-1", stage.OutputArtifactID)
	_, err = ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: artifact.ContentHash})
	if err == nil || !strings.Contains(err.Error(), "质量门") {
		t.Fatalf("err=%v", err)
	}
}

func TestApprovedArtCanApplyAndUnlockStoryboard(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage := completeVideoWorkflowArtStage(t, detail, "idem-art-approved")
	artifact, ok, err := repository.GetUserWorkflowArtifact("user-1", stage.OutputArtifactID)
	if err != nil || !ok {
		t.Fatalf("GetUserWorkflowArtifact ok=%v err=%v", ok, err)
	}
	approved, err := ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: artifact.ContentHash})
	if err != nil || approved.Status != model.WorkflowStageRunStatusApproved {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
	applied, err := ApplyWorkflowStage("user-1", stage.ID, WorkflowApplyInput{
		ArtifactHash: artifact.ContentHash,
		Target:       "production_bible",
		TargetIDs:    []string{"asset-1"},
		AppliedCount: 1,
		Version:      "local-v1",
	})
	if err != nil || applied.Status != model.WorkflowStageRunStatusApplied || applied.ApplyReceiptJSON == "" {
		t.Fatalf("applied=%#v err=%v", applied, err)
	}
	storyboard, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageSeedanceStoryboard, "idem-storyboard-approved")
	if err != nil || storyboard.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("storyboard=%#v err=%v", storyboard, err)
	}
}

func setupVideoWorkflowTest(t *testing.T) {
	t.Helper()
	setupAITaskTestDB(t)
	saveAgentRunTextChannel(t, "https://workflow.example.com")
}

func ensureVideoWorkflowTestRun(t *testing.T) WorkflowRunDetail {
	t.Helper()
	detail, err := EnsureWorkflowRun("user-1", EnsureWorkflowRunInput{
		ProjectID:       "project-1",
		EpisodeID:       "episode-1",
		ScriptSnapshot:  "第一场：阿宁进入房间。",
		ScriptConfirmed: true,
	})
	if err != nil {
		t.Fatalf("EnsureWorkflowRun returned error: %v", err)
	}
	return detail
}

func completeVideoWorkflowArtStage(t *testing.T, detail WorkflowRunDetail, idempotencyKey string) model.WorkflowStageRun {
	t.Helper()
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageArtDesign, idempotencyKey)
	if err != nil {
		t.Fatalf("StartWorkflowStage returned error: %v", err)
	}
	agentRun, ok, err := repository.GetAgentRun(stage.AgentRunID)
	if err != nil || !ok {
		t.Fatalf("GetAgentRun ok=%v err=%v", ok, err)
	}
	agentRun.Status = model.AgentRunStatusNeedsReview
	agentRun.StructuredDraftJSON = `{"directorSummary":"室内压迫感","items":[{"id":"character-1","kind":"character","name":"阿宁","prompt":"三视图角色设定"}]}`
	if _, err := repository.SaveAgentRun(agentRun); err != nil {
		t.Fatalf("SaveAgentRun returned error: %v", err)
	}
	if err := CompleteWorkflowStageAgentRun(agentRun); err != nil {
		t.Fatalf("CompleteWorkflowStageAgentRun returned error: %v", err)
	}
	stage, ok, err = repository.GetUserWorkflowStageRun("user-1", stage.ID)
	if err != nil || !ok {
		t.Fatalf("GetUserWorkflowStageRun ok=%v err=%v", ok, err)
	}
	return stage
}

func workflowTestStage(detail WorkflowRunDetail, stageID string) model.WorkflowStageRun {
	for _, stage := range detail.Stages {
		if stage.StageID == stageID {
			return stage
		}
	}
	return model.WorkflowStageRun{}
}
