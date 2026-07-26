package service

import (
	"context"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestEvaluateSkillUsesFrozenCandidateWithoutBusinessWrites(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	draft := createSkillTestDraft(t, "workflow.stage.art", "1.2.0")
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{"items":[{"logicalAssetId":"CHAR-001","kind":"character","name":"阿宁","scriptEvidence":"阿宁进入房间","description":"进入房间的年轻角色"}]}`})
	defer restore()
	beforeStages, beforeArtifacts := skillEvaluationBusinessCounts(t)
	result, err := EvaluateSkill("admin-1", draft.ID, SkillEvaluationInput{WorkflowRunID: detail.Run.ID, ConfirmAPICost: true})
	if err != nil || result.Evaluation.ContentHash != draft.ContentHash || result.Evaluation.Status != "passed" {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	afterStages, afterArtifacts := skillEvaluationBusinessCounts(t)
	if beforeStages != afterStages || beforeArtifacts != afterArtifacts {
		t.Fatalf("business writes before=%d/%d after=%d/%d", beforeStages, beforeArtifacts, afterStages, afterArtifacts)
	}
	stored, ok, err := repository.GetSkillVersion(draft.ID)
	if err != nil || !ok || !strings.Contains(stored.EvaluationSummaryJSON, result.Evaluation.ID) {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
}

func TestEvaluateSkillRequiresExplicitAPICostConfirmation(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	draft := createSkillTestDraft(t, "workflow.stage.art", "1.3.0")
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{}`})
	defer restore()
	_, err := EvaluateSkill("admin-1", draft.ID, SkillEvaluationInput{WorkflowRunID: detail.Run.ID})
	if err == nil || !strings.Contains(err.Error(), "显式确认") {
		t.Fatalf("err=%v", err)
	}
}

func TestDeterministicSkillEvaluationRoundTripsStoredDiff(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	if err := EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	skill, ok, err := repository.GetSkillDefinition("skill-system-workflow-delivery")
	if err != nil || !ok {
		t.Fatalf("skill=%+v ok=%v err=%v", skill, ok, err)
	}
	result, err := EvaluateSkill("admin-1", skill.RecommendedVersionID, SkillEvaluationInput{WorkflowRunID: detail.Run.ID})
	if err != nil {
		t.Fatal(err)
	}
	stored, err := GetSkillEvaluationResult(result.Evaluation.ID)
	if err != nil || stored.Diff["sameInput"] != true {
		t.Fatalf("stored=%+v err=%v", stored, err)
	}
}

type fakeSkillExecutor struct{ output string }

func (fakeSkillExecutor) Kind() string                         { return AgentRunExecutorAPI }
func (fakeSkillExecutor) Available(context.Context) error      { return nil }
func (fakeSkillExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (fakeSkillExecutor) RefundCredits(*model.AgentRun) error  { return nil }
func (fake fakeSkillExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	return agentRunCallResult{rawOutput: fake.output, structuredJSON: fake.output}
}

func useSkillEvaluationExecutor(t *testing.T, executor AgentRunExecutor) func() {
	t.Helper()
	previous := skillEvaluationExecutorFactory
	skillEvaluationExecutorFactory = func() (AgentRunExecutor, error) { return executor, nil }
	return func() { skillEvaluationExecutorFactory = previous }
}

func skillEvaluationBusinessCounts(t *testing.T) (int64, int64) {
	t.Helper()
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	var stages, artifacts int64
	if err := db.Model(&model.WorkflowStageRun{}).Count(&stages).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.Artifact{}).Count(&artifacts).Error; err != nil {
		t.Fatal(err)
	}
	return stages, artifacts
}
