package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestInvocationCompletionArchivesImageRenditionWithBriefParent(t *testing.T) {
	setupInvocationServiceTest(t)
	png := testRuntimePNG(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"request-e2e","data":[{"b64_json":"` + base64.StdEncoding.EncodeToString(png) + `"}]}`))
	}))
	defer server.Close()
	originalAssets := config.Cfg.PublicAssetDir
	config.Cfg.PublicAssetDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.PublicAssetDir = originalAssets })
	if _, err := SaveSettings(model.Settings{
		Public:  model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"image-test"}, DefaultImageModel: "image-test", ModelCosts: []model.ModelCost{{Model: "image-test", Credits: 3}}}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{ID: "image-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "openai", BaseURL: server.URL, APIKey: "image-key", Models: []string{"image-test"}, Capabilities: []string{"image"}, Enabled: true}}},
	}); err != nil {
		t.Fatal(err)
	}
	stamp := now()
	if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "image-user", AffCode: "image-user-aff", Status: model.UserStatusActive, Credits: 100, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	brief := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "asset_brief", `{"assetId":"character-001","brief":"角色四视图","format":"character-four-view"}`)
	version := seedImageInvocationSkill(t, "image-completion")
	preflight, err := PreflightInvocation("user-1", InvocationRequest{
		Source: "image", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: version.ID, ExpectedOutputArtifactType: "asset_rendition",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "asset_brief", ArtifactID: brief.Artifact.ID, ContentHash: brief.Artifact.ContentHash}}, Parameters: json.RawMessage(`{"n":1}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ConfirmInvocation("user-1", preflight.Run.ID, InvocationConfirmation{RequirementCodes: preflight.ConfirmationRequirements}); err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "image-e2e-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: NewAPIAgentRunExecutor(server.Client())})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, ok, err := repository.GetUserInvocation("user-1", preflight.Run.ID)
	if err != nil || !ok || run.Status != model.InvocationStatusNeedsReview {
		t.Fatalf("run=%+v ok=%v err=%v", run, ok, err)
	}
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID})
	if err != nil || len(outputs.Items) != 1 {
		t.Fatalf("outputs=%+v err=%v", outputs, err)
	}
	output := outputs.Items[0]
	if output.Artifact.ArtifactType != "asset_rendition" || output.Payload["assetId"] != "character-001" || output.Payload["mediaType"] != "image" || !strings.HasPrefix(output.Payload["mediaRef"].(string), "/api/uploaded-assets/runtime/image/") {
		t.Fatalf("output=%+v", output)
	}
	if len(output.ParentArtifactIds) != 1 || output.ParentArtifactIds[0] != brief.Artifact.ID {
		t.Fatalf("parents=%v brief=%s", output.ParentArtifactIds, brief.Artifact.ID)
	}
}

func TestInvocationImagePartialRetryPreservesOrdinalAndSettlesPerImage(t *testing.T) {
	setupInvocationServiceTest(t)
	png := base64.StdEncoding.EncodeToString(testRuntimePNG(t))
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(`{"id":"request-partial","data":[{"b64_json":"` + png + `"}]}`))
	}))
	defer server.Close()
	originalAssets := config.Cfg.PublicAssetDir
	config.Cfg.PublicAssetDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.PublicAssetDir = originalAssets })
	if _, err := SaveSettings(model.Settings{
		Public:  model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"image-test"}, DefaultImageModel: "image-test", ModelCosts: []model.ModelCost{{Model: "image-test", Credits: 3}}}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{ID: "image-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "openai", BaseURL: server.URL, APIKey: "image-key", Models: []string{"image-test"}, Capabilities: []string{"image"}, Enabled: true}}},
	}); err != nil {
		t.Fatal(err)
	}
	stamp := now()
	if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "partial-image-user", AffCode: "partial-image-aff", Status: model.UserStatusActive, Credits: 100, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	brief := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "asset_brief", `{"assetId":"character-001","brief":"角色四视图","format":"character-four-view"}`)
	version := seedImageInvocationSkill(t, "image-partial")
	preflight, err := PreflightInvocation("user-1", InvocationRequest{
		Source: "image", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: version.ID, ExpectedOutputArtifactType: "asset_rendition",
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "asset_brief", ArtifactID: brief.Artifact.ID, ContentHash: brief.Artifact.ContentHash}}, Parameters: json.RawMessage(`{"n":2}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ConfirmInvocation("user-1", preflight.Run.ID, InvocationConfirmation{RequirementCodes: preflight.ConfirmationRequirements}); err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "image-partial-worker-1", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: NewAPIAgentRunExecutor(server.Client())})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetUserInvocation("user-1", preflight.Run.ID)
	user, _, _ := repository.GetUserByID("user-1")
	attempts, _ := repository.ListInvocationAttempts("user-1", run.ID)
	if run.Status != model.InvocationStatusPartial || user.Credits != 97 || len(attempts) != 1 || attempts[0].CreditsReserved != 6 || attempts[0].CreditsRefunded != 3 {
		t.Fatalf("partial run=%+v user=%+v attempts=%+v", run, user, attempts)
	}
	refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
	if countInvocationOutputOrdinal(refs, 1, 0) != 1 || countInvocationOutputOrdinal(refs, 1, 1) != 0 {
		t.Fatalf("partial refs=%+v", refs)
	}
	if _, err := RetryInvocation("user-1", run.ID); err != nil {
		t.Fatal(err)
	}
	worker = NewAgentRunWorker(AgentRunWorkerOptions{ID: "image-partial-worker-2", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: NewAPIAgentRunExecutor(server.Client())})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ = repository.GetUserInvocation("user-1", run.ID)
	user, _, _ = repository.GetUserByID("user-1")
	attempts, _ = repository.ListInvocationAttempts("user-1", run.ID)
	refs, _ = repository.ListInvocationArtifactRefs("user-1", run.ID)
	if run.Status != model.InvocationStatusNeedsReview || user.Credits != 94 || calls.Load() != 2 || len(attempts) != 2 || attempts[1].CreditsReserved != 3 || attempts[1].CreditsRefunded != 0 {
		t.Fatalf("retry run=%+v user=%+v attempts=%+v calls=%d", run, user, attempts, calls.Load())
	}
	if countInvocationOutputOrdinal(refs, 2, 0) != 1 || countInvocationOutputOrdinal(refs, 2, 1) != 1 {
		t.Fatalf("retry refs=%+v", refs)
	}
}

func countInvocationOutputOrdinal(refs []model.InvocationArtifactRef, attempt, ordinal int) int {
	count := 0
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == attempt && ref.Ordinal == ordinal {
			count++
		}
	}
	return count
}

func TestInvocationAgentRunWorkerCompletesFourGatesAndImmutableOutput(t *testing.T) {
	snapshot, source := queueInvocationWorkerTest(t, nil)
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now:      func() time.Time { return time.Now().UTC().Add(time.Minute) },
		Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	run, ok, err := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	if err != nil || !ok || run.Status != model.InvocationStatusNeedsReview {
		t.Fatalf("Invocation run=%#v ok=%v err=%v", run, ok, err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", run.ID)
	if err != nil || len(attempts) != 1 || attempts[0].Status != string(model.AgentRunStatusNeedsReview) || attempts[0].RawOutput == "" {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID})
	if err != nil || len(outputs.Items) != 1 {
		t.Fatalf("outputs=%#v err=%v", outputs, err)
	}
	output := outputs.Items[0]
	if output.Artifact.ArtifactType != "production_script" || output.Artifact.ProducerInvocationID == nil || *output.Artifact.ProducerInvocationID != run.ID || output.Artifact.ProducerAttempt != 1 {
		t.Fatalf("output lineage header=%#v", output.Artifact)
	}
	if len(output.ParentArtifactIds) != 1 || output.ParentArtifactIds[0] != source.Artifact.ID {
		t.Fatalf("parent lineage=%v, source=%s", output.ParentArtifactIds, source.Artifact.ID)
	}
	gates, err := repository.ListInvocationGates("user-1", run.ID)
	if err != nil || len(gates) != 4 {
		t.Fatalf("gates=%#v err=%v", gates, err)
	}
	wantLayers := []string{"input_contract", "output_schema", "business_gate", "policy_gate"}
	for index, gate := range gates {
		if !gate.Passed || gate.Layer != wantLayers[index] || gate.ExecutionOrdinal != index+1 {
			t.Fatalf("gate[%d]=%#v", index, gate)
		}
	}
	refs, err := repository.ListInvocationArtifactRefs("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	outputRefs := 0
	for _, ref := range refs {
		if ref.Direction == "output" {
			outputRefs++
			if ref.BindingName != "script" || ref.Ordinal != 0 || ref.ArtifactID != output.Artifact.ID || ref.ArtifactHash != output.Artifact.ContentHash {
				t.Fatalf("output ref=%#v artifact=%#v", ref, output.Artifact)
			}
		}
	}
	if outputRefs != 1 {
		t.Fatalf("output refs=%d", outputRefs)
	}
}

func TestInvocationWorkerRejectsTamperedFrozenExecutionBeforeModelCall(t *testing.T) {
	cases := []struct {
		name, column string
		value        any
	}{
		{name: "model", column: "model", value: "tampered-model"},
		{name: "channel", column: "channel_id", value: "tampered-channel"},
		{name: "request", column: "request_json", value: `{"messages":[{"role":"user","content":"tampered"}]}`},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			snapshot, _ := queueInvocationWorkerTest(t, nil)
			attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
			if err != nil || len(attempts) != 1 {
				t.Fatalf("attempts=%#v err=%v", attempts, err)
			}
			database, err := repository.DB()
			if err != nil {
				t.Fatal(err)
			}
			if err := database.Model(&model.AgentRun{}).Where("id = ?", attempts[0].AgentRunID).Update(test.column, test.value).Error; err != nil {
				t.Fatal(err)
			}
			executor := &countingInvocationExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}}
			worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "invocation-worker", LeaseDuration: time.Minute, Executor: executor})
			if err := worker.ProcessOne(context.Background()); err != nil {
				t.Fatalf("ProcessOne returned error: %v", err)
			}
			if executor.calls.Load() != 0 {
				t.Fatalf("model calls=%d, want 0", executor.calls.Load())
			}
			attempts, err = repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
			if err != nil || len(attempts) != 1 || attempts[0].Status != string(model.AgentRunStatusFailed) {
				t.Fatalf("attempts=%#v err=%v", attempts, err)
			}
		})
	}
}

func TestInvocationAgentRunWorkerSchemaFailureKeepsRawWithoutArtifact(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	raw := `{"wrong":true}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now:      func() time.Time { return time.Now().UTC().Add(time.Minute) },
		Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	run, ok, err := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	if err != nil || !ok || run.Status != model.InvocationStatusFailed {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", run.ID)
	if err != nil || len(attempts) != 1 || attempts[0].Status != string(model.AgentRunStatusFailed) || attempts[0].ErrorClass != "output_schema" || attempts[0].RawOutput != raw {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
	agentRun, ok, err := repository.GetAgentRun(attempts[0].AgentRunID)
	if err != nil || !ok || agentRun.RawOutput != raw || agentRun.Status != model.AgentRunStatusFailed {
		t.Fatalf("AgentRun=%#v ok=%v err=%v", agentRun, ok, err)
	}
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID})
	if err != nil || len(outputs.Items) != 0 {
		t.Fatalf("outputs=%#v err=%v", outputs, err)
	}
	gates, err := repository.ListInvocationGates("user-1", run.ID)
	if err != nil || len(gates) != 2 || !gates[0].Passed || gates[0].Layer != "input_contract" || gates[1].Passed || gates[1].Layer != "output_schema" {
		t.Fatalf("gates=%#v err=%v", gates, err)
	}
}

func TestInvocationValidatorRegistryRejectsUnknownSkillGate(t *testing.T) {
	pkg := validSkillTestPackage()
	pkg.QualityGateProfile = []string{"schema", "unknown-validator"}
	if _, err := ValidateInvocableSkillPackage(pkg); err == nil {
		t.Fatal("expected unknown Skill gate rejection")
	}
}

func TestInvocationBusinessGateFailurePersistsTraceWithoutArtifact(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now:      func() time.Time { return time.Now().UTC().Add(time.Minute) },
		Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":" "}`, structuredJSON: `{"productionScript":" "}`}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	assertInvocationGateFailure(t, snapshot.Run.ID, "business_gate", 3)
}

func TestInvocationPolicyGateRejectsQueueWithoutRecordedConfirmation(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTestWithEvent(t, nil, func(event *model.InvocationEvent) { event.DataJSON = `{}` })
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now:      func() time.Time { return time.Now().UTC().Add(time.Minute) },
		Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	assertInvocationGateFailure(t, snapshot.Run.ID, "policy_gate", 4)
}

func TestInvocationPolicyGateRejectsUndeclaredToolTrace(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now: func() time.Time { return time.Now().UTC().Add(time.Minute) },
		Executor: invocationFakeExecutor{result: agentRunCallResult{
			rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`,
			toolTraceJSON: `[{"tool":"project.write"}]`,
		}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	assertInvocationGateFailure(t, snapshot.Run.ID, "policy_gate", 4)
}

func TestInvocationGateFailuresRefundReservedCredits(t *testing.T) {
	tests := []struct {
		name        string
		result      agentRunCallResult
		mutateEvent func(*model.InvocationEvent)
		mutateInput bool
	}{
		{name: "input_contract", result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}, mutateInput: true},
		{name: "output_schema", result: agentRunCallResult{rawOutput: `{"wrong":true}`, structuredJSON: `{"wrong":true}`}},
		{name: "business_gate", result: agentRunCallResult{rawOutput: `{"productionScript":" "}`, structuredJSON: `{"productionScript":" "}`}},
		{name: "policy_gate", result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}, mutateEvent: func(event *model.InvocationEvent) { event.DataJSON = `{}` }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			snapshot, source := queueInvocationWorkerTestWithEvent(t, nil, test.mutateEvent)
			saveInvocationCreditUser(t, snapshot.Run.ID)
			if test.mutateInput {
				database, _ := repository.DB()
				if err := database.Model(&model.Artifact{}).Where("id = ?", source.Artifact.ID).Update("payload_json", `{"text":"篡改但保留旧哈希"}`).Error; err != nil {
					t.Fatal(err)
				}
			}
			executor := &creditedInvocationExecutor{result: test.result}
			worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: executor})
			if err := worker.ProcessOne(context.Background()); err != nil {
				t.Fatalf("ProcessOne returned error: %v", err)
			}
			assertInvocationCreditRefund(t, snapshot.Run.ID, model.InvocationStatusFailed, model.AgentRunStatusFailed)
			if executor.calls.Load() != 1 {
				t.Fatalf("model calls=%d, want 1", executor.calls.Load())
			}
			attempts, _ := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
			agentRun, _, _ := repository.GetAgentRun(attempts[0].AgentRunID)
			if err := finalizeInvocationAgentRun(agentRun, test.result, agentRun.FinishedAt); err != nil {
				t.Fatalf("duplicate completion returned error: %v", err)
			}
			assertInvocationCreditRefund(t, snapshot.Run.ID, model.InvocationStatusFailed, model.AgentRunStatusFailed)
		})
	}
}

func TestInvocationInputContractGateRejectsChangedFrozenArtifact(t *testing.T) {
	snapshot, source := queueInvocationWorkerTest(t, nil)
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.Artifact{}).Where("id = ?", source.Artifact.ID).Update("payload_json", `{"text":"篡改但保留旧哈希"}`).Error; err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now:      func() time.Time { return time.Now().UTC().Add(time.Minute) },
		Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	assertInvocationGateFailure(t, snapshot.Run.ID, "input_contract", 1)
}

func TestInvocationInputContractGateRejectsTamperedFrozenEnvelope(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	revisions, err := repository.ListInvocationPreflightRevisions("user-1", snapshot.Run.ID)
	if err != nil || len(revisions) != 1 {
		t.Fatalf("revisions=%#v err=%v", revisions, err)
	}
	var bindings []ResolvedArtifactBinding
	if err := json.Unmarshal([]byte(revisions[0].InputSnapshotJSON), &bindings); err != nil || len(bindings) != 1 {
		t.Fatalf("bindings=%#v err=%v", bindings, err)
	}
	bindings[0].Artifact.Payload["text"] = "篡改的冻结 payload"
	tampered, err := json.Marshal(bindings)
	if err != nil {
		t.Fatal(err)
	}
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.InvocationPreflightRevision{}).Where("id = ?", revisions[0].ID).Update("input_snapshot_json", string(tampered)).Error; err != nil {
		t.Fatal(err)
	}
	revisions[0].InputSnapshotJSON = string(tampered)
	systemPrompt, userPrompt, err := buildInvocationPrompts(revisions[0])
	if err != nil {
		t.Fatal(err)
	}
	requestJSON, err := buildAgentRunChatRequest(CreateAgentRunInput{SystemPrompt: systemPrompt, UserPrompt: userPrompt}, snapshot.ExecutionPolicy.Model)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.AgentRun{}).Where("invocation_id = ?", snapshot.Run.ID).Update("request_json", string(requestJSON)).Error; err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now:      func() time.Time { return time.Now().UTC().Add(time.Minute) },
		Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	assertInvocationGateFailure(t, snapshot.Run.ID, "input_contract", 1)
}

func TestInvocationInputContractMatchesBindingsByNameAndOrdinal(t *testing.T) {
	setupInvocationServiceTest(t)
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"原稿"}`)
	contextArtifact := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"上下文"}`)
	_, version := seedInvocationSkill(t, invocationSkillSeed{ID: "skill-input-order", VersionID: "skill-input-order-v1", Version: "1.0.0", Recommended: true, Mutate: func(pkg *SkillPackage) {
		pkg.InputContract.ArtifactInputs = append(pkg.InputContract.ArtifactInputs, ArtifactInputSpec{BindingName: "context", ArtifactType: "source_text", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"})
	}})
	snapshot, err := PreflightInvocation("user-1", InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: version.ID,
		InputArtifactRefs: []ArtifactRefInput{
			{BindingName: "source", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash},
			{BindingName: "context", ArtifactID: contextArtifact.Artifact.ID, ContentHash: contextArtifact.Artifact.ContentHash},
		}, Parameters: json.RawMessage(`{"tone":"克制"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	queued, attempt, agentRun, refs, event, err := buildInvocationAttemptQueue(snapshot.Run, snapshot.Revision, snapshot.InputArtifactRefs)
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.QueueInvocationAttemptTx(queued, attempt, agentRun, refs, event); err != nil {
		t.Fatal(err)
	}
	var bindings []ResolvedArtifactBinding
	if err := json.Unmarshal([]byte(snapshot.Revision.InputSnapshotJSON), &bindings); err != nil || len(bindings) != 2 {
		t.Fatalf("bindings=%#v err=%v", bindings, err)
	}
	if bindings[0].BindingName != "context" || bindings[1].BindingName != "source" {
		t.Fatalf("preflight bindings=%v,%v", bindings[0].BindingName, bindings[1].BindingName)
	}
	bindings[0], bindings[1] = bindings[1], bindings[0]
	reordered, err := json.Marshal(bindings)
	if err != nil {
		t.Fatal(err)
	}
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.InvocationPreflightRevision{}).Where("id = ?", snapshot.Revision.ID).Update("input_snapshot_json", string(reordered)).Error; err != nil {
		t.Fatal(err)
	}
	snapshot.Revision.InputSnapshotJSON = string(reordered)
	systemPrompt, userPrompt, err := buildInvocationPrompts(snapshot.Revision)
	if err != nil {
		t.Fatal(err)
	}
	requestJSON, err := buildAgentRunChatRequest(CreateAgentRunInput{SystemPrompt: systemPrompt, UserPrompt: userPrompt}, snapshot.ExecutionPolicy.Model)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.AgentRun{}).Where("id = ?", agentRun.ID).Update("request_json", string(requestJSON)).Error; err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now:      func() time.Time { return time.Now().UTC().Add(time.Minute) },
		Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	run, ok, err := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	if err != nil || !ok || run.Status != model.InvocationStatusNeedsReview {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
}

func TestInvocationCompletionSupportsMultiOutputBindingOrdinals(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, func(pkg *SkillPackage) {
		pkg.OutputContract.ArtifactOutputs[0].Max = 2
		pkg.OutputContract.Schema = workflowScriptOutputSchema()
	})
	raw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"第一稿"}},{"bindingName":"script","ordinal":1,"payload":{"productionScript":"第二稿"}}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now:      func() time.Time { return time.Now().UTC().Add(time.Minute) },
		Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: snapshot.Run.ID, PageSize: 10})
	if err != nil || len(outputs.Items) != 2 {
		t.Fatalf("outputs=%#v err=%v", outputs, err)
	}
	refs, err := repository.ListInvocationArtifactRefs("user-1", snapshot.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	ordinals := []int{}
	for _, ref := range refs {
		if ref.Direction == "output" {
			if ref.BindingName != "script" {
				t.Fatalf("ref=%#v", ref)
			}
			ordinals = append(ordinals, ref.Ordinal)
		}
	}
	if len(ordinals) != 2 || ordinals[0] != 0 || ordinals[1] != 1 {
		t.Fatalf("output ordinals=%v", ordinals)
	}
}

func TestInvocationTwoWorkersCreateArtifactSetExactlyOnce(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	executor := &blockingInvocationExecutor{
		started: make(chan struct{}), release: make(chan struct{}),
		result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`},
	}
	newWorker := func(id string) *AgentRunWorker {
		return NewAgentRunWorker(AgentRunWorkerOptions{ID: id, LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, UserConcurrency: 1, Executor: executor})
	}
	firstResult := make(chan error, 1)
	go func() { firstResult <- newWorker("invocation-worker-a").ProcessOne(context.Background()) }()
	select {
	case <-executor.started:
	case <-time.After(5 * time.Second):
		t.Fatal("first worker did not start model call")
	}
	if err := newWorker("invocation-worker-b").ProcessOne(context.Background()); err != nil {
		t.Fatalf("second worker returned error: %v", err)
	}
	close(executor.release)
	if err := <-firstResult; err != nil {
		t.Fatalf("first worker returned error: %v", err)
	}
	if executor.calls.Load() != 1 {
		t.Fatalf("executor calls=%d, want 1", executor.calls.Load())
	}
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: snapshot.Run.ID})
	if err != nil || len(outputs.Items) != 1 {
		t.Fatalf("outputs=%#v err=%v", outputs, err)
	}
}

func TestInvocationCancelRaceAfterLastCheckRefundsExactlyOnce(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	saveInvocationCreditUser(t, snapshot.Run.ID)
	executor := &creditedInvocationExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}}
	originalFinalize := finalizeInvocationAttemptTx
	var injected atomic.Bool
	finalizeInvocationAttemptTx = func(agentRun model.AgentRun, run model.InvocationRun, attempt model.InvocationAttempt, artifacts []model.Artifact, refs []model.InvocationArtifactRef, gates []model.InvocationGateResult, event model.InvocationEvent) error {
		if injected.CompareAndSwap(false, true) {
			if _, err := repository.RequestAgentRunCancel(agentRun.UserID, agentRun.ID); err != nil {
				return err
			}
		}
		return repository.FinalizeInvocationAttemptTx(agentRun, run, attempt, artifacts, refs, gates, event)
	}
	t.Cleanup(func() { finalizeInvocationAttemptTx = originalFinalize })
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: executor})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatalf("ProcessOne returned error: %v", err)
	}
	assertInvocationCreditRefund(t, snapshot.Run.ID, model.InvocationStatusCancelled, model.AgentRunStatusCancelled)
	if executor.calls.Load() != 1 {
		t.Fatalf("model calls=%d, want 1", executor.calls.Load())
	}
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: snapshot.Run.ID})
	if err != nil || len(outputs.Items) != 0 {
		t.Fatalf("outputs=%#v err=%v", outputs, err)
	}
}

func TestInvocationDuplicateCompletionIsIdempotent(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	result := agentRunCallResult{rawOutput: `{"productionScript":"优化稿"}`, structuredJSON: `{"productionScript":"优化稿"}`}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Now: func() time.Time { return time.Now().UTC().Add(time.Minute) }, Executor: invocationFakeExecutor{result: result},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if err != nil || len(attempts) != 1 {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
	agentRun, ok, err := repository.GetAgentRun(attempts[0].AgentRunID)
	if err != nil || !ok {
		t.Fatalf("AgentRun ok=%v err=%v", ok, err)
	}
	if err := finalizeInvocationAgentRun(agentRun, result, agentRun.FinishedAt); err != nil {
		t.Fatalf("duplicate completion returned error: %v", err)
	}
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: snapshot.Run.ID})
	if err != nil || len(outputs.Items) != 1 {
		t.Fatalf("outputs=%#v err=%v", outputs, err)
	}
}

func TestInvocationAgentRunWorkerClassifiesExecutionTargetUnavailable(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "wrong-worker", LeaseDuration: time.Minute, Executor: invocationWrongExecutor{}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if err != nil || len(attempts) != 1 || attempts[0].ErrorClass != "execution_target_unavailable" || attempts[0].Status != string(model.AgentRunStatusFailed) {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
}

func TestInvocationWorkerRejectsUnavailableFrozenChannelBeforeModelCall(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	if _, err := SaveSettings(model.Settings{
		Public: model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"text-test"}, DefaultTextModel: "text-test"}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			ID: "text-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "text", BaseURL: "https://example.invalid/v1",
			Models: []string{"text-test"}, Capabilities: []string{"text"}, Enabled: false,
		}}},
	}); err != nil {
		t.Fatal(err)
	}
	executor := &countingInvocationExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"不应调用"}`}}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "invocation-worker", LeaseDuration: time.Minute, Executor: executor})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	if executor.calls.Load() != 0 {
		t.Fatalf("model calls=%d, want 0", executor.calls.Load())
	}
	attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if err != nil || len(attempts) != 1 || attempts[0].Status != string(model.AgentRunStatusFailed) || attempts[0].ErrorClass != "execution_target_unavailable" {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
}

func TestInvocationWorkerRevalidatesAfterExecutorAvailabilityBeforeModelCall(t *testing.T) {
	for _, test := range []struct {
		name, column string
		value        any
	}{
		{name: "request", column: "request_json", value: `{"messages":[{"role":"user","content":"tampered-after-validation"}]}`},
		{name: "model", column: "model", value: "tampered-model"},
		{name: "channel", column: "channel_id", value: "tampered-channel"},
		{name: "credits", column: "credits", value: 7},
		{name: "estimated credits", column: "estimated_credits", value: 7},
		{name: "timeout", column: "timeout_seconds", value: 31},
		{name: "max attempts", column: "max_attempts", value: 2},
		{name: "concurrency", column: "concurrency_limit", value: 2},
		{name: "allow batch", column: "allow_batch", value: true},
		{name: "write policy", column: "write_policy", value: "apply_direct"},
		{name: "requires confirm", column: "requires_confirm", value: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot, _ := queueInvocationWorkerTest(t, nil)
			if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "invocation-policy-user", Credits: 100, Status: model.UserStatusActive, CreatedAt: now(), UpdatedAt: now()}); err != nil {
				t.Fatal(err)
			}
			executor := &availabilityMutatingInvocationExecutor{
				mutate: func() error {
					database, _ := repository.DB()
					return database.Model(&model.AgentRun{}).Where("invocation_id = ?", snapshot.Run.ID).Update(test.column, test.value).Error
				},
				result: agentRunCallResult{rawOutput: `{"productionScript":"不应调用"}`, structuredJSON: `{"productionScript":"不应调用"}`},
			}
			worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "invocation-worker", LeaseDuration: time.Minute, Executor: executor})
			if err := worker.ProcessOne(context.Background()); err != nil {
				t.Fatal(err)
			}
			if executor.calls.Load() != 0 {
				t.Fatalf("model calls=%d, want 0", executor.calls.Load())
			}
			attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
			if err != nil || len(attempts) != 1 || attempts[0].ErrorClass != "execution_target_unavailable" {
				t.Fatalf("attempts=%#v err=%v", attempts, err)
			}
			assertInvocationFailureSettlement(t, snapshot.Run.ID)
		})
	}
}

func assertInvocationFailureSettlement(t *testing.T, invocationID string) {
	t.Helper()
	run, ok, err := repository.GetUserInvocation("user-1", invocationID)
	if err != nil || !ok || run.Status != model.InvocationStatusFailed {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", invocationID)
	if err != nil || len(attempts) != 1 || attempts[0].Status != string(model.AgentRunStatusFailed) || attempts[0].ErrorClass != "execution_target_unavailable" {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
	agentRun, ok, err := repository.GetAgentRun(attempts[0].AgentRunID)
	if err != nil || !ok || agentRun.Status != model.AgentRunStatusFailed || agentRun.CreditsReserved != agentRun.CreditsRefunded || attempts[0].CreditsReserved != agentRun.CreditsReserved || attempts[0].CreditsRefunded != agentRun.CreditsRefunded {
		t.Fatalf("AgentRun=%#v attempt=%#v ok=%v err=%v", agentRun, attempts[0], ok, err)
	}
	user, ok, err := repository.GetUserByID("user-1")
	if err != nil || !ok || user.Credits != 100 {
		t.Fatalf("user=%#v ok=%v err=%v", user, ok, err)
	}
}

func TestInvocationRetryableExecutorFailureKeepsAppendOnlyAttempt(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "invocation-worker", LeaseDuration: time.Minute,
		Executor: invocationFakeExecutor{result: agentRunCallResult{message: "temporary upstream failure", retryable: true}},
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if err != nil || len(attempts) != 1 || attempts[0].Attempt != 1 || attempts[0].Status != string(model.AgentRunStatusFailed) || attempts[0].FinishedAt == "" {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
}

func assertInvocationGateFailure(t *testing.T, invocationID, layer string, gateCount int) {
	t.Helper()
	run, ok, err := repository.GetUserInvocation("user-1", invocationID)
	if err != nil || !ok || run.Status != model.InvocationStatusFailed {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", invocationID)
	if err != nil || len(attempts) != 1 || attempts[0].ErrorClass != layer {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
	outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: invocationID})
	if err != nil || len(outputs.Items) != 0 {
		t.Fatalf("outputs=%#v err=%v", outputs, err)
	}
	gates, err := repository.ListInvocationGates("user-1", invocationID)
	if err != nil || len(gates) != gateCount || gates[len(gates)-1].Layer != layer || gates[len(gates)-1].Passed {
		t.Fatalf("gates=%#v err=%v", gates, err)
	}
}

type invocationFakeExecutor struct{ result agentRunCallResult }

func (invocationFakeExecutor) Kind() string                    { return AgentRunExecutorAPI }
func (invocationFakeExecutor) Available(context.Context) error { return nil }
func (executor invocationFakeExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	return executor.result
}
func (invocationFakeExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (invocationFakeExecutor) RefundCredits(*model.AgentRun) error  { return nil }

type countingInvocationExecutor struct {
	calls  atomic.Int32
	result agentRunCallResult
}

func (*countingInvocationExecutor) Kind() string                    { return AgentRunExecutorAPI }
func (*countingInvocationExecutor) Available(context.Context) error { return nil }
func (executor *countingInvocationExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	executor.calls.Add(1)
	return executor.result
}
func (*countingInvocationExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (*countingInvocationExecutor) RefundCredits(*model.AgentRun) error  { return nil }

type creditedInvocationExecutor struct {
	calls  atomic.Int32
	result agentRunCallResult
}

type availabilityMutatingInvocationExecutor struct {
	mutate func() error
	calls  atomic.Int32
	result agentRunCallResult
}

func (*availabilityMutatingInvocationExecutor) Kind() string { return AgentRunExecutorAPI }
func (executor *availabilityMutatingInvocationExecutor) Available(context.Context) error {
	return executor.mutate()
}
func (executor *availabilityMutatingInvocationExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	executor.calls.Add(1)
	return executor.result
}
func (*availabilityMutatingInvocationExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (*availabilityMutatingInvocationExecutor) RefundCredits(*model.AgentRun) error  { return nil }

func (*creditedInvocationExecutor) Kind() string                    { return AgentRunExecutorAPI }
func (*creditedInvocationExecutor) Available(context.Context) error { return nil }
func (executor *creditedInvocationExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	executor.calls.Add(1)
	return executor.result
}
func (*creditedInvocationExecutor) ReserveCredits(run *model.AgentRun) error {
	return reserveAgentRunCredits(run)
}
func (*creditedInvocationExecutor) RefundCredits(run *model.AgentRun) error {
	return refundAgentRunCredits(run)
}

func saveInvocationCreditUser(t *testing.T, invocationID string) {
	t.Helper()
	stamp := now()
	if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "invocation-credit-user", Credits: 100, Status: model.UserStatusActive, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	database, _ := repository.DB()
	revisions, err := repository.ListInvocationPreflightRevisions("user-1", invocationID)
	if err != nil || len(revisions) != 1 {
		t.Fatalf("revisions=%#v err=%v", revisions, err)
	}
	var policy InvocationExecutionPolicy
	if err := json.Unmarshal([]byte(revisions[0].ExecutionPolicyJSON), &policy); err != nil {
		t.Fatal(err)
	}
	policy.Credits = 5
	policyJSON, err := json.Marshal(policy)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.InvocationPreflightRevision{}).Where("id = ?", revisions[0].ID).Update("execution_policy_json", string(policyJSON)).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.AgentRun{}).Where("invocation_id = ?", invocationID).Update("credits", 5).Error; err != nil {
		t.Fatal(err)
	}
}

func assertInvocationCreditRefund(t *testing.T, invocationID string, runStatus model.InvocationStatus, agentStatus model.AgentRunStatus) {
	t.Helper()
	run, ok, err := repository.GetUserInvocation("user-1", invocationID)
	if err != nil || !ok || run.Status != runStatus {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", invocationID)
	if err != nil || len(attempts) != 1 {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
	agentRun, ok, err := repository.GetAgentRun(attempts[0].AgentRunID)
	if err != nil || !ok {
		t.Fatalf("AgentRun=%#v ok=%v err=%v", agentRun, ok, err)
	}
	if agentRun.Status != agentStatus || attempts[0].Status != string(agentStatus) || agentRun.CreditsReserved <= 0 || agentRun.CreditsRefunded != agentRun.CreditsReserved || attempts[0].CreditsReserved != agentRun.CreditsReserved || attempts[0].CreditsRefunded != agentRun.CreditsReserved {
		t.Fatalf("AgentRun=%#v attempt=%#v", agentRun, attempts[0])
	}
	consumed, err := repository.CountCreditLogsByRelatedIDAndType(agentRun.ID, model.CreditLogTypeAIConsume)
	if err != nil {
		t.Fatal(err)
	}
	refunded, err := repository.CountCreditLogsByRelatedIDAndType(agentRun.ID, model.CreditLogTypeAIRefund)
	if err != nil {
		t.Fatal(err)
	}
	logs, err := repository.ListCreditLogsByRelatedID(agentRun.ID)
	if err != nil {
		t.Fatal(err)
	}
	consumeAmount, refundAmount := 0, 0
	for _, log := range logs {
		if log.Type == model.CreditLogTypeAIConsume {
			consumeAmount -= log.Amount
		}
		if log.Type == model.CreditLogTypeAIRefund {
			refundAmount += log.Amount
		}
	}
	user, ok, err := repository.GetUserByID("user-1")
	if err != nil || !ok || consumed != 1 || refunded != 1 || consumeAmount != agentRun.CreditsReserved || refundAmount != agentRun.CreditsReserved || user.Credits != 100 {
		t.Fatalf("consume=%d/%d refund=%d/%d user=%#v ok=%v err=%v", consumed, consumeAmount, refunded, refundAmount, user, ok, err)
	}
}

type invocationWrongExecutor struct{}

func (invocationWrongExecutor) Kind() string                    { return AgentRunExecutorCodexCLI }
func (invocationWrongExecutor) Available(context.Context) error { return nil }
func (invocationWrongExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	return agentRunCallResult{}
}
func (invocationWrongExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (invocationWrongExecutor) RefundCredits(*model.AgentRun) error  { return nil }

type blockingInvocationExecutor struct {
	started chan struct{}
	release chan struct{}
	calls   atomic.Int32
	result  agentRunCallResult
}

func (*blockingInvocationExecutor) Kind() string                    { return AgentRunExecutorAPI }
func (*blockingInvocationExecutor) Available(context.Context) error { return nil }
func (executor *blockingInvocationExecutor) Call(context.Context, model.AgentRun) agentRunCallResult {
	executor.calls.Add(1)
	close(executor.started)
	<-executor.release
	return executor.result
}
func (*blockingInvocationExecutor) ReserveCredits(*model.AgentRun) error { return nil }
func (*blockingInvocationExecutor) RefundCredits(*model.AgentRun) error  { return nil }

func queueInvocationWorkerTest(t *testing.T, mutate func(*SkillPackage)) (InvocationPreflightSnapshot, ArtifactEnvelope) {
	return queueInvocationWorkerTestWithEvent(t, mutate, nil)
}

func queueInvocationWorkerTestWithEvent(t *testing.T, mutate func(*SkillPackage), mutateEvent func(*model.InvocationEvent)) (InvocationPreflightSnapshot, ArtifactEnvelope) {
	t.Helper()
	setupInvocationServiceTest(t)
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"原稿"}`)
	_, version := seedInvocationSkill(t, invocationSkillSeed{ID: "skill-worker", VersionID: "skill-worker-v1", Version: "1.0.0", Recommended: true, Mutate: mutate})
	snapshot, err := PreflightInvocation("user-1", InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: version.ID,
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}}, Parameters: json.RawMessage(`{"tone":"克制"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	queued, attempt, agentRun, refs, event, err := buildInvocationAttemptQueue(snapshot.Run, snapshot.Revision, snapshot.InputArtifactRefs)
	if err != nil {
		t.Fatal(err)
	}
	if mutateEvent != nil {
		mutateEvent(&event)
	}
	if err := repository.QueueInvocationAttemptTx(queued, attempt, agentRun, refs, event); err != nil {
		t.Fatal(err)
	}
	return snapshot, source
}
