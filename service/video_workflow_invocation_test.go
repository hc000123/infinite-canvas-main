package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestEnsureWorkflowRunCreatesStandardRootArtifactsOnly(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage := workflowTestStage(detail, WorkflowStageScriptAdaptation)
	if stage.OutputArtifactID == "" || stage.Status != model.WorkflowStageRunStatusApproved {
		t.Fatalf("stage=%#v", stage)
	}
	artifact, err := GetArtifact("user-1", stage.OutputArtifactID)
	if err != nil || artifact.Artifact.ArtifactType != "production_script" || artifact.Payload["productionScript"] != detail.Run.ScriptSnapshot {
		t.Fatalf("artifact=%#v err=%v", artifact, err)
	}
	db, _ := repository.DB()
	if db.Migrator().HasTable(&model.WorkflowArtifact{}) || db.Migrator().HasTable(&model.WorkflowQualityGateResult{}) {
		t.Fatal("fresh workflow must not require legacy artifact or gate tables")
	}
}

func TestProjectWorkflowInvocationAggregatesAssetBriefSet(t *testing.T) {
	setupVideoWorkflowTest(t)
	seedWorkflowInvocationCredits(t)
	detail := ensureVideoWorkflowTestRun(t)
	extraction, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetExtraction, "workflow-brief-extract")
	if err != nil {
		t.Fatal(err)
	}
	catalog := `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁进入房间。"],"coreFacts":["主要角色"]},{"assetId":"scene-001","kind":"scene","name":"房间","sourceEvidence":["第一场：阿宁进入房间。"],"coreFacts":["室内空间"]}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "workflow-catalog-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: catalog, structuredJSON: catalog}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	invocation, err := GetInvocationDetail("user-1", extraction.InvocationID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ReviewInvocation("user-1", extraction.InvocationID, InvocationReviewInput{Decision: "approved", Attempt: invocation.Run.LatestAttempt, ArtifactSetHash: invocation.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}
	detail, _ = GetWorkflowRunDetail("user-1", detail.Run.ID)
	briefStage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetImagePrompt, "workflow-brief-run")
	if err != nil {
		t.Fatal(err)
	}
	briefs := `{"outputs":[{"bindingName":"asset_brief","ordinal":0,"payload":{"assetId":"character-001","brief":"同一角色四视图","format":"character-four-view"}},{"bindingName":"asset_brief","ordinal":1,"payload":{"assetId":"scene-001","brief":"干净场景母版","format":"scene-master"}}]}`
	worker = NewAgentRunWorker(AgentRunWorkerOptions{ID: "workflow-brief-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: briefs, structuredJSON: briefs}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	detail, err = GetWorkflowRunDetail("user-1", detail.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	projected := workflowTestStage(detail, WorkflowStageAssetImagePrompt)
	artifact := detail.Artifacts[len(detail.Artifacts)-1]
	var payload struct {
		Items []map[string]any `json:"items"`
	}
	if projected.ID != briefStage.ID || json.Unmarshal([]byte(artifact.ContentJSON), &payload) != nil || len(payload.Items) != 2 {
		t.Fatalf("projected=%#v artifact=%s", projected, artifact.ContentJSON)
	}
	if payload.Items[0]["logicalAssetId"] != "character-001" || payload.Items[1]["imagePrompt"] != "干净场景母版" || len(artifact.ArtifactIDs) != 2 {
		t.Fatalf("payload=%#v artifact=%#v", payload, artifact)
	}
}

func TestWorkflowInvocationReviewAndApplyDelegateToRuntime(t *testing.T) {
	setupVideoWorkflowTest(t)
	seedWorkflowInvocationCredits(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetExtraction, "workflow-review-apply")
	if err != nil {
		t.Fatal(err)
	}
	raw := `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁进入房间。"],"coreFacts":["主要角色"]}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "workflow-review-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	detail, _ = GetWorkflowRunDetail("user-1", detail.Run.ID)
	projected := workflowTestStage(detail, WorkflowStageAssetExtraction)
	artifact := detail.Artifacts[len(detail.Artifacts)-1]
	approved, err := ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: artifact.ContentHash, Comment: "通过"})
	if err != nil || approved.Status != model.WorkflowStageRunStatusApproved || approved.ReviewedArtifactHash != artifact.ContentHash {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
	applied, err := ApplyWorkflowStage("user-1", stage.ID, WorkflowApplyInput{ArtifactHash: artifact.ContentHash, Target: "asset_store", TargetIDs: []string{"asset-1"}, AppliedCount: 1, Version: "local-v1"})
	if err != nil || applied.Status != model.WorkflowStageRunStatusApplied || applied.ApplyReceiptJSON == "" {
		t.Fatalf("applied=%#v err=%v", applied, err)
	}
	receipt, ok, err := repository.GetWorkflowLocalApplyReceiptByInvocation("user-1", projected.InvocationID)
	if err != nil || !ok || receipt.StageRunID != stage.ID || receipt.AppliedCount != 1 {
		t.Fatalf("receipt=%#v ok=%v err=%v", receipt, ok, err)
	}
	replayed, err := ApplyWorkflowStage("user-1", stage.ID, WorkflowApplyInput{ArtifactHash: artifact.ContentHash, Target: "asset_store", TargetIDs: []string{"asset-1"}, AppliedCount: 1, Version: "local-v1"})
	if err != nil || replayed.Status != model.WorkflowStageRunStatusApplied {
		t.Fatalf("replayed=%#v err=%v", replayed, err)
	}
}

func TestWorkflowInvocationCancelAndRetryAppendAttempt(t *testing.T) {
	setupVideoWorkflowTest(t)
	seedWorkflowInvocationCredits(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetExtraction, "workflow-cancel-retry")
	if err != nil {
		t.Fatal(err)
	}
	cancelled, err := CancelWorkflowStage("user-1", stage.ID)
	if err != nil || cancelled.Status != model.WorkflowStageRunStatusCancelled {
		t.Fatalf("cancelled=%#v err=%v", cancelled, err)
	}
	retried, err := RetryWorkflowStage("user-1", stage.ID, "workflow-retry-2")
	if err != nil || retried.ID == stage.ID || retried.ParentStageRunID != stage.ID || retried.InvocationID != stage.InvocationID || retried.Attempt != 2 || retried.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("retried=%#v err=%v", retried, err)
	}
	replayed, err := RetryWorkflowStage("user-1", stage.ID, "workflow-retry-2")
	if err != nil || replayed.ID != retried.ID || replayed.Attempt != 2 {
		t.Fatalf("replayed=%#v err=%v", replayed, err)
	}
}

func TestStartWorkflowStageCreatesAndConfirmsInvocation(t *testing.T) {
	setupVideoWorkflowTest(t)
	seedWorkflowInvocationCredits(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetExtraction, "workflow-start-1")
	if err != nil {
		t.Fatal(err)
	}
	if stage.InvocationID == "" || stage.AgentRunID == "" || stage.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("stage=%#v", stage)
	}
	run, ok, err := repository.GetUserInvocation("user-1", stage.InvocationID)
	if err != nil || !ok || run.Source != "workflow" || run.LatestAttempt != 1 || run.Status != model.InvocationStatusQueued {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
	replayed, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetExtraction, "workflow-start-1")
	if err != nil || replayed.ID != stage.ID || replayed.InvocationID != stage.InvocationID {
		t.Fatalf("replayed=%#v err=%v", replayed, err)
	}
}

func TestProjectWorkflowInvocationUsesAuthoritativeArtifactSet(t *testing.T) {
	setupVideoWorkflowTest(t)
	seedWorkflowInvocationCredits(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetExtraction, "workflow-project-1")
	if err != nil {
		t.Fatal(err)
	}
	raw := `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁进入房间。"],"coreFacts":["主要角色"]}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "workflow-projection-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	detail, err = GetWorkflowRunDetail("user-1", detail.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	projected := workflowTestStage(detail, WorkflowStageAssetExtraction)
	if projected.ID != stage.ID || projected.Status != model.WorkflowStageRunStatusNeedsReview || projected.OutputArtifactID == "" {
		t.Fatalf("projected=%#v", projected)
	}
	if len(detail.Artifacts) != 2 || detail.Artifacts[1].ContentHash == "" || len(detail.Artifacts[1].ArtifactIDs) != 1 {
		t.Fatalf("artifacts=%#v", detail.Artifacts)
	}
	if len(detail.Gates) != 2 || !detail.Gates[1].Passed || detail.Gates[1].ArtifactID != projected.OutputArtifactID {
		t.Fatalf("gates=%#v", detail.Gates)
	}
	if len(detail.AgentRuns) != 1 || detail.AgentRuns[0].ID != projected.AgentRunID {
		t.Fatalf("agentRuns=%#v", detail.AgentRuns)
	}
}

func seedWorkflowInvocationCredits(t *testing.T) {
	t.Helper()
	user, ok, err := repository.GetUserByID("user-1")
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		user = model.User{ID: "user-1", Username: "workflow-user", AffCode: "workflow-aff", Role: model.UserRoleUser, Status: model.UserStatusActive}
	}
	if user.Credits < 100 {
		user.Credits = 100
	}
	if _, err := repository.SaveUser(user); err != nil {
		t.Fatal(err)
	}
}
