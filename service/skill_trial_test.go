package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestTrialSkillRunsWithoutWorkflowAndPersistsRawAndStandardResults(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	snapshot, _ := ParseSkillFolder("剧本优化", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# 保留台词")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{"productionScript":"  原台词\n动作不改  "}`})
	defer restore()
	beforeStages, beforeArtifacts := skillEvaluationBusinessCounts(t)
	result, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{InputText: "原始剧本", ConfirmAPICost: true})
	if err != nil || result.Evaluation.Status != "passed" || result.StageKey != WorkflowSkillStageScript {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	if result.Raw["productionScript"] != "  原台词\n动作不改  " || result.Standard["productionScript"] != "原台词\n动作不改" {
		t.Fatalf("raw=%+v standard=%+v", result.Raw, result.Standard)
	}
	afterStages, afterArtifacts := skillEvaluationBusinessCounts(t)
	if beforeStages != afterStages || beforeArtifacts != afterArtifacts {
		t.Fatalf("trial wrote workflow business data before=%d/%d after=%d/%d", beforeStages, beforeArtifacts, afterStages, afterArtifacts)
	}
	stored, ok, err := repository.GetSkillEvaluation(result.Evaluation.ID)
	if err != nil || !ok || stored.ProjectID != "" || stored.EpisodeID != "" || stored.InputSnapshotJSON == "" {
		t.Fatalf("stored=%+v ok=%v err=%v", stored, ok, err)
	}
	var storedResult map[string]any
	if json.Unmarshal([]byte(stored.ResultJSON), &storedResult) != nil || storedResult["raw"] == nil || storedResult["standard"] == nil {
		t.Fatalf("stored result=%s", stored.ResultJSON)
	}
}

func TestTrialImportedSkillUsesFrozenStageSnapshotAfterDefinitionChanges(t *testing.T) {
	setupInvocationServiceTest(t)
	snapshot, _ := ParseSkillFolder("剧本优化", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# 保留台词")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	created.Skill.StageKey = WorkflowSkillStageArt
	if err := repository.SaveSkillDefinition(created.Skill); err != nil {
		t.Fatal(err)
	}
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{"productionScript":"  历史版本  "}`})
	defer restore()
	result, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{InputText: "原稿", ConfirmAPICost: true})
	if err != nil || result.StageKey != WorkflowSkillStageScript || result.Evaluation.Status != "passed" || result.Standard["productionScript"] != "历史版本" {
		t.Fatalf("result=%+v err=%v", result, err)
	}
}

func TestTrialImportedSkillUsesHistoricalTemplateAfterRegistryUpgrade(t *testing.T) {
	setupInvocationServiceTest(t)
	snapshot, _ := ParseSkillFolder("剧本优化", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# 保留台词")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	originalTemplates := registeredSkillStageTemplates
	originalCurrent := currentSkillStageTemplateVersions
	originalTransforms := workflowAdapterTransformRegistry
	t.Cleanup(func() {
		registeredSkillStageTemplates = originalTemplates
		currentSkillStageTemplateVersions = originalCurrent
		workflowAdapterTransformRegistry = originalTransforms
	})
	currentTemplate, _ := ResolveSkillStageTemplate(WorkflowSkillStageScript)
	upgraded := currentTemplate
	upgraded.TemplateVersion = "2.0.0"
	upgraded.FixedAdapter = WorkflowAdapterRef{AdapterID: "stage-script-normalize", AdapterVersion: "2.0.0", TransformKind: "stage-script-normalize-v2"}
	registeredSkillStageTemplates = append(append([]SkillStageTemplate(nil), registeredSkillStageTemplates...), upgraded)
	currentSkillStageTemplateVersions = cloneStringMap(currentSkillStageTemplateVersions)
	currentSkillStageTemplateVersions[WorkflowSkillStageScript] = upgraded.TemplateVersion
	workflowAdapterTransformRegistry = cloneWorkflowAdapterTransforms(workflowAdapterTransformRegistry)
	workflowAdapterTransformRegistry[upgraded.FixedAdapter.TransformKind] = func(bindings []ResolvedArtifactBinding) (json.RawMessage, error) {
		return json.Marshal(map[string]string{"productionScript": "v2:" + strings.TrimSpace(bindings[0].Artifact.Payload["productionScript"].(string))})
	}
	listed, err := ResolveSkillStageTemplate(WorkflowSkillStageScript)
	if err != nil || listed.TemplateVersion != "2.0.0" || listed.FixedAdapter.AdapterVersion != "2.0.0" || listed.FixedAdapter.TransformKind != "stage-script-normalize-v2" {
		t.Fatalf("current template=%+v err=%v", listed, err)
	}
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{"productionScript":"  历史版本  "}`})
	defer restore()
	result, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{InputText: "原稿", ConfirmAPICost: true})
	if err != nil || result.StageKey != WorkflowSkillStageScript || result.Evaluation.Status != "passed" || result.Standard["productionScript"] != "历史版本" {
		t.Fatalf("historical result=%+v err=%v", result, err)
	}
	resolved, err := ResolveImportedSkillStageSnapshot(created.Version)
	if err != nil || resolved.TemplateVersion != "1.0.0" || resolved.FixedAdapter.AdapterVersion != "1.0.0" || resolved.FixedAdapter.TransformKind == upgraded.FixedAdapter.TransformKind || resolved.FixedAdapter.ContentHash == listed.FixedAdapter.ContentHash {
		t.Fatalf("historical template=%+v err=%v", resolved, err)
	}
}

func TestTrialImportedSkillRejectsDamagedOrMismatchedStageSnapshot(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(model.SkillVersion) model.SkillVersion
		want   string
	}{
		{name: "damaged metadata", want: "快照", mutate: func(version model.SkillVersion) model.SkillVersion {
			version.ImportMetadataJSON = `{`
			return version
		}},
		{name: "adapter hash mismatch", want: "冻结", mutate: func(version model.SkillVersion) model.SkillVersion {
			var metadata map[string]any
			_ = json.Unmarshal([]byte(version.ImportMetadataJSON), &metadata)
			adapter, _ := metadata["fixedAdapter"].(map[string]any)
			if adapter == nil {
				adapter = map[string]any{}
				metadata["fixedAdapter"] = adapter
			}
			adapter["contentHash"] = "sha256:mismatch"
			encoded, _ := json.Marshal(metadata)
			version.ImportMetadataJSON = string(encoded)
			return version
		}},
		{name: "adapter behavior mismatch", want: "冻结", mutate: func(version model.SkillVersion) model.SkillVersion {
			var metadata map[string]any
			_ = json.Unmarshal([]byte(version.ImportMetadataJSON), &metadata)
			adapter, _ := metadata["fixedAdapter"].(map[string]any)
			adapter["transformKind"] = "missing-transform-v9"
			encoded, _ := json.Marshal(metadata)
			version.ImportMetadataJSON = string(encoded)
			return version
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			setupInvocationServiceTest(t)
			snapshot, _ := ParseSkillFolder("剧本优化", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# 保留台词")}})
			created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
			if err != nil {
				t.Fatal(err)
			}
			if err := repository.SaveSkillVersion(test.mutate(created.Version)); err != nil {
				t.Fatal(err)
			}
			restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{"productionScript":"结果"}`})
			defer restore()
			if _, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{InputText: "原稿", ConfirmAPICost: true}); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func cloneStringMap(source map[string]string) map[string]string {
	result := make(map[string]string, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func cloneWorkflowAdapterTransforms(source map[string]WorkflowAdapterTransform) map[string]WorkflowAdapterTransform {
	result := make(map[string]WorkflowAdapterTransform, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func TestTrialImageSkillUsesImageRequestAndConvertsEveryOutput(t *testing.T) {
	setupInvocationServiceTest(t)
	setupImageInvocationSettings(t, true)
	snapshot, _ := ParseSkillFolder("角色资产成图", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# 生成角色四视图")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: "asset-rendition-character", Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	executor := &recordingSkillExecutor{output: `{"outputs":[{"bindingName":"asset_rendition","ordinal":0,"payload":{"assetId":"trial-input","renditionId":"rendition-1","mediaType":"image","mediaRef":"/api/uploaded-assets/runtime/image/one.png","generationMetadata":{}}},{"bindingName":"asset_rendition","ordinal":1,"payload":{"assetId":"trial-input","renditionId":"rendition-2","mediaType":"image","mediaRef":"/api/uploaded-assets/runtime/image/two.png","generationMetadata":{}}}]}`}
	restore := useSkillEvaluationExecutor(t, executor)
	defer restore()
	result, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{InputText: "同一位成年女性角色四视图", Parameters: json.RawMessage(`{"n":2,"size":"1024x1024"}`), ConfirmAPICost: true})
	if err != nil || result.Evaluation.Status != "passed" {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	if executor.run.ExecutionKind != "image_model" || executor.run.Model != "image-test" || executor.run.ChannelID != "image-channel" {
		t.Fatalf("run=%+v", executor.run)
	}
	var request map[string]any
	if json.Unmarshal([]byte(executor.run.RequestJSON), &request) != nil || request["model"] != "image-test" || request["n"] != float64(2) || request["messages"] != nil {
		t.Fatalf("image request=%s", executor.run.RequestJSON)
	}
	var manifest struct {
		AssetID  string `json:"assetId"`
		Ordinals []int  `json:"ordinals"`
	}
	if json.Unmarshal([]byte(executor.run.ImageManifestJSON), &manifest) != nil || manifest.AssetID != "trial-input" || len(manifest.Ordinals) != 2 {
		t.Fatalf("manifest=%s", executor.run.ImageManifestJSON)
	}
	outputs, _ := result.Standard["outputs"].([]any)
	if len(outputs) != 2 || result.Diff["contentChanged"] != false {
		t.Fatalf("standard=%+v diff=%+v", result.Standard, result.Diff)
	}
}

type recordingSkillExecutor struct {
	output string
	run    model.AgentRun
}

func (*recordingSkillExecutor) Kind() string                         { return AgentRunExecutorAPI }
func (*recordingSkillExecutor) Available(context.Context) error      { return nil }
func (*recordingSkillExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (*recordingSkillExecutor) RefundCredits(*model.AgentRun) error  { return nil }
func (executor *recordingSkillExecutor) Call(_ context.Context, run model.AgentRun) agentRunCallResult {
	executor.run = run
	return agentRunCallResult{rawOutput: executor.output, structuredJSON: executor.output}
}

func TestTrialSkillRequiresInputAndExplicitAPICostConfirmation(t *testing.T) {
	setupInvocationServiceTest(t)
	if err := EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	snapshot, _ := ParseSkillFolder("剧本优化", []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# 保留台词")}})
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: WorkflowSkillStageScript, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: `{"productionScript":"结果"}`})
	defer restore()
	if _, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{}); err == nil || !strings.Contains(err.Error(), "输入") {
		t.Fatalf("missing input err=%v", err)
	}
	if _, err := TrialSkill("admin-1", created.Version.ID, SkillTrialInput{InputText: "原稿"}); err == nil || !strings.Contains(err.Error(), "显式确认") {
		t.Fatalf("cost confirmation err=%v", err)
	}
}
