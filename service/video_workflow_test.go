package service

import (
	"encoding/json"
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

func TestWorkflowV2UsesAssetAndShotSubtasks(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	want := []string{
		WorkflowStageScriptAdaptation,
		WorkflowStageAssetExtraction,
		WorkflowStageAssetImagePrompt,
		WorkflowStageShotBreakdown,
		WorkflowStageShotPrompt,
	}
	if len(detail.Stages) != len(want) {
		t.Fatalf("stages=%#v", detail.Stages)
	}
	for index, stageID := range want {
		if detail.Stages[index].StageID != stageID {
			t.Fatalf("stage[%d]=%s want=%s", index, detail.Stages[index].StageID, stageID)
		}
	}
	if stage := workflowTestStage(detail, WorkflowStageAssetExtraction); stage.Status != model.WorkflowStageRunStatusReady {
		t.Fatalf("asset extraction=%#v", stage)
	}
	if stage := workflowTestStage(detail, WorkflowStageAssetImagePrompt); stage.Status != model.WorkflowStageRunStatusBlocked {
		t.Fatalf("asset image prompt=%#v", stage)
	}
	if stage := workflowTestStage(detail, WorkflowStageShotBreakdown); stage.Status != model.WorkflowStageRunStatusBlocked {
		t.Fatalf("shot breakdown=%#v", stage)
	}
	if stage := workflowTestStage(detail, WorkflowStageShotPrompt); stage.Status != model.WorkflowStageRunStatusBlocked {
		t.Fatalf("shot prompt=%#v", stage)
	}
}

func TestStoryboardStageRequiresApprovedAssets(t *testing.T) {
	setupVideoWorkflowTest(t)
	run := ensureVideoWorkflowTestRun(t)
	_, err := StartWorkflowStage("user-1", run.Run.ID, WorkflowStageShotBreakdown, "idem-storyboard")
	if err == nil || !strings.Contains(err.Error(), "资产") {
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
	agentRun.StructuredDraftJSON = `{"items":[{"logicalAssetId":"CHAR-001","kind":"character","name":"阿宁","scriptEvidence":"阿宁进入房间","description":"进入房间的年轻角色"}]}`
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

func TestApprovedArtUnlocksAssetsAndApprovedAssetsUnlockStoryboard(t *testing.T) {
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
	assetStage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetImagePrompt, "idem-assets-approved")
	if err != nil || assetStage.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("assets=%#v err=%v", assetStage, err)
	}
	assetRun, _, _ := repository.GetAgentRun(assetStage.AgentRunID)
	assetRun.Status = model.AgentRunStatusNeedsReview
	assetRun.StructuredDraftJSON = `{"items":[{"logicalAssetId":"CHAR-001","kind":"character","name":"阿宁","scriptEvidence":"阿宁进入房间","description":"进入房间的年轻角色","imagePrompt":"可执行三视图角色设定","status":"ready"}]}`
	_, _ = repository.SaveAgentRun(assetRun)
	if err := CompleteWorkflowStageAgentRun(assetRun); err != nil {
		t.Fatalf("complete assets: %v", err)
	}
	assetStage, _, _ = repository.GetUserWorkflowStageRun("user-1", assetStage.ID)
	assetArtifact, _, _ := repository.GetUserWorkflowArtifact("user-1", assetStage.OutputArtifactID)
	if _, err := ReviewWorkflowStage("user-1", assetStage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: assetArtifact.ContentHash}); err != nil {
		t.Fatalf("approve assets: %v", err)
	}
	storyboard, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageShotBreakdown, "idem-storyboard-approved")
	if err != nil || storyboard.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("storyboard=%#v err=%v", storyboard, err)
	}
}

func TestShotPromptRequiresConfirmedBoundedContext(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	detail = approveWorkflowStageForTest(t, detail, WorkflowStageAssetExtraction, `{"items":[{"logicalAssetId":"CHAR-001","kind":"character","name":"阿宁","scriptEvidence":"阿宁进入房间","description":"年轻角色"}]}`)
	detail = approveWorkflowStageForTest(t, detail, WorkflowStageAssetImagePrompt, `{"items":[{"logicalAssetId":"CHAR-001","kind":"character","name":"阿宁","scriptEvidence":"阿宁进入房间","description":"年轻角色","imagePrompt":"角色设定图","status":"ready"}]}`)
	detail = approveWorkflowStageForTest(t, detail, WorkflowStageShotBreakdown, `{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"阿宁进入房间。","shotDraft":{"shotSize":"中景","camera":"固定机位","movement":"缓慢推近","action":"阿宁进入房间","performance":"克制","dialogue":"","durationSeconds":6,"continuityMode":"continuous"}}]}`)

	_, err := StartWorkflowStageWithInput("user-1", detail.Run.ID, WorkflowStageShotPrompt, WorkflowStageStartInput{IdempotencyKey: "shot-prompt-missing"})
	if err == nil || !strings.Contains(err.Error(), "镜头上下文") {
		t.Fatalf("missing context err=%v", err)
	}
	context := json.RawMessage(`{"shotId":"shot-001","sourceScript":"阿宁进入房间。","shotDraft":{"shotSize":"中景","camera":"固定机位","movement":"缓慢推近","action":"阿宁进入房间","performance":"克制","dialogue":"","durationSeconds":6,"continuityMode":"continuous"},"references":[{"logicalAssetId":"CHAR-001","libraryAssetId":"asset-1","version":"v1","usage":"角色一致性"}]}`)
	stage, err := StartWorkflowStageWithInput("user-1", detail.Run.ID, WorkflowStageShotPrompt, WorkflowStageStartInput{IdempotencyKey: "shot-prompt-valid", Context: context})
	if err != nil || stage.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("stage=%#v err=%v", stage, err)
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
	agentRun.StructuredDraftJSON = `{"items":[{"logicalAssetId":"CHAR-001","kind":"character","name":"阿宁","scriptEvidence":"阿宁进入房间","description":"进入房间的年轻角色"}]}`
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

func approveWorkflowStageForTest(t *testing.T, detail WorkflowRunDetail, stageID string, output string) WorkflowRunDetail {
	t.Helper()
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, stageID, "approve-"+stageID)
	if err != nil {
		t.Fatalf("start %s: %v", stageID, err)
	}
	agentRun, ok, err := repository.GetAgentRun(stage.AgentRunID)
	if err != nil || !ok {
		t.Fatalf("agent run %s ok=%v err=%v", stageID, ok, err)
	}
	agentRun.Status = model.AgentRunStatusNeedsReview
	agentRun.StructuredDraftJSON = output
	_, _ = repository.SaveAgentRun(agentRun)
	if err := CompleteWorkflowStageAgentRun(agentRun); err != nil {
		t.Fatalf("complete %s: %v", stageID, err)
	}
	stage, _, _ = repository.GetUserWorkflowStageRun("user-1", stage.ID)
	artifact, _, _ := repository.GetUserWorkflowArtifact("user-1", stage.OutputArtifactID)
	if _, err := ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: artifact.ContentHash}); err != nil {
		t.Fatalf("approve %s: %v", stageID, err)
	}
	return mustWorkflowDetailForTest(t, detail.Run.ID)
}

func mustWorkflowDetailForTest(t *testing.T, workflowRunID string) WorkflowRunDetail {
	t.Helper()
	detail, err := GetWorkflowRunDetail("user-1", workflowRunID)
	if err != nil {
		t.Fatal(err)
	}
	return detail
}

func workflowTestStage(detail WorkflowRunDetail, stageID string) model.WorkflowStageRun {
	for _, stage := range detail.Stages {
		if stage.StageID == stageID {
			return stage
		}
	}
	return model.WorkflowStageRun{}
}
