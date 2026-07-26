package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestAgentPlanPreflightFreezesSequentialSkillChain(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	detail, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Plan.Status != model.AgentPlanDraft || detail.Plan.CurrentRevision != 1 || len(detail.Steps) != 2 {
		t.Fatalf("draft=%#v", detail)
	}
	result, err := PreflightAgentPlan("user-1", detail.Plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if result.Plan.Status != model.AgentPlanAwaitingConfirmation || len(result.Steps) != 2 || result.Plan.ConfirmationFingerprint == "" {
		t.Fatalf("result=%#v", result)
	}
	first, second := result.Steps[0], result.Steps[1]
	if first.Step.SkillVersionID != fixture.FirstSkillVersionID || first.Step.SkillContentHash == "" || first.Step.Status != model.AgentPlanStepReady {
		t.Fatalf("first=%#v", first)
	}
	if second.Step.SkillVersionID != fixture.SecondSkillVersionID || second.Step.SkillContentHash == "" || second.Step.Status != model.AgentPlanStepPending {
		t.Fatalf("second=%#v", second)
	}
	if len(first.InputBindings) != 1 || first.InputBindings[0].ArtifactID != fixture.SourceArtifactID || first.InputBindings[0].ContentHash != fixture.SourceArtifactHash {
		t.Fatalf("first bindings=%#v", first.InputBindings)
	}
	if len(second.InputBindings) != 1 || second.InputBindings[0].FromStepKey != first.Step.StepKey || second.InputBindings[0].FromOutputBinding != "script" {
		t.Fatalf("second bindings=%#v", second.InputBindings)
	}
	if len(result.ConfirmationRequirements) == 0 || result.ConfirmationRequirements[0].Code != "api_cost" {
		t.Fatalf("requirements=%#v", result.ConfirmationRequirements)
	}
	reloaded, err := GetAgentPlanDetail("user-1", detail.Plan.ID)
	if err != nil || reloaded.Plan.ConfirmationFingerprint != result.Plan.ConfirmationFingerprint || reloaded.Steps[1].Step.SkillContentHash != second.Step.SkillContentHash {
		t.Fatalf("reloaded=%#v err=%v", reloaded, err)
	}
}

func TestAgentPlanPreflightRejectsIncompatibleSymbolicHandoff(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	version, ok, err := repository.GetAgentVersion(fixture.CreateInput.AgentVersionID)
	if err != nil || !ok {
		t.Fatalf("version=%#v ok=%v err=%v", version, ok, err)
	}
	packageValue, err := DecodeAgentPackage(version)
	if err != nil {
		t.Fatal(err)
	}
	packageValue.DefaultSkillRefs[1].InputBindings[0].FromOutputBinding = "missing_output"
	fixture.CreateInput.SkillOverrides = packageValue.DefaultSkillRefs
	fixture.CreateInput.IdempotencyKey = "agent-plan-incompatible-handoff"
	created, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PreflightAgentPlan("user-1", created.Plan.ID); err == nil || !strings.Contains(err.Error(), "不兼容") {
		t.Fatalf("preflight err=%v", err)
	}
}

func TestAgentPlanPreflightRejectsChangedSourceHash(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	fixture.CreateInput.SourceArtifactRefs[0].ContentHash = "sha256:changed"
	fixture.CreateInput.IdempotencyKey = "agent-plan-changed-source"
	created, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PreflightAgentPlan("user-1", created.Plan.ID); err == nil || !strings.Contains(err.Error(), "已变化") {
		t.Fatalf("preflight err=%v", err)
	}
}

func TestAgentPlanPreflightRejectsSkillUnpublishedAfterPlanCreation(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	created, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.SkillVersion{}).Where("id = ?", fixture.SecondSkillVersionID).Update("status", model.SkillVersionArchived).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := PreflightAgentPlan("user-1", created.Plan.ID); err == nil || !strings.Contains(err.Error(), "不可用") {
		t.Fatalf("preflight err=%v", err)
	}
}

func TestAgentPlanPreflightRechecksSkillAccessPolicy(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	created, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.SkillDefinition{}).Where("id = ?", "plan-profile").Updates(map[string]any{
		"owner_type": model.SkillOwnerProject, "owner_user_id": "user-2", "owner_project_id": "project-2",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := PreflightAgentPlan("user-1", created.Plan.ID); err == nil || !strings.Contains(err.Error(), "不存在") {
		t.Fatalf("preflight err=%v", err)
	}
}

func TestAgentPlanRevisionPreservesPreviouslyFrozenRevision(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	first, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	firstPreflight, err := PreflightAgentPlan("user-1", first.Plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	second, err := CreateAgentPlanRevision("user-1", first.Plan.ID, AgentPlanRevisionInput{
		AgentVersionID: fixture.CreateInput.AgentVersionID, Goal: "第二版目标",
		SourceArtifactRefs: fixture.CreateInput.SourceArtifactRefs,
	})
	if err != nil {
		t.Fatal(err)
	}
	if second.Plan.CurrentRevision != 2 || second.Plan.Status != model.AgentPlanDraft || second.Revision.ConfirmationFingerprint != "" {
		t.Fatalf("second=%#v", second)
	}
	frozen, _, ok, err := repository.GetAgentPlanRevision(first.Plan.ID, 1)
	if err != nil || !ok || frozen.ConfirmationFingerprint != firstPreflight.Plan.ConfirmationFingerprint || frozen.Goal != fixture.CreateInput.Goal {
		t.Fatalf("frozen=%#v ok=%v err=%v", frozen, ok, err)
	}
	secondPreflight, err := PreflightAgentPlan("user-1", second.Plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if secondPreflight.Plan.ConfirmationFingerprint == firstPreflight.Plan.ConfirmationFingerprint {
		t.Fatalf("revision fingerprints did not change: %s", secondPreflight.Plan.ConfirmationFingerprint)
	}
}

func TestAgentPlanFingerprintIncludesHiddenExecutionFields(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	created, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := PreflightAgentPlan("user-1", created.Plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	steps := make([]model.AgentPlanStep, len(preflight.Steps))
	for index := range preflight.Steps {
		steps[index] = preflight.Steps[index].Step
	}
	baseline := agentPlanFingerprint(preflight.Revision, steps)
	steps[0].ParametersJSON = `{"language":"en"}`
	if changed := agentPlanFingerprint(preflight.Revision, steps); changed == baseline {
		t.Fatalf("parameters were omitted from fingerprint %s", baseline)
	}
	steps[0] = preflight.Steps[0].Step
	steps[0].InputBindingsJSON = `[]`
	if changed := agentPlanFingerprint(preflight.Revision, steps); changed == baseline {
		t.Fatalf("input bindings were omitted from fingerprint %s", baseline)
	}
}

type twoStepAgentPlanFixture struct {
	CreateInput          AgentPlanCreateInput
	FirstSkillVersionID  string
	SecondSkillVersionID string
	SourceArtifactID     string
	SourceArtifactHash   string
}

func seedTwoStepAgentPlan(t *testing.T) twoStepAgentPlanFixture {
	t.Helper()
	setupInvocationServiceTest(t)
	firstSkill, firstVersion := seedInvocationSkill(t, invocationSkillSeed{
		ID: "plan-script", VersionID: "plan-script-v1", Version: "1.0.0", Recommended: true,
	})
	secondSkill, secondVersion := seedInvocationSkill(t, invocationSkillSeed{
		ID: "plan-profile", VersionID: "plan-profile-v1", Version: "1.0.0", Recommended: true,
		Mutate: func(pkg *SkillPackage) {
			pkg.Manifest.Capabilities = []string{"content.classify"}
			pkg.Manifest.InputArtifactTypes = []string{"production_script"}
			pkg.Manifest.OutputArtifactTypes = []string{"content_profile"}
			pkg.Manifest.SchemaCompatibility = map[string]string{"production_script": ">=1.0 <2.0"}
			pkg.InputContract.ArtifactInputs = []ArtifactInputSpec{{BindingName: "script", ArtifactType: "production_script", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"}}
			pkg.OutputContract.ArtifactOutputs = []ArtifactOutputSpec{{BindingName: "profile", ArtifactType: "content_profile", Min: 1, Max: 1, SchemaVersion: "1.0.0"}}
		},
	})
	created, err := CreateProjectAgent("user-1", AgentCreateInput{
		ProjectID: "project-1", Name: "两步前期制作", Version: "1.0.0",
		Package: AgentPackage{
			RolePrompt: "只负责顺序规划剧本整理和内容分类。", PlannerMode: AgentPlannerConfiguredChain,
			DefaultSkillRefs: []AgentSkillRef{
				{StepKey: "optimize", Label: "剧本整理", Capability: "script.create", SkillID: firstSkill.ID, SkillVersionID: firstVersion.ID, Required: true, Parameters: json.RawMessage(`{}`), ExpectedOutputType: "production_script"},
				{StepKey: "classify", Label: "内容分类", Capability: "content.classify", SkillID: secondSkill.ID, SkillVersionID: secondVersion.ID, Required: true, Parameters: json.RawMessage(`{}`), ExpectedOutputType: "content_profile", InputBindings: []AgentStepInputBinding{{BindingName: "script", FromStepKey: "optimize", FromOutputBinding: "script"}}},
			},
			SkillAccessPolicy: AgentSkillAccessPolicy{AllowedSkillIDs: []string{firstSkill.ID, secondSkill.ID}, AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerSystem}},
			ExecutionPolicy:   AgentExecutionPolicy{MaxSteps: 2, AllowRuntimeSkillOverride: true},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishAgentVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := CreateArtifact("user-1", CreateArtifactInput{
		ArtifactType: "source_text", SchemaVersion: "1.0.0", ProjectID: "project-1", EpisodeID: "episode-1", Payload: json.RawMessage(`{"text":"原始剧本"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	return twoStepAgentPlanFixture{
		FirstSkillVersionID: firstVersion.ID, SecondSkillVersionID: secondVersion.ID,
		SourceArtifactID: artifact.Artifact.ID, SourceArtifactHash: artifact.Artifact.ContentHash,
		CreateInput: AgentPlanCreateInput{
			ProjectID: "project-1", EpisodeID: "episode-1", AgentID: published.Agent.ID, AgentVersionID: published.Version.ID,
			Goal: "先优化剧本，再提取内容标签", SourceArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: artifact.Artifact.ID, ContentHash: artifact.Artifact.ContentHash}},
			IdempotencyKey: "agent-plan-two-step-1",
		},
	}
}
