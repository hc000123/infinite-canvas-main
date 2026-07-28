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
	if agent.OwnerType != model.AgentOwnerSystem || agent.RecommendedVersionID != "agent-version-system-canvas-orchestrator-1.0.0" {
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
	if packageValue.PlannerMode != AgentPlannerCatalog || len(packageValue.DefaultSkillRefs) != 0 || !packageValue.ExecutionPolicy.AllowRuntimeSkillOverride || packageValue.ExecutionPolicy.MaxSteps != 12 {
		t.Fatalf("package=%#v", packageValue)
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

func TestCanvasOrchestratorCatalogUsesTheSameProjectSkillVersion(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCanvasOrchestratorSeed(); err != nil {
		t.Fatal(err)
	}
	_, version := seedInvocationSkill(t, invocationSkillSeed{
		ID: "canvas-cross-entry-skill", VersionID: "canvas-cross-entry-skill-v1", Version: "1.0.0", OwnerType: model.SkillOwnerProject, Recommended: true,
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
	if _, err := resolveAgentSkillReference("user-2", "project-1", AgentSkillRef{SkillVersionID: version.ID}); err == nil {
		t.Fatal("canvas Agent resolved another user's Project Skill")
	}
}
