package service

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func lifecycleInvocationFixture(t *testing.T, mutate func(*SkillPackage)) InvocationPreflightSnapshot {
	t.Helper()
	setupInvocationServiceTest(t)
	_, version := seedInvocationSkill(t, invocationSkillSeed{ID: "lifecycle-skill", VersionID: "lifecycle-version", Version: "1.0.0", Mutate: mutate})
	input := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"原稿"}`)
	snapshot, err := PreflightInvocation("user-1", InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: version.ID,
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: input.Artifact.ID, ContentHash: input.Artifact.ContentHash}}, Parameters: json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func TestConfirmInvocationRacesCancelWithoutOrphan(t *testing.T) {
	snapshot := lifecycleInvocationFixture(t, nil)
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wait sync.WaitGroup
	wait.Add(2)
	go func() {
		defer wait.Done()
		<-start
		_, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: []string{"api_cost"}})
		errs <- err
	}()
	go func() {
		defer wait.Done()
		<-start
		_, err := CancelInvocation("user-1", snapshot.Run.ID)
		errs <- err
	}()
	close(start)
	wait.Wait()
	close(errs)
	for err := range errs {
		if err != nil && !errors.Is(err, repository.ErrInvocationTransitionConflict) {
			t.Fatalf("unexpected race error: %v", err)
		}
	}
	attempts, _ := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	database, _ := repository.DB()
	var agents int64
	database.Model(&model.AgentRun{}).Where("invocation_id = ?", snapshot.Run.ID).Count(&agents)
	if int64(len(attempts)) != agents || len(attempts) > 1 {
		t.Fatalf("attempts=%#v agents=%d", attempts, agents)
	}
	run, ok, err := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	if err != nil || !ok || (run.Status != model.InvocationStatusQueued && run.Status != model.InvocationStatusCancelled) {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
	if run.Status == model.InvocationStatusQueued && len(attempts) != 1 {
		t.Fatalf("queued without durable job: attempts=%#v", attempts)
	}
}

func TestRetryInvocationPartialOnlyRequestsFailedOrdinal(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, func(pkg *SkillPackage) {
		pkg.OutputContract.ArtifactOutputs[0].Min = 2
		pkg.OutputContract.ArtifactOutputs[0].Max = 2
		pkg.OutputContract.Schema = workflowScriptOutputSchema()
	})
	raw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"第一稿"}},{"bindingName":"script","ordinal":1,"payload":{"productionScript":" "}}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "partial-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, ok, err := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	if err != nil || !ok || run.Status != model.InvocationStatusPartial {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
	refs, err := repository.ListInvocationArtifactRefs("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	outputs := []model.InvocationArtifactRef{}
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 1 {
			outputs = append(outputs, ref)
		}
	}
	if len(outputs) != 1 || outputs[0].Ordinal != 0 {
		t.Fatalf("outputs=%#v", outputs)
	}
	retried, err := RetryInvocation("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	var plan InvocationRetryPlan
	if retried.Attempt == nil || json.Unmarshal([]byte(retried.Attempt.RetryPlanJSON), &plan) != nil || len(plan.PreservedOutputRefs) != 1 || len(plan.RequestedOutputs) != 1 || plan.RequestedOutputs[0] != (InvocationOutputCoordinate{BindingName: "script", Ordinal: 1}) {
		t.Fatalf("attempt=%#v plan=%#v", retried.Attempt, plan)
	}
	agent, ok, err := repository.GetAgentRun(retried.Attempt.AgentRunID)
	if err != nil || !ok || !strings.Contains(agent.RequestJSON, `\"ordinal\":1`) || !strings.Contains(agent.RequestJSON, "retryContext") {
		t.Fatalf("agent=%#v ok=%v err=%v", agent, ok, err)
	}
	retryRaw := `{"outputs":[{"bindingName":"script","ordinal":1,"payload":{"productionScript":"第二稿"}}]}`
	retryWorker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "partial-retry-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: retryRaw, structuredJSON: retryRaw}}})
	if err := retryWorker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, ok, err = repository.GetUserInvocation("user-1", run.ID)
	if err != nil || !ok || run.Status != model.InvocationStatusNeedsReview || run.LatestAttempt != 2 {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
	refs, err = repository.ListInvocationArtifactRefs("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	ordinals := map[int]string{}
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 2 {
			ordinals[ref.Ordinal] = ref.ArtifactID
		}
	}
	if len(ordinals) != 2 || ordinals[0] != outputs[0].ArtifactID || ordinals[1] == "" {
		t.Fatalf("attempt2 ordinals=%#v", ordinals)
	}
	newArtifact, found, err := repository.GetUserArtifact("user-1", ordinals[1])
	if err != nil || !found || strings.Contains(newArtifact.ParentArtifactRefsJSON, outputs[0].ArtifactID) {
		t.Fatalf("newArtifact=%#v found=%v err=%v", newArtifact, found, err)
	}
	if _, err := RetryInvocation("user-1", run.ID); err == nil {
		t.Fatal("needs_review attempt must not retry")
	}
}

func TestApprovedRetryArtifactSetAuthorizesPreservedAndNewOutputs(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, func(pkg *SkillPackage) {
		pkg.OutputContract.ArtifactOutputs[0].Min = 2
		pkg.OutputContract.ArtifactOutputs[0].Max = 2
		pkg.OutputContract.Schema = workflowScriptOutputSchema()
	})
	partialRaw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"保留稿"}},{"bindingName":"script","ordinal":1,"payload":{"productionScript":" "}}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "approval-partial-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: partialRaw, structuredJSON: partialRaw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	if _, err := RetryInvocation("user-1", run.ID); err != nil {
		t.Fatal(err)
	}
	retryRaw := `{"outputs":[{"bindingName":"script","ordinal":1,"payload":{"productionScript":"新稿"}}]}`
	retryWorker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "approval-retry-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: retryRaw, structuredJSON: retryRaw}}})
	if err := retryWorker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ = repository.GetUserInvocation("user-1", run.ID)
	refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
	outputs := map[int]model.InvocationArtifactRef{}
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 2 {
			outputs[ref.Ordinal] = ref
		}
	}
	if len(outputs) != 2 || outputs[0].ArtifactID == "" || outputs[1].ArtifactID == "" {
		t.Fatalf("outputs=%#v", outputs)
	}
	_, consumer := seedInvocationSkill(t, invocationSkillSeed{ID: "approval-consumer", VersionID: "approval-consumer-v1", Version: "1.0.0", Mutate: func(pkg *SkillPackage) {
		pkg.Manifest.InputArtifactTypes = []string{"production_script"}
		pkg.Manifest.SchemaCompatibility = map[string]string{"production_script": ">=1.0 <2.0"}
		pkg.InputContract.ArtifactInputs = []ArtifactInputSpec{{BindingName: "source", ArtifactType: "production_script", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0", RequiresApproval: true}}
	}})
	preflight := func(key string, ref model.InvocationArtifactRef) InvocationPreflightSnapshot {
		t.Helper()
		result, err := PreflightInvocation("user-1", InvocationRequest{Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: consumer.ID, IdempotencyKey: key, InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: ref.ArtifactID, ContentHash: ref.ArtifactHash}}, Parameters: json.RawMessage(`{}`)})
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	if unreviewed := preflight("approval-before-review", outputs[0]); unreviewed.Run.Status != model.InvocationStatusBlocked || !strings.Contains(unreviewed.Revision.BlockReasonsJSON, "input_approval_required") {
		t.Fatalf("unreviewed=%#v", unreviewed)
	}
	setHash := invocationArtifactSetHash(refs, 2)
	if approved, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "approved", Attempt: 2, ArtifactSetHash: setHash}); err != nil || approved.Run.Status != model.InvocationStatusApproved {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
	for ordinal, ref := range outputs {
		approved := preflight("approval-after-review-"+string(rune('0'+ordinal)), ref)
		if approved.Run.Status != model.InvocationStatusAwaitingConfirmation || strings.Contains(approved.Revision.BlockReasonsJSON, "input_approval_required") {
			t.Fatalf("ordinal=%d approved=%#v", ordinal, approved)
		}
	}
	database, _ := repository.DB()
	if err := database.Model(&model.InvocationRun{}).Where("id = ?", run.ID).Update("reviewed_artifact_set_hash", "sha256:tampered").Error; err != nil {
		t.Fatal(err)
	}
	if tampered := preflight("approval-tampered-hash", outputs[0]); tampered.Run.Status != model.InvocationStatusBlocked || !strings.Contains(tampered.Revision.BlockReasonsJSON, "input_approval_required") {
		t.Fatalf("tampered=%#v", tampered)
	}
}

func TestRetryInvocationUsesExactFailedCoordinatesAndKeepsNonObjectItemPartial(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, func(pkg *SkillPackage) {
		pkg.OutputContract.ArtifactOutputs[0].Min = 1
		pkg.OutputContract.ArtifactOutputs[0].Max = 3
		pkg.OutputContract.Schema = workflowScriptOutputSchema()
	})
	raw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"A"}},{"bindingName":"script","ordinal":1,"payload":"bad"},{"bindingName":"script","ordinal":2,"payload":{"productionScript":"C"}}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "exact-partial-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
	got := []int{}
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 1 {
			got = append(got, ref.Ordinal)
		}
	}
	if run.Status != model.InvocationStatusPartial || !slices.Equal(got, []int{0, 2}) {
		t.Fatalf("run=%#v ordinals=%v", run, got)
	}
	loaded, _ := loadInvocationPreflightSnapshot("user-1", run)
	forged := InvocationRetryPlan{RequestedOutputs: []InvocationOutputCoordinate{{BindingName: "script", Ordinal: 0}}}
	queued, forgedAttempt, forgedAgent, inputRefs, event, buildErr := buildInvocationAttemptQueueWithRetry(run, loaded.Revision, loaded.InputArtifactRefs, forged)
	if buildErr != nil {
		t.Fatal(buildErr)
	}
	if err := repository.QueueInvocationAttemptTx(queued, forgedAttempt, forgedAgent, inputRefs, event); !errors.Is(err, repository.ErrInvocationTransitionConflict) {
		t.Fatalf("forged plan err=%v", err)
	}
	retried, err := RetryInvocation("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	var plan InvocationRetryPlan
	_ = json.Unmarshal([]byte(retried.Attempt.RetryPlanJSON), &plan)
	if len(plan.PreservedOutputRefs) != 2 || !slices.Equal(plan.RequestedOutputs, []InvocationOutputCoordinate{{BindingName: "script", Ordinal: 1}}) {
		t.Fatalf("plan=%#v", plan)
	}
}

func TestRetryInvocationWholeParseFailureCorrectionReattachesPreservedOutputs(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, func(pkg *SkillPackage) {
		pkg.OutputContract.ArtifactOutputs[0].Min = 2
		pkg.OutputContract.ArtifactOutputs[0].Max = 2
		pkg.OutputContract.Schema = workflowScriptOutputSchema()
	})
	partialRaw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"第一稿"}},{"bindingName":"script","ordinal":1,"payload":{"productionScript":" "}}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "preserved-partial-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: partialRaw, structuredJSON: partialRaw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
	var preserved model.InvocationArtifactRef
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 1 {
			preserved = ref
		}
	}
	if run.Status != model.InvocationStatusPartial || preserved.Ordinal != 0 || preserved.ArtifactID == "" {
		t.Fatalf("run=%#v preserved=%#v", run, preserved)
	}
	retried, err := RetryInvocation("user-1", run.ID)
	if err != nil || retried.Attempt == nil {
		t.Fatalf("retried=%#v err=%v", retried, err)
	}
	immutablePlan := retried.Attempt.RetryPlanJSON
	invalidRaw := `not-json`
	retryWorker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "preserved-failed-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: invalidRaw, structuredJSON: invalidRaw}}})
	if err := retryWorker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ = repository.GetUserInvocation("user-1", run.ID)
	attempts, _ := repository.ListInvocationAttempts("user-1", run.ID)
	if run.Status != model.InvocationStatusFailed || len(attempts) != 2 || attempts[1].RetryPlanJSON != immutablePlan {
		t.Fatalf("run=%#v attempts=%#v", run, attempts)
	}
	refs, _ = repository.ListInvocationArtifactRefs("user-1", run.ID)
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 2 {
			t.Fatalf("failed attempt copied output ref: %#v", ref)
		}
	}
	artifacts, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID, PageSize: 10})
	if err != nil || artifacts.Total != 1 {
		t.Fatalf("artifacts=%#v err=%v", artifacts, err)
	}
	failedCorrection := InvocationCorrectionInput{Attempt: 2, ExpectedRawOutputHash: invocationSHA256([]byte(invalidRaw)), Output: json.RawMessage(`{"outputs":[{"bindingName":"script","ordinal":1,"payload":{"productionScript":" "}}]}`)}
	failed, err := RevalidateInvocationOutput("user-1", run.ID, failedCorrection)
	if err != nil || failed.Run.Status != model.InvocationStatusFailed {
		t.Fatalf("failed=%#v err=%v", failed, err)
	}
	refs, _ = repository.ListInvocationArtifactRefs("user-1", run.ID)
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 2 {
			t.Fatalf("failed correction copied output ref: %#v", ref)
		}
	}
	success, err := RevalidateInvocationOutput("user-1", run.ID, InvocationCorrectionInput{Attempt: 2, ExpectedRawOutputHash: invocationSHA256([]byte(invalidRaw)), Output: json.RawMessage(`{"outputs":[{"bindingName":"script","ordinal":1,"payload":{"productionScript":"第二稿"}}]}`)})
	if err != nil || success.Run.Status != model.InvocationStatusNeedsReview {
		t.Fatalf("success=%#v err=%v", success, err)
	}
	refs, _ = repository.ListInvocationArtifactRefs("user-1", run.ID)
	outputIDs := map[int]string{}
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 2 {
			outputIDs[ref.Ordinal] = ref.ArtifactID
		}
	}
	if len(outputIDs) != 2 || outputIDs[0] != preserved.ArtifactID || outputIDs[1] == "" {
		t.Fatalf("attempt2 outputs=%#v preserved=%#v", outputIDs, preserved)
	}
	artifacts, err = ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID, PageSize: 10})
	if err != nil || artifacts.Total != 2 {
		t.Fatalf("artifacts=%#v err=%v", artifacts, err)
	}
	gates, _ := repository.ListInvocationGates("user-1", run.ID)
	latestGroup := 0
	for _, gate := range gates {
		if gate.Attempt == 2 && gate.ExecutionOrdinal > latestGroup {
			latestGroup = gate.ExecutionOrdinal
		}
	}
	layers := map[string]map[string]bool{"output_schema": {}, "business_gate": {}, "policy_gate": {}}
	inputPassed := false
	for _, gate := range gates {
		if gate.Attempt != 2 || gate.ExecutionOrdinal != latestGroup || !gate.Passed {
			continue
		}
		if gate.Layer == "input_contract" && gate.ArtifactID == "" {
			inputPassed = true
		}
		if layer, ok := layers[gate.Layer]; ok {
			layer[gate.ArtifactID] = true
		}
	}
	if !inputPassed {
		t.Fatalf("latest correction group %d missing input gate", latestGroup)
	}
	for ordinal, artifactID := range outputIDs {
		for layer, passed := range layers {
			if !passed[artifactID] {
				t.Fatalf("ordinal=%d artifact=%s missing %s in group %d", ordinal, artifactID, layer, latestGroup)
			}
		}
	}
}

func TestRetryInvocationFailedAndCancelledInheritExactRetryPlan(t *testing.T) {
	for _, terminal := range []string{"failed", "cancelled"} {
		t.Run(terminal, func(t *testing.T) {
			snapshot, _ := queueInvocationWorkerTest(t, func(pkg *SkillPackage) {
				pkg.OutputContract.ArtifactOutputs[0].Min = 2
				pkg.OutputContract.ArtifactOutputs[0].Max = 2
				pkg.OutputContract.Schema = workflowScriptOutputSchema()
			})
			partialRaw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"保留"}},{"bindingName":"script","ordinal":1,"payload":{"productionScript":" "}}]}`
			worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "inherit-partial-" + terminal, LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: partialRaw, structuredJSON: partialRaw}}})
			if err := worker.ProcessOne(context.Background()); err != nil {
				t.Fatal(err)
			}
			run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
			second, err := RetryInvocation("user-1", run.ID)
			if err != nil || second.Attempt == nil {
				t.Fatalf("second=%#v err=%v", second, err)
			}
			if terminal == "failed" {
				bad := `not-json`
				retryWorker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "inherit-failed-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: bad, structuredJSON: bad}}})
				if err := retryWorker.ProcessOne(context.Background()); err != nil {
					t.Fatal(err)
				}
			} else if _, err := CancelInvocation("user-1", run.ID); err != nil {
				t.Fatal(err)
			}
			run, _, _ = repository.GetUserInvocation("user-1", run.ID)
			loaded, err := loadInvocationPreflightSnapshot("user-1", run)
			if err != nil {
				t.Fatal(err)
			}
			var exact InvocationRetryPlan
			if json.Unmarshal([]byte(second.Attempt.RetryPlanJSON), &exact) != nil {
				t.Fatal("invalid attempt2 retry plan")
			}
			for name, mutate := range map[string]func(*InvocationRetryPlan){
				"missing-coordinate": func(plan *InvocationRetryPlan) { plan.RequestedOutputs = nil },
				"extra-coordinate": func(plan *InvocationRetryPlan) {
					plan.RequestedOutputs = append(plan.RequestedOutputs, InvocationOutputCoordinate{BindingName: "script", Ordinal: 2})
				},
				"forged-preserved": func(plan *InvocationRetryPlan) {
					plan.PreservedOutputRefs = append(plan.PreservedOutputRefs, InvocationRetryOutputRef{BindingName: "script", Ordinal: 2, ArtifactID: exact.PreservedOutputRefs[0].ArtifactID, ArtifactHash: exact.PreservedOutputRefs[0].ArtifactHash, ArtifactType: exact.PreservedOutputRefs[0].ArtifactType, SchemaVersion: exact.PreservedOutputRefs[0].SchemaVersion, SchemaContentHash: exact.PreservedOutputRefs[0].SchemaContentHash})
				},
				"forged-rejected-parent": func(plan *InvocationRetryPlan) {
					plan.RejectedParentArtifactIDs = []string{exact.PreservedOutputRefs[0].ArtifactID}
				},
			} {
				t.Run(name, func(t *testing.T) {
					forged := exact
					forged.PreservedOutputRefs = append([]InvocationRetryOutputRef(nil), exact.PreservedOutputRefs...)
					forged.RequestedOutputs = append([]InvocationOutputCoordinate(nil), exact.RequestedOutputs...)
					forged.RejectedParentArtifactIDs = append([]string(nil), exact.RejectedParentArtifactIDs...)
					mutate(&forged)
					queued, attempt, agent, inputRefs, event, buildErr := buildInvocationAttemptQueueWithRetry(run, loaded.Revision, loaded.InputArtifactRefs, normalizeInvocationRetryPlan(forged))
					if buildErr != nil {
						t.Fatal(buildErr)
					}
					if err := repository.QueueInvocationAttemptTx(queued, attempt, agent, inputRefs, event); !errors.Is(err, repository.ErrInvocationTransitionConflict) {
						t.Fatalf("forged plan err=%v", err)
					}
				})
			}
			third, err := RetryInvocation("user-1", run.ID)
			if err != nil || third.Attempt == nil || third.Attempt.RetryPlanJSON != second.Attempt.RetryPlanJSON {
				t.Fatalf("second=%#v third=%#v err=%v", second.Attempt, third.Attempt, err)
			}
		})
	}
}

func TestRetryInvocationRepositoryRejectsReorderedInheritedRetryPlanArrays(t *testing.T) {
	for _, field := range []string{"requested", "preserved", "rejected-parents"} {
		t.Run(field, func(t *testing.T) {
			var run model.InvocationRun
			var second InvocationResponse
			var err error
			if field == "rejected-parents" {
				snapshot, _ := queueInvocationWorkerTest(t, func(pkg *SkillPackage) {
					pkg.OutputContract.ArtifactOutputs[0].Min = 2
					pkg.OutputContract.ArtifactOutputs[0].Max = 2
					pkg.OutputContract.Schema = workflowScriptOutputSchema()
				})
				raw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"A"}},{"bindingName":"script","ordinal":1,"payload":{"productionScript":"B"}}]}`
				worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "reordered-rejected-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
				if err := worker.ProcessOne(context.Background()); err != nil {
					t.Fatal(err)
				}
				run, _, _ = repository.GetUserInvocation("user-1", snapshot.Run.ID)
				refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
				if _, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "rejected", Attempt: 1, ArtifactSetHash: invocationArtifactSetHash(refs, 1)}); err != nil {
					t.Fatal(err)
				}
				second, err = RetryInvocation("user-1", run.ID)
				if err != nil {
					t.Fatal(err)
				}
			} else {
				snapshot, _ := queueInvocationWorkerTest(t, func(pkg *SkillPackage) {
					pkg.OutputContract.ArtifactOutputs[0].Min = 4
					pkg.OutputContract.ArtifactOutputs[0].Max = 4
					pkg.OutputContract.Schema = workflowScriptOutputSchema()
				})
				raw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"A"}},{"bindingName":"script","ordinal":1,"payload":{"productionScript":" "}},{"bindingName":"script","ordinal":2,"payload":{"productionScript":"C"}},{"bindingName":"script","ordinal":3,"payload":{"productionScript":" "}}]}`
				worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "reordered-partial-worker-" + field, LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
				if err := worker.ProcessOne(context.Background()); err != nil {
					t.Fatal(err)
				}
				run, _, _ = repository.GetUserInvocation("user-1", snapshot.Run.ID)
				second, err = RetryInvocation("user-1", run.ID)
				if err != nil {
					t.Fatal(err)
				}
			}
			bad := `not-json`
			retryWorker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "reordered-failed-worker-" + field, LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: bad, structuredJSON: bad}}})
			if err := retryWorker.ProcessOne(context.Background()); err != nil {
				t.Fatal(err)
			}
			run, _, _ = repository.GetUserInvocation("user-1", run.ID)
			if run.Status != model.InvocationStatusFailed || second.Attempt == nil {
				t.Fatalf("run=%#v second=%#v", run, second)
			}
			var forged InvocationRetryPlan
			if json.Unmarshal([]byte(second.Attempt.RetryPlanJSON), &forged) != nil {
				t.Fatal("invalid attempt2 RetryPlan")
			}
			switch field {
			case "requested":
				if len(forged.RequestedOutputs) != 2 {
					t.Fatalf("requested=%#v", forged.RequestedOutputs)
				}
				slices.Reverse(forged.RequestedOutputs)
			case "preserved":
				if len(forged.PreservedOutputRefs) != 2 {
					t.Fatalf("preserved=%#v", forged.PreservedOutputRefs)
				}
				slices.Reverse(forged.PreservedOutputRefs)
			case "rejected-parents":
				if len(forged.RejectedParentArtifactIDs) != 2 {
					t.Fatalf("parents=%#v", forged.RejectedParentArtifactIDs)
				}
				slices.Reverse(forged.RejectedParentArtifactIDs)
			}
			loaded, err := loadInvocationPreflightSnapshot("user-1", run)
			if err != nil {
				t.Fatal(err)
			}
			queued, attempt, agent, inputRefs, event, err := buildInvocationAttemptQueueWithRetry(run, loaded.Revision, loaded.InputArtifactRefs, forged)
			if err != nil {
				t.Fatal(err)
			}
			if attempt.RetryPlanJSON == second.Attempt.RetryPlanJSON {
				t.Fatal("forged array order did not change canonical RetryPlan JSON")
			}
			if err := repository.QueueInvocationAttemptTx(queued, attempt, agent, inputRefs, event); !errors.Is(err, repository.ErrInvocationTransitionConflict) {
				t.Fatalf("reordered %s plan err=%v", field, err)
			}
		})
	}
}

func TestRetryInvocationFirstFailureUsesExactFrozenMinimumCoordinates(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, func(pkg *SkillPackage) {
		pkg.OutputContract.ArtifactOutputs[0].Min = 2
		pkg.OutputContract.ArtifactOutputs[0].Max = 3
	})
	bad := `not-json`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "first-failed-plan-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: bad, structuredJSON: bad}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	loaded, err := loadInvocationPreflightSnapshot("user-1", run)
	if err != nil {
		t.Fatal(err)
	}
	for name, requested := range map[string][]InvocationOutputCoordinate{
		"missing": {{BindingName: "script", Ordinal: 0}},
		"extra":   {{BindingName: "script", Ordinal: 0}, {BindingName: "script", Ordinal: 1}, {BindingName: "script", Ordinal: 2}},
	} {
		t.Run(name, func(t *testing.T) {
			plan := InvocationRetryPlan{RequestedOutputs: requested}
			queued, attempt, agent, inputRefs, event, buildErr := buildInvocationAttemptQueueWithRetry(run, loaded.Revision, loaded.InputArtifactRefs, plan)
			if buildErr != nil {
				t.Fatal(buildErr)
			}
			if err := repository.QueueInvocationAttemptTx(queued, attempt, agent, inputRefs, event); !errors.Is(err, repository.ErrInvocationTransitionConflict) {
				t.Fatalf("forged plan err=%v", err)
			}
		})
	}
	retried, err := RetryInvocation("user-1", run.ID)
	if err != nil || retried.Attempt == nil {
		t.Fatalf("retried=%#v err=%v", retried, err)
	}
	var plan InvocationRetryPlan
	_ = json.Unmarshal([]byte(retried.Attempt.RetryPlanJSON), &plan)
	want := []InvocationOutputCoordinate{{BindingName: "script", Ordinal: 0}, {BindingName: "script", Ordinal: 1}}
	if len(plan.PreservedOutputRefs) != 0 || len(plan.RejectedParentArtifactIDs) != 0 || !slices.Equal(plan.RequestedOutputs, want) {
		t.Fatalf("plan=%#v want=%#v", plan, want)
	}
}

func needsReviewLifecycleFixture(t *testing.T) model.InvocationRun {
	t.Helper()
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "review-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"审核稿"}`, structuredJSON: `{"productionScript":"审核稿"}`}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	run, ok, err := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	if err != nil || !ok || run.Status != model.InvocationStatusNeedsReview {
		t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
	}
	return run
}

func TestReviewInvocationValidatesArtifactSetAndIsIdempotent(t *testing.T) {
	run := needsReviewLifecycleFixture(t)
	refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
	hash := invocationArtifactSetHash(refs, run.LatestAttempt)
	if _, err := ReviewInvocation("foreign", run.ID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: hash}); !errors.Is(err, repository.ErrInvocationNotFound) {
		t.Fatalf("foreign err=%v", err)
	}
	if _, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "approved", Attempt: 2, ArtifactSetHash: hash}); err == nil {
		t.Fatal("expected wrong attempt rejection")
	}
	if _, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: "sha256:wrong"}); err == nil {
		t.Fatal("expected hash mismatch rejection")
	}
	input := InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: hash, Comment: "通过"}
	approved, err := ReviewInvocation("user-1", run.ID, input)
	if err != nil || approved.Run.Status != model.InvocationStatusApproved {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
	replay, err := ReviewInvocation("user-1", run.ID, input)
	if err != nil || replay.Run.Status != model.InvocationStatusApproved {
		t.Fatalf("replay=%#v err=%v", replay, err)
	}
	if _, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "rejected", Attempt: 1, ArtifactSetHash: hash}); !errors.Is(err, repository.ErrInvocationTransitionConflict) {
		t.Fatalf("changed err=%v", err)
	}
}

func TestReviewInvocationConcurrentSameReplayWritesOnce(t *testing.T) {
	run := needsReviewLifecycleFixture(t)
	refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
	input := InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: invocationArtifactSetHash(refs, 1), Comment: "通过"}
	errs := make(chan error, 8)
	var wait sync.WaitGroup
	for range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := ReviewInvocation("user-1", run.ID, input)
			errs <- err
		}()
	}
	wait.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("same review err=%v", err)
		}
	}
	reviews, _ := repository.ListInvocationReviews("user-1", run.ID)
	events, _ := repository.ListInvocationEvents("user-1", run.ID, 0, model.MaxPageSize)
	reviewEvents := 0
	for _, event := range events {
		if event.Type == "review.approved" {
			reviewEvents++
		}
	}
	if len(reviews) != 1 || reviewEvents != 1 {
		t.Fatalf("reviews=%d events=%d", len(reviews), reviewEvents)
	}
}

func TestRetryInvocationRejectedAddsRejectedOutputsToLineage(t *testing.T) {
	run := needsReviewLifecycleFixture(t)
	refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
	hash := invocationArtifactSetHash(refs, 1)
	if _, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "rejected", Attempt: 1, ArtifactSetHash: hash, Comment: "需重做"}); err != nil {
		t.Fatal(err)
	}
	var rejectedID string
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == 1 {
			rejectedID = ref.ArtifactID
		}
	}
	retried, err := RetryInvocation("user-1", run.ID)
	if err != nil || retried.Attempt == nil || retried.Attempt.Attempt != 2 {
		t.Fatalf("retried=%#v err=%v", retried, err)
	}
	raw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"重做稿"}}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "rejected-retry-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	artifacts, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: run.ID, PageSize: 10})
	if err != nil || len(artifacts.Items) != 2 {
		t.Fatalf("artifacts=%#v err=%v", artifacts, err)
	}
	found := false
	for _, artifact := range artifacts.Items {
		if artifact.Artifact.ProducerAttempt == 2 && strings.Contains(artifact.Artifact.ParentArtifactRefsJSON, rejectedID) {
			found = true
		}
	}
	if !found {
		t.Fatalf("attempt2 lineage missing rejected artifact %s: %#v", rejectedID, artifacts.Items)
	}
	reviews, _ := repository.ListInvocationReviews("user-1", run.ID)
	if len(reviews) != 1 || reviews[0].Decision != "rejected" {
		t.Fatalf("reviews=%#v", reviews)
	}
}

func TestRevalidateInvocationOutputPreservesRawAndAppendsValidationExecutions(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	raw := `{"wrong":true}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "correction-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	badHash := InvocationCorrectionInput{Attempt: 1, ExpectedRawOutputHash: "sha256:wrong", Output: json.RawMessage(`{"productionScript":"修正稿"}`)}
	if _, err := RevalidateInvocationOutput("user-1", snapshot.Run.ID, badHash); err == nil {
		t.Fatal("expected raw hash mismatch")
	}
	failedCorrection := InvocationCorrectionInput{Attempt: 1, ExpectedRawOutputHash: invocationSHA256([]byte(raw)), Output: json.RawMessage(`{"productionScript":" "}`)}
	first, err := RevalidateInvocationOutput("user-1", snapshot.Run.ID, failedCorrection)
	if err != nil || first.Run.Status != model.InvocationStatusFailed {
		t.Fatalf("first=%#v err=%v", first, err)
	}
	gatesAfterFirst, _ := repository.ListInvocationGates("user-1", snapshot.Run.ID)
	second, err := RevalidateInvocationOutput("user-1", snapshot.Run.ID, failedCorrection)
	if err != nil || second.Run.Status != model.InvocationStatusFailed {
		t.Fatalf("second=%#v err=%v", second, err)
	}
	gatesAfterSecond, _ := repository.ListInvocationGates("user-1", snapshot.Run.ID)
	if len(gatesAfterSecond) <= len(gatesAfterFirst) {
		t.Fatalf("gates first=%d second=%d", len(gatesAfterFirst), len(gatesAfterSecond))
	}
	beforeAttempts, _ := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	success, err := RevalidateInvocationOutput("user-1", snapshot.Run.ID, InvocationCorrectionInput{Attempt: 1, ExpectedRawOutputHash: invocationSHA256([]byte(raw)), Output: json.RawMessage(`{"productionScript":"修正稿"}`)})
	if err != nil || success.Run.Status != model.InvocationStatusNeedsReview {
		t.Fatalf("success=%#v err=%v", success, err)
	}
	afterAttempts, _ := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if len(beforeAttempts) != 1 || len(afterAttempts) != 1 || afterAttempts[0].RawOutput != raw || afterAttempts[0].StructuredOutputJSON != `{"productionScript":"修正稿"}` {
		t.Fatalf("before=%#v after=%#v", beforeAttempts, afterAttempts)
	}
	var agentRuns int64
	database, _ := repository.DB()
	database.Model(&model.AgentRun{}).Where("invocation_id = ?", snapshot.Run.ID).Count(&agentRuns)
	if agentRuns != 1 {
		t.Fatalf("agentRuns=%d", agentRuns)
	}
	refs, _ := repository.ListInvocationArtifactRefs("user-1", snapshot.Run.ID)
	hash := invocationArtifactSetHash(refs, 1)
	if approved, err := ReviewInvocation("user-1", snapshot.Run.ID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: hash}); err != nil || approved.Run.Status != model.InvocationStatusApproved {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
}

func TestRevalidateInvocationOutputConcurrentCASCommitsOnce(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	raw := `{"wrong":true}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "correction-cas-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	input := InvocationCorrectionInput{Attempt: 1, ExpectedRawOutputHash: invocationSHA256([]byte(raw)), Output: json.RawMessage(`{"productionScript":"修正稿"}`)}
	errs := make(chan error, 2)
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := RevalidateInvocationOutput("user-1", snapshot.Run.ID, input)
			errs <- err
		}()
	}
	wait.Wait()
	close(errs)
	successes, conflicts := 0, 0
	for err := range errs {
		if err == nil {
			successes++
		} else if errors.Is(err, repository.ErrInvocationTransitionConflict) {
			conflicts++
		} else {
			t.Fatalf("unexpected err=%v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("successes=%d conflicts=%d", successes, conflicts)
	}
	attempts, _ := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	var trace []map[string]any
	_ = json.Unmarshal([]byte(attempts[0].CorrectionTraceJSON), &trace)
	if len(trace) != 1 || attempts[0].Status != string(model.AgentRunStatusNeedsReview) {
		t.Fatalf("attempt=%#v trace=%#v", attempts[0], trace)
	}
}

func TestCancelInvocationKeepsAggregateConsistent(t *testing.T) {
	t.Run("prequeue", func(t *testing.T) {
		snapshot := lifecycleInvocationFixture(t, nil)
		response, err := CancelInvocation("user-1", snapshot.Run.ID)
		if err != nil || response.Run.Status != model.InvocationStatusCancelled || response.Attempt != nil {
			t.Fatalf("response=%#v err=%v", response, err)
		}
	})

	for _, test := range []struct {
		name      string
		claim     bool
		wantRun   model.InvocationStatus
		wantAgent model.AgentRunStatus
	}{
		{name: "queued", wantRun: model.InvocationStatusCancelled, wantAgent: model.AgentRunStatusCancelled},
		{name: "running", claim: true, wantRun: model.InvocationStatusCancelRequested, wantAgent: model.AgentRunStatusCancelRequested},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot := lifecycleInvocationFixture(t, nil)
			confirmed, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: []string{"api_cost"}})
			if err != nil {
				t.Fatal(err)
			}
			if test.claim {
				if _, ok, err := repository.ClaimNextAgentRunWithInvocationTx("worker", time.Minute, 1); err != nil || !ok {
					t.Fatalf("claim ok=%v err=%v", ok, err)
				}
			}
			cancelled, err := CancelInvocation("user-1", snapshot.Run.ID)
			if err != nil || cancelled.Run.Status != test.wantRun || cancelled.Attempt == nil || cancelled.Attempt.Status != string(test.wantAgent) {
				t.Fatalf("cancelled=%#v err=%v", cancelled, err)
			}
			agent, ok, err := repository.GetAgentRun(confirmed.Attempt.AgentRunID)
			if err != nil || !ok || agent.Status != test.wantAgent {
				t.Fatalf("agent=%#v ok=%v err=%v", agent, ok, err)
			}
			replay, err := CancelInvocation("user-1", snapshot.Run.ID)
			if err != nil || replay.Run.Status != test.wantRun {
				t.Fatalf("replay=%#v err=%v", replay, err)
			}
		})
	}
}

func TestCancelInvocationRunningSettlesThroughFinalizeOrReaper(t *testing.T) {
	for _, test := range []struct {
		name string
		reap bool
	}{
		{name: "finalize"},
		{name: "reaper", reap: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot := lifecycleInvocationFixture(t, nil)
			if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: []string{"api_cost"}}); err != nil {
				t.Fatal(err)
			}
			claimed, ok, err := repository.ClaimNextAgentRunWithInvocationTx("worker", time.Millisecond, 1)
			if err != nil || !ok {
				t.Fatalf("claim ok=%v err=%v", ok, err)
			}
			if _, err := CancelInvocation("user-1", snapshot.Run.ID); err != nil {
				t.Fatal(err)
			}
			if test.reap {
				if _, err := repository.RequeueExpiredAgentRuns(time.Now().UTC().Add(time.Hour)); err != nil {
					t.Fatal(err)
				}
			} else if err := finalizeInvocationTerminal(claimed, model.AgentRunStatusCancelled, model.InvocationStatusCancelled, "cancelled", "cancelled", now()); err != nil {
				t.Fatal(err)
			}
			run, ok, err := repository.GetUserInvocation("user-1", snapshot.Run.ID)
			if err != nil || !ok || run.Status != model.InvocationStatusCancelled {
				t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
			}
		})
	}
}

func TestRetryInvocationAppendsAttemptAndPreservesFrozenRevision(t *testing.T) {
	snapshot := lifecycleInvocationFixture(t, nil)
	if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: []string{"api_cost"}}); err != nil {
		t.Fatal(err)
	}
	claimed, ok, err := repository.ClaimNextAgentRunWithInvocationTx("worker", time.Minute, 1)
	if err != nil || !ok {
		t.Fatalf("claim ok=%v err=%v", ok, err)
	}
	if err := finalizeInvocationTerminal(claimed, model.AgentRunStatusFailed, model.InvocationStatusFailed, "provider", "failed", now()); err != nil {
		t.Fatal(err)
	}
	retried, err := RetryInvocation("user-1", snapshot.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if retried.Run.Status != model.InvocationStatusQueued || retried.Run.LatestRevision != snapshot.Run.LatestRevision || retried.Attempt == nil || retried.Attempt.Attempt != 2 || retried.Attempt.Revision != snapshot.Revision.Revision {
		t.Fatalf("retried=%#v", retried)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if err != nil || len(attempts) != 2 || attempts[0].Status != string(model.AgentRunStatusFailed) {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
}

func TestRetryInvocationRepositoryRejectsNonCanonicalEmptyRetryPlan(t *testing.T) {
	snapshot := lifecycleInvocationFixture(t, nil)
	if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: []string{"api_cost"}}); err != nil {
		t.Fatal(err)
	}
	claimed, ok, err := repository.ClaimNextAgentRunWithInvocationTx("worker", time.Minute, 1)
	if err != nil || !ok {
		t.Fatalf("claim ok=%v err=%v", ok, err)
	}
	if err := finalizeInvocationTerminal(claimed, model.AgentRunStatusFailed, model.InvocationStatusFailed, "provider", "failed", now()); err != nil {
		t.Fatal(err)
	}
	run, _, _ := repository.GetUserInvocation("user-1", snapshot.Run.ID)
	loaded, err := loadInvocationPreflightSnapshot("user-1", run)
	if err != nil {
		t.Fatal(err)
	}
	queued, attempt, agent, refs, event, err := buildInvocationAttemptQueueWithRetry(run, loaded.Revision, loaded.InputArtifactRefs, InvocationRetryPlan{RequestedOutputs: []InvocationOutputCoordinate{{BindingName: "script", Ordinal: 0}}})
	if err != nil {
		t.Fatal(err)
	}
	attempt.RetryPlanJSON = `{"preservedOutputRefs":[],"requestedOutputs":[],"rejectedParentArtifactIds":[]}`
	if err := repository.QueueInvocationAttemptTx(queued, attempt, agent, refs, event); !errors.Is(err, repository.ErrInvocationTransitionConflict) {
		t.Fatalf("err=%v", err)
	}
}

func TestExecutionTargetUnavailableRequiresRepreflightAndQueuesRevisionTwo(t *testing.T) {
	snapshot, _ := queueInvocationWorkerTest(t, nil)
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "wrong-target-worker", LeaseDuration: time.Minute, Executor: invocationWrongExecutor{}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := RetryInvocation("user-1", snapshot.Run.ID); err == nil || !strings.Contains(err.Error(), "重新预检") {
		t.Fatalf("retry err=%v", err)
	}
	if _, err := SaveSettings(model.Settings{
		Public:  model.PublicSetting{ModelChannel: model.PublicModelChannelSetting{AvailableModels: []string{"text-test"}, DefaultTextModel: "text-test"}},
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{ID: "replacement-channel", Protocol: string(model.ModelProtocolOpenAI), Name: "replacement", BaseURL: "https://example.invalid/v1", APIKey: "test-replacement-key", Models: []string{"text-test"}, Capabilities: []string{"text"}, Enabled: true}}},
	}); err != nil {
		t.Fatal(err)
	}
	input := snapshot.InputArtifactRefs[0]
	repreflight, err := RepreflightInvocation("user-1", snapshot.Run.ID, InvocationRequest{Source: snapshot.Run.Source, ProjectID: snapshot.Run.ProjectID, EpisodeID: snapshot.Run.EpisodeID, SkillVersionID: snapshot.Revision.SkillVersionID, InputArtifactRefs: []ArtifactRefInput{{BindingName: input.BindingName, ArtifactID: input.ArtifactID, ContentHash: input.ArtifactHash}}, Parameters: json.RawMessage(`{}`)})
	if err != nil || repreflight.Revision.Revision != 2 || repreflight.Run.LatestAttempt != 1 {
		t.Fatalf("repreflight=%#v err=%v", repreflight, err)
	}
	confirmed, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: repreflight.ConfirmationRequirements})
	if err != nil || confirmed.Attempt == nil || confirmed.Attempt.Attempt != 2 || confirmed.Attempt.Revision != 2 {
		t.Fatalf("confirmed=%#v err=%v", confirmed, err)
	}
	agent, ok, err := repository.GetAgentRun(confirmed.Attempt.AgentRunID)
	if err != nil || !ok || agent.ChannelID != "replacement-channel" || agent.InvocationRevision != 2 {
		t.Fatalf("agent=%#v ok=%v err=%v", agent, ok, err)
	}
}

func TestConfirmInvocationRequiresExactNormalizedRequirements(t *testing.T) {
	snapshot := lifecycleInvocationFixture(t, func(pkg *SkillPackage) {
		pkg.OutputContract.ArtifactOutputs[0].Max = 2
	})
	if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: []string{" API_COST "}}); err == nil {
		t.Fatal("expected missing batch confirmation to be rejected")
	}
	response, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: []string{" BATCH ", "api_cost", "batch"}})
	if err != nil {
		t.Fatal(err)
	}
	if response.Run.Status != model.InvocationStatusQueued || response.Attempt == nil || response.Attempt.Attempt != 1 {
		t.Fatalf("response=%#v", response)
	}
	attempts, _ := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if len(attempts) != 1 {
		t.Fatalf("attempts=%#v", attempts)
	}
}

func TestConfirmInvocationIsIdempotentAndRejectsChangedConfirmation(t *testing.T) {
	snapshot := lifecycleInvocationFixture(t, nil)
	input := InvocationConfirmation{RequirementCodes: []string{"api_cost"}}
	first, err := ConfirmInvocation("user-1", snapshot.Run.ID, input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := ConfirmInvocation("user-1", snapshot.Run.ID, input)
	if err != nil || second.Attempt == nil || first.Attempt == nil || second.Attempt.ID != first.Attempt.ID {
		t.Fatalf("second=%#v err=%v", second, err)
	}
	if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: []string{"api_cost", "changed"}}); !errors.Is(err, repository.ErrInvocationTransitionConflict) {
		t.Fatalf("err=%v", err)
	}
}
