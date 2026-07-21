package service

import (
	"context"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestWorkflowSkillEvaluationNeverWritesBusinessDataAndUsesSameInput(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	draft := createWorkflowSkillTestDraft(t, WorkflowSkillStageArt, "1.2.0")
	restore := useWorkflowSkillEvaluationExecutor(t, fakeWorkflowSkillExecutor{output: `{"directorSummary":"压迫感","items":[{"id":"character-1","kind":"character","name":"阿宁","prompt":"三视图角色设定"}]}`})
	defer restore()
	beforeStages, beforeArtifacts := workflowEvaluationBusinessCounts(t)

	result, err := EvaluateWorkflowSkill("admin-1", draft.ID, WorkflowSkillEvaluationInput{WorkflowRunID: detail.Run.ID, ConfirmAPICost: true})
	if err != nil || result.Evaluation.Status != "passed" {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	afterStages, afterArtifacts := workflowEvaluationBusinessCounts(t)
	if beforeStages != afterStages || beforeArtifacts != afterArtifacts {
		t.Fatalf("business writes before=%d/%d after=%d/%d", beforeStages, beforeArtifacts, afterStages, afterArtifacts)
	}
	if result.Evaluation.InputHash == "" || result.Evaluation.BaselineVersionID == "" || result.Diff["sameInput"] != true {
		t.Fatalf("result=%+v", result)
	}
	if _, err := PublishWorkflowSkillVersion("admin-1", draft.ID, WorkflowSkillPublishInput{Scope: model.WorkflowSkillScopeProject, ScopeID: detail.Run.ProjectID}); err != nil {
		t.Fatalf("publish after passed evaluation: %v", err)
	}
	global, err := PublishWorkflowSkillVersion("admin-1", draft.ID, WorkflowSkillPublishInput{Scope: model.WorkflowSkillScopeGlobal})
	if err != nil || global.Version.ID != draft.ID || global.Binding.Scope != model.WorkflowSkillScopeGlobal {
		t.Fatalf("promote global=%+v err=%v", global, err)
	}
}

func TestWorkflowSkillAPIEvaluationRequiresExplicitCostConfirmation(t *testing.T) {
	setupVideoWorkflowTest(t)
	detail := ensureVideoWorkflowTestRun(t)
	draft := createWorkflowSkillTestDraft(t, WorkflowSkillStageArt, "1.3.0")
	restore := useWorkflowSkillEvaluationExecutor(t, fakeWorkflowSkillExecutor{output: `{}`})
	defer restore()
	_, err := EvaluateWorkflowSkill("admin-1", draft.ID, WorkflowSkillEvaluationInput{WorkflowRunID: detail.Run.ID})
	if err == nil || !strings.Contains(err.Error(), "显式确认") {
		t.Fatalf("err=%v", err)
	}
}

type fakeWorkflowSkillExecutor struct{ output string }

func (fakeWorkflowSkillExecutor) Kind() string                    { return AgentRunExecutorAPI }
func (fakeWorkflowSkillExecutor) Available(context.Context) error { return nil }
func (fake fakeWorkflowSkillExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	return agentRunCallResult{rawOutput: fake.output, structuredJSON: fake.output}
}
func (fakeWorkflowSkillExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (fakeWorkflowSkillExecutor) RefundCredits(*model.AgentRun) error  { return nil }

func useWorkflowSkillEvaluationExecutor(t *testing.T, executor AgentRunExecutor) func() {
	t.Helper()
	previous := workflowSkillEvaluationExecutorFactory
	workflowSkillEvaluationExecutorFactory = func() (AgentRunExecutor, error) { return executor, nil }
	return func() { workflowSkillEvaluationExecutorFactory = previous }
}

func workflowEvaluationBusinessCounts(t *testing.T) (int64, int64) {
	t.Helper()
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	var stages, artifacts int64
	if err := db.Model(&model.WorkflowStageRun{}).Count(&stages).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.WorkflowArtifact{}).Count(&artifacts).Error; err != nil {
		t.Fatal(err)
	}
	return stages, artifacts
}
