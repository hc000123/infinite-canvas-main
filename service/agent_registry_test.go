package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestPublishAgentRejectsSkillOutsideAccessPolicy(t *testing.T) {
	setupInvocationServiceTest(t)
	_, skillVersion := seedInvocationSkill(t, invocationSkillSeed{
		ID: "agent-access-skill", VersionID: "agent-access-skill-v1", Version: "1.0.0", Recommended: true,
	})
	seedInvocationSkill(t, invocationSkillSeed{ID: "another-skill", VersionID: "another-skill-v1", Version: "1.0.0", Recommended: true})
	created, err := CreateProjectAgent("user-1", AgentCreateInput{
		ProjectID: "project-1",
		Name:      "导演",
		Version:   "1.0.0",
		Package: AgentPackage{
			RolePrompt:  "负责选择制作步骤，不包含业务 Skill 正文。",
			PlannerMode: AgentPlannerConfiguredChain,
			DefaultSkillRefs: []AgentSkillRef{{
				StepKey: "write", SkillVersionID: skillVersion.ID, Required: true,
			}},
			SkillAccessPolicy: AgentSkillAccessPolicy{AllowedSkillIDs: []string{"another-skill"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PublishAgentVersion("user-1", created.Version.ID); err == nil || !strings.Contains(err.Error(), "访问范围") {
		t.Fatalf("publish err=%v", err)
	}
}

func TestPublishedAgentPackageRoundTripsWithoutSkillBody(t *testing.T) {
	setupInvocationServiceTest(t)
	skill, skillVersion := seedInvocationSkill(t, invocationSkillSeed{
		ID: "agent-roundtrip-skill", VersionID: "agent-roundtrip-skill-v1", Version: "1.0.0", Recommended: true,
	})
	created, err := CreateProjectAgent("user-1", AgentCreateInput{
		ProjectID: "project-1",
		Name:      "编剧",
		Summary:   "把生产步骤交给已发布 Skill",
		Tags:      []string{"script", "short_drama", "script"},
		Version:   "1.0.0",
		Package: AgentPackage{
			RolePrompt:  "负责按顺序调用剧本 Skill。",
			PlannerMode: AgentPlannerConfiguredChain,
			DefaultSkillRefs: []AgentSkillRef{{
				StepKey: "optimize", Label: "剧本优化", Capability: "script.create", SkillVersionID: skillVersion.ID, Required: true,
			}},
			SkillAccessPolicy: AgentSkillAccessPolicy{
				AllowedSkillIDs:   []string{skill.ID},
				AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerSystem},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishAgentVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	if published.Version.Status != model.AgentVersionPublished || published.Package.ContentHash == "" || published.Package.ContentHash != published.Version.ContentHash {
		t.Fatalf("published=%#v", published)
	}
	roundTrip, err := DecodeAgentPackage(published.Version)
	if err != nil || roundTrip.DefaultSkillRefs[0].SkillVersionID != skillVersion.ID {
		t.Fatalf("package=%#v err=%v", roundTrip, err)
	}
	encoded, _ := json.Marshal(roundTrip)
	for _, forbidden := range []string{"files", "inputContract", "outputContract", "qualityGateProfile"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("Agent package copied Skill body field %q: %s", forbidden, encoded)
		}
	}
}

func TestNormalizeAgentPackageRejectsDuplicateStepKeys(t *testing.T) {
	_, err := NormalizeAgentPackage(AgentPackage{
		RolePrompt:  "planner",
		PlannerMode: AgentPlannerConfiguredChain,
		DefaultSkillRefs: []AgentSkillRef{
			{StepKey: "same", SkillVersionID: "v1"},
			{StepKey: " same ", SkillVersionID: "v2"},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "重复") {
		t.Fatalf("err=%v", err)
	}
}

func TestNormalizeAgentPackageAllowsCatalogPlannerWithoutDefaultSteps(t *testing.T) {
	packageValue, err := NormalizeAgentPackage(AgentPackage{
		RolePrompt:  "根据画布目标从已授权 Skill Catalog 形成临时计划。",
		PlannerMode: AgentPlannerCatalog,
		SkillAccessPolicy: AgentSkillAccessPolicy{
			AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerSystem},
		},
		ExecutionPolicy: AgentExecutionPolicy{MaxSteps: 8, AllowRuntimeSkillOverride: true},
	})
	if err != nil || len(packageValue.DefaultSkillRefs) != 0 || packageValue.ExecutionPolicy.MaxSteps != 8 {
		t.Fatalf("package=%#v err=%v", packageValue, err)
	}
}

func TestNormalizeAgentPackageRejectsProjectSkillOwnerPolicy(t *testing.T) {
	_, err := NormalizeAgentPackage(AgentPackage{
		RolePrompt:  "根据画布目标从已授权 Skill Catalog 形成临时计划。",
		PlannerMode: AgentPlannerCatalog,
		SkillAccessPolicy: AgentSkillAccessPolicy{
			AllowedOwnerTypes: []model.SkillOwnerType{model.SkillOwnerType("project")},
		},
		ExecutionPolicy: AgentExecutionPolicy{MaxSteps: 8, AllowRuntimeSkillOverride: true},
	})
	if err == nil || !strings.Contains(err.Error(), "Agent Skill 所有者范围无效") {
		t.Fatalf("err=%v", err)
	}
}

func TestNormalizeAgentPackageRejectsInvalidPlannerContracts(t *testing.T) {
	tests := []AgentPackage{
		{RolePrompt: "configured", PlannerMode: AgentPlannerConfiguredChain},
		{RolePrompt: "catalog", PlannerMode: AgentPlannerCatalog, ExecutionPolicy: AgentExecutionPolicy{MaxSteps: 8}},
		{RolePrompt: "catalog", PlannerMode: AgentPlannerCatalog, ExecutionPolicy: AgentExecutionPolicy{MaxSteps: 33, AllowRuntimeSkillOverride: true}},
	}
	for index, packageValue := range tests {
		if _, err := NormalizeAgentPackage(packageValue); err == nil {
			t.Fatalf("case %d unexpectedly accepted", index)
		}
	}
}

func TestAgentRegistryDraftLifecycleAndVisibility(t *testing.T) {
	setupInvocationServiceTest(t)
	skill, skillVersion := seedInvocationSkill(t, invocationSkillSeed{
		ID: "agent-lifecycle-skill", VersionID: "agent-lifecycle-skill-v1", Version: "1.0.0", Recommended: true,
	})
	packageValue := AgentPackage{
		RolePrompt:  "负责规划。",
		PlannerMode: AgentPlannerConfiguredChain,
		DefaultSkillRefs: []AgentSkillRef{{
			StepKey: "run", SkillVersionID: skillVersion.ID, Parameters: json.RawMessage(`{}`),
		}},
		SkillAccessPolicy: AgentSkillAccessPolicy{AllowedSkillIDs: []string{skill.ID}},
	}
	created, err := CreateProjectAgent("user-1", AgentCreateInput{ProjectID: "project-1", Name: "测试 Agent", Version: "1.0.0", Package: packageValue})
	if err != nil {
		t.Fatal(err)
	}
	draft, err := CreateAgentDraft("user-1", created.Agent.ID, AgentDraftInput{Version: "1.1.0", Package: packageValue})
	if err != nil {
		t.Fatal(err)
	}
	packageValue.RolePrompt = "负责规划并解释版本选择。"
	updated, err := UpdateAgentDraft("user-1", draft.ID, AgentDraftInput{Version: draft.Version, Package: packageValue})
	if err != nil || updated.ContentHash == draft.ContentHash {
		t.Fatalf("updated=%#v err=%v", updated, err)
	}
	published, err := PublishAgentVersion("user-1", updated.ID)
	if err != nil {
		t.Fatal(err)
	}
	recommended, err := RecommendAgentVersion("user-1", created.Agent.ID, published.Version.ID)
	if err != nil || recommended.Agent.RecommendedVersionID != published.Version.ID {
		t.Fatalf("recommended=%#v err=%v", recommended, err)
	}
	items, err := ListVisibleAgents("user-1", "project-1")
	if err != nil || len(items) != 1 || items[0].RecommendedPackage == nil {
		t.Fatalf("items=%#v err=%v", items, err)
	}
	if items, err := ListVisibleAgents("user-2", "project-2"); err != nil || len(items) != 0 {
		t.Fatalf("foreign items=%#v err=%v", items, err)
	}
	if _, err := GetVisibleAgent("user-2", "project-2", created.Agent.ID); err == nil {
		t.Fatal("foreign user read project Agent")
	}
	if _, err := UpdateAgentDraft("user-1", published.Version.ID, AgentDraftInput{Version: published.Version.Version, Package: packageValue}); err == nil {
		t.Fatal("published Agent version was mutable")
	}
}
