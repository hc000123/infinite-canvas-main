package service

import (
	"strings"
	"testing"
)

func TestNormalizeWorkflowPackageProducesStableHash(t *testing.T) {
	input := WorkflowPackage{
		InputArtifactTypes: []string{"source_text", "source_text"},
		Nodes: []WorkflowNodeSpec{{
			NodeKey: " Extract ", Name: " 提取 ", ExecutorType: WorkflowExecutorSkill,
			SkillBinding:       &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: " skill-1 "},
			InputBindings:      []WorkflowNodeInputBinding{{BindingName: " source ", ArtifactType: " source_text ", Source: WorkflowInputSource, WorkflowInputName: " source "}},
			OutputArtifactType: " asset_catalog ",
		}},
	}
	first, err := NormalizeWorkflowPackage(input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := NormalizeWorkflowPackage(first)
	if err != nil {
		t.Fatal(err)
	}
	if first.ContentHash == "" || first.ContentHash != second.ContentHash || first.Nodes[0].NodeKey != "extract" {
		t.Fatalf("first=%#v second=%#v", first, second)
	}
}

func TestNormalizeWorkflowPackageRejectsCycle(t *testing.T) {
	_, err := NormalizeWorkflowPackage(WorkflowPackage{Nodes: []WorkflowNodeSpec{
		workflowGraphSkillNode("a", "asset_catalog", "b"),
		workflowGraphSkillNode("b", "asset_brief", "a"),
	}})
	if err == nil || !strings.Contains(err.Error(), "循环") {
		t.Fatalf("err=%v", err)
	}
}

func TestNormalizeWorkflowPackageRejectsUnknownDependency(t *testing.T) {
	node := workflowGraphSkillNode("extract", "asset_catalog", "missing")
	_, err := NormalizeWorkflowPackage(WorkflowPackage{Nodes: []WorkflowNodeSpec{node}})
	if err == nil || !strings.Contains(err.Error(), "依赖") {
		t.Fatalf("err=%v", err)
	}
}

func TestNormalizeWorkflowPackageRejectsUpstreamTypeMismatch(t *testing.T) {
	first := workflowGraphSkillNode("extract", "asset_catalog", "")
	second := workflowGraphSkillNode("brief", "asset_brief", "extract")
	second.InputBindings = []WorkflowNodeInputBinding{{BindingName: "asset", ArtifactType: "production_script", Source: WorkflowNodeSource, FromNodeKey: "extract", FromOutputBinding: "output"}}
	_, err := NormalizeWorkflowPackage(WorkflowPackage{Nodes: []WorkflowNodeSpec{first, second}})
	if err == nil || !strings.Contains(err.Error(), "类型") {
		t.Fatalf("err=%v", err)
	}
}

func TestNormalizeWorkflowPackageEnforcesExecutorReferences(t *testing.T) {
	node := workflowGraphSkillNode("director", "storyboard_package", "")
	node.ExecutorType = WorkflowExecutorAgent
	node.AgentRef = nil
	_, err := NormalizeWorkflowPackage(WorkflowPackage{Nodes: []WorkflowNodeSpec{node}})
	if err == nil || !strings.Contains(err.Error(), "Agent") {
		t.Fatalf("err=%v", err)
	}
}

func workflowGraphSkillNode(key, output, dependency string) WorkflowNodeSpec {
	node := WorkflowNodeSpec{
		NodeKey: key, Name: key, ExecutorType: WorkflowExecutorSkill,
		SkillBinding:       &WorkflowSkillBinding{Mode: WorkflowSkillBindingFixed, SkillID: "skill-" + key},
		OutputArtifactType: output,
	}
	if dependency != "" {
		node.DependsOn = []string{dependency}
	}
	return node
}
