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

func TestNormalizeWorkflowPackageSupportsMultiSourceBinding(t *testing.T) {
	character := workflowGraphSkillNode("character", "asset_rendition", "")
	scene := workflowGraphSkillNode("scene", "asset_rendition", "")
	video := workflowGraphSkillNode("video", "video_prompt_package", "")
	video.InputBindings = []WorkflowNodeInputBinding{{
		BindingName: "asset_rendition", ArtifactType: "asset_rendition", Source: WorkflowNodeSource,
		FromNodeKeys: []string{"scene", "character", "scene"}, FromOutputBinding: "asset_rendition", Required: true,
	}}
	normalized, err := NormalizeWorkflowPackage(WorkflowPackage{Nodes: []WorkflowNodeSpec{character, scene, video}})
	if err != nil {
		t.Fatal(err)
	}
	binding := normalized.Nodes[2].InputBindings[0]
	if strings.Join(binding.FromNodeKeys, ",") != "character,scene" || strings.Join(normalized.Nodes[2].DependsOn, ",") != "character,scene" {
		t.Fatalf("binding=%+v dependencies=%v", binding, normalized.Nodes[2].DependsOn)
	}
	video.InputBindings[0].FromNodeKey = "scene"
	if _, err := NormalizeWorkflowPackage(WorkflowPackage{Nodes: []WorkflowNodeSpec{character, scene, video}}); err == nil || !strings.Contains(err.Error(), "二选一") {
		t.Fatalf("single+multi source accepted: %v", err)
	}
	video.InputBindings[0].FromNodeKey = ""
	scene.OutputArtifactType = "asset_brief"
	if _, err := NormalizeWorkflowPackage(WorkflowPackage{Nodes: []WorkflowNodeSpec{character, scene, video}}); err == nil || !strings.Contains(err.Error(), "类型") {
		t.Fatalf("multi-source type mismatch accepted: %v", err)
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
