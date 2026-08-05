package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestImportedFolderInvocationNormalizesRawAssetOutputBeforeCoreValidation(t *testing.T) {
	setupInvocationServiceTest(t)
	imported := mustImportPublishedFolderSkill(t, WorkflowSkillStageArt)
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "production_script", `{"productionScript":"林秋走进雨中"}`)
	raw := `{"items":[{"kind":"character","name":"林秋","sourceEvidence":["林秋走进雨中"],"coreFacts":["成年女性"]}]}`

	snapshot, err := PreflightInvocation("user-1", InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: imported.Version.ID,
		ExpectedOutputArtifactType: "asset_catalog", InputArtifactRefs: []ArtifactRefInput{{BindingName: "production_script", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements}); err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "imported-asset-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}

	run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID})
	if err != nil || run.Status != model.InvocationStatusNeedsReview || len(outputs.Items) != 1 {
		t.Fatalf("run=%+v outputs=%+v err=%v", run, outputs, err)
	}
	output := outputs.Items[0]
	items, _ := output.Payload["items"].([]any)
	item, _ := items[0].(map[string]any)
	if output.Artifact.SchemaVersion != coreArtifactSchemaVersion || item["assetId"] != "CHAR-001" {
		t.Fatalf("output=%+v", output)
	}
	attempts, _ := repository.ListInvocationAttempts("user-1", run.ID)
	if len(attempts) != 1 || attempts[0].RawOutput != raw {
		t.Fatalf("attempts=%+v", attempts)
	}
	var extensions map[string]json.RawMessage
	var trace struct {
		RawPayload         map[string]any `json:"rawPayload"`
		AdapterID          string         `json:"adapterId"`
		AdapterContentHash string         `json:"adapterContentHash"`
		TransformKind      string         `json:"transformKind"`
		Diff               map[string]any `json:"diff"`
	}
	if json.Unmarshal([]byte(output.Artifact.ExtensionsJSON), &extensions) != nil || json.Unmarshal(extensions[imported.Skill.ID], &trace) != nil {
		t.Fatalf("extensions=%s", output.Artifact.ExtensionsJSON)
	}
	if trace.RawPayload == nil || trace.AdapterID != importedAdapterID(t, imported.Version) || trace.AdapterContentHash == "" || trace.TransformKind == "" || trace.Diff["contentChanged"] != false {
		t.Fatalf("trace=%+v", trace)
	}
}

func TestWorkflowAdapterReusesInvocationArtifactWhenFrozenAdapterAlreadyApplied(t *testing.T) {
	setupInvocationServiceTest(t)
	imported := mustImportPublishedFolderSkill(t, WorkflowSkillStageScript)
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"原台词"}`)
	output, run := runImportedInvocation(t, imported, "workflow", "production_script", []ArtifactRefInput{{BindingName: "source_text", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}}, `{"productionScript":"  原台词  "}`)
	refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
	setHash := invocationArtifactSetHash(refs, run.LatestAttempt)
	if _, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "approved", Attempt: run.LatestAttempt, ArtifactSetHash: setHash}); err != nil {
		t.Fatal(err)
	}
	template, err := ResolveImportedSkillStageSnapshot(imported.Version, imported.Package)
	if err != nil {
		t.Fatal(err)
	}
	adapter, err := ResolveWorkflowAdapter(template.FixedAdapter)
	if err != nil {
		t.Fatal(err)
	}
	reused, err := ExecuteWorkflowAdapterOutputs("user-1", "project-1", "episode-1", adapter, []ArtifactRefInput{{BindingName: adapter.InputContracts[0].BindingName, ArtifactID: output.Artifact.ID, ContentHash: output.Artifact.ContentHash}})
	if err != nil || len(reused) != 1 || reused[0].Artifact.ID != output.Artifact.ID {
		t.Fatalf("reused=%+v err=%v original=%s", reused, err, output.Artifact.ID)
	}
}

func TestImportedStoryboardTrialAndCanvasInvocationShareRawToStandardRules(t *testing.T) {
	setupInvocationServiceTest(t)
	imported := mustImportPublishedFolderSkill(t, WorkflowSkillStageStoryboard)
	raw := `{"shots":[{"sourceScript":"林秋走进雨中","shotDraft":{"shotSize":"中景","camera":"平视","movement":"跟拍","action":"走进雨中","performance":"克制","dialogue":"","durationSeconds":6,"continuityMode":"continuous"}}]}`
	restore := useSkillEvaluationExecutor(t, fakeSkillExecutor{output: raw})
	trial, err := TrialSkill("admin-1", imported.Version.ID, SkillTrialInput{InputText: "林秋走进雨中", ConfirmAPICost: true})
	restore()
	if err != nil || trial.Evaluation.Status != "passed" {
		t.Fatalf("trial=%+v err=%v", trial, err)
	}
	trialShot := trial.Standard["shots"].([]any)[0].(map[string]any)
	if trialShot["shotId"] != "shot-001" || trialShot["sceneKey"] != "scene-001" {
		t.Fatalf("trial standard=%+v", trial.Standard)
	}
	script := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "production_script", `{"productionScript":"林秋走进雨中"}`)
	assets := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "asset_catalog", `{"items":[]}`)
	output, _ := runImportedInvocation(t, imported, "canvas_chat", "storyboard_package", []ArtifactRefInput{
		{BindingName: "production_script", ArtifactID: script.Artifact.ID, ContentHash: script.Artifact.ContentHash},
		{BindingName: "asset_catalog", ArtifactID: assets.Artifact.ID, ContentHash: assets.Artifact.ContentHash},
	}, raw)
	shot := output.Payload["shots"].([]any)[0].(map[string]any)
	if shot["shotId"] != trialShot["shotId"] || shot["sceneKey"] != trialShot["sceneKey"] || output.Artifact.SchemaVersion != coreArtifactSchemaVersion {
		t.Fatalf("invocation=%+v", output)
	}
}

func TestImportedInvocationContentFidelityFailureCreatesNoArtifact(t *testing.T) {
	setupInvocationServiceTest(t)
	imported := mustImportPublishedFolderSkill(t, WorkflowSkillStageScript)
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"原台词"}`)
	original := workflowAdapterTransformRegistry
	workflowAdapterTransformRegistry = cloneWorkflowAdapterTransforms(original)
	t.Cleanup(func() { workflowAdapterTransformRegistry = original })
	workflowAdapterTransformRegistry["stage-script-normalize-v1"] = func([]ResolvedArtifactBinding) (json.RawMessage, error) {
		return json.RawMessage(`{"productionScript":"被恶意替换"}`), nil
	}
	raw := `{"productionScript":"原台词"}`
	snapshot, err := PreflightInvocation("user-1", InvocationRequest{Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: imported.Version.ID, ExpectedOutputArtifactType: "production_script", InputArtifactRefs: []ArtifactRefInput{{BindingName: "source_text", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements}); err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "fidelity-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	attempts, _ := repository.ListInvocationAttempts("user-1", run.ID)
	outputs, _ := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID})
	if run.Status != model.InvocationStatusFailed || len(attempts) != 1 || attempts[0].ErrorClass != "content_fidelity" || attempts[0].RawOutput != raw || len(outputs.Items) != 0 {
		t.Fatalf("run=%+v attempts=%+v outputs=%+v", run, attempts, outputs)
	}
}

func TestImportedMultiOutputStandardizationIsAtomic(t *testing.T) {
	setupInvocationServiceTest(t)
	imported := mustImportPublishedFolderSkill(t, WorkflowSkillStageArt)
	script := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "production_script", `{"productionScript":"林秋拿着钥匙"}`)
	original := workflowAdapterTransformRegistry
	workflowAdapterTransformRegistry = cloneWorkflowAdapterTransforms(original)
	t.Cleanup(func() { workflowAdapterTransformRegistry = original })
	workflowAdapterTransformRegistry["stage-art-normalize-v1"] = func(bindings []ResolvedArtifactBinding) (json.RawMessage, error) {
		converted, err := normalizeSkillStagePayloadV1(WorkflowSkillStageArt, bindings[0].Artifact.Payload)
		if err != nil || bindings[0].Artifact.Payload["items"].([]any)[0].(map[string]any)["name"] != "钥匙" {
			return converted, err
		}
		var payload map[string]any
		_ = json.Unmarshal(converted, &payload)
		payload["items"].([]any)[0].(map[string]any)["name"] = "被篡改"
		return json.Marshal(payload)
	}
	raw := `{"outputs":[{"bindingName":"asset_catalog","ordinal":0,"payload":{"items":[{"kind":"character","name":"林秋","sourceEvidence":["林秋"],"coreFacts":["成年女性"]}]}},{"bindingName":"asset_catalog","ordinal":1,"payload":{"items":[{"kind":"prop","name":"钥匙","sourceEvidence":["钥匙"],"coreFacts":["金属"]}]}}]}`
	snapshot, err := PreflightInvocation("user-1", InvocationRequest{Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: imported.Version.ID, ExpectedOutputArtifactType: "asset_catalog", InputArtifactRefs: []ArtifactRefInput{{BindingName: "production_script", ArtifactID: script.Artifact.ID, ContentHash: script.Artifact.ContentHash}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements}); err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "multi-atomic-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	outputs, _ := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID})
	if run.Status != model.InvocationStatusFailed || len(outputs.Items) != 0 {
		t.Fatalf("run=%+v outputs=%+v", run, outputs)
	}
}

func TestImportedImageSkillUsesCommonCompletionAdapterTrace(t *testing.T) {
	setupInvocationServiceTest(t)
	setupImageInvocationSettings(t, true)
	stamp := now()
	if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "imported-image", AffCode: "imported-image-aff", Status: model.UserStatusActive, Credits: 100, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	imported := mustImportPublishedFolderSkill(t, "asset-rendition-character")
	brief := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "asset_brief", `{"assetId":"character-001","brief":"角色四视图","format":"character-four-view"}`)
	raw := `{"outputs":[{"bindingName":"asset_rendition","ordinal":0,"payload":{"assetId":"character-001","renditionId":"rendition-001","mediaType":"image","mediaRef":"/api/uploaded-assets/runtime/image/sha256-test.png","generationMetadata":{"model":"image-test"}}}]}`
	output, _ := runImportedInvocation(t, imported, "image", "asset_rendition", []ArtifactRefInput{{BindingName: "asset_brief", ArtifactID: brief.Artifact.ID, ContentHash: brief.Artifact.ContentHash}}, raw)
	var extensions map[string]json.RawMessage
	var trace importedSkillAdapterArtifactExtension
	_ = json.Unmarshal([]byte(output.Artifact.ExtensionsJSON), &extensions)
	_ = json.Unmarshal(extensions[imported.Skill.ID], &trace)
	if trace.AdapterID == "" || trace.AdapterContentHash == "" || trace.RawSchemaVersion != importedSkillRawSchemaVersion || output.Artifact.SchemaVersion != coreArtifactSchemaVersion {
		t.Fatalf("output=%+v trace=%+v", output, trace)
	}
}

func TestImportedInvocationSourcesFreezeSameAdapterMetadata(t *testing.T) {
	setupInvocationServiceTest(t)
	imported := mustImportPublishedFolderSkill(t, WorkflowSkillStageScript)
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"原台词"}`)
	wantHash := ""
	for _, invocationSource := range []string{"workflow", "canvas_chat", "direct"} {
		output, _ := runImportedInvocation(t, imported, invocationSource, "production_script", []ArtifactRefInput{{BindingName: "source_text", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}}, `{"productionScript":"原台词"}`)
		var extensions map[string]json.RawMessage
		var trace importedSkillAdapterArtifactExtension
		_ = json.Unmarshal([]byte(output.Artifact.ExtensionsJSON), &extensions)
		_ = json.Unmarshal(extensions[imported.Skill.ID], &trace)
		if wantHash == "" {
			wantHash = trace.AdapterContentHash
		}
		if trace.AdapterContentHash != wantHash || trace.AdapterID != importedAdapterID(t, imported.Version) {
			t.Fatalf("source=%s trace=%+v wantHash=%s", invocationSource, trace, wantHash)
		}
	}
}

func runImportedInvocation(t *testing.T, imported ResolvedSkill, source, outputType string, refs []ArtifactRefInput, raw string) (ArtifactEnvelope, model.InvocationRun) {
	t.Helper()
	snapshot, err := PreflightInvocation("user-1", InvocationRequest{Source: source, ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: imported.Version.ID, ExpectedOutputArtifactType: outputType, InputArtifactRefs: refs})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements}); err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "imported-" + source + "-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID})
	if err != nil || run.Status != model.InvocationStatusNeedsReview || len(outputs.Items) != 1 {
		t.Fatalf("run=%+v outputs=%+v err=%v", run, outputs, err)
	}
	return outputs.Items[0], run
}

func mustImportPublishedFolderSkill(t *testing.T, stageKey string) ResolvedSkill {
	t.Helper()
	snapshot, err := ParseSkillFolder("imported-"+stageKey, []SkillFolderFile{{Path: "SKILL.md", Data: []byte("# Imported " + stageKey)}})
	if err != nil {
		t.Fatal(err)
	}
	created, err := ImportManagedSkillFolder("admin-1", true, SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: stageKey, Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(stageKey, "asset-rendition-") {
		pkg := created.Package
		for index := range pkg.InputContract.ArtifactInputs {
			pkg.InputContract.ArtifactInputs[index].RequiresApproval = false
		}
		pkg, err = ValidateInvocableSkillPackage(pkg)
		if err != nil {
			t.Fatal(err)
		}
		stored := created.Version
		created.Version = skillVersionFromPackage(stored.ID, stored.SkillID, stored.Version, stored.CreatedBy, stored.CreatedAt, pkg)
		created.Version.SourceKind, created.Version.SourceHash, created.Version.SourceArchiveBlob = stored.SourceKind, stored.SourceHash, stored.SourceArchiveBlob
		created.Version.SourceFileIndexJSON, created.Version.ImportMetadataJSON = stored.SourceFileIndexJSON, stored.ImportMetadataJSON
		created.Package = pkg
	}
	created.Version.Status = model.SkillVersionPublished
	created.Skill.RecommendedVersionID = created.Version.ID
	if err := repository.SaveSkillVersion(created.Version); err != nil {
		t.Fatal(err)
	}
	if err := repository.SaveSkillDefinition(created.Skill); err != nil {
		t.Fatal(err)
	}
	return created
}

func importedAdapterID(t *testing.T, version model.SkillVersion) string {
	t.Helper()
	var metadata importedSkillStageMetadata
	if json.Unmarshal([]byte(version.ImportMetadataJSON), &metadata) != nil || strings.TrimSpace(metadata.FixedAdapter.AdapterID) == "" {
		t.Fatalf("metadata=%s", version.ImportMetadataJSON)
	}
	return metadata.FixedAdapter.AdapterID
}
