package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
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
	if stage := workflowTestStage(detail, WorkflowStageShotBreakdown); stage.Status != model.WorkflowStageRunStatusReady {
		t.Fatalf("shot breakdown=%#v", stage)
	}
	if stage := workflowTestStage(detail, WorkflowStageShotPrompt); stage.Status != model.WorkflowStageRunStatusBlocked {
		t.Fatalf("shot prompt=%#v", stage)
	}
}

func TestWorkflowShotBreakdownRequiresApprovedAssetCatalog(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	if _, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageShotBreakdown, "idem-storyboard-blocked"); err == nil || !strings.Contains(err.Error(), "资产提取") {
		t.Fatalf("err=%v", err)
	}
	detail = approveWorkflowStageForTest(t, detail, WorkflowStageAssetExtraction, `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁进入房间。"],"coreFacts":["主要角色"]}]}`)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageShotBreakdown, "idem-storyboard")
	if err != nil || stage.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("stage=%#v err=%v", stage, err)
	}
}

func TestReviewRejectsArtifactHashMismatch(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageArtDesign, "idem-art")
	if err != nil {
		t.Fatalf("StartWorkflowStage returned error: %v", err)
	}
	seedWorkflowInvocationCredits(t)
	runWorkflowInvocationWorkerForTest(t, `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁进入房间。"],"coreFacts":["主要角色"]}]}`)
	_, err = ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: "old"})
	if err == nil || !strings.Contains(err.Error(), "已变化") {
		t.Fatalf("err=%v", err)
	}
}

func TestInvalidOutputFailsInvocationBeforeReview(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageArtDesign, "idem-art-invalid")
	if err != nil {
		t.Fatalf("StartWorkflowStage returned error: %v", err)
	}
	seedWorkflowInvocationCredits(t)
	runWorkflowInvocationWorkerForTest(t, `{"summary":"missing items"}`)
	invocation, err := GetInvocationDetail("user-1", stage.InvocationID)
	if err != nil || invocation.Run.Status != model.InvocationStatusFailed || len(invocation.OutputArtifacts) != 0 {
		t.Fatalf("invocation=%#v err=%v", invocation, err)
	}
	if _, err = ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: "missing"}); err == nil || !strings.Contains(err.Error(), "待审核产物不存在") {
		t.Fatalf("review err=%v", err)
	}
}

func TestAppliedAssetImagesUnlockStoryboard(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	stage := completeVideoWorkflowArtStage(t, detail, "idem-art-approved")
	detail = mustWorkflowDetailForTest(t, detail.Run.ID)
	artifact := workflowTestArtifact(detail, stage.ID)
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
	runWorkflowInvocationWorkerForTest(t, `{"outputs":[{"bindingName":"asset_brief","ordinal":0,"payload":{"assetId":"character-001","brief":"可执行三视图角色设定","format":"character-four-view"}}]}`)
	detail = mustWorkflowDetailForTest(t, detail.Run.ID)
	assetArtifact := workflowTestArtifact(detail, assetStage.ID)
	if _, err := ReviewWorkflowStage("user-1", assetStage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: assetArtifact.ContentHash}); err != nil {
		t.Fatalf("approve assets: %v", err)
	}
	storyboard, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageShotBreakdown, "idem-storyboard-parallel")
	if err != nil || storyboard.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("storyboard should run independently from asset images: %#v err=%v", storyboard, err)
	}
	if _, err := ApplyWorkflowStage("user-1", assetStage.ID, WorkflowApplyInput{ArtifactHash: assetArtifact.ContentHash, Target: "asset_store", TargetIDs: []string{"asset-1"}, AppliedCount: 1, Version: "local-v1"}); err != nil {
		t.Fatalf("apply asset images: %v", err)
	}
	storyboard, err = StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageShotBreakdown, "idem-storyboard-approved")
	if err != nil || storyboard.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("storyboard=%#v err=%v", storyboard, err)
	}
}

func TestShotPromptRequiresConfirmedBoundedContext(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	detail = approveWorkflowStageForTest(t, detail, WorkflowStageAssetExtraction, `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁进入房间。"],"coreFacts":["主要角色"]}]}`)
	detail = approveWorkflowStageForTest(t, detail, WorkflowStageAssetImagePrompt, `{"outputs":[{"bindingName":"asset_brief","ordinal":0,"payload":{"assetId":"character-001","brief":"角色设定图","format":"character-four-view"}}]}`)
	detail = approveWorkflowStageForTest(t, detail, WorkflowStageShotBreakdown, `{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"阿宁进入房间。","shotDraft":{"shotSize":"中景","camera":"固定机位","movement":"缓慢推近","action":"阿宁进入房间","performance":"克制","dialogue":"","durationSeconds":6,"continuityMode":"continuous"}}]}`)

	_, err := StartWorkflowStageWithInput("user-1", detail.Run.ID, WorkflowStageShotPrompt, WorkflowStageStartInput{IdempotencyKey: "shot-prompt-missing"})
	if err == nil || !strings.Contains(err.Error(), "镜头上下文") {
		t.Fatalf("missing context err=%v", err)
	}
	referencedContext := json.RawMessage(`{"shotId":"shot-001","sourceScript":"阿宁进入房间。","shotDraft":{"shotSize":"中景","camera":"固定机位","movement":"缓慢推近","action":"阿宁进入房间","performance":"克制","dialogue":"","durationSeconds":6,"continuityMode":"continuous"},"promptInputHash":"wf2-reference","references":[{"role":"character","label":"阿宁","logicalAssetId":"character-001","libraryAssetId":"asset-1","version":"v1","usage":"角色一致性"}]}`)
	if _, err := StartWorkflowStageWithInput("user-1", detail.Run.ID, WorkflowStageShotPrompt, WorkflowStageStartInput{IdempotencyKey: "shot-prompt-reference-missing-media", Context: referencedContext}); err == nil || !strings.Contains(err.Error(), "参考图片") {
		t.Fatalf("missing media err=%v", err)
	}
	context := json.RawMessage(`{"shotId":"shot-001","sourceScript":"阿宁进入房间。","shotDraft":{"shotSize":"中景","camera":"固定机位","movement":"缓慢推近","action":"阿宁进入房间","performance":"克制","dialogue":"","durationSeconds":6,"continuityMode":"continuous"},"promptInputHash":"wf2-test","references":[]}`)
	stage, err := StartWorkflowStageWithInput("user-1", detail.Run.ID, WorkflowStageShotPrompt, WorkflowStageStartInput{IdempotencyKey: "shot-prompt-valid", Context: context})
	if err != nil || stage.Status != model.WorkflowStageRunStatusQueued {
		t.Fatalf("stage=%#v err=%v", stage, err)
	}
}

func TestShotPromptQualityGateRejectsWrongInputHash(t *testing.T) {
	report := ValidateShotPromptArtifact(json.RawMessage(`{"shotId":"shot-001","promptInputHash":"wrong","referenceEvidence":[],"prompt":"场景：室内。\n声音：环境音。\n画面内容：0-6秒，阿宁走进房间。\n限制：无字幕。"}`))
	validateWorkflowShotPromptInputIdentity([]byte(`{"shotId":"shot-001","promptInputHash":"wrong","referenceEvidence":[],"prompt":"场景：室内。\n声音：环境音。\n画面内容：0-6秒，阿宁走进房间。\n限制：无字幕。"}`), `{"metadata":{"sourceSnapshot":{"shotId":"shot-001","promptInputHash":"expected"}}}`, &report)
	if report.Passed || len(report.Issues) == 0 || report.Issues[len(report.Issues)-1].Code != "prompt_input_hash_mismatch" {
		t.Fatalf("report=%+v", report)
	}
}

func TestNormalizeWorkflowArtifactContentRepairsStableAssetIDs(t *testing.T) {
	raw := []byte(`{"items":[{"logicalAssetId":"CHAR001","kind":"CHAR","name":"林秋"},{"logicalAssetId":"scene_2","kind":"SCENE","name":"土坯房"}]}`)
	normalized := normalizeWorkflowArtifactContent(WorkflowStageAssetExtraction, raw)
	var payload struct {
		Items []struct {
			LogicalAssetID string `json:"logicalAssetId"`
			Kind           string `json:"kind"`
		} `json:"items"`
	}
	if json.Unmarshal(normalized, &payload) != nil || len(payload.Items) != 2 {
		t.Fatalf("normalized=%s", normalized)
	}
	if payload.Items[0].LogicalAssetID != "CHAR-001" || payload.Items[0].Kind != "character" || payload.Items[1].LogicalAssetID != "SCENE-002" || payload.Items[1].Kind != "scene" {
		t.Fatalf("items=%+v", payload.Items)
	}
}

func TestAssetImagePromptQualityGateKeepsExactUpstreamIDs(t *testing.T) {
	report := ValidateAssetImagePromptArtifact(json.RawMessage(`{"items":[{"logicalAssetId":"CHAR-001","kind":"character","name":"林秋","scriptEvidence":"林秋进门","description":"角色","imagePrompt":"角色设定图","status":"ready"},{"logicalAssetId":"SCENE-002","kind":"scene","name":"房间","scriptEvidence":"房内","description":"场景","imagePrompt":"场景设定图","status":"ready"}]}`))
	validateWorkflowAssetIdentity([]byte(`{"items":[{"logicalAssetId":"CHAR-001"},{"logicalAssetId":"SCENE-001"}]}`), []byte(`{"items":[{"logicalAssetId":"CHAR-001"},{"logicalAssetId":"SCENE-002"}]}`), &report)
	if report.Passed {
		t.Fatal("expected asset identity mismatch")
	}
	codes := map[string]bool{}
	for _, issue := range report.Issues {
		codes[issue.Code] = true
	}
	if !codes["missing_upstream_asset"] || !codes["unexpected_asset_id"] {
		t.Fatalf("issues=%+v", report.Issues)
	}
}

func TestValidateAssetExtractionArtifactAcceptsCharacterVariant(t *testing.T) {
	report := ValidateAssetExtractionArtifact(json.RawMessage(`{"items":[
		{"logicalAssetId":"CHAR-001","kind":"character","name":"林秋","scriptEvidence":"林秋躺在床上","description":"六十岁女性"},
		{"logicalAssetId":"COSTUME-001","kind":"costume","name":"病中旧棉衣","scriptEvidence":"林秋穿着旧棉衣","description":"褪色旧棉衣","parentLogicalAssetId":"CHAR-001","variantType":"costume","variantName":"病中旧棉衣"}
	]}`))
	if !report.Passed {
		t.Fatalf("expected linked variant to pass: %+v", report.Issues)
	}
}

func TestValidateAssetExtractionArtifactRejectsOrphanCharacterVariant(t *testing.T) {
	report := ValidateAssetExtractionArtifact(json.RawMessage(`{"items":[
		{"logicalAssetId":"COSTUME-001","kind":"costume","name":"旧棉衣","scriptEvidence":"她穿旧棉衣","description":"褪色旧棉衣","parentLogicalAssetId":"CHAR-999","variantType":"costume","variantName":"旧棉衣"}
	]}`))
	if report.Passed {
		t.Fatal("expected orphan variant to fail")
	}
	codes := map[string]bool{}
	for _, issue := range report.Issues {
		codes[issue.Code] = true
	}
	if !codes["invalid_variant_parent"] {
		t.Fatalf("issues=%+v", report.Issues)
	}
}

func TestAssetImagePromptQualityGatePreservesCharacterVariantRelationship(t *testing.T) {
	report := ValidateAssetImagePromptArtifact(json.RawMessage(`{"items":[
		{"logicalAssetId":"CHAR-001","kind":"character","name":"林秋","scriptEvidence":"林秋","description":"角色","imagePrompt":"角色设定图","status":"ready"},
		{"logicalAssetId":"COSTUME-001","kind":"costume","name":"旧棉衣","scriptEvidence":"穿旧棉衣","description":"服装","imagePrompt":"服装设定图","status":"ready","parentLogicalAssetId":"CHAR-001","variantType":"costume","variantName":"另一个名称"}
	]}`))
	validateWorkflowAssetIdentity(
		[]byte(`{"items":[{"logicalAssetId":"CHAR-001"},{"logicalAssetId":"COSTUME-001","parentLogicalAssetId":"CHAR-001","variantType":"costume","variantName":"旧棉衣"}]}`),
		[]byte(`{"items":[{"logicalAssetId":"CHAR-001"},{"logicalAssetId":"COSTUME-001","parentLogicalAssetId":"CHAR-001","variantType":"costume","variantName":"另一个名称"}]}`),
		&report,
	)
	if report.Passed {
		t.Fatal("expected changed character variant relationship to fail")
	}
	if report.Issues[len(report.Issues)-1].Code != "changed_asset_relationship" {
		t.Fatalf("issues=%+v", report.Issues)
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
	seedWorkflowInvocationCredits(t)
	runWorkflowInvocationWorkerForTest(t, `{"items":[{"assetId":"character-001","kind":"character","name":"阿宁","sourceEvidence":["阿宁进入房间。"],"coreFacts":["主要角色"]}]}`)
	detail = mustWorkflowDetailForTest(t, detail.Run.ID)
	return workflowTestStage(detail, stage.StageID)
}

func approveWorkflowStageForTest(t *testing.T, detail WorkflowRunDetail, stageID string, output string) WorkflowRunDetail {
	t.Helper()
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, stageID, "approve-"+stageID)
	if err != nil {
		t.Fatalf("start %s: %v", stageID, err)
	}
	seedWorkflowInvocationCredits(t)
	runWorkflowInvocationWorkerForTest(t, output)
	detail = mustWorkflowDetailForTest(t, detail.Run.ID)
	artifact := workflowTestArtifact(detail, stage.ID)
	if _, err := ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: artifact.ContentHash}); err != nil {
		t.Fatalf("approve %s: %v", stageID, err)
	}
	if stageID == WorkflowStageAssetImagePrompt {
		if _, err := ApplyWorkflowStage("user-1", stage.ID, WorkflowApplyInput{ArtifactHash: artifact.ContentHash, Target: "asset_store", TargetIDs: []string{"asset-1"}, AppliedCount: 1, Version: "test-v1"}); err != nil {
			t.Fatalf("apply %s: %v", stageID, err)
		}
	}
	return mustWorkflowDetailForTest(t, detail.Run.ID)
}

func runWorkflowInvocationWorkerForTest(t *testing.T, output string) {
	t.Helper()
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: newID("workflow-test-worker"), LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: output, structuredJSON: output}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func workflowTestArtifact(detail WorkflowRunDetail, stageRunID string) model.WorkflowArtifact {
	for _, artifact := range detail.Artifacts {
		if artifact.StageRunID == stageRunID {
			return artifact
		}
	}
	return model.WorkflowArtifact{}
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
