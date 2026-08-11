package repository

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestSkillFolderSourceRoundTripsWithoutSerializingArchive(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "folder-skill", Name: "剧本优化", StageKey: "script", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{
		ID: "folder-version", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft,
		SourceKind: "folder_import", SourceHash: "sha256:test", SourceArchiveBlob: []byte("private-zip"),
		SourceFileIndexJSON: `[{"path":"SKILL.md"}]`, ImportMetadataJSON: `{"folderName":"script"}`,
	}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	storedSkill, ok, err := GetSkillDefinition(skill.ID)
	if err != nil || !ok || storedSkill.StageKey != "script" {
		t.Fatalf("skill=%+v ok=%v err=%v", storedSkill, ok, err)
	}
	storedVersion, ok, err := GetSkillVersion(version.ID)
	if err != nil || !ok || !bytes.Equal(storedVersion.SourceArchiveBlob, version.SourceArchiveBlob) || storedVersion.SourceHash != version.SourceHash || storedVersion.SourceFileIndexJSON != version.SourceFileIndexJSON {
		t.Fatalf("version=%+v ok=%v err=%v", storedVersion, ok, err)
	}
	encoded, err := json.Marshal(storedVersion)
	if err != nil || bytes.Contains(encoded, []byte("private-zip")) || bytes.Contains(encoded, []byte("folderName")) {
		t.Fatalf("json=%s err=%v", encoded, err)
	}
}

func TestCreateImportedSkillAggregateRollsBackWhenAuditFails(t *testing.T) {
	setupRepositoryTestDB(t)
	if err := CreateSkillAuditLog(model.SkillAuditLog{ID: "duplicate-audit"}); err != nil {
		t.Fatal(err)
	}
	skill := model.SkillDefinition{ID: "atomic-folder-skill", Name: "剧本优化", OwnerType: model.SkillOwnerSystem}
	sourceIdentity := "sha256:atomic"
	version := model.SkillVersion{ID: "atomic-folder-version", SkillID: skill.ID, Version: "1.0.0", SourceKind: "folder_import", SourceHash: sourceIdentity, SourceIdentity: &sourceIdentity}
	if err := CreateSkillAggregateWithAudit(skill, version, model.SkillAuditLog{ID: "duplicate-audit"}); err == nil {
		t.Fatal("duplicate audit should fail the aggregate")
	}
	if _, ok, _ := GetSkillDefinition(skill.ID); ok {
		t.Fatal("definition survived failed audit transaction")
	}
	if _, ok, _ := GetSkillVersion(version.ID); ok {
		t.Fatal("version survived failed audit transaction")
	}
}

func TestCreateImportedSkillVersionWithAuditIsAtomicAndDeduplicatesSource(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "source-unique-skill", Name: "剧本优化", OwnerType: model.SkillOwnerSystem}
	if err := CreateSkillDefinition(skill); err != nil {
		t.Fatal(err)
	}
	sourceIdentity := "sha256:same-folder"
	first := model.SkillVersion{ID: "source-version-1", SkillID: skill.ID, Version: "1.0.0", SourceKind: "folder_import", SourceHash: sourceIdentity, SourceIdentity: &sourceIdentity}
	if err := CreateSkillVersionWithAudit(first, model.SkillAuditLog{ID: "source-audit-1"}); err != nil {
		t.Fatal(err)
	}
	duplicate := first
	duplicate.ID, duplicate.Version = "source-version-2", "1.0.1"
	if err := CreateSkillVersionWithAudit(duplicate, model.SkillAuditLog{ID: "source-audit-2"}); err == nil {
		t.Fatal("same source content should be rejected for one Skill")
	}
	if _, ok, _ := GetSkillVersion(duplicate.ID); ok {
		t.Fatal("duplicate source version was persisted")
	}
	database, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	var auditCount int64
	if err := database.Model(&model.SkillAuditLog{}).Where("id = ?", "source-audit-2").Count(&auditCount).Error; err != nil || auditCount != 0 {
		t.Fatalf("duplicate source audit count=%d err=%v", auditCount, err)
	}

	if err := CreateSkillAuditLog(model.SkillAuditLog{ID: "duplicate-version-audit"}); err != nil {
		t.Fatal(err)
	}
	otherIdentity := "sha256:other-folder"
	other := model.SkillVersion{ID: "source-version-3", SkillID: skill.ID, Version: "1.0.2", SourceKind: "folder_import", SourceHash: otherIdentity, SourceIdentity: &otherIdentity}
	if err := CreateSkillVersionWithAudit(other, model.SkillAuditLog{ID: "duplicate-version-audit"}); err == nil {
		t.Fatal("duplicate audit should fail version creation")
	}
	if _, ok, _ := GetSkillVersion(other.ID); ok {
		t.Fatal("version survived failed audit transaction")
	}
}

func TestListSystemSkillDefinitionsExcludesLegacyProjectOwners(t *testing.T) {
	setupRepositoryTestDB(t)
	for _, skill := range []model.SkillDefinition{
		{ID: "system", Name: "系统技能", OwnerType: model.SkillOwnerSystem, Enabled: true},
		{ID: "legacy-project", Name: "遗留项目技能", OwnerType: model.SkillOwnerType("project"), OwnerUserID: "user-1", OwnerProjectID: "project-1", Enabled: true},
	} {
		if err := CreateSkillDefinition(skill); err != nil {
			t.Fatal(err)
		}
	}
	items, err := ListSystemSkillDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != "system" {
		t.Fatalf("items=%+v", items)
	}
}

func TestSetRecommendedSkillVersionIsAtomic(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "skill-1", Name: "分镜", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{ID: "version-1", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	version.Status = model.SkillVersionPublished
	version.PublishedAt = "2026-07-25T00:00:00Z"
	version.UpdatedAt = version.PublishedAt
	if err := PublishSkillVersionWithAudit(version, model.SkillAuditLog{ID: "audit-publish"}); err != nil {
		t.Fatal(err)
	}
	if err := SetRecommendedSkillVersionWithAudit(skill.ID, version.ID, version.UpdatedAt, model.SkillAuditLog{ID: "audit-recommend"}); err != nil {
		t.Fatal(err)
	}
	stored, ok, err := GetSkillDefinition(skill.ID)
	if err != nil || !ok || stored.RecommendedVersionID != version.ID {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
	storedVersion, ok, err := GetSkillVersion(version.ID)
	if err != nil || !ok || storedVersion.Status != model.SkillVersionPublished {
		t.Fatalf("version=%+v ok=%v err=%v", storedVersion, ok, err)
	}
}

func TestSaveSkillVersionRejectsStaleDraftAfterPublish(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "stale-save-skill", Name: "Stale", OwnerType: model.SkillOwnerSystem, Enabled: true}
	stale := model.SkillVersion{ID: "stale-save-version", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft, ContentHash: "draft"}
	if err := CreateSkillAggregate(skill, stale); err != nil {
		t.Fatal(err)
	}
	published := stale
	published.PublishedAt, published.UpdatedAt = "published", "published"
	if err := PublishSkillVersionWithAudit(published, model.SkillAuditLog{ID: "stale-save-publish-audit"}); err != nil {
		t.Fatal(err)
	}
	stale.ContentHash, stale.UpdatedAt = "stale-overwrite", "later"
	if err := SaveSkillVersion(stale); !errors.Is(err, ErrSkillVersionMustBeDraft) {
		t.Fatalf("err=%v", err)
	}
	stored, ok, err := GetSkillVersion(stale.ID)
	if err != nil || !ok || stored.Status != model.SkillVersionPublished || stored.ContentHash != "draft" || stored.UpdatedAt != "published" {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
}

func TestRecommendSkillVersionRejectsArchivedTargetWithoutAudit(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "recommend-archived-skill", Name: "Archived", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{ID: "recommend-archived-version", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionPublished}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	if err := ArchiveSkillVersionWithAudit(version.ID, skill.ID, "archived", model.SkillAuditLog{ID: "archive-before-recommend"}); err != nil {
		t.Fatal(err)
	}
	if err := SetRecommendedSkillVersionWithAudit(skill.ID, version.ID, "later", model.SkillAuditLog{ID: "recommend-archived-audit"}); !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
		t.Fatalf("err=%v", err)
	}
	stored, ok, err := GetSkillDefinition(skill.ID)
	if err != nil || !ok || stored.RecommendedVersionID != "" {
		t.Fatalf("skill=%+v ok=%v err=%v", stored, ok, err)
	}
	db, _ := DB()
	var audits int64
	if err := db.Model(&model.SkillAuditLog{}).Where("id = ?", "recommend-archived-audit").Count(&audits).Error; err != nil || audits != 0 {
		t.Fatalf("audits=%d err=%v", audits, err)
	}
}

func TestCreateSkillVersionRejectsDeletedDefinitionWithoutPartialWrites(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "deleted-version-parent", Name: "Deleted", OwnerType: model.SkillOwnerSystem, Enabled: true}
	if err := CreateSkillDefinition(skill); err != nil {
		t.Fatal(err)
	}
	if err := DeleteUnpublishedSkillDefinitionWithAudit(skill.ID, model.SkillAuditLog{ID: "delete-empty-definition"}); err != nil {
		t.Fatal(err)
	}
	for _, withAudit := range []bool{false, true} {
		version := model.SkillVersion{ID: map[bool]string{false: "orphan-version", true: "orphan-version-audited"}[withAudit], SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
		var err error
		if withAudit {
			err = CreateSkillVersionWithAudit(version, model.SkillAuditLog{ID: "orphan-version-audit"})
		} else {
			err = CreateSkillVersion(version)
		}
		if !errors.Is(err, ErrSkillReferenceTargetUnavailable) {
			t.Fatalf("withAudit=%v err=%v", withAudit, err)
		}
		if _, ok, err := GetSkillVersion(version.ID); err != nil || ok {
			t.Fatalf("version=%s ok=%v err=%v", version.ID, ok, err)
		}
	}
	db, _ := DB()
	var audits int64
	if err := db.Model(&model.SkillAuditLog{}).Where("id = ?", "orphan-version-audit").Count(&audits).Error; err != nil || audits != 0 {
		t.Fatalf("audits=%d err=%v", audits, err)
	}
}

func TestArchiveSkillVersionRejectsPublishedWorkflowReference(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "archive-workflow-skill", Name: "剧本", OwnerType: model.SkillOwnerSystem, Enabled: true, RecommendedVersionID: "archive-workflow-skill-version"}
	version := model.SkillVersion{ID: skill.RecommendedVersionID, SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionPublished}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	workflowVersion := model.WorkflowVersion{ID: "published-workflow-version", WorkflowID: "published-workflow", Version: "1.0.0", Status: model.WorkflowVersionPublished, PackageJSON: `{"nodes":[{"skillBinding":{"skillVersionId":"archive-workflow-skill-version"}}]}`}
	if err := CreateWorkflowDefinitionAggregate(model.WorkflowDefinition{ID: workflowVersion.WorkflowID, Name: "Workflow", OwnerType: model.WorkflowOwnerSystem, Enabled: true, RecommendedVersionID: workflowVersion.ID}, workflowVersion); err != nil {
		t.Fatal(err)
	}

	err := ArchiveSkillVersionWithAudit(version.ID, skill.ID, "later", model.SkillAuditLog{ID: "archive-workflow-audit"})
	if !errors.Is(err, ErrSkillVersionActiveReference) {
		t.Fatalf("err=%v", err)
	}
	storedVersion, ok, err := GetSkillVersion(version.ID)
	if err != nil || !ok || storedVersion.Status != model.SkillVersionPublished {
		t.Fatalf("skill version=%+v ok=%v err=%v", storedVersion, ok, err)
	}
	storedWorkflow, ok, err := GetWorkflowVersion(workflowVersion.ID)
	if err != nil || !ok || storedWorkflow.Status != model.WorkflowVersionPublished || storedWorkflow.PackageJSON != workflowVersion.PackageJSON {
		t.Fatalf("workflow version=%+v ok=%v err=%v", storedWorkflow, ok, err)
	}
}

func TestArchiveSkillVersionRejectsPublishedAgentReference(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "archive-agent-skill", Name: "分镜", OwnerType: model.SkillOwnerSystem, Enabled: true, RecommendedVersionID: "archive-agent-skill-version"}
	version := model.SkillVersion{ID: skill.RecommendedVersionID, SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionPublished}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	agentVersion := model.AgentVersion{ID: "published-agent-version", AgentID: "published-agent", Version: "1.0.0", Status: model.AgentVersionPublished, DefaultSkillRefsJSON: `[{"skillVersionId":"archive-agent-skill-version"}]`}
	if err := CreateAgentAggregate(model.AgentDefinition{ID: agentVersion.AgentID, Name: "Agent", OwnerType: model.AgentOwnerSystem, Enabled: true, RecommendedVersionID: agentVersion.ID}, agentVersion); err != nil {
		t.Fatal(err)
	}

	err := ArchiveSkillVersionWithAudit(version.ID, skill.ID, "later", model.SkillAuditLog{ID: "archive-agent-audit"})
	if !errors.Is(err, ErrSkillVersionActiveReference) {
		t.Fatalf("err=%v", err)
	}
	storedVersion, ok, err := GetSkillVersion(version.ID)
	if err != nil || !ok || storedVersion.Status != model.SkillVersionPublished {
		t.Fatalf("skill version=%+v ok=%v err=%v", storedVersion, ok, err)
	}
	storedAgent, ok, err := GetAgentVersion(agentVersion.ID)
	if err != nil || !ok || storedAgent.Status != model.AgentVersionPublished || storedAgent.DefaultSkillRefsJSON != agentVersion.DefaultSkillRefsJSON {
		t.Fatalf("agent version=%+v ok=%v err=%v", storedAgent, ok, err)
	}
}

func TestArchiveRecommendedSkillVersionRejectsPublishedAgentSkillIDReference(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "agent-default-skill", Name: "Default", OwnerType: model.SkillOwnerSystem, Enabled: true, RecommendedVersionID: "agent-default-v1"}
	oldVersion := model.SkillVersion{ID: skill.RecommendedVersionID, SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionPublished}
	if err := CreateSkillAggregate(skill, oldVersion); err != nil {
		t.Fatal(err)
	}
	nextVersion := model.SkillVersion{ID: "agent-default-v2", SkillID: skill.ID, Version: "2.0.0", Status: model.SkillVersionPublished}
	if err := CreateSkillVersion(nextVersion); err != nil {
		t.Fatal(err)
	}
	agentVersion := model.AgentVersion{ID: "skill-id-only-agent-version", AgentID: "skill-id-only-agent", Version: "1.0.0", Status: model.AgentVersionPublished, DefaultSkillRefsJSON: `[{"skillId":"agent-default-skill"}]`}
	if err := CreateAgentAggregate(model.AgentDefinition{ID: agentVersion.AgentID, Name: "Agent", OwnerType: model.AgentOwnerSystem, Enabled: true}, agentVersion); err != nil {
		t.Fatal(err)
	}
	if err := ArchiveSkillVersionWithAudit(oldVersion.ID, skill.ID, "blocked", model.SkillAuditLog{ID: "skill-id-only-blocked-audit"}); !errors.Is(err, ErrSkillVersionActiveReference) {
		t.Fatalf("err=%v", err)
	}
	if err := SetRecommendedSkillVersionWithAudit(skill.ID, nextVersion.ID, "switched", model.SkillAuditLog{ID: "skill-id-only-switch-audit"}); err != nil {
		t.Fatal(err)
	}
	if err := ArchiveSkillVersionWithAudit(oldVersion.ID, skill.ID, "archived", model.SkillAuditLog{ID: "skill-id-only-archive-audit"}); err != nil {
		t.Fatal(err)
	}
	storedOld, ok, err := GetSkillVersion(oldVersion.ID)
	if err != nil || !ok || storedOld.Status != model.SkillVersionArchived {
		t.Fatalf("old=%+v ok=%v err=%v", storedOld, ok, err)
	}
	storedSkill, ok, err := GetSkillDefinition(skill.ID)
	if err != nil || !ok || storedSkill.RecommendedVersionID != nextVersion.ID {
		t.Fatalf("skill=%+v ok=%v err=%v", storedSkill, ok, err)
	}
}

func TestArchiveSkillVersionIgnoresNonReferenceJSONValues(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "archive-value-skill", Name: "条件值", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{ID: "archive-value-skill-version", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionPublished}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	workflowVersion := model.WorkflowVersion{ID: "condition-workflow-version", WorkflowID: "condition-workflow", Version: "1.0.0", Status: model.WorkflowVersionPublished, PackageJSON: `{"nodes":[{"condition":{"value":"archive-value-skill-version"}}]}`}
	if err := CreateWorkflowDefinitionAggregate(model.WorkflowDefinition{ID: workflowVersion.WorkflowID, Name: "Workflow", OwnerType: model.WorkflowOwnerSystem, Enabled: true}, workflowVersion); err != nil {
		t.Fatal(err)
	}
	agentVersion := model.AgentVersion{ID: "parameter-agent-version", AgentID: "parameter-agent", Version: "1.0.0", Status: model.AgentVersionPublished, DefaultSkillRefsJSON: `[{"parameters":{"value":"archive-value-skill-version"}}]`}
	if err := CreateAgentAggregate(model.AgentDefinition{ID: agentVersion.AgentID, Name: "Agent", OwnerType: model.AgentOwnerSystem, Enabled: true}, agentVersion); err != nil {
		t.Fatal(err)
	}

	if err := ArchiveSkillVersionWithAudit(version.ID, skill.ID, "later", model.SkillAuditLog{ID: "archive-value-audit"}); err != nil {
		t.Fatalf("err=%v", err)
	}
	storedVersion, ok, err := GetSkillVersion(version.ID)
	if err != nil || !ok || storedVersion.Status != model.SkillVersionArchived {
		t.Fatalf("skill version=%+v ok=%v err=%v", storedVersion, ok, err)
	}
	storedWorkflow, workflowOK, workflowErr := GetWorkflowVersion(workflowVersion.ID)
	storedAgent, agentOK, agentErr := GetAgentVersion(agentVersion.ID)
	if workflowErr != nil || !workflowOK || storedWorkflow.PackageJSON != workflowVersion.PackageJSON || agentErr != nil || !agentOK || storedAgent.DefaultSkillRefsJSON != agentVersion.DefaultSkillRefsJSON {
		t.Fatalf("workflow=%+v ok=%v err=%v agent=%+v ok=%v err=%v", storedWorkflow, workflowOK, workflowErr, storedAgent, agentOK, agentErr)
	}
}

func TestDeleteSkillDraftRejectsBaselineEvaluationReference(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "baseline-skill", Name: "基线", OwnerType: model.SkillOwnerSystem, Enabled: true}
	baseline := model.SkillVersion{ID: "baseline-version", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
	if err := CreateSkillAggregate(skill, baseline); err != nil {
		t.Fatal(err)
	}
	comparison := model.SkillVersion{ID: "comparison-version", SkillID: skill.ID, Version: "1.0.1", Status: model.SkillVersionDraft}
	if err := CreateSkillVersion(comparison); err != nil {
		t.Fatal(err)
	}
	evaluation := model.SkillEvaluation{ID: "baseline-evaluation", SkillVersionID: comparison.ID, BaselineVersionID: baseline.ID, Status: "passed"}
	if err := CreateSkillEvaluation(evaluation); err != nil {
		t.Fatal(err)
	}

	err := DeleteUnreferencedSkillDraftWithAudit(baseline.ID, model.SkillAuditLog{ID: "delete-baseline-audit"})
	if !errors.Is(err, ErrSkillVersionReferenced) {
		t.Fatalf("err=%v", err)
	}
	if stored, ok, err := GetSkillVersion(baseline.ID); err != nil || !ok || stored.Status != model.SkillVersionDraft {
		t.Fatalf("baseline=%+v ok=%v err=%v", stored, ok, err)
	}
	if stored, ok, err := GetSkillEvaluation(evaluation.ID); err != nil || !ok || stored.BaselineVersionID != baseline.ID {
		t.Fatalf("evaluation=%+v ok=%v err=%v", stored, ok, err)
	}
}

func TestCreateSkillEvaluationUpdatesVersionSummary(t *testing.T) {
	setupRepositoryTestDB(t)
	skill := model.SkillDefinition{ID: "skill-1", Name: "资产", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{ID: "version-1", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	evaluation := model.SkillEvaluation{ID: "eval-1", SkillVersionID: version.ID, Status: "passed"}
	if err := CreateSkillEvaluationAndUpdateSummary(evaluation, `{"evaluationId":"eval-1","status":"passed"}`, "now"); err != nil {
		t.Fatal(err)
	}
	stored, ok, err := GetSkillVersion(version.ID)
	if err != nil || !ok || stored.EvaluationSummaryJSON == "" || stored.UpdatedAt != "now" {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
}

func TestDeleteSkillDraftUsesStructuredVersionReferences(t *testing.T) {
	setupRepositoryTestDB(t)
	otherSkill := model.SkillDefinition{ID: "other-version-skill", Name: "Other", OwnerType: model.SkillOwnerSystem, Enabled: true}
	otherVersion := model.SkillVersion{ID: "version-10", SkillID: otherSkill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
	if err := CreateSkillAggregate(otherSkill, otherVersion); err != nil {
		t.Fatal(err)
	}
	skill := model.SkillDefinition{ID: "delete-structured-skill", Name: "结构化删除", OwnerType: model.SkillOwnerSystem, Enabled: true}
	version := model.SkillVersion{ID: "version-1", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
	if err := CreateSkillAggregate(skill, version); err != nil {
		t.Fatal(err)
	}
	workflow := model.WorkflowVersion{ID: "delete-structured-workflow-version", WorkflowID: "delete-structured-workflow", Version: "1.0.0", Status: model.WorkflowVersionDraft, PackageJSON: `{"nodes":[{"skillBinding":{"skillVersionId":"version-10"},"condition":{"value":"version-1"}}]}`}
	if err := CreateWorkflowDefinitionAggregate(model.WorkflowDefinition{ID: workflow.WorkflowID, Name: "Workflow", OwnerType: model.WorkflowOwnerSystem}, workflow); err != nil {
		t.Fatal(err)
	}
	agent := model.AgentVersion{ID: "delete-structured-agent-version", AgentID: "delete-structured-agent", Version: "1.0.0", Status: model.AgentVersionDraft, DefaultSkillRefsJSON: `[{"skillVersionId":"version-10","parameters":{"value":"version-1"}}]`}
	if err := CreateAgentAggregate(model.AgentDefinition{ID: agent.AgentID, Name: "Agent", OwnerType: model.AgentOwnerSystem}, agent); err != nil {
		t.Fatal(err)
	}
	if err := DeleteUnreferencedSkillDraftWithAudit(version.ID, model.SkillAuditLog{ID: "delete-structured-audit"}); err != nil {
		t.Fatalf("non-reference JSON blocked deletion: %v", err)
	}
	if _, ok, err := GetSkillVersion(version.ID); err != nil || ok {
		t.Fatalf("version ok=%v err=%v", ok, err)
	}
}

func TestDeleteSkillDraftRejectsRealStructuredVersionReferences(t *testing.T) {
	for _, source := range []string{"workflow", "agent"} {
		t.Run(source, func(t *testing.T) {
			setupRepositoryTestDB(t)
			skill := model.SkillDefinition{ID: "referenced-skill", Name: "真实引用", OwnerType: model.SkillOwnerSystem, Enabled: true}
			version := model.SkillVersion{ID: "referenced-version", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
			if err := CreateSkillAggregate(skill, version); err != nil {
				t.Fatal(err)
			}
			if source == "workflow" {
				workflow := model.WorkflowVersion{ID: "referencing-workflow-version", WorkflowID: "referencing-workflow", Version: "1.0.0", Status: model.WorkflowVersionDraft, PackageJSON: `{"nodes":[{"skillBinding":{"skillVersionId":"referenced-version"}}]}`}
				if err := CreateWorkflowDefinitionAggregate(model.WorkflowDefinition{ID: workflow.WorkflowID, Name: "Workflow", OwnerType: model.WorkflowOwnerSystem}, workflow); err != nil {
					t.Fatal(err)
				}
			} else {
				agent := model.AgentVersion{ID: "referencing-agent-version", AgentID: "referencing-agent", Version: "1.0.0", Status: model.AgentVersionDraft, DefaultSkillRefsJSON: `[{"skillVersionId":"referenced-version"}]`}
				if err := CreateAgentAggregate(model.AgentDefinition{ID: agent.AgentID, Name: "Agent", OwnerType: model.AgentOwnerSystem}, agent); err != nil {
					t.Fatal(err)
				}
			}
			if err := DeleteUnreferencedSkillDraftWithAudit(version.ID, model.SkillAuditLog{ID: "referenced-audit"}); !errors.Is(err, ErrSkillVersionReferenced) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestDeleteSkillDefinitionUsesStructuredSkillReferences(t *testing.T) {
	for _, source := range []string{"ignored values", "workflow skill", "workflow candidate", "agent default", "agent access"} {
		t.Run(source, func(t *testing.T) {
			setupRepositoryTestDB(t)
			for _, definition := range []model.SkillDefinition{
				{ID: "other-definition", Name: "Other", OwnerType: model.SkillOwnerSystem, Enabled: true},
				{ID: "definition-10", Name: "Prefix", OwnerType: model.SkillOwnerSystem, Enabled: true},
			} {
				if err := CreateSkillDefinition(definition); err != nil {
					t.Fatal(err)
				}
			}
			skill := model.SkillDefinition{ID: "definition-1", Name: "Definition", OwnerType: model.SkillOwnerSystem, Enabled: true}
			version := model.SkillVersion{ID: "definition-version", SkillID: skill.ID, Version: "1.0.0", Status: model.SkillVersionDraft}
			if err := CreateSkillAggregate(skill, version); err != nil {
				t.Fatal(err)
			}
			switch source {
			case "ignored values", "workflow skill", "workflow candidate":
				binding := `{"skillId":"other-definition","candidateSkillIds":["definition-10"]}`
				if source == "workflow skill" {
					binding = `{"skillId":"definition-1"}`
				} else if source == "workflow candidate" {
					binding = `{"candidateSkillIds":["definition-1"]}`
				}
				workflow := model.WorkflowVersion{ID: "definition-workflow-version", WorkflowID: "definition-workflow", Version: "1.0.0", Status: model.WorkflowVersionDraft, PackageJSON: `{"nodes":[{"skillBinding":` + binding + `,"condition":{"value":"definition-1"}}]}`}
				if err := CreateWorkflowDefinitionAggregate(model.WorkflowDefinition{ID: workflow.WorkflowID, Name: "Workflow", OwnerType: model.WorkflowOwnerSystem}, workflow); err != nil {
					t.Fatal(err)
				}
			case "agent default":
				agent := model.AgentVersion{ID: "definition-agent-version", AgentID: "definition-agent", Version: "1.0.0", Status: model.AgentVersionDraft, DefaultSkillRefsJSON: `[{"skillId":"definition-1"}]`}
				if err := CreateAgentAggregate(model.AgentDefinition{ID: agent.AgentID, Name: "Agent", OwnerType: model.AgentOwnerSystem}, agent); err != nil {
					t.Fatal(err)
				}
			case "agent access":
				agent := model.AgentVersion{ID: "definition-access-agent-version", AgentID: "definition-access-agent", Version: "1.0.0", Status: model.AgentVersionDraft, SkillAccessPolicyJSON: `{"allowedSkillIds":["definition-1"]}`}
				if err := CreateAgentAggregate(model.AgentDefinition{ID: agent.AgentID, Name: "Agent", OwnerType: model.AgentOwnerSystem}, agent); err != nil {
					t.Fatal(err)
				}
			}
			err := DeleteUnpublishedSkillDefinitionWithAudit(skill.ID, model.SkillAuditLog{ID: "definition-delete-audit"})
			if source == "ignored values" {
				if err != nil {
					t.Fatalf("non-reference value blocked deletion: %v", err)
				}
				return
			}
			if !errors.Is(err, ErrSkillDefinitionReferenced) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestSkillLifecycleValidatesLockedTargetBeforeScanningReferences(t *testing.T) {
	setupRepositoryTestDB(t)
	workflow := model.WorkflowVersion{ID: "malformed-workflow-version", WorkflowID: "malformed-workflow", Version: "1.0.0", Status: model.WorkflowVersionPublished, PackageJSON: `{"nodes":[]}`}
	if err := CreateWorkflowDefinitionAggregate(model.WorkflowDefinition{ID: workflow.WorkflowID, Name: "Malformed", OwnerType: model.WorkflowOwnerSystem}, workflow); err != nil {
		t.Fatal(err)
	}
	db, _ := DB()
	if err := db.Model(&model.WorkflowVersion{}).Where("id = ?", workflow.ID).Update("package_json", `{`).Error; err != nil {
		t.Fatal(err)
	}
	if err := ArchiveSkillVersionWithAudit("missing-version", "missing-skill", "later", model.SkillAuditLog{ID: "missing-archive-audit"}); !errors.Is(err, ErrSkillVersionMustBePublished) {
		t.Fatalf("archive checked references before target: %v", err)
	}
	if err := DeleteUnreferencedSkillDraftWithAudit("missing-version", model.SkillAuditLog{ID: "missing-delete-audit"}); !errors.Is(err, ErrSkillVersionMustBeDraft) {
		t.Fatalf("delete checked references before target: %v", err)
	}
	var audits int64
	if err := db.Model(&model.SkillAuditLog{}).Where("id IN ?", []string{"missing-archive-audit", "missing-delete-audit"}).Count(&audits).Error; err != nil || audits != 0 {
		t.Fatalf("partial audits=%d err=%v", audits, err)
	}
}

func TestDeleteSkillDefinitionProtectsSeedsAndPublishedHistory(t *testing.T) {
	for _, item := range []struct {
		name    string
		skillID string
		status  model.SkillVersionStatus
		want    error
	}{
		{name: "seed", skillID: "skill-system-protected", status: model.SkillVersionDraft, want: ErrSkillDefinitionSeedProtected},
		{name: "published history", skillID: "ordinary-history", status: model.SkillVersionPublished, want: ErrSkillDefinitionHasHistory},
		{name: "archived history", skillID: "ordinary-archive", status: model.SkillVersionArchived, want: ErrSkillDefinitionHasHistory},
	} {
		t.Run(item.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			skill := model.SkillDefinition{ID: item.skillID, Name: item.name, OwnerType: model.SkillOwnerSystem, Enabled: true}
			version := model.SkillVersion{ID: item.skillID + "-version", SkillID: skill.ID, Version: "1.0.0", Status: item.status}
			if err := CreateSkillAggregate(skill, version); err != nil {
				t.Fatal(err)
			}
			if err := DeleteUnpublishedSkillDefinitionWithAudit(skill.ID, model.SkillAuditLog{ID: item.skillID + "-audit"}); !errors.Is(err, item.want) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestListSkillRegistryRelationsInBatches(t *testing.T) {
	setupRepositoryTestDB(t)
	for _, skill := range []model.SkillDefinition{{ID: "skill-1", Name: "一", OwnerType: model.SkillOwnerSystem, Enabled: true}, {ID: "skill-2", Name: "二", OwnerType: model.SkillOwnerSystem, Enabled: true}} {
		if err := CreateSkillDefinition(skill); err != nil {
			t.Fatal(err)
		}
	}
	for _, version := range []model.SkillVersion{
		{ID: "version-1", SkillID: "skill-1", Version: "1.0.0", Status: model.SkillVersionDraft, CreatedAt: "1"},
		{ID: "version-2", SkillID: "skill-2", Version: "1.0.0", Status: model.SkillVersionPublished, CreatedAt: "2"},
	} {
		if err := CreateSkillVersion(version); err != nil {
			t.Fatal(err)
		}
	}
	if err := CreateSkillEvaluation(model.SkillEvaluation{ID: "evaluation-1", SkillVersionID: "version-1", CreatedAt: "1"}); err != nil {
		t.Fatal(err)
	}
	if err := CreateSkillAuditLog(model.SkillAuditLog{ID: "audit-1", SkillVersionID: "version-2", CreatedAt: "1"}); err != nil {
		t.Fatal(err)
	}
	if err := SaveWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{ID: "binding-1", StageKey: "script", Scope: model.WorkflowStageSkillScopeGlobal, SkillVersionID: "version-2"}); err != nil {
		t.Fatal(err)
	}
	versions, err := ListSkillVersionsBySkillIDs([]string{"skill-1", "skill-2"})
	if err != nil || len(versions) != 2 {
		t.Fatalf("versions=%+v err=%v", versions, err)
	}
	evaluations, err := ListSkillEvaluationsByVersionIDs([]string{"version-1", "version-2"})
	if err != nil || len(evaluations) != 1 || evaluations[0].ID != "evaluation-1" {
		t.Fatalf("evaluations=%+v err=%v", evaluations, err)
	}
	audits, err := ListSkillAuditLogsByVersionIDs([]string{"version-1", "version-2"})
	if err != nil || len(audits) != 1 || audits[0].ID != "audit-1" {
		t.Fatalf("audits=%+v err=%v", audits, err)
	}
	bindings, err := ListWorkflowStageSkillBindingsByVersionIDs([]string{"version-1", "version-2"})
	if err != nil || len(bindings) != 1 || bindings[0].ID != "binding-1" {
		t.Fatalf("bindings=%+v err=%v", bindings, err)
	}
}
