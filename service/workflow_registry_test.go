package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestWorkflowRegistryDraftLifecycleAndVisibility(t *testing.T) {
	setupInvocationServiceTest(t)
	skill, version := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-registry-skill", VersionID: "workflow-registry-skill-v1", Version: "1.0.0", Recommended: true})
	pkg := workflowRegistryTestPackage(skill.ID)
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "短剧制作", Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	if published.Version.Status != model.WorkflowVersionPublished || published.Package.Nodes[0].SkillBinding.SkillVersionID != version.ID {
		t.Fatalf("published=%#v", published)
	}
	recommended, err := RecommendWorkflowVersion("user-1", created.Workflow.ID, published.Version.ID)
	if err != nil || recommended.Workflow.RecommendedVersionID != published.Version.ID {
		t.Fatalf("recommended=%#v err=%v", recommended, err)
	}
	items, err := ListVisibleWorkflows("user-1", "project-1")
	if err != nil || len(items) != 1 || items[0].RecommendedPackage == nil {
		t.Fatalf("items=%#v err=%v", items, err)
	}
	if items, err := ListVisibleWorkflows("user-2", "project-2"); err != nil || len(items) != 0 {
		t.Fatalf("foreign items=%#v err=%v", items, err)
	}
}

func TestPublishWorkflowVersionFreezesRecommendedSkill(t *testing.T) {
	setupInvocationServiceTest(t)
	skill, first := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-freeze-skill", VersionID: "workflow-freeze-v1", Version: "1.0.0", Recommended: true})
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "冻结版本", Version: "1.0.0", Package: workflowRegistryTestPackage(skill.ID)})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	second := first
	second.ID, second.Version, second.ContentHash = "workflow-freeze-v2", "1.1.0", "sha256:second"
	second.Status = model.SkillVersionPublished
	if err := repository.CreateSkillVersion(second); err != nil {
		t.Fatal(err)
	}
	if err := repository.SetRecommendedSkillVersionWithAudit(skill.ID, second.ID, now(), model.SkillAuditLog{ID: "workflow-freeze-audit", Action: "recommend", Scope: "system", ScopeID: skill.ID, SkillVersionID: second.ID, CreatedAt: now()}); err != nil {
		t.Fatal(err)
	}
	roundTrip, err := GetVisibleWorkflowVersion("user-1", published.Version.ID)
	if err != nil || roundTrip.Package.Nodes[0].SkillBinding.SkillVersionID != first.ID {
		t.Fatalf("roundTrip=%#v err=%v", roundTrip, err)
	}
}

func TestCopySystemWorkflowCreatesEditableProjectDraft(t *testing.T) {
	setupInvocationServiceTest(t)
	skill, _ := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-copy-skill", VersionID: "workflow-copy-v1", Version: "1.0.0", Recommended: true})
	pkg, err := NormalizeWorkflowPackage(workflowRegistryTestPackage(skill.ID))
	if err != nil {
		t.Fatal(err)
	}
	definition := model.WorkflowDefinition{ID: "system-workflow", Name: "系统模板", OwnerType: model.WorkflowOwnerSystem, Enabled: true, CreatedAt: now(), UpdatedAt: now()}
	version := model.WorkflowVersion{ID: "system-workflow-v1", WorkflowID: definition.ID, Version: "1.0.0", Status: model.WorkflowVersionPublished, PackageJSON: mustWorkflowJSON(t, pkg), ContentHash: pkg.ContentHash, CreatedAt: now(), UpdatedAt: now(), PublishedAt: now()}
	definition.RecommendedVersionID = version.ID
	if err := repository.CreateWorkflowDefinitionAggregate(definition, version); err != nil {
		t.Fatal(err)
	}
	copied, err := CopyWorkflowToProject("user-1", definition.ID, "project-1", "系统模板（项目版）")
	if err != nil || copied.Workflow.OwnerType != model.WorkflowOwnerProject || copied.Version.Status != model.WorkflowVersionDraft {
		t.Fatalf("copied=%#v err=%v", copied, err)
	}
}

func TestPublishWorkflowVersionPreservesDynamicRoutesAndFreezesAgent(t *testing.T) {
	setupInvocationServiceTest(t)
	skill, skillVersion := seedInvocationSkill(t, invocationSkillSeed{ID: "workflow-route-skill", VersionID: "workflow-route-v1", Version: "1.0.0", Recommended: true})
	agent, err := CreateProjectAgent("user-1", AgentCreateInput{
		ProjectID: "project-1", Name: "流程导演", Version: "1.0.0",
		Package: AgentPackage{RolePrompt: "负责调度。", PlannerMode: AgentPlannerConfiguredChain,
			DefaultSkillRefs:  []AgentSkillRef{{StepKey: "write", SkillVersionID: skillVersion.ID}},
			SkillAccessPolicy: AgentSkillAccessPolicy{AllowedSkillIDs: []string{skill.ID}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	publishedAgent, err := PublishAgentVersion("user-1", agent.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := RecommendAgentVersion("user-1", agent.Agent.ID, publishedAgent.Version.ID); err != nil {
		t.Fatal(err)
	}
	pkg := WorkflowPackage{Nodes: []WorkflowNodeSpec{
		{NodeKey: "tag", Name: "标签路由", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingTagRoute, Capability: "script.create"}, OutputArtifactType: "production_script"},
		{NodeKey: "manual", Name: "运行前选择", ExecutorType: WorkflowExecutorSkill, SkillBinding: &WorkflowSkillBinding{Mode: WorkflowSkillBindingManualBeforeRun, Capability: "script.create", CandidateSkillIDs: []string{skill.ID}}, OutputArtifactType: "production_script"},
		{NodeKey: "director", Name: "导演", ExecutorType: WorkflowExecutorAgent, AgentRef: &WorkflowAgentRef{AgentID: agent.Agent.ID}, OutputArtifactType: "production_script"},
	}}
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "动态路由", Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	if published.Package.Nodes[0].SkillBinding.SkillVersionID != "" || published.Package.Nodes[1].SkillBinding.SkillVersionID != "" {
		t.Fatalf("dynamic route was frozen: %#v", published.Package.Nodes)
	}
	if published.Package.Nodes[2].AgentRef.AgentVersionID != publishedAgent.Version.ID {
		t.Fatalf("agent ref was not frozen: %#v", published.Package.Nodes[2].AgentRef)
	}
}

func workflowRegistryTestPackage(skillID string) WorkflowPackage {
	return WorkflowPackage{Nodes: []WorkflowNodeSpec{{
		NodeKey: "extract", Name: "资产提取", ExecutorType: WorkflowExecutorSkill,
		SkillBinding:       &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: skillID},
		OutputArtifactType: "production_script",
	}}}
}

func mustWorkflowJSON(t *testing.T, value WorkflowPackage) string {
	t.Helper()
	raw, err := marshalInvocationJSON(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}
