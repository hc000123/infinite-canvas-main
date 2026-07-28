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
