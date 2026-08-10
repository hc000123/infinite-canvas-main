package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestEnsureCanvasOrchestratorSeedPublishesUniqueCatalogPlanner(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCanvasOrchestratorSeed(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureCanvasOrchestratorSeed(); err != nil {
		t.Fatal(err)
	}
	agent, ok, err := repository.GetAgentDefinition("agent-system-canvas-orchestrator")
	if err != nil || !ok {
		t.Fatalf("agent=%#v ok=%v err=%v", agent, ok, err)
	}
	if agent.OwnerType != model.AgentOwnerSystem || agent.RecommendedVersionID != "agent-version-system-canvas-orchestrator-1.1.0" {
		t.Fatalf("agent=%#v", agent)
	}
	version, ok, err := repository.GetAgentVersion(agent.RecommendedVersionID)
	if err != nil || !ok || version.Status != model.AgentVersionPublished {
		t.Fatalf("version=%#v ok=%v err=%v", version, ok, err)
	}
	packageValue, err := DecodeAgentPackage(version)
	if err != nil {
		t.Fatal(err)
	}
	if packageValue.PlannerMode != AgentPlannerCatalog || len(packageValue.DefaultSkillRefs) != 0 || !packageValue.ExecutionPolicy.AllowRuntimeSkillOverride || packageValue.ExecutionPolicy.MaxSteps != 12 || len(packageValue.SkillAccessPolicy.AllowedOwnerTypes) != 1 || packageValue.SkillAccessPolicy.AllowedOwnerTypes[0] != model.SkillOwnerSystem {
		t.Fatalf("package=%#v", packageValue)
	}
}

func TestEnsureCanvasOrchestratorSeedPreservesVersionOnePackage(t *testing.T) {
	setupInvocationServiceTest(t)
	stamp := now()
	agent := model.AgentDefinition{
		ID: canvasOrchestratorAgentID, Name: "画布总控", OwnerType: model.AgentOwnerSystem, Enabled: true,
		RecommendedVersionID: "agent-version-system-canvas-orchestrator-1.0.0", CreatedAt: stamp, UpdatedAt: stamp,
	}
	legacy := model.AgentVersion{
		ID: "agent-version-system-canvas-orchestrator-1.0.0", AgentID: agent.ID, Version: "1.0.0", Status: model.AgentVersionPublished,
		RolePrompt: "legacy role", PlannerMode: AgentPlannerCatalog, DefaultSkillRefsJSON: `[]`, SkillAccessPolicyJSON: `{"allowedOwnerTypes":["system","project"]}`,
		ModelPolicyJSON: `{}`, ToolPolicyJSON: `{}`, ExecutionPolicyJSON: `{"maxSteps":12,"allowRuntimeSkillOverride":true}`,
		ContentHash: "legacy-hash", CreatedBy: "system", PublishedAt: stamp, CreatedAt: stamp, UpdatedAt: stamp,
	}
	if err := repository.CreateAgentAggregate(agent, legacy); err != nil {
		t.Fatal(err)
	}
	if err := EnsureCanvasOrchestratorSeed(); err != nil {
		t.Fatal(err)
	}
	stored, ok, err := repository.GetAgentVersion(legacy.ID)
	if err != nil || !ok || stored.RolePrompt != legacy.RolePrompt || stored.SkillAccessPolicyJSON != legacy.SkillAccessPolicyJSON || stored.ContentHash != legacy.ContentHash {
		t.Fatalf("legacy=%#v ok=%v err=%v", stored, ok, err)
	}
	updated, ok, err := repository.GetAgentDefinition(agent.ID)
	if err != nil || !ok || updated.RecommendedVersionID != canvasOrchestratorVersionID {
		t.Fatalf("agent=%#v ok=%v err=%v", updated, ok, err)
	}
}

func TestCatalogPlannerRequiresRuntimeStepsForAgentPlan(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCanvasOrchestratorSeed(); err != nil {
		t.Fatal(err)
	}
	_, err := CreateAgentPlan("user-1", AgentPlanCreateInput{
		ProjectID: "project-1", AgentID: "agent-system-canvas-orchestrator", Goal: "整理当前画布剧本",
		SourceArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: "artifact-1", ContentHash: "hash"}},
		IdempotencyKey:     "catalog-plan-without-steps",
	})
	if err == nil {
		t.Fatal("catalog planner accepted an Agent Plan without runtime steps")
	}
}

func TestCanvasOrchestratorCatalogUsesTheSameSystemSkillVersion(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCanvasOrchestratorSeed(); err != nil {
		t.Fatal(err)
	}
	_, version := seedInvocationSkill(t, invocationSkillSeed{
		ID: "canvas-cross-entry-skill", VersionID: "canvas-cross-entry-skill-v1", Version: "1.0.0", Recommended: true,
		Mutate: func(pkg *SkillPackage) { pkg.Manifest.Capabilities = []string{"workflow.stage.cross_entry"} },
	})
	agentVersion, ok, err := repository.GetAgentVersion(canvasOrchestratorVersionID)
	if err != nil || !ok {
		t.Fatalf("agent version=%+v ok=%v err=%v", agentVersion, ok, err)
	}
	agentPackage, err := DecodeAgentPackage(agentVersion)
	if err != nil {
		t.Fatal(err)
	}
	options, err := ListSkillOptions("user-1", "project-1", SkillOptionFilter{Capability: "workflow.stage.cross_entry"})
	if err != nil || len(options) != 1 {
		t.Fatalf("catalog=%+v err=%v", options, err)
	}
	option := options[0]
	ref := AgentSkillRef{StepKey: "script", Capability: option.Manifest.Capabilities[0], SkillID: option.SkillID, SkillVersionID: option.SkillVersionID, ExpectedOutputType: option.OutputBindings[0].ArtifactType}
	resolved, err := resolveAgentSkillReference("user-1", "project-1", ref)
	if err != nil || validateAgentSkillAccess(agentPackage, ref, resolved) != nil || resolved.Version.ID != option.SkillVersionID || resolved.Version.ContentHash != option.ContentHash {
		t.Fatalf("canvas catalog drift option=%+v resolved=%+v err=%v", option, resolved, err)
	}
	if len(resolved.Package.InputContract.ArtifactInputs) != len(option.InputBindings) || len(resolved.Package.OutputContract.ArtifactOutputs) != len(option.OutputBindings) {
		t.Fatalf("canvas catalog contract drift option=%+v resolved=%+v", option, resolved.Package)
	}
	if other, err := resolveAgentSkillReference("user-2", "project-2", AgentSkillRef{SkillVersionID: version.ID}); err != nil || other.Version.ID != version.ID {
		t.Fatalf("system Skill was not globally resolvable: resolved=%+v err=%v", other, err)
	}
}
