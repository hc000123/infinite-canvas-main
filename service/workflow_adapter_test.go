package service

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestWorkflowAdapterCreatesDeterministicDerivedArtifact(t *testing.T) {
	setupInvocationServiceTest(t)
	parent := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "production_script", `{"productionScript":"完整导演稿"}`)
	adapter, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: "production-script-envelope", AdapterVersion: "1.0.0"})
	if err != nil {
		t.Fatal(err)
	}
	refs := []ArtifactRefInput{{BindingName: "production_script", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}}
	first, err := ExecuteWorkflowAdapter("user-1", "project-1", "episode-1", adapter, refs)
	if err != nil {
		t.Fatal(err)
	}
	second, err := ExecuteWorkflowAdapter("user-1", "project-1", "episode-1", adapter, refs)
	if err != nil {
		t.Fatal(err)
	}
	if first.Artifact.ID != second.Artifact.ID || first.Artifact.ContentHash != second.Artifact.ContentHash {
		t.Fatal("adapter retry drifted")
	}
	if !reflect.DeepEqual(first.ParentArtifactIds, []string{parent.Artifact.ID}) || first.Payload["productionScript"] != "完整导演稿" {
		t.Fatalf("derived=%+v", first)
	}
	metadata, ok := first.Extensions["workflow.adapter"].(map[string]any)
	if !ok || metadata["adapterId"] != adapter.ID || metadata["adapterVersion"] != adapter.Version || metadata["contentHash"] != adapter.ContentHash {
		t.Fatalf("missing adapter provenance: %+v", first.Extensions)
	}
}

func TestWorkflowAdapterCannotOverrideRegisteredTransform(t *testing.T) {
	setupInvocationServiceTest(t)
	parent := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "production_script", `{"productionScript":"完整导演稿"}`)
	adapter, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: "production-script-envelope", AdapterVersion: "1.0.0"})
	if err != nil {
		t.Fatal(err)
	}
	maliciousCalled := false
	adapter.Transform = func([]ResolvedArtifactBinding) (json.RawMessage, error) {
		maliciousCalled = true
		return json.RawMessage(`{"productionScript":"恶意覆盖"}`), nil
	}
	output, err := ExecuteWorkflowAdapter("user-1", "project-1", "episode-1", adapter, []ArtifactRefInput{{BindingName: "production_script", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}})
	if err != nil {
		t.Fatal(err)
	}
	if maliciousCalled || output.Payload["productionScript"] != "完整导演稿" {
		t.Fatalf("unregistered transform executed: called=%v output=%+v", maliciousCalled, output.Payload)
	}
}

func TestInvalidHistoricalAdapterDoesNotPoisonRegisteredVersions(t *testing.T) {
	setupInvocationServiceTest(t)
	originalTemplates := registeredSkillStageTemplates
	t.Cleanup(func() { registeredSkillStageTemplates = originalTemplates })
	current, err := ResolveSkillStageTemplate(WorkflowSkillStageScript)
	if err != nil {
		t.Fatal(err)
	}
	broken := current
	broken.TemplateVersion = "2.0.0"
	broken.FixedAdapter = WorkflowAdapterRef{AdapterID: "stage-script-normalize", AdapterVersion: "2.0.0", TransformKind: "missing-script-transform-v2"}
	registeredSkillStageTemplates = append([]SkillStageTemplate{broken}, registeredSkillStageTemplates...)
	legacy, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: "production-script-envelope", AdapterVersion: "1.0.0"})
	if err != nil || legacy.ID == "" {
		t.Fatalf("legacy=%+v err=%v", legacy, err)
	}
	v1, err := ResolveWorkflowAdapter(current.FixedAdapter)
	if err != nil || v1.Version != "1.0.0" {
		t.Fatalf("v1=%+v err=%v", v1, err)
	}
	if _, err := ResolveWorkflowAdapter(broken.FixedAdapter); err == nil {
		t.Fatal("broken v2 adapter resolved")
	}
}

func TestWorkflowAdapterRejectsWrongInputContract(t *testing.T) {
	setupInvocationServiceTest(t)
	adapter, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: "production-script-envelope", AdapterVersion: "1.0.0"})
	if err != nil {
		t.Fatal(err)
	}
	parent := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"原稿"}`)
	_, err = ExecuteWorkflowAdapter("user-1", "project-1", "episode-1", adapter, []ArtifactRefInput{{BindingName: "production_script", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}})
	if err == nil {
		t.Fatal("adapter accepted incompatible input")
	}
}

func TestWorkflowAdapterRejectsOutputSchemaFailureWithoutChangingParent(t *testing.T) {
	setupInvocationServiceTest(t)
	parent := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "production_script", `{"productionScript":"完整导演稿"}`)
	adapter, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: "production-script-envelope", AdapterVersion: "1.0.0"})
	if err != nil {
		t.Fatal(err)
	}
	originalTransforms := workflowAdapterTransformRegistry
	workflowAdapterTransformRegistry = cloneWorkflowAdapterTransforms(workflowAdapterTransformRegistry)
	t.Cleanup(func() { workflowAdapterTransformRegistry = originalTransforms })
	adapter.ID = "test-invalid-production-script"
	adapter.TransformKind = "test-invalid-production-script-v1"
	adapter.ContentHash = ""
	workflowAdapterTransformRegistry[adapter.TransformKind] = func([]ResolvedArtifactBinding) (json.RawMessage, error) {
		return json.RawMessage(`{"productionScript":""}`), nil
	}
	adapter, err = normalizeWorkflowAdapterDefinition(adapter)
	if err != nil {
		t.Fatal(err)
	}
	_, err = ExecuteWorkflowAdapter("user-1", "project-1", "episode-1", adapter, []ArtifactRefInput{{BindingName: "production_script", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}})
	if err == nil || strings.Contains(err.Error(), "内容保真") {
		t.Fatalf("adapter schema error was replaced by fidelity gate: %v", err)
	}
	reloaded, reloadErr := GetArtifact("user-1", parent.Artifact.ID)
	if reloadErr != nil || reloaded.Artifact.ContentHash != parent.Artifact.ContentHash || reloaded.Payload["productionScript"] != "完整导演稿" {
		t.Fatalf("parent changed: %+v err=%v", reloaded, reloadErr)
	}
}

func TestWorkflowExecutionRunsFrozenAdapterNode(t *testing.T) {
	setupInvocationServiceTest(t)
	parent := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "production_script", `{"productionScript":"完整导演稿"}`)
	pkg := WorkflowPackage{InputArtifactTypes: []string{"production_script"}, Nodes: []WorkflowNodeSpec{{
		NodeKey: "script_envelope", Name: "剧本结构映射", ExecutorType: WorkflowExecutorAdapter,
		AdapterRef:         &WorkflowAdapterRef{AdapterID: "production-script-envelope", AdapterVersion: "1.0.0"},
		InputBindings:      []WorkflowNodeInputBinding{{BindingName: "production_script", ArtifactType: "production_script", Source: WorkflowInputSource, WorkflowInputName: "production_script", Required: true}},
		OutputArtifactType: "production_script",
	}}}
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "Adapter 流程", Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	published, err := PublishWorkflowVersion("user-1", created.Version.ID)
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := PreflightWorkflowExecution("user-1", WorkflowExecutionPreflightInput{
		WorkflowVersionID: published.Version.ID, ProjectID: "project-1", EpisodeID: "episode-1",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "production_script", ArtifactID: parent.Artifact.ID, ContentHash: parent.Artifact.ContentHash}}, IdempotencyKey: "adapter-flow",
	})
	if err != nil || !preflight.Preview.Executable || preflight.Preview.Nodes[0].AdapterContentHash == "" || len(preflight.Preview.Nodes[0].AdapterSnapshot) == 0 {
		t.Fatalf("preflight=%+v err=%v", preflight, err)
	}
	confirmed, err := ConfirmWorkflowExecution("user-1", preflight.Run.ID, WorkflowExecutionConfirmationInput{Revision: 1, Fingerprint: preflight.Run.ConfirmationFingerprint})
	if err != nil || confirmed.Run.Status != "completed" || confirmed.Nodes[0].Status != "completed" {
		t.Fatalf("confirmed=%+v err=%v", confirmed, err)
	}
	var refs []ArtifactRefInput
	if err := json.Unmarshal([]byte(confirmed.Nodes[0].OutputArtifactRefsJSON), &refs); err != nil || len(refs) != 1 {
		t.Fatalf("refs=%+v err=%v", refs, err)
	}
	output, err := GetArtifact("user-1", refs[0].ArtifactID)
	if err != nil || !reflect.DeepEqual(output.ParentArtifactIds, []string{parent.Artifact.ID}) {
		t.Fatalf("output=%+v err=%v", output, err)
	}
}

func TestPublishWorkflowRejectsUnknownAdapterVersion(t *testing.T) {
	setupInvocationServiceTest(t)
	pkg := WorkflowPackage{Nodes: []WorkflowNodeSpec{{NodeKey: "unknown", Name: "未知 Adapter", ExecutorType: WorkflowExecutorAdapter, AdapterRef: &WorkflowAdapterRef{AdapterID: "missing", AdapterVersion: "1.0.0"}, OutputArtifactType: "production_script"}}}
	created, err := CreateProjectWorkflow("user-1", WorkflowCreateInput{ProjectID: "project-1", Name: "未知 Adapter", Version: "1.0.0", Package: pkg})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PublishWorkflowVersion("user-1", created.Version.ID); err == nil {
		t.Fatal("unknown adapter was published")
	}
}

func TestStageAdapterPreservesScriptContentApartFromOuterWhitespace(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	template, err := ResolveSkillStageTemplate(WorkflowSkillStageScript)
	if err != nil {
		t.Fatal(err)
	}
	converted, diff, err := ConvertSkillStageOutput(template, map[string]any{"productionScript": "  原台词\n动作不改  "})
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if json.Unmarshal(converted, &payload) != nil || payload["productionScript"] != "原台词\n动作不改" {
		t.Fatalf("payload=%s", converted)
	}
	if diff["contentChanged"] != false || diff["structureChanged"] != true {
		t.Fatalf("diff=%+v", diff)
	}
}

func TestStageAdapterAddsOnlyMissingStableAssetAndStoryboardIDs(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	assetTemplate, _ := ResolveSkillStageTemplate(WorkflowSkillStageArt)
	assetRaw := map[string]any{"items": []any{
		map[string]any{"kind": "character", "name": "林秋", "sourceEvidence": []any{"林秋进门"}, "coreFacts": []any{"年轻女性"}},
		map[string]any{"assetId": "PROP-CUSTOM", "kind": "prop", "name": "钥匙", "sourceEvidence": []any{"手里有钥匙"}, "coreFacts": []any{"金属"}},
	}}
	converted, _, err := ConvertSkillStageOutput(assetTemplate, assetRaw)
	if err != nil {
		t.Fatal(err)
	}
	var asset map[string]any
	_ = json.Unmarshal(converted, &asset)
	items := asset["items"].([]any)
	if items[0].(map[string]any)["assetId"] != "CHAR-001" || items[1].(map[string]any)["assetId"] != "PROP-CUSTOM" {
		t.Fatalf("asset=%s", converted)
	}

	storyboardTemplate, _ := ResolveSkillStageTemplate(WorkflowSkillStageStoryboard)
	storyboardRaw := map[string]any{"shots": []any{map[string]any{
		"sourceScript": "原文", "shotDraft": map[string]any{"shotSize": "中景", "camera": "平视", "movement": "固定", "action": "进门", "performance": "紧张", "dialogue": "", "durationSeconds": 6.0, "continuityMode": "continuous"},
	}}}
	converted, _, err = ConvertSkillStageOutput(storyboardTemplate, storyboardRaw)
	if err != nil {
		t.Fatal(err)
	}
	var storyboard map[string]any
	_ = json.Unmarshal(converted, &storyboard)
	shot := storyboard["shots"].([]any)[0].(map[string]any)
	if shot["shotId"] != "shot-001" || shot["sceneKey"] != "scene-001" || shot["sourceScript"] != "原文" {
		t.Fatalf("storyboard=%s", converted)
	}
}

func TestStageAdapterConvertsMultipleArtifactsOneToOne(t *testing.T) {
	setupInvocationServiceTest(t)
	first := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "asset_brief", `{"assetId":"character-001","brief":"角色正面","format":"character-four-view"}`)
	second := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "asset_brief", `{"assetId":"character-002","brief":"角色侧面","format":"character-four-view"}`)
	adapter, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: "stage-asset-brief-character-normalize", AdapterVersion: "1.0.0"})
	if err != nil {
		t.Fatal(err)
	}
	refs := []ArtifactRefInput{
		{BindingName: "asset_brief", ArtifactID: first.Artifact.ID, ContentHash: first.Artifact.ContentHash},
		{BindingName: "asset_brief", ArtifactID: second.Artifact.ID, ContentHash: second.Artifact.ContentHash},
	}
	outputs, err := ExecuteWorkflowAdapterOutputs("user-1", "project-1", "episode-1", adapter, refs)
	if err != nil || len(outputs) != 2 {
		t.Fatalf("outputs=%+v err=%v", outputs, err)
	}
	if !reflect.DeepEqual(outputs[0].ParentArtifactIds, []string{first.Artifact.ID}) || !reflect.DeepEqual(outputs[1].ParentArtifactIds, []string{second.Artifact.ID}) {
		t.Fatalf("one-to-one lineage lost: %+v", outputs)
	}
	if outputs[0].Payload["assetId"] != "character-001" || outputs[1].Payload["assetId"] != "character-002" {
		t.Fatalf("payloads=%+v", outputs)
	}
}
