package service

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestAgentPlanE2EFreezesVersionsHandsOffArtifactsAndChargesOnce(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	settings, err := repository.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.Public.ModelChannel.ModelCosts = []model.ModelCost{{Model: "text-test", Credits: 2}}
	if _, err := SaveSettings(settings); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.SaveUser(model.User{ID: "user-1", Username: "agent-plan-e2e", Credits: 100, Status: model.UserStatusActive, CreatedAt: now(), UpdatedAt: now()}); err != nil {
		t.Fatal(err)
	}
	sourceBefore, err := GetArtifact("user-1", fixture.SourceArtifactID)
	if err != nil {
		t.Fatal(err)
	}

	created, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := PreflightAgentPlan("user-1", created.Plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if preflight.Plan.EstimatedCredits != 4 || preflight.Revision.EstimatedCredits != 4 {
		t.Fatalf("estimated credits=%d/%d, want 4", preflight.Plan.EstimatedCredits, preflight.Revision.EstimatedCredits)
	}
	agentVersion, ok, err := repository.GetAgentVersion(preflight.Plan.AgentVersionID)
	if err != nil || !ok || preflight.Revision.AgentContentHash != agentVersion.ContentHash {
		t.Fatalf("Agent snapshot=%#v version=%#v ok=%v err=%v", preflight.Revision, agentVersion, ok, err)
	}
	wantSkillVersions := []string{fixture.FirstSkillVersionID, fixture.SecondSkillVersionID}
	for index, step := range preflight.Steps {
		skillVersion, ok, err := repository.GetSkillVersion(wantSkillVersions[index])
		if err != nil || !ok || step.Step.SkillVersionID != skillVersion.ID || step.Step.SkillContentHash != skillVersion.ContentHash {
			t.Fatalf("step %d=%#v version=%#v ok=%v err=%v", index, step, skillVersion, ok, err)
		}
	}
	codes := agentPlanRequirementCodes(preflight)
	if _, err := ConfirmAgentPlan("user-1", created.Plan.ID, AgentPlanConfirmInput{Revision: preflight.Plan.CurrentRevision, Fingerprint: "sha256:stale", RequirementCodes: codes}); err == nil {
		t.Fatal("stale confirmation fingerprint was accepted")
	}
	confirmed, err := ConfirmAgentPlan("user-1", created.Plan.ID, AgentPlanConfirmInput{Revision: preflight.Plan.CurrentRevision, Fingerprint: preflight.Plan.ConfirmationFingerprint, RequirementCodes: codes})
	if err != nil {
		t.Fatal(err)
	}

	firstSkill, ok, err := repository.GetSkillDefinition("plan-script")
	if err != nil || !ok {
		t.Fatalf("first skill=%#v ok=%v err=%v", firstSkill, ok, err)
	}
	_, replacement := seedInvocationSkillVersion(t, firstSkill, invocationSkillSeed{VersionID: "plan-script-v2-e2e", Version: "2.0.0"})
	firstSkill.RecommendedVersionID = replacement.ID
	if err := repository.SaveSkillDefinition(firstSkill); err != nil {
		t.Fatal(err)
	}

	first, err := ContinueAgentPlan("user-1", confirmed.Plan.ID)
	if err != nil || first.Invocation == nil {
		t.Fatalf("first=%#v err=%v", first, err)
	}
	firstInvocationID := first.Invocation.Run.ID
	replay, err := ContinueAgentPlan("user-1", confirmed.Plan.ID)
	if err != nil || replay.Invocation == nil || replay.Invocation.Run.ID != firstInvocationID {
		t.Fatalf("duplicate continue=%#v err=%v", replay, err)
	}
	firstDetail, err := GetInvocationDetail("user-1", firstInvocationID)
	if err != nil || firstDetail.Revisions[0].SkillVersionID != fixture.FirstSkillVersionID || firstDetail.Revisions[0].SkillContentHash != preflight.Steps[0].Step.SkillContentHash {
		t.Fatalf("first frozen invocation=%#v err=%v", firstDetail, err)
	}
	firstExecutor := &creditedInvocationExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"优化后的生产剧本：主角在雨夜重生，决定改写命运。"}`, structuredJSON: `{"productionScript":"优化后的生产剧本：主角在雨夜重生，决定改写命运。"}`}}
	if err := NewAgentRunWorker(AgentRunWorkerOptions{ID: "agent-plan-e2e-first", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: firstExecutor}).ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := RetryInvocation("user-1", firstInvocationID); err == nil {
		t.Fatal("needs_review Invocation was retryable before a review decision")
	}
	firstDetail, err = GetInvocationDetail("user-1", firstInvocationID)
	if err != nil || len(firstDetail.OutputArtifacts) != 1 {
		t.Fatalf("first output=%#v err=%v", firstDetail.OutputArtifacts, err)
	}
	assertAgentPlanE2EGates(t, firstInvocationID)
	if _, err := ReviewInvocation("user-1", firstInvocationID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: firstDetail.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}

	second, err := ContinueAgentPlan("user-1", confirmed.Plan.ID)
	if err != nil || second.Invocation == nil {
		t.Fatalf("second=%#v err=%v", second, err)
	}
	secondInvocationID := second.Invocation.Run.ID
	secondBefore, err := GetInvocationDetail("user-1", secondInvocationID)
	if err != nil {
		t.Fatal(err)
	}
	inputID := ""
	for _, ref := range secondBefore.AuthoritativeArtifactRefs {
		if ref.Direction == "input" && ref.BindingName == "script" {
			inputID = ref.ArtifactID
		}
	}
	if inputID != firstDetail.OutputArtifacts[0].Artifact.ID {
		t.Fatalf("second input=%q, want first output=%q", inputID, firstDetail.OutputArtifacts[0].Artifact.ID)
	}
	secondExecutor := &creditedInvocationExecutor{result: agentRunCallResult{rawOutput: `{"routingTags":[{"tag":"男频","evidence":["主角重生改命"],"confidence":0.97},{"tag":"穿越重生","evidence":["雨夜重生"],"confidence":0.99}]}`, structuredJSON: `{"routingTags":[{"tag":"男频","evidence":["主角重生改命"],"confidence":0.97},{"tag":"穿越重生","evidence":["雨夜重生"],"confidence":0.99}]}`}}
	if err := NewAgentRunWorker(AgentRunWorkerOptions{ID: "agent-plan-e2e-second", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour, Executor: secondExecutor}).ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	secondDetail, err := GetInvocationDetail("user-1", secondInvocationID)
	if err != nil || len(secondDetail.OutputArtifacts) != 1 {
		t.Fatalf("second output=%#v err=%v", secondDetail.OutputArtifacts, err)
	}
	assertAgentPlanE2EGates(t, secondInvocationID)
	if _, err := ReviewInvocation("user-1", secondInvocationID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: secondDetail.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}
	completed, err := ContinueAgentPlan("user-1", confirmed.Plan.ID)
	if err != nil || completed.Plan.Status != model.AgentPlanCompleted {
		t.Fatalf("completed=%#v err=%v", completed, err)
	}

	if firstExecutor.calls.Load() != 1 || secondExecutor.calls.Load() != 1 {
		t.Fatalf("model calls=%d/%d, want 1/1", firstExecutor.calls.Load(), secondExecutor.calls.Load())
	}
	assertAgentPlanE2ECredits(t, []string{firstInvocationID, secondInvocationID}, 4, 96)
	sourceAfter, err := GetArtifact("user-1", fixture.SourceArtifactID)
	if err != nil || sourceAfter.Artifact.ContentHash != sourceBefore.Artifact.ContentHash || !reflect.DeepEqual(sourceAfter.Payload, sourceBefore.Payload) {
		t.Fatalf("source mutated before=%#v after=%#v err=%v", sourceBefore, sourceAfter, err)
	}
}

func TestAgentPlanE2ERetryAndCancellationGuards(t *testing.T) {
	t.Run("rejected output retries the same frozen invocation revision", func(t *testing.T) {
		fixture := seedTwoStepAgentPlan(t)
		plan := mustPreflightAndConfirmAgentPlan(t, fixture)
		started, err := ContinueAgentPlan("user-1", plan.Plan.ID)
		if err != nil || started.Invocation == nil {
			t.Fatalf("started=%#v err=%v", started, err)
		}
		invocationID := started.Invocation.Run.ID
		firstRaw := `{"productionScript":"需要重做的版本"}`
		if err := NewAgentRunWorker(AgentRunWorkerOptions{ID: "agent-plan-e2e-retry-1", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: firstRaw, structuredJSON: firstRaw}}}).ProcessOne(context.Background()); err != nil {
			t.Fatal(err)
		}
		detail, err := GetInvocationDetail("user-1", invocationID)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := ReviewInvocation("user-1", invocationID, InvocationReviewInput{Decision: "rejected", Attempt: 1, ArtifactSetHash: detail.ArtifactSetHash, Comment: "标签依据不足"}); err != nil {
			t.Fatal(err)
		}
		retried, err := RetryInvocation("user-1", invocationID)
		if err != nil || retried.Run.LatestRevision != 1 || retried.Run.LatestAttempt != 2 {
			t.Fatalf("retried=%#v err=%v", retried, err)
		}
		secondRaw := `{"productionScript":"补足因果与制作描述的版本"}`
		if err := NewAgentRunWorker(AgentRunWorkerOptions{ID: "agent-plan-e2e-retry-2", LeaseDuration: time.Minute, Executor: invocationFakeExecutor{result: agentRunCallResult{rawOutput: secondRaw, structuredJSON: secondRaw}}}).ProcessOne(context.Background()); err != nil {
			t.Fatal(err)
		}
		detail, err = GetInvocationDetail("user-1", invocationID)
		if err != nil || len(detail.Attempts) != 2 || detail.Revisions[0].SkillVersionID != fixture.FirstSkillVersionID {
			t.Fatalf("retry detail=%#v err=%v", detail, err)
		}
	})

	t.Run("cancelling a plan cancels its active invocation without downstream work", func(t *testing.T) {
		fixture := seedTwoStepAgentPlan(t)
		plan := mustPreflightAndConfirmAgentPlan(t, fixture)
		started, err := ContinueAgentPlan("user-1", plan.Plan.ID)
		if err != nil || started.Invocation == nil {
			t.Fatalf("started=%#v err=%v", started, err)
		}
		cancelled, err := CancelAgentPlan("user-1", plan.Plan.ID)
		if err != nil || cancelled.Plan.Status != model.AgentPlanCancelled {
			t.Fatalf("cancelled=%#v err=%v", cancelled, err)
		}
		if _, err := ContinueAgentPlan("user-1", plan.Plan.ID); !errors.Is(err, repository.ErrAgentPlanTransitionConflict) {
			t.Fatalf("continued cancelled plan err=%v", err)
		}
		database, _ := repository.DB()
		var downstream int64
		if err := database.Model(&model.InvocationRun{}).Where("agent_plan_id = ? AND agent_plan_step_key = ?", plan.Plan.ID, "classify").Count(&downstream).Error; err != nil || downstream != 0 {
			t.Fatalf("downstream invocations=%d err=%v", downstream, err)
		}
	})
}

func assertAgentPlanE2EGates(t *testing.T, invocationID string) {
	t.Helper()
	gates, err := repository.ListInvocationGates("user-1", invocationID)
	if err != nil || len(gates) == 0 {
		t.Fatalf("gates=%#v err=%v", gates, err)
	}
	artifactGate := false
	for _, gate := range gates {
		if !gate.Passed {
			t.Fatalf("failed gate=%#v", gate)
		}
		if gate.ArtifactID != "" && gate.ArtifactHash != "" {
			artifactGate = true
		}
	}
	if !artifactGate {
		t.Fatalf("no Artifact-bound quality gate: %#v", gates)
	}
}

func assertAgentPlanE2ECredits(t *testing.T, invocationIDs []string, expectedCharge, expectedBalance int) {
	t.Helper()
	total := 0
	for _, invocationID := range invocationIDs {
		attempts, err := repository.ListInvocationAttempts("user-1", invocationID)
		if err != nil || len(attempts) != 1 {
			t.Fatalf("attempts for %s=%#v err=%v", invocationID, attempts, err)
		}
		logs, err := repository.ListCreditLogsByRelatedID(attempts[0].AgentRunID)
		if err != nil || len(logs) != 1 || logs[0].Type != model.CreditLogTypeAIConsume {
			t.Fatalf("credit logs for %s=%#v err=%v", invocationID, logs, err)
		}
		total -= logs[0].Amount
	}
	user, ok, err := repository.GetUserByID("user-1")
	if err != nil || !ok || total != expectedCharge || user.Credits != expectedBalance {
		t.Fatalf("charge=%d user=%#v ok=%v err=%v", total, user, ok, err)
	}
}
