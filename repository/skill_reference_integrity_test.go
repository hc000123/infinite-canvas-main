package repository

import (
	"errors"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestWorkflowStageBindingRevalidatesSkillTargetInWriteTransaction(t *testing.T) {
	for _, item := range []struct {
		name    string
		prepare func(*testing.T) string
		write   func(model.WorkflowStageSkillBinding) error
	}{
		{name: "save missing", prepare: func(*testing.T) string { return "missing-version" }, write: SaveWorkflowStageSkillBinding},
		{name: "upsert project owner", prepare: func(t *testing.T) string { return createReferenceTestSkill(t, "project", model.SkillOwnerProject, true, model.SkillVersionPublished).ID }, write: UpsertWorkflowStageSkillBinding},
		{name: "upsert with audit archived", prepare: func(t *testing.T) string { return createReferenceTestSkill(t, "archived", model.SkillOwnerSystem, true, model.SkillVersionArchived).ID }, write: func(binding model.WorkflowStageSkillBinding) error {
			return UpsertWorkflowStageSkillBindingWithSkillAudit(binding, model.SkillAuditLog{ID: "invalid-binding-audit"})
		}},
	} {
		t.Run(item.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			versionID := item.prepare(t)
			err := item.write(model.WorkflowStageSkillBinding{ID: "invalid-binding", StageKey: "art", Scope: model.WorkflowStageSkillScopeGlobal, SkillVersionID: versionID})
			if !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
				t.Fatalf("err=%v", err)
			}
			db, _ := DB()
			var bindings, audits int64
			_ = db.Model(&model.WorkflowStageSkillBinding{}).Count(&bindings).Error
			_ = db.Model(&model.SkillAuditLog{}).Where("id = ?", "invalid-binding-audit").Count(&audits).Error
			if bindings != 0 || audits != 0 {
				t.Fatalf("partial writes bindings=%d audits=%d", bindings, audits)
			}
		})
	}
}

func TestPublishWorkflowVersionRevalidatesStructuredSkillTargets(t *testing.T) {
	for _, item := range []struct {
		name      string
		prepare   func(*testing.T) string
		reference func(string) string
	}{
		{name: "missing version", prepare: func(*testing.T) string { return "missing-version" }, reference: workflowVersionReferenceJSON},
		{name: "project version", prepare: func(t *testing.T) string { return createReferenceTestSkill(t, "workflow-project", model.SkillOwnerProject, true, model.SkillVersionPublished).ID }, reference: workflowVersionReferenceJSON},
		{name: "archived version", prepare: func(t *testing.T) string { return createReferenceTestSkill(t, "workflow-archived", model.SkillOwnerSystem, true, model.SkillVersionArchived).ID }, reference: workflowVersionReferenceJSON},
		{name: "disabled skill id", prepare: func(t *testing.T) string { return createReferenceTestSkill(t, "workflow-disabled", model.SkillOwnerSystem, false, model.SkillVersionPublished).SkillID }, reference: workflowSkillReferenceJSON},
		{name: "project candidate", prepare: func(t *testing.T) string { return createReferenceTestSkill(t, "workflow-project-candidate", model.SkillOwnerProject, true, model.SkillVersionPublished).SkillID }, reference: workflowCandidateReferenceJSON},
	} {
		t.Run(item.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			referenceID := item.prepare(t)
			_, version := mustCreateWorkflowAggregate(t, model.WorkflowOwnerProject, "user-1", "project-1", "invalid-reference")
			originalPackage := version.PackageJSON
			version.PackageJSON = item.reference(referenceID)
			version.PublishedAt, version.UpdatedAt = "later", "later"
			if err := PublishWorkflowVersion(version); !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
				t.Fatalf("err=%v", err)
			}
			stored, ok, err := GetWorkflowVersion(version.ID)
			if err != nil || !ok || stored.Status != model.WorkflowVersionDraft || stored.PackageJSON != originalPackage {
				t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
			}
		})
	}
}

func TestPublishAgentVersionRevalidatesSkillTargets(t *testing.T) {
	for _, item := range []struct {
		name    string
		prepare func(*testing.T) (string, string)
	}{
		{name: "missing version", prepare: func(*testing.T) (string, string) { return `[{"skillVersionId":"missing-version"}]`, `{}` }},
		{name: "project version", prepare: func(t *testing.T) (string, string) { version := createReferenceTestSkill(t, "agent-project", model.SkillOwnerProject, true, model.SkillVersionPublished); return `[{"skillVersionId":"` + version.ID + `"}]`, `{}` }},
		{name: "archived version", prepare: func(t *testing.T) (string, string) { version := createReferenceTestSkill(t, "agent-archived", model.SkillOwnerSystem, true, model.SkillVersionArchived); return `[{"skillVersionId":"` + version.ID + `"}]`, `{}` }},
		{name: "project access id", prepare: func(t *testing.T) (string, string) { version := createReferenceTestSkill(t, "agent-access", model.SkillOwnerProject, true, model.SkillVersionPublished); return `[]`, `{"allowedSkillIds":["` + version.SkillID + `"]}` }},
	} {
		t.Run(item.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			refs, access := item.prepare(t)
			_, version := mustCreateAgentAggregate(t, model.AgentOwnerProject, "user-1", "project-1", "invalid-reference")
			version.DefaultSkillRefsJSON, version.SkillAccessPolicyJSON = refs, access
			if err := SaveAgentDraft(version); err != nil {
				t.Fatal(err)
			}
			version.PublishedAt, version.UpdatedAt = "later", "later"
			if err := PublishAgentVersion(version); !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
				t.Fatalf("err=%v", err)
			}
			stored, ok, err := GetAgentVersion(version.ID)
			if err != nil || !ok || stored.Status != model.AgentVersionDraft {
				t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
			}
		})
	}
}

func TestSkillEvaluationRevalidatesTargetsWithoutPartialWrites(t *testing.T) {
	for _, item := range []struct {
		name    string
		prepare func(*testing.T) string
	}{
		{name: "missing", prepare: func(*testing.T) string { return "missing-version" }},
		{name: "project", prepare: func(t *testing.T) string { return createReferenceTestSkill(t, "evaluation-project", model.SkillOwnerProject, true, model.SkillVersionDraft).ID }},
		{name: "archived", prepare: func(t *testing.T) string { return createReferenceTestSkill(t, "evaluation-archived", model.SkillOwnerSystem, true, model.SkillVersionArchived).ID }},
	} {
		t.Run(item.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			versionID := item.prepare(t)
			if err := CreateSkillEvaluation(model.SkillEvaluation{ID: "invalid-evaluation", SkillVersionID: versionID}); !errors.Is(err, ErrSkillEvaluationTargetUnavailable) {
				t.Fatalf("err=%v", err)
			}
			if _, ok, err := GetSkillEvaluation("invalid-evaluation"); err != nil || ok {
				t.Fatalf("evaluation ok=%v err=%v", ok, err)
			}
		})
	}

	setupRepositoryTestDB(t)
	candidate := createReferenceTestSkill(t, "evaluation-candidate", model.SkillOwnerSystem, true, model.SkillVersionDraft)
	baseline := createReferenceTestSkill(t, "evaluation-baseline", model.SkillOwnerSystem, true, model.SkillVersionArchived)
	db, _ := DB()
	if err := db.Model(&model.SkillVersion{}).Where("id = ?", candidate.ID).Update("evaluation_summary_json", "before").Error; err != nil {
		t.Fatal(err)
	}
	evaluation := model.SkillEvaluation{ID: "invalid-baseline-evaluation", SkillVersionID: candidate.ID, BaselineVersionID: baseline.ID}
	if err := CreateSkillEvaluationAndUpdateSummary(evaluation, "after", "later"); !errors.Is(err, ErrSkillEvaluationTargetUnavailable) {
		t.Fatalf("err=%v", err)
	}
	stored, ok, err := GetSkillVersion(candidate.ID)
	if err != nil || !ok || stored.EvaluationSummaryJSON != "before" {
		t.Fatalf("candidate=%+v ok=%v err=%v", stored, ok, err)
	}
	if _, ok, err := GetSkillEvaluation(evaluation.ID); err != nil || ok {
		t.Fatalf("evaluation ok=%v err=%v", ok, err)
	}
}

func TestSkillEvaluationRejectsBlankPrimaryVersionWithoutPartialWrites(t *testing.T) {
	for _, item := range []struct {
		name      string
		versionID string
		create    func(model.SkillEvaluation) error
	}{
		{name: "empty create", versionID: "", create: CreateSkillEvaluation},
		{name: "whitespace create", versionID: "  ", create: CreateSkillEvaluation},
		{name: "empty summary", versionID: "", create: func(evaluation model.SkillEvaluation) error { return CreateSkillEvaluationAndUpdateSummary(evaluation, "after", "later") }},
		{name: "whitespace summary", versionID: "\t", create: func(evaluation model.SkillEvaluation) error { return CreateSkillEvaluationAndUpdateSummary(evaluation, "after", "later") }},
	} {
		t.Run(item.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			baseline := createReferenceTestSkill(t, "blank-primary", model.SkillOwnerSystem, true, model.SkillVersionDraft)
			db, _ := DB()
			if err := db.Model(&model.SkillVersion{}).Where("id = ?", baseline.ID).Update("evaluation_summary_json", "before").Error; err != nil {
				t.Fatal(err)
			}
			evaluation := model.SkillEvaluation{ID: "blank-primary-evaluation", SkillVersionID: item.versionID, BaselineVersionID: baseline.ID}
			if err := item.create(evaluation); !errors.Is(err, ErrSkillEvaluationTargetUnavailable) {
				t.Fatalf("err=%v", err)
			}
			if _, ok, err := GetSkillEvaluation(evaluation.ID); err != nil || ok {
				t.Fatalf("evaluation ok=%v err=%v", ok, err)
			}
			stored, ok, err := GetSkillVersion(baseline.ID)
			if err != nil || !ok || stored.EvaluationSummaryJSON != "before" {
				t.Fatalf("baseline=%+v ok=%v err=%v", stored, ok, err)
			}
			var audits int64
			if err := db.Model(&model.SkillAuditLog{}).Count(&audits).Error; err != nil || audits != 0 {
				t.Fatalf("audits=%d err=%v", audits, err)
			}
		})
	}
}

func createReferenceTestSkill(t *testing.T, key string, owner model.SkillOwnerType, enabled bool, status model.SkillVersionStatus) model.SkillVersion {
	t.Helper()
	skill := model.SkillDefinition{ID: "reference-skill-" + key, Name: key, OwnerType: owner, Enabled: enabled}
	version := model.SkillVersion{ID: "reference-version-" + key, SkillID: skill.ID, Version: "1.0.0", Status: status}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	return version
}

func workflowVersionReferenceJSON(versionID string) string {
	return `{"nodes":[{"skillBinding":{"skillVersionId":"` + versionID + `"}}]}`
}

func workflowSkillReferenceJSON(skillID string) string {
	return `{"nodes":[{"skillBinding":{"skillId":"` + skillID + `"}}]}`
}

func workflowCandidateReferenceJSON(skillID string) string {
	return `{"nodes":[{"skillBinding":{"candidateSkillIds":["` + skillID + `"]}}]}`
}
