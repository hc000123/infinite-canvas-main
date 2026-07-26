package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

func TestDirectSkillInvocationEndToEnd(t *testing.T) {
	setupInvocationServiceTest(t)
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"原始剧本"}`)
	_, version := seedInvocationSkill(t, invocationSkillSeed{
		ID: "script.optimize", VersionID: "script.optimize-v1", Version: "1.0.0", Recommended: true, Cost: "text_high",
		Mutate: func(pkg *SkillPackage) {
			pkg.Manifest.Capabilities = []string{"script.optimize"}
			pkg.InputContract.ArtifactInputs[0].BindingName = "source_text"
			pkg.OutputContract.ArtifactOutputs[0].BindingName = "production_script"
		},
	})
	request := InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: version.ID,
		ExpectedOutputArtifactType: "production_script",
		InputArtifactRefs:          []ArtifactRefInput{{BindingName: "source_text", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}},
		Parameters:                 json.RawMessage(`{"language":"zh-CN"}`), IdempotencyKey: "direct-e2e-1",
	}
	preflight, err := PreflightInvocation("user-1", request)
	if err != nil {
		t.Fatal(err)
	}
	if preflight.Run.Status != model.InvocationStatusAwaitingConfirmation || preflight.Revision.SkillVersionID != version.ID || preflight.RouteTrace.FinalSkillVersionID != version.ID {
		t.Fatalf("preflight did not freeze exact Skill: %#v", preflight)
	}
	if len(preflight.ConfirmationRequirements) == 0 {
		t.Fatal("costed direct invocation did not require exact confirmation")
	}
	replay, err := PreflightInvocation("user-1", request)
	if err != nil || replay.Run.ID != preflight.Run.ID {
		t.Fatalf("idempotent preflight=%#v err=%v", replay, err)
	}
	differentSource := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"另一份原始剧本"}`)
	conflictingRequest := request
	conflictingRequest.InputArtifactRefs = []ArtifactRefInput{{BindingName: "source_text", ArtifactID: differentSource.Artifact.ID, ContentHash: differentSource.Artifact.ContentHash}}
	if _, err := PreflightInvocation("user-1", conflictingRequest); !errors.Is(err, repository.ErrInvocationIdempotencyConflict) {
		t.Fatalf("same key accepted a different valid source Artifact: err=%v", err)
	}
	confirmed, err := ConfirmInvocation("user-1", preflight.Run.ID, InvocationConfirmation{RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil || confirmed.Attempt == nil || confirmed.Attempt.Attempt != 1 {
		t.Fatalf("confirmed=%#v err=%v", confirmed, err)
	}
	confirmationReplay, err := ConfirmInvocation("user-1", preflight.Run.ID, InvocationConfirmation{RequirementCodes: preflight.ConfirmationRequirements})
	if err != nil || confirmationReplay.Attempt == nil || confirmationReplay.Attempt.ID != confirmed.Attempt.ID {
		t.Fatalf("confirmation replay=%#v err=%v", confirmationReplay, err)
	}
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	var agentRunCount int64
	if err := database.Model(&model.AgentRun{}).Where("invocation_id = ?", preflight.Run.ID).Count(&agentRunCount).Error; err != nil || agentRunCount != 1 {
		t.Fatalf("AgentRun count=%d err=%v", agentRunCount, err)
	}
	executor := &countingInvocationExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"生产剧本"}`, structuredJSON: `{"productionScript":"生产剧本"}`}}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "direct-e2e-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Executor: executor,
	})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	detail, err := GetInvocationDetail("user-1", preflight.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Run.Status != model.InvocationStatusNeedsReview || len(detail.Attempts) != 1 || len(detail.OutputArtifacts) != 1 {
		t.Fatalf("completed detail=%#v", detail)
	}
	output := detail.OutputArtifacts[0]
	if detail.Revisions[0].SkillVersionID != version.ID || output.Artifact.ArtifactType != "production_script" || len(output.ParentArtifactIds) != 1 || output.ParentArtifactIds[0] != source.Artifact.ID {
		t.Fatalf("frozen lineage mismatch: detail=%#v output=%#v", detail.Revisions, output)
	}
	assertDirectInvocationGateLayers(t, detail.Attempts[0].Gates)
	approved, err := ReviewInvocation("user-1", detail.Run.ID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: detail.ArtifactSetHash})
	if err != nil || approved.Run.Status != model.InvocationStatusApproved {
		t.Fatalf("approved=%#v err=%v", approved, err)
	}
	applied, err := ApplyInvocation("user-1", approved.Run.ID, InvocationApplyInput{IdempotencyKey: "apply-e2e-1", Attempt: 1, ArtifactSetHash: detail.ArtifactSetHash, Target: "test_sink", TargetID: "result-1"})
	if err != nil || applied.Status != "applied" {
		t.Fatalf("applied=%#v err=%v", applied, err)
	}
	replayedApply, err := ApplyInvocation("user-1", approved.Run.ID, InvocationApplyInput{IdempotencyKey: "apply-e2e-1", Attempt: 1, ArtifactSetHash: detail.ArtifactSetHash, Target: "test_sink", TargetID: "result-1"})
	if err != nil || replayedApply.ID != applied.ID || executor.calls.Load() != 1 {
		t.Fatalf("Apply replay=%#v err=%v modelCalls=%d", replayedApply, err, executor.calls.Load())
	}
	assertDirectInvocationTraceComplete(t, approved.Run.ID)
	if _, err := GetInvocationDetail("foreign-user", approved.Run.ID); err == nil {
		t.Fatal("foreign user read Invocation")
	}
	if _, err := GetArtifact("foreign-user", output.Artifact.ID); err == nil {
		t.Fatal("foreign user read output Artifact")
	}
}

func TestDirectSkillInvocationEvidenceMatrix(t *testing.T) {
	tests := []struct {
		name string
		run  func(*testing.T)
	}{
		{"same key same request and changed hash conflict plus recommended version freeze", TestPreflightInvocationCanonicalIdempotencyAndRecommendationFreeze},
		{"same confirmation queues one AgentRun", TestConfirmInvocationIsIdempotentAndRejectsChangedConfirmation},
		{"stale parent hash blocks", TestPreflightInvocationRejectsStaleArtifactHash},
		{"schema failure preserves raw and creates no Artifact", TestInvocationAgentRunWorkerSchemaFailureKeepsRawWithoutArtifact},
		{"multi output ordinals", TestInvocationCompletionSupportsMultiOutputBindingOrdinals},
		{"partial retry preserves successful ordinals", TestRetryInvocationPartialOnlyRequestsFailedOrdinal},
		{"cancel finalize race refunds exactly once", TestInvocationCancelRaceAfterLastCheckRefundsExactlyOnce},
		{"Apply same key once and changed body conflicts", TestApplyInvocationIsServerOwnedAndIdempotent},
		{"Apply failure remains approved and new key succeeds", TestApplyInvocationFailedAdapterRollsBackAndNewKeyCanRetry},
		{"concurrent Apply calls adapter once", TestApplyInvocationConcurrentReplayWritesSinkOnce},
		{"confirm cancel race leaves no orphan", TestConfirmInvocationRacesCancelWithoutOrphan},
		{"two finalizers create one Artifact set", TestInvocationTwoWorkersCreateArtifactSetExactlyOnce},
	}
	for _, test := range tests {
		t.Run(test.name, test.run)
	}
}

func TestDirectSkillInvocationBlockedRepreflightRestoresConfirmableRevision(t *testing.T) {
	setupInvocationServiceTest(t)
	blocked, err := PreflightInvocation("user-1", InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", Capability: "missing.capability", IdempotencyKey: "blocked-direct-e2e",
	})
	if err != nil || blocked.Run.Status != model.InvocationStatusBlocked || blocked.Revision.Revision != 1 || len(blocked.BlockReasons) == 0 {
		t.Fatalf("blocked=%#v err=%v", blocked, err)
	}
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"恢复预检原稿"}`)
	_, version := seedInvocationSkill(t, invocationSkillSeed{ID: "direct-repreflight", VersionID: "direct-repreflight-v1", Version: "1.0.0", Cost: "text_high"})
	recovered, err := RepreflightInvocation("user-1", blocked.Run.ID, InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: version.ID,
		ExpectedOutputArtifactType: "production_script",
		InputArtifactRefs:          []ArtifactRefInput{{BindingName: "source", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}},
		Parameters:                 json.RawMessage(`{}`),
	})
	if err != nil || recovered.Run.Status != model.InvocationStatusAwaitingConfirmation || recovered.Run.LatestRevision != 2 || recovered.Revision.Revision != 2 || len(recovered.BlockReasons) != 0 || len(recovered.ConfirmationRequirements) == 0 {
		t.Fatalf("recovered=%#v err=%v", recovered, err)
	}
	detail, err := GetInvocationDetail("user-1", blocked.Run.ID)
	if err != nil || len(detail.Revisions) != 2 || detail.Revisions[0].Revision != 1 || len(detail.Revisions[0].BlockReasons) == 0 || detail.Revisions[1].Revision != 2 || len(detail.Revisions[1].BlockReasons) != 0 || len(detail.Revisions[1].ConfirmationRequirements) == 0 {
		t.Fatalf("repreflight history=%#v err=%v", detail.Revisions, err)
	}
	confirmed, err := ConfirmInvocation("user-1", blocked.Run.ID, InvocationConfirmation{RequirementCodes: recovered.ConfirmationRequirements})
	if err != nil || confirmed.Attempt == nil || confirmed.Attempt.Revision != 2 || confirmed.Attempt.Attempt != 1 {
		t.Fatalf("confirmed revision 2=%#v err=%v", confirmed, err)
	}
}

func TestDirectSkillInvocationCorrectionDoesNotCallModelAgain(t *testing.T) {
	snapshot, source := directSkillInvocationQueuedFixture(t, true)
	raw := `{"wrong":true}`
	executor := &countingInvocationExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "correction-e2e-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: executor})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	corrected, err := RevalidateInvocationOutput("user-1", snapshot.Run.ID, InvocationCorrectionInput{
		Attempt: 1, ExpectedRawOutputHash: invocationSHA256([]byte(raw)), Output: json.RawMessage(`{"productionScript":"校正稿"}`),
	})
	if err != nil || corrected.Run.Status != model.InvocationStatusNeedsReview || executor.calls.Load() != 1 {
		t.Fatalf("corrected=%#v modelCalls=%d err=%v", corrected, executor.calls.Load(), err)
	}
	detail, err := GetInvocationDetail("user-1", snapshot.Run.ID)
	if err != nil || len(detail.OutputArtifacts) != 1 {
		t.Fatalf("corrected output Artifacts=%#v err=%v", detail.OutputArtifacts, err)
	}
	output := detail.OutputArtifacts[0]
	if output.Artifact.ArtifactType != "production_script" || output.Payload["productionScript"] != "校正稿" || len(output.ParentArtifactIds) != 1 || output.ParentArtifactIds[0] != source.Artifact.ID {
		t.Fatalf("corrected output=%#v", output)
	}
	authoritativeOutputs := 0
	for _, ref := range detail.AuthoritativeArtifactRefs {
		if ref.Direction == "output" {
			authoritativeOutputs++
			if ref.Attempt != 1 || ref.ArtifactID != output.Artifact.ID || ref.ArtifactHash != output.Artifact.ContentHash {
				t.Fatalf("authoritative output ref=%#v output=%#v", ref, output.Artifact)
			}
		}
	}
	if authoritativeOutputs != 1 {
		t.Fatalf("authoritative output refs=%#v", detail.AuthoritativeArtifactRefs)
	}
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	var agentRuns int64
	if err := database.Model(&model.AgentRun{}).Where("invocation_id = ?", snapshot.Run.ID).Count(&agentRuns).Error; err != nil || agentRuns != 1 {
		t.Fatalf("AgentRuns=%d err=%v", agentRuns, err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if err != nil || len(attempts) != 1 || attempts[0].RawOutput != raw {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
}

func TestDirectSkillInvocationRejectedRetryPreservesAttemptOneRefsAndLineage(t *testing.T) {
	run := needsReviewLifecycleFixture(t)
	before, err := repository.ListInvocationArtifactRefs("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	var attemptOneOutput model.InvocationArtifactRef
	attemptOneOutputs := 0
	for _, ref := range before {
		if ref.Direction == "output" && ref.Attempt == 1 {
			attemptOneOutput = ref
			attemptOneOutputs++
		}
	}
	if attemptOneOutputs != 1 || attemptOneOutput.ID == "" || attemptOneOutput.ArtifactID == "" || attemptOneOutput.ArtifactHash == "" {
		t.Fatalf("attempt 1 output refs=%#v", before)
	}
	if _, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "rejected", Attempt: 1, ArtifactSetHash: invocationArtifactSetHash(before, 1), Comment: "需重做"}); err != nil {
		t.Fatal(err)
	}
	retried, err := RetryInvocation("user-1", run.ID)
	if err != nil || retried.Attempt == nil || retried.Attempt.Attempt != 2 {
		t.Fatalf("retried=%#v err=%v", retried, err)
	}
	raw := `{"outputs":[{"bindingName":"script","ordinal":0,"payload":{"productionScript":"重做稿"}}]}`
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "direct-rejected-retry-worker", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: raw, structuredJSON: raw}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	after, err := repository.ListInvocationArtifactRefs("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	attemptOnePreserved := false
	var attemptTwoOutput model.InvocationArtifactRef
	attemptTwoOutputs := 0
	for _, ref := range after {
		if ref.ID == attemptOneOutput.ID && ref.ArtifactID == attemptOneOutput.ArtifactID && ref.ArtifactHash == attemptOneOutput.ArtifactHash && ref.Direction == "output" && ref.Attempt == 1 {
			attemptOnePreserved = true
		}
		if ref.Direction == "output" && ref.Attempt == 2 {
			attemptTwoOutput = ref
			attemptTwoOutputs++
		}
	}
	if !attemptOnePreserved || attemptTwoOutputs != 1 || attemptTwoOutput.ArtifactID == "" || attemptTwoOutput.ArtifactID == attemptOneOutput.ArtifactID {
		t.Fatalf("before=%#v after=%#v", before, after)
	}
	attemptTwoArtifact, err := GetArtifact("user-1", attemptTwoOutput.ArtifactID)
	if err != nil {
		t.Fatal(err)
	}
	foundRejectedParent := false
	for _, parentID := range attemptTwoArtifact.ParentArtifactIds {
		if parentID == attemptOneOutput.ArtifactID {
			foundRejectedParent = true
		}
	}
	if !foundRejectedParent {
		t.Fatalf("attempt 2 Artifact=%#v missing rejected parent %s", attemptTwoArtifact, attemptOneOutput.ArtifactID)
	}
}

func TestDirectSkillInvocationApplyLifecycleDoesNotCallModelAgain(t *testing.T) {
	snapshot, _ := directSkillInvocationQueuedFixture(t, true)
	executor := &countingInvocationExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"Apply 稿"}`, structuredJSON: `{"productionScript":"Apply 稿"}`}}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "apply-e2e-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: executor})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	detail, err := GetInvocationDetail("user-1", snapshot.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ReviewInvocation("user-1", snapshot.Run.ID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: detail.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}
	original := invocationApplyAdapters["test_sink"]
	t.Cleanup(func() { invocationApplyAdapters["test_sink"] = original })
	applyCalls := 0
	invocationApplyAdapters["test_sink"] = invocationApplyAdapterFunc{name: "test_sink", fn: func(tx *gorm.DB, context InvocationApplyContext) (json.RawMessage, error) {
		applyCalls++
		return nil, errors.New("sink unavailable")
	}}
	failedInput := InvocationApplyInput{IdempotencyKey: "apply-failed-e2e", Attempt: 1, ArtifactSetHash: detail.ArtifactSetHash, Target: "test_sink", TargetID: "target-1"}
	failed, err := ApplyInvocation("user-1", snapshot.Run.ID, failedInput)
	if err == nil || failed.Status != "failed" || applyCalls != 1 || executor.calls.Load() != 1 {
		t.Fatalf("failed=%#v applyCalls=%d modelCalls=%d err=%v", failed, applyCalls, executor.calls.Load(), err)
	}
	replayedFailure, err := ApplyInvocation("user-1", snapshot.Run.ID, failedInput)
	if err != nil || replayedFailure.ID != failed.ID || replayedFailure.Status != "failed" || applyCalls != 1 || executor.calls.Load() != 1 {
		t.Fatalf("replayedFailure=%#v applyCalls=%d modelCalls=%d err=%v", replayedFailure, applyCalls, executor.calls.Load(), err)
	}
	changed := failedInput
	changed.TargetID = "target-2"
	if _, err := ApplyInvocation("user-1", snapshot.Run.ID, changed); !errors.Is(err, repository.ErrInvocationApplyConflict) {
		t.Fatalf("changed body err=%v", err)
	}
	invocationApplyAdapters["test_sink"] = original
	successInput := failedInput
	successInput.IdempotencyKey = "apply-success-e2e"
	applied, err := ApplyInvocation("user-1", snapshot.Run.ID, successInput)
	if err != nil || applied.Status != "applied" {
		t.Fatalf("applied=%#v err=%v", applied, err)
	}
	replayedSuccess, err := ApplyInvocation("user-1", snapshot.Run.ID, successInput)
	if err != nil || replayedSuccess.ID != applied.ID || executor.calls.Load() != 1 {
		t.Fatalf("replayedSuccess=%#v modelCalls=%d err=%v", replayedSuccess, executor.calls.Load(), err)
	}
	database, err := repository.DB()
	if err != nil {
		t.Fatal(err)
	}
	var receipts int64
	if err := database.Model(&model.InvocationTestSinkReceipt{}).Where("invocation_id = ?", snapshot.Run.ID).Count(&receipts).Error; err != nil || receipts != 1 {
		t.Fatalf("receipts=%d err=%v", receipts, err)
	}
}

func TestDirectSkillInvocationRecommendationDriftDoesNotChangeRetrySnapshot(t *testing.T) {
	setupInvocationServiceTest(t)
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"version freeze"}`)
	skill, versionOne := seedInvocationSkill(t, invocationSkillSeed{ID: "direct-version-freeze", VersionID: "direct-version-freeze-v1", Version: "1.0.0", Recommended: true})
	snapshot, err := PreflightInvocation("user-1", InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillID: skill.ID,
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}}, Parameters: json.RawMessage(`{}`),
	})
	if err != nil || snapshot.Revision.SkillVersionID != versionOne.ID {
		t.Fatalf("snapshot=%#v err=%v", snapshot, err)
	}
	_, versionTwo := seedInvocationSkillVersion(t, skill, invocationSkillSeed{VersionID: "direct-version-freeze-v2", Version: "2.0.0", Mutate: func(pkg *SkillPackage) {
		pkg.Files["SKILL.md"] = "V2-RECOMMENDATION-MARKER"
	}})
	skill.RecommendedVersionID = versionTwo.ID
	if err := repository.SaveSkillDefinition(skill); err != nil {
		t.Fatal(err)
	}
	if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements}); err != nil {
		t.Fatal(err)
	}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "version-freeze-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: `{"wrong":true}`, structuredJSON: `{"wrong":true}`}}})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	retried, err := RetryInvocation("user-1", snapshot.Run.ID)
	if err != nil || retried.Attempt == nil || retried.Attempt.Revision != 1 {
		t.Fatalf("retried=%#v err=%v", retried, err)
	}
	revisions, err := repository.ListInvocationPreflightRevisions("user-1", snapshot.Run.ID)
	if err != nil || len(revisions) != 1 || revisions[0].SkillVersionID != versionOne.ID {
		t.Fatalf("revisions=%#v err=%v", revisions, err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if err != nil || len(attempts) != 2 {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
	for _, attempt := range attempts {
		agentRun, ok, err := repository.GetAgentRun(attempt.AgentRunID)
		if err != nil || !ok || agentRun.InvocationRevision != 1 || agentRun.InvocationAttempt != attempt.Attempt || strings.Contains(agentRun.RequestJSON, "V2-RECOMMENDATION-MARKER") {
			t.Fatalf("attempt=%#v AgentRun=%#v ok=%v err=%v", attempt, agentRun, ok, err)
		}
	}
}

func TestDirectSkillInvocationCancelRetryDoesNotDoubleReserveCredits(t *testing.T) {
	snapshot, _ := directSkillInvocationQueuedFixture(t, true)
	saveInvocationCreditUser(t, snapshot.Run.ID)
	cancelled, err := CancelInvocation("user-1", snapshot.Run.ID)
	if err != nil || cancelled.Run.Status != model.InvocationStatusCancelled {
		t.Fatalf("cancelled=%#v err=%v", cancelled, err)
	}
	retried, err := RetryInvocation("user-1", snapshot.Run.ID)
	if err != nil || retried.Attempt == nil || retried.Attempt.Attempt != 2 {
		t.Fatalf("retried=%#v err=%v", retried, err)
	}
	executor := &countingInvocationExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"重试稿"}`, structuredJSON: `{"productionScript":"重试稿"}`}}
	worker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "credit-retry-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: executor})
	if err := worker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	attempts, err := repository.ListInvocationAttempts("user-1", snapshot.Run.ID)
	if err != nil || len(attempts) != 2 || attempts[0].CreditsReserved != 0 || attempts[1].CreditsReserved != 5 || executor.calls.Load() != 1 {
		t.Fatalf("attempts=%#v modelCalls=%d err=%v", attempts, executor.calls.Load(), err)
	}
	consumeLogs := int64(0)
	for _, attempt := range attempts {
		count, err := repository.CountCreditLogsByRelatedIDAndType(attempt.AgentRunID, model.CreditLogTypeAIConsume)
		if err != nil {
			t.Fatal(err)
		}
		consumeLogs += count
	}
	if consumeLogs != 1 {
		t.Fatalf("consumeLogs=%d, want exactly one reservation", consumeLogs)
	}
}

func TestDirectSkillInvocationQueueAndFinalizeFailpointsAreAtomic(t *testing.T) {
	t.Run("queue", func(t *testing.T) {
		snapshot, _ := directSkillInvocationQueuedFixture(t, false)
		database, err := repository.DB()
		if err != nil {
			t.Fatal(err)
		}
		callback := "direct_e2e_queue_failpoint"
		if err := database.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
			if tx.Statement != nil && tx.Statement.Schema != nil && tx.Statement.Schema.Table == "agent_runs" {
				tx.AddError(errors.New("queue failpoint"))
			}
		}); err != nil {
			t.Fatal(err)
		}
		if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements}); err == nil {
			t.Fatal("queue failpoint did not fail")
		}
		if err := database.Callback().Create().Remove(callback); err != nil {
			t.Fatal(err)
		}
		run, ok, err := repository.GetUserInvocation("user-1", snapshot.Run.ID)
		if err != nil || !ok || run.Status != model.InvocationStatusAwaitingConfirmation || run.LatestAttempt != 0 {
			t.Fatalf("run=%#v ok=%v err=%v", run, ok, err)
		}
		attempts, err := repository.ListInvocationAttempts("user-1", run.ID)
		if err != nil || len(attempts) != 0 {
			t.Fatalf("attempts=%#v err=%v", attempts, err)
		}
		var agentRuns int64
		if err := database.Model(&model.AgentRun{}).Where("invocation_id = ?", run.ID).Count(&agentRuns).Error; err != nil || agentRuns != 0 {
			t.Fatalf("AgentRuns=%d err=%v", agentRuns, err)
		}
		confirmed, err := ConfirmInvocation("user-1", run.ID, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements})
		if err != nil || confirmed.Attempt == nil || confirmed.Attempt.Attempt != 1 {
			t.Fatalf("confirmed=%#v err=%v", confirmed, err)
		}
	})

	t.Run("finalize", func(t *testing.T) {
		snapshot, _ := directSkillInvocationQueuedFixture(t, true)
		database, err := repository.DB()
		if err != nil {
			t.Fatal(err)
		}
		callback := "direct_e2e_finalize_failpoint"
		if err := database.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
			if tx.Statement != nil && tx.Statement.Schema != nil && tx.Statement.Schema.Table == "artifacts" {
				tx.AddError(errors.New("finalize failpoint"))
			}
		}); err != nil {
			t.Fatal(err)
		}
		executor := &countingInvocationExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"恢复稿"}`, structuredJSON: `{"productionScript":"恢复稿"}`}}
		failedWorker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "failpoint-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: executor})
		if err := failedWorker.ProcessOne(context.Background()); err == nil {
			t.Fatal("finalize failpoint did not fail")
		}
		if err := database.Callback().Create().Remove(callback); err != nil {
			t.Fatal(err)
		}
		outputs, err := ListArtifacts("user-1", ArtifactQuery{ProducerInvocationID: snapshot.Run.ID})
		if err != nil || len(outputs.Items) != 0 {
			t.Fatalf("partial outputs=%#v err=%v", outputs, err)
		}
		gates, err := repository.ListInvocationGates("user-1", snapshot.Run.ID)
		if err != nil || len(gates) != 0 {
			t.Fatalf("partial gates=%#v err=%v", gates, err)
		}
		future := time.Now().UTC().Add(2 * time.Minute)
		if _, err := repository.RequeueExpiredAgentRuns(future); err != nil {
			t.Fatal(err)
		}
		if err := database.Model(&model.AgentRun{}).Where("invocation_id = ?", snapshot.Run.ID).Update("available_at", time.Now().UTC().Add(-time.Second).Format(time.RFC3339Nano)).Error; err != nil {
			t.Fatal(err)
		}
		recoveryWorker := NewAgentRunWorker(AgentRunWorkerOptions{ID: "recovery-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Now: func() time.Time { return future }, Executor: executor})
		if err := recoveryWorker.ProcessOne(context.Background()); err != nil {
			t.Fatal(err)
		}
		detail, err := GetInvocationDetail("user-1", snapshot.Run.ID)
		if err != nil || detail.Run.Status != model.InvocationStatusNeedsReview || len(detail.Attempts) != 1 || len(detail.OutputArtifacts) != 1 || executor.calls.Load() != 2 {
			t.Fatalf("detail=%#v modelCalls=%d err=%v", detail, executor.calls.Load(), err)
		}
		assertDirectInvocationGateLayers(t, detail.Attempts[0].Gates)
	})
}

func directSkillInvocationQueuedFixture(t *testing.T, confirm bool) (InvocationPreflightSnapshot, ArtifactEnvelope) {
	t.Helper()
	setupInvocationServiceTest(t)
	source := mustCreateInvocationArtifact(t, "user-1", "project-1", "episode-1", "source_text", `{"text":"failpoint"}`)
	_, version := seedInvocationSkill(t, invocationSkillSeed{ID: "direct-failpoint", VersionID: "direct-failpoint-v1", Version: "1.0.0", Recommended: true})
	snapshot, err := PreflightInvocation("user-1", InvocationRequest{
		Source: "direct", ProjectID: "project-1", EpisodeID: "episode-1", SkillVersionID: version.ID,
		InputArtifactRefs: []ArtifactRefInput{{BindingName: "source", ArtifactID: source.Artifact.ID, ContentHash: source.Artifact.ContentHash}}, Parameters: json.RawMessage(`{}`),
		ExecutionPolicyOverride: InvocationExecutionPolicyOverride{MaxAttempts: 2},
	})
	if err != nil {
		t.Fatal(err)
	}
	if confirm {
		if _, err := ConfirmInvocation("user-1", snapshot.Run.ID, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements}); err != nil {
			t.Fatal(err)
		}
	}
	return snapshot, source
}

func assertDirectInvocationGateLayers(t *testing.T, gates []model.InvocationGateResult) {
	t.Helper()
	want := []string{"input_contract", "output_schema", "business_gate", "policy_gate"}
	seen := map[string]bool{}
	for _, gate := range gates {
		if !gate.Passed {
			t.Fatalf("failed gate=%#v", gate)
		}
		seen[gate.Layer] = true
	}
	for _, layer := range want {
		if !seen[layer] {
			t.Fatalf("missing gate layer %q in %#v", layer, gates)
		}
	}
}

func assertDirectInvocationTraceComplete(t *testing.T, invocationID string) {
	t.Helper()
	events, err := repository.ListInvocationEvents("user-1", invocationID, 0, model.MaxPageSize)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"preflight.completed", "attempt.queued", "attempt.running", "attempt.needs_review", "review.approved", "apply.applied"}
	seen := map[string]bool{}
	for _, event := range events {
		seen[event.Type] = true
	}
	for _, eventType := range want {
		if !seen[eventType] {
			t.Fatalf("trace missing %q: %#v", eventType, events)
		}
	}
}
