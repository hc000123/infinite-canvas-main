package service

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const productionWorkflowBusStopScript = `场次 1，清晨，旧公交站。
林秋站在站牌下，手里捏着一张折起的车票。公交车由远及近。
林秋低声说：“这次不等了。”
她把车票收进口袋，向车门走去。`

func TestProductionWorkflowInvocationE2E(t *testing.T) {
	setupVideoWorkflowTest(t)
	seedWorkflowInvocationCredits(t)
	detail, err := EnsureWorkflowRun("user-1", EnsureWorkflowRunInput{
		ProjectID: "project-bus-stop", EpisodeID: "episode-bus-stop", ScriptSnapshot: productionWorkflowBusStopScript, ScriptConfirmed: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	productionStage := workflowTestStage(detail, WorkflowStageScriptAdaptation)
	productionArtifact, err := GetArtifact("user-1", productionStage.OutputArtifactID)
	if err != nil || productionArtifact.Artifact.ArtifactType != "production_script" || productionArtifact.Payload["productionScript"] != productionWorkflowBusStopScript {
		t.Fatalf("production artifact=%#v err=%v", productionArtifact, err)
	}

	catalogJSON := `{"items":[{"assetId":"character-001","kind":"character","name":"林秋","sourceEvidence":["林秋站在站牌下，手里捏着一张折起的车票。","林秋低声说：“这次不等了。”"],"coreFacts":["主要角色","手持折起的车票"]},{"assetId":"scene-001","kind":"scene","name":"旧公交站","sourceEvidence":["场次 1，清晨，旧公交站。"],"coreFacts":["清晨","公交站"]},{"assetId":"prop-001","kind":"prop","name":"折起的车票","sourceEvidence":["手里捏着一张折起的车票","她把车票收进口袋"],"coreFacts":["折起","由林秋持有"]}]}`
	extraction, _ := completeAndApproveWorkflowE2EStage(t, detail.Run.ID, WorkflowStageAssetExtraction, "bus-extraction", catalogJSON)
	catalogInvocation := mustWorkflowInvocationE2EDetail(t, extraction.InvocationID)
	assertWorkflowInvocationE2ELineage(t, catalogInvocation, []string{productionArtifact.Artifact.ID})
	assertBusStopCatalogEvidence(t, catalogInvocation.OutputArtifacts[0].Payload)

	briefJSON := `{"outputs":[{"bindingName":"asset_brief","ordinal":0,"payload":{"assetId":"character-001","brief":"林秋角色四视图，固定清晨服装与折起车票","format":"character-four-view"}},{"bindingName":"asset_brief","ordinal":1,"payload":{"assetId":"scene-001","brief":"无人物旧公交站清晨场景母版","format":"scene-master"}},{"bindingName":"asset_brief","ordinal":2,"payload":{"assetId":"prop-001","brief":"折起车票道具多角度设定","format":"prop-turnaround"}}]}`
	brief, briefArtifact := completeAndApproveWorkflowE2EStage(t, detail.Run.ID, WorkflowStageAssetImagePrompt, "bus-brief", briefJSON)
	briefInvocation := mustWorkflowInvocationE2EDetail(t, brief.InvocationID)
	assertWorkflowInvocationE2ELineage(t, briefInvocation, []string{catalogInvocation.OutputArtifacts[0].Artifact.ID})
	applyWorkflowE2EStage(t, brief, briefArtifact, "asset_store", []string{"character-001", "scene-001", "prop-001"}, "bus-assets-v1")

	storyboardJSON := `{"shots":[{"shotId":"shot-001","sceneKey":"scene-001","sourceScript":"林秋站在站牌下，手里捏着一张折起的车票。公交车由远及近。","shotDraft":{"shotSize":"中景","camera":"平视","movement":"缓慢推近","action":"林秋捏着折起的车票等待，公交车由远及近","performance":"克制而坚定","dialogue":"","durationSeconds":7,"continuityMode":"continuous"}},{"shotId":"shot-002","sceneKey":"scene-001","sourceScript":"林秋低声说：“这次不等了。”\n她把车票收进口袋，向车门走去。","shotDraft":{"shotSize":"中近景","camera":"平视","movement":"跟拍","action":"林秋说完后收起车票走向车门","performance":"下定决心","dialogue":"这次不等了。","durationSeconds":7,"continuityMode":"continuous"}}]}`
	storyboard, storyboardArtifact := completeAndApproveWorkflowE2EStage(t, detail.Run.ID, WorkflowStageShotBreakdown, "bus-storyboard", storyboardJSON)
	storyboardInvocation := mustWorkflowInvocationE2EDetail(t, storyboard.InvocationID)
	assertWorkflowInvocationE2ELineage(t, storyboardInvocation, []string{productionArtifact.Artifact.ID, catalogInvocation.OutputArtifacts[0].Artifact.ID})
	applyWorkflowE2EStage(t, storyboard, storyboardArtifact, "storyboard_store", []string{"shot-001", "shot-002"}, "bus-storyboard-v1")

	shotContext := json.RawMessage(`{"shotId":"shot-001","sourceScript":"林秋站在站牌下，手里捏着一张折起的车票。公交车由远及近。","shotDraft":{"shotSize":"中景","camera":"平视","movement":"缓慢推近","action":"林秋捏着折起的车票等待，公交车由远及近","performance":"克制而坚定","dialogue":"","durationSeconds":7,"continuityMode":"continuous"},"promptInputHash":"bus-shot-001-v1","references":[]}`)
	shotPrompt, err := StartWorkflowStageWithInput("user-1", detail.Run.ID, WorkflowStageShotPrompt, WorkflowStageStartInput{IdempotencyKey: "bus-shot-prompt", Context: shotContext})
	if err != nil {
		t.Fatal(err)
	}
	beforeRetry := mustWorkflowInvocationE2EDetail(t, shotPrompt.InvocationID)
	if _, err := CancelWorkflowStage("user-1", shotPrompt.ID); err != nil {
		t.Fatal(err)
	}
	retried, err := RetryWorkflowStage("user-1", shotPrompt.ID, "bus-shot-prompt-retry")
	if err != nil || retried.InvocationID != shotPrompt.InvocationID || retried.Attempt != 2 {
		t.Fatalf("retried=%#v err=%v", retried, err)
	}
	afterRetry := mustWorkflowInvocationE2EDetail(t, retried.InvocationID)
	if len(beforeRetry.Revisions) != 1 || len(afterRetry.Revisions) != 1 || beforeRetry.Revisions[0].SkillVersionID != afterRetry.Revisions[0].SkillVersionID || beforeRetry.Revisions[0].SkillContentHash != afterRetry.Revisions[0].SkillContentHash {
		t.Fatalf("retry changed frozen Skill: before=%#v after=%#v", beforeRetry.Revisions, afterRetry.Revisions)
	}
	promptJSON := `{"outputs":[{"bindingName":"video_prompt_package","ordinal":0,"payload":{"items":[{"shotId":"shot-001","prompt":"场景：清晨的旧公交站，冷色自然光。\n声音：公交车驶近的环境声，无台词。\n画面内容：\n0-3秒：中景缓慢推近，林秋站在站牌下捏着折起的车票。\n3-7秒：公交车由远及近，林秋抬眼看向车门。\n限制：无字幕、无水印、无 logo。","inputArtifactRefs":[]}]}}]}`
	runWorkflowInvocationWorkerForTest(t, promptJSON)
	retriedRun, _, _ := repository.GetAgentRun(retried.AgentRunID)
	if retriedRun.Status == model.AgentRunStatusQueued {
		database, _ := repository.DB()
		var queued []model.AgentRun
		_ = database.Where("status = ?", model.AgentRunStatusQueued).Order("created_at asc").Find(&queued).Error
		t.Fatalf("retried AgentRun was not claimed: retried=%#v queued=%#v", retriedRun, queued)
	}
	detail = mustWorkflowDetailForTest(t, detail.Run.ID)
	shotPrompt = workflowTestStage(detail, WorkflowStageShotPrompt)
	shotPromptArtifact := workflowTestArtifact(detail, shotPrompt.ID)
	approved, err := ReviewWorkflowStage("user-1", shotPrompt.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: shotPromptArtifact.ContentHash})
	if err != nil || approved.Status != model.WorkflowStageRunStatusApproved {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
	shotInvocation := mustWorkflowInvocationE2EDetail(t, shotPrompt.InvocationID)
	assertWorkflowInvocationE2ELineage(t, shotInvocation, []string{storyboardInvocation.OutputArtifacts[0].Artifact.ID, catalogInvocation.OutputArtifacts[0].Artifact.ID})
	applyWorkflowE2EStage(t, shotPrompt, shotPromptArtifact, "video_prompt_store", []string{"shot-001"}, "bus-video-prompt-v1")

	assertWorkflowE2ERefreshStable(t, detail.Run.ID)
	assertWorkflowE2ENoLegacyRows(t)
	t.Run("invalid output creates no approvable artifact", testProductionWorkflowInvalidOutput)
	t.Run("insufficient credits creates no approvable artifact", testProductionWorkflowInsufficientCredits)
}

func completeAndApproveWorkflowE2EStage(t *testing.T, workflowRunID, stageID, key, output string) (model.WorkflowStageRun, model.WorkflowArtifact) {
	t.Helper()
	stage, err := StartWorkflowStage("user-1", workflowRunID, stageID, key)
	if err != nil {
		t.Fatal(err)
	}
	runWorkflowInvocationWorkerForTest(t, output)
	detail := mustWorkflowDetailForTest(t, workflowRunID)
	stage = workflowTestStage(detail, stageID)
	artifact := workflowTestArtifact(detail, stage.ID)
	approved, err := ReviewWorkflowStage("user-1", stage.ID, WorkflowReviewInput{Decision: "approved", ArtifactHash: artifact.ContentHash})
	if err != nil || approved.Status != model.WorkflowStageRunStatusApproved {
		t.Fatalf("approve %s: stage=%#v artifact=%#v err=%v", stageID, approved, artifact, err)
	}
	return approved, artifact
}

func applyWorkflowE2EStage(t *testing.T, stage model.WorkflowStageRun, artifact model.WorkflowArtifact, target string, targetIDs []string, version string) {
	t.Helper()
	input := WorkflowApplyInput{ArtifactHash: artifact.ContentHash, Target: target, TargetIDs: targetIDs, AppliedCount: len(targetIDs), Version: version}
	first, err := ApplyWorkflowStage("user-1", stage.ID, input)
	if err != nil || first.Status != model.WorkflowStageRunStatusApplied {
		t.Fatalf("apply %s: stage=%#v err=%v", stage.StageID, first, err)
	}
	replayed, err := ApplyWorkflowStage("user-1", stage.ID, input)
	if err != nil || replayed.Status != model.WorkflowStageRunStatusApplied {
		t.Fatalf("replay apply %s: stage=%#v err=%v", stage.StageID, replayed, err)
	}
	database, _ := repository.DB()
	var count int64
	if err := database.Model(&model.WorkflowLocalApplyReceipt{}).Where("user_id = ? AND invocation_id = ?", "user-1", stage.InvocationID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("apply receipts=%d err=%v", count, err)
	}
}

func mustWorkflowInvocationE2EDetail(t *testing.T, invocationID string) InvocationDetail {
	t.Helper()
	detail, err := GetInvocationDetail("user-1", invocationID)
	if err != nil {
		t.Fatal(err)
	}
	return detail
}

func assertWorkflowInvocationE2ELineage(t *testing.T, detail InvocationDetail, expectedParents []string) {
	t.Helper()
	inputIDs := []string{}
	for _, ref := range detail.AuthoritativeArtifactRefs {
		if ref.Direction == "input" {
			inputIDs = append(inputIDs, ref.ArtifactID)
		}
	}
	slices.Sort(inputIDs)
	expected := slices.Clone(expectedParents)
	slices.Sort(expected)
	if !slices.Equal(inputIDs, expected) || len(detail.OutputArtifacts) == 0 {
		t.Fatalf("lineage inputs=%v expected=%v outputs=%#v", inputIDs, expected, detail.OutputArtifacts)
	}
	parents := slices.Clone(detail.OutputArtifacts[0].ParentArtifactIds)
	slices.Sort(parents)
	if !slices.Equal(parents, expected) {
		t.Fatalf("output parents=%v expected=%v", parents, expected)
	}
}

func assertBusStopCatalogEvidence(t *testing.T, payload map[string]any) {
	t.Helper()
	items := invocationObjectItems(payload, "items")
	if len(items) != 3 {
		t.Fatalf("catalog items=%#v", items)
	}
	wanted := map[string]bool{"character-001": false, "scene-001": false, "prop-001": false}
	for _, item := range items {
		id := invocationString(item, "assetId")
		if _, ok := wanted[id]; !ok {
			t.Fatalf("unexpected asset id %q", id)
		}
		wanted[id] = true
		for _, evidence := range invocationStringItems(item["sourceEvidence"]) {
			if !strings.Contains(productionWorkflowBusStopScript, evidence) {
				t.Fatalf("evidence is not exact source substring: %q", evidence)
			}
		}
	}
	for id, found := range wanted {
		if !found {
			t.Fatalf("missing asset %s", id)
		}
	}
}

func assertWorkflowE2ERefreshStable(t *testing.T, workflowRunID string) {
	t.Helper()
	before := mustWorkflowDetailForTest(t, workflowRunID)
	after := mustWorkflowDetailForTest(t, workflowRunID)
	if before.Run.ID != after.Run.ID || len(before.Stages) != len(after.Stages) || len(before.Artifacts) != len(after.Artifacts) {
		t.Fatalf("refresh changed aggregate: before=%#v after=%#v", before.Run, after.Run)
	}
	for index := range before.Stages {
		if before.Stages[index].ID != after.Stages[index].ID || before.Stages[index].InvocationID != after.Stages[index].InvocationID || before.Stages[index].OutputArtifactID != after.Stages[index].OutputArtifactID {
			t.Fatalf("refresh changed stage %d: before=%#v after=%#v", index, before.Stages[index], after.Stages[index])
		}
	}
	for index := range before.Artifacts {
		if before.Artifacts[index].ID != after.Artifacts[index].ID || before.Artifacts[index].ArtifactSetHash != after.Artifacts[index].ArtifactSetHash {
			t.Fatalf("refresh changed artifact %d: before=%#v after=%#v", index, before.Artifacts[index], after.Artifacts[index])
		}
	}
}

func assertWorkflowE2ENoLegacyRows(t *testing.T) {
	t.Helper()
	database, _ := repository.DB()
	if database.Migrator().HasTable(&model.WorkflowArtifact{}) || database.Migrator().HasTable(&model.WorkflowQualityGateResult{}) {
		t.Fatal("fresh database unexpectedly migrated legacy workflow content tables")
	}
}

func testProductionWorkflowInvalidOutput(t *testing.T) {
	detail, err := EnsureWorkflowRun("user-1", EnsureWorkflowRunInput{ProjectID: "project-bus-stop", EpisodeID: "episode-invalid", ScriptSnapshot: productionWorkflowBusStopScript, ScriptConfirmed: true})
	if err != nil {
		t.Fatal(err)
	}
	stage, err := StartWorkflowStage("user-1", detail.Run.ID, WorkflowStageAssetExtraction, "bus-invalid-output")
	if err != nil {
		t.Fatal(err)
	}
	runWorkflowInvocationWorkerForTest(t, `{"summary":"missing asset catalog"}`)
	invocation := mustWorkflowInvocationE2EDetail(t, stage.InvocationID)
	if invocation.Run.Status != model.InvocationStatusFailed || len(invocation.OutputArtifacts) != 0 {
		t.Fatalf("invalid output invocation=%#v artifacts=%#v", invocation.Run, invocation.OutputArtifacts)
	}
}

func testProductionWorkflowInsufficientCredits(t *testing.T) {
	stamp := now()
	if _, err := repository.SaveUser(model.User{ID: "user-no-credits", Username: "no-credits", AffCode: "no-credits-aff", Role: model.UserRoleUser, Status: model.UserStatusActive, Credits: 0, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	detail, err := EnsureWorkflowRun("user-no-credits", EnsureWorkflowRunInput{ProjectID: "project-bus-stop", EpisodeID: "episode-no-credits", ScriptSnapshot: productionWorkflowBusStopScript, ScriptConfirmed: true})
	if err != nil {
		t.Fatal(err)
	}
	stage, err := StartWorkflowStage("user-no-credits", detail.Run.ID, WorkflowStageAssetExtraction, "bus-no-credits")
	if err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "bus-no-credits-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: `{}`, structuredJSON: `{}`}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	invocation, err := GetInvocationDetail("user-no-credits", stage.InvocationID)
	stored, ok, storedErr := repository.GetUserInvocation("user-no-credits", stage.InvocationID)
	if err != nil || storedErr != nil || !ok || invocation.Run.Status != model.InvocationStatusFailed || !strings.Contains(stored.AggregateErrorSummary, "算力点不足") || len(invocation.OutputArtifacts) != 0 {
		t.Fatalf("insufficient credits invocation=%#v stored=%#v artifacts=%#v err=%v storedErr=%v", invocation.Run, stored, invocation.OutputArtifacts, err, storedErr)
	}
}
