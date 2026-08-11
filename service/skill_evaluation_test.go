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

func TestEvaluateSkillRejectsBlankPrimaryVersionWithoutWrites(t *testing.T) {
	setupInvocationServiceTest(t)
	db, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	for _, versionID := range []string{"", "  "} {
		var beforeEvaluations, beforeAudits int64
		if err := db.Model(&model.SkillEvaluation{}).Count(&beforeEvaluations).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Model(&model.SkillAuditLog{}).Count(&beforeAudits).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := EvaluateSkill("admin-1", versionID, SkillEvaluationInput{}); err == nil || !strings.Contains(err.Error(), "Skill 版本不存在") {
			t.Fatalf("versionID=%q err=%v", versionID, err)
		}
		var afterEvaluations, afterAudits int64
		_ = db.Model(&model.SkillEvaluation{}).Count(&afterEvaluations).Error
		_ = db.Model(&model.SkillAuditLog{}).Count(&afterAudits).Error
		if afterEvaluations != beforeEvaluations || afterAudits != beforeAudits {
			t.Fatalf("versionID=%q evaluations=%d/%d audits=%d/%d", versionID, beforeEvaluations, afterEvaluations, beforeAudits, afterAudits)
		}
	}
}

func TestEvaluateSkillRejectsUnavailableBaselineBeforeExecutorCall(t *testing.T) {
	for _, test := range []struct {
		name    string
		prepare func(*testing.T, model.SkillVersion) string
	}{
		{name: "missing", prepare: func(*testing.T, model.SkillVersion) string { return "missing-baseline-version" }},
		{name: "legacy project", prepare: func(t *testing.T, candidate model.SkillVersion) string {
			skill := model.SkillDefinition{ID: "project-baseline-skill", Name: "Project", OwnerType: model.SkillOwnerType("project"), Enabled: true}
			version := candidate
			version.ID, version.SkillID, version.Version = "project-baseline-version", skill.ID, "1.0.0-project"
			if err := repository.CreateSkillAggregate(skill, version); err != nil {
				t.Fatal(err)
			}
			return version.ID
		}},
		{name: "archived", prepare: func(t *testing.T, candidate model.SkillVersion) string {
			skill := model.SkillDefinition{ID: "archived-baseline-skill", Name: "Archived", OwnerType: model.SkillOwnerSystem, Enabled: true}
			version := candidate
			version.ID, version.SkillID, version.Version, version.Status = "archived-baseline-version", skill.ID, "1.0.0-archived", model.SkillVersionArchived
			if err := repository.CreateSkillAggregate(skill, version); err != nil {
				t.Fatal(err)
			}
			return version.ID
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			setupVideoWorkflowTest(t)
			detail := ensureVideoWorkflowTestRun(t)
			candidate := createSkillTestDraft(t, "workflow.stage.art", "1.4.0")
			baselineVersionID := test.prepare(t, candidate)
			calls := 0
			restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{}`, calls: &calls})
			defer restore()
			database, _ := repository.DB()
			var beforeEvaluations, beforeAudits int64
			_ = database.Model(&model.SkillEvaluation{}).Count(&beforeEvaluations).Error
			_ = database.Model(&model.SkillAuditLog{}).Count(&beforeAudits).Error
			_, err := EvaluateSkill("admin-1", candidate.ID, SkillEvaluationInput{WorkflowRunID: detail.Run.ID, BaselineVersionID: baselineVersionID, ConfirmAPICost: true})
			if err == nil || calls != 0 {
				t.Fatalf("err=%v calls=%d", err, calls)
			}
			var afterEvaluations, afterAudits int64
			_ = database.Model(&model.SkillEvaluation{}).Count(&afterEvaluations).Error
			_ = database.Model(&model.SkillAuditLog{}).Count(&afterAudits).Error
			if afterEvaluations != beforeEvaluations || afterAudits != beforeAudits {
				t.Fatalf("evaluations=%d/%d audits=%d/%d", beforeEvaluations, afterEvaluations, beforeAudits, afterAudits)
			}
		})
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
	stored, err := GetManagedSkillEvaluationResult("admin-1", result.Evaluation.ID, true)
	if err != nil || stored.Diff["sameInput"] != true {
		t.Fatalf("stored=%+v err=%v", stored, err)
	}
	if _, err := GetManagedSkillEvaluationResult("user-1", result.Evaluation.ID, false); err == nil {
		t.Fatal("non-admin read a managed Skill evaluation")
	}
}

type fakeSkillExecutor struct {
	output string
	calls  *int
}

func (fakeSkillExecutor) Kind() string                         { return AgentRunExecutorAPI }
func (fakeSkillExecutor) Available(context.Context) error      { return nil }
func (fakeSkillExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (fakeSkillExecutor) RefundCredits(*model.AgentRun) error  { return nil }
func (fake fakeSkillExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	if fake.calls != nil {
		*fake.calls = *fake.calls + 1
	}
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
