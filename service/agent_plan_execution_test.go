package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestAgentPlanConfirmRejectsStaleRevisionAndFingerprint(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	created, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := PreflightAgentPlan("user-1", created.Plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	codes := agentPlanRequirementCodes(preflight)
	if _, err := ConfirmAgentPlan("user-1", created.Plan.ID, AgentPlanConfirmInput{Revision: 2, Fingerprint: preflight.Plan.ConfirmationFingerprint, RequirementCodes: codes}); err == nil {
		t.Fatal("stale revision confirmation succeeded")
	}
	if _, err := ConfirmAgentPlan("user-1", created.Plan.ID, AgentPlanConfirmInput{Revision: 1, Fingerprint: "sha256:wrong", RequirementCodes: codes}); err == nil {
		t.Fatal("wrong fingerprint confirmation succeeded")
	}
	if _, err := ConfirmAgentPlan("user-1", created.Plan.ID, AgentPlanConfirmInput{Revision: 1, Fingerprint: preflight.Plan.ConfirmationFingerprint, RequirementCodes: []string{}}); err == nil {
		t.Fatal("missing requirement confirmation succeeded")
	}
	confirmed, err := ConfirmAgentPlan("user-1", created.Plan.ID, AgentPlanConfirmInput{Revision: 1, Fingerprint: preflight.Plan.ConfirmationFingerprint, RequirementCodes: codes})
	if err != nil || confirmed.Plan.Status != model.AgentPlanRunning || confirmed.Confirmation == nil {
		t.Fatalf("confirmed=%#v err=%v", confirmed, err)
	}
	replayed, err := ConfirmAgentPlan("user-1", created.Plan.ID, AgentPlanConfirmInput{Revision: 1, Fingerprint: preflight.Plan.ConfirmationFingerprint, RequirementCodes: codes})
	if err != nil || replayed.Confirmation == nil || replayed.Confirmation.ID != confirmed.Confirmation.ID {
		t.Fatalf("replayed=%#v err=%v", replayed, err)
	}
}

func TestAgentPlanContinueExecutesTwoStepsWithApprovedArtifactHandoff(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	plan := mustPreflightAndConfirmAgentPlan(t, fixture)
	first, err := ContinueAgentPlan("user-1", plan.Plan.ID)
	if err != nil || first.Invocation == nil || first.Invocation.Run.Status != model.InvocationStatusQueued {
		t.Fatalf("first=%#v err=%v", first, err)
	}
	firstID := first.Invocation.Run.ID
	replayed, err := ContinueAgentPlan("user-1", plan.Plan.ID)
	if err != nil || replayed.Invocation == nil || replayed.Invocation.Run.ID != firstID {
		t.Fatalf("replayed=%#v err=%v", replayed, err)
	}
	database, _ := repository.DB()
	var firstAgentRuns int64
	if err := database.Model(&model.AgentRun{}).Where("invocation_id = ?", firstID).Count(&firstAgentRuns).Error; err != nil || firstAgentRuns != 1 {
		t.Fatalf("first AgentRun count=%d err=%v", firstAgentRuns, err)
	}
	storedFirst, ok, err := repository.GetUserInvocation("user-1", firstID)
	if err != nil || !ok || storedFirst.Source != "agent_plan" || storedFirst.AgentPlanID != plan.Plan.ID || storedFirst.AgentPlanRevision != 1 || storedFirst.AgentPlanStepKey != "optimize" || storedFirst.ConfirmationSource != "agent_plan" {
		t.Fatalf("stored first=%#v ok=%v err=%v", storedFirst, ok, err)
	}
	if _, err := ConfirmInvocation("user-1", firstID, InvocationConfirmation{RequirementCodes: agentPlanRequirementCodesFromInvocation(t, firstID)}); err == nil {
		t.Fatal("public confirmation path accepted delegated Agent Plan invocation")
	}

	firstWorker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "agent-plan-first-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Executor: &countingInvocationExecutor{result: agentRunCallResult{rawOutput: `{"productionScript":"优化后的生产剧本"}`, structuredJSON: `{"productionScript":"优化后的生产剧本"}`}},
	})
	if err := firstWorker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	paused, err := ContinueAgentPlan("user-1", plan.Plan.ID)
	if err != nil || paused.Plan.Status != model.AgentPlanNeedsReview || paused.ActiveStep == nil || paused.ActiveStep.Step.StepKey != "optimize" {
		t.Fatalf("paused=%#v err=%v", paused, err)
	}
	firstDetail, err := GetInvocationDetail("user-1", firstID)
	if err != nil || firstDetail.Run.Status != model.InvocationStatusNeedsReview || len(firstDetail.OutputArtifacts) != 1 {
		t.Fatalf("first detail=%#v err=%v", firstDetail, err)
	}
	if _, err := ReviewInvocation("user-1", firstID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: firstDetail.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}

	second, err := ContinueAgentPlan("user-1", plan.Plan.ID)
	if err != nil || second.Invocation == nil || second.Invocation.Run.Status != model.InvocationStatusQueued || second.ActiveStep == nil || second.ActiveStep.Step.StepKey != "classify" {
		current, _ := GetAgentPlanDetail("user-1", plan.Plan.ID)
		t.Fatalf("second=%#v current=%#v err=%v", second, current, err)
	}
	secondID := second.Invocation.Run.ID
	secondDetail, err := GetInvocationDetail("user-1", secondID)
	if err != nil {
		t.Fatal(err)
	}
	inputArtifactID := ""
	for _, ref := range secondDetail.AuthoritativeArtifactRefs {
		if ref.Direction == "input" && ref.BindingName == "script" {
			inputArtifactID = ref.ArtifactID
		}
	}
	if inputArtifactID == "" || inputArtifactID != firstDetail.OutputArtifacts[0].Artifact.ID {
		t.Fatalf("second input=%q first output=%q refs=%#v", inputArtifactID, firstDetail.OutputArtifacts[0].Artifact.ID, secondDetail.AuthoritativeArtifactRefs)
	}

	secondWorker := NewAgentRunWorker(AgentRunWorkerOptions{
		ID: "agent-plan-second-worker", LeaseDuration: time.Minute, HeartbeatInterval: time.Hour,
		Executor: &countingInvocationExecutor{result: agentRunCallResult{rawOutput: `{"routingTags":[{"tag":"男频","evidence":["主角成长"],"confidence":0.9}]}`, structuredJSON: `{"routingTags":[{"tag":"男频","evidence":["主角成长"],"confidence":0.9}]}`}},
	})
	if err := secondWorker.ProcessOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	secondDetail, err = GetInvocationDetail("user-1", secondID)
	if err != nil || secondDetail.Run.Status != model.InvocationStatusNeedsReview || len(secondDetail.OutputArtifacts) != 1 {
		t.Fatalf("second detail=%#v err=%v", secondDetail, err)
	}
	if _, err := ReviewInvocation("user-1", secondID, InvocationReviewInput{Decision: "approved", Attempt: 1, ArtifactSetHash: secondDetail.ArtifactSetHash}); err != nil {
		t.Fatal(err)
	}
	completed, err := ContinueAgentPlan("user-1", plan.Plan.ID)
	if err != nil || completed.Plan.Status != model.AgentPlanCompleted || completed.Invocation != nil {
		t.Fatalf("completed=%#v err=%v", completed, err)
	}
	for _, step := range completed.Steps {
		if step.Step.Status != model.AgentPlanStepCompleted || len(step.OutputArtifactRefs) == 0 {
			t.Fatalf("incomplete step=%#v", step)
		}
	}
}

func TestAgentPlanContinueConcurrentReplayCreatesOneInvocation(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	plan := mustPreflightAndConfirmAgentPlan(t, fixture)

	const callers = 8
	results := make(chan AgentPlanContinueResult, callers)
	errors := make(chan error, callers)
	start := make(chan struct{})
	var group sync.WaitGroup
	for range callers {
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			result, err := ContinueAgentPlan("user-1", plan.Plan.ID)
			results <- result
			errors <- err
		}()
	}
	close(start)
	group.Wait()
	close(results)
	close(errors)

	invocationID := ""
	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent continue err=%v", err)
		}
	}
	for result := range results {
		if result.Invocation == nil {
			t.Fatalf("concurrent result=%#v", result)
		}
		if invocationID == "" {
			invocationID = result.Invocation.Run.ID
		}
		if result.Invocation.Run.ID != invocationID {
			t.Fatalf("invocation=%q want=%q", result.Invocation.Run.ID, invocationID)
		}
	}
	database, _ := repository.DB()
	var invocationCount, agentRunCount int64
	if err := database.Model(&model.InvocationRun{}).Where("agent_plan_id = ? AND agent_plan_step_key = ?", plan.Plan.ID, "optimize").Count(&invocationCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&model.AgentRun{}).Where("invocation_id = ?", invocationID).Count(&agentRunCount).Error; err != nil {
		t.Fatal(err)
	}
	if invocationCount != 1 || agentRunCount != 1 {
		t.Fatalf("invocations=%d AgentRuns=%d", invocationCount, agentRunCount)
	}
}

func TestAgentPlanContinueUsesFrozenSkillAfterRecommendationChanges(t *testing.T) {
	fixture := seedTwoStepAgentPlan(t)
	plan := mustPreflightAndConfirmAgentPlan(t, fixture)
	skill, ok, err := repository.GetSkillDefinition("plan-script")
	if err != nil || !ok {
		t.Fatalf("skill=%#v ok=%v err=%v", skill, ok, err)
	}
	_, next := seedInvocationSkillVersion(t, skill, invocationSkillSeed{VersionID: "plan-script-v2", Version: "2.0.0"})
	skill.RecommendedVersionID = next.ID
	if err := repository.SaveSkillDefinition(skill); err != nil {
		t.Fatal(err)
	}

	continued, err := ContinueAgentPlan("user-1", plan.Plan.ID)
	if err != nil || continued.Invocation == nil {
		t.Fatalf("continued=%#v err=%v", continued, err)
	}
	detail, err := GetInvocationDetail("user-1", continued.Invocation.Run.ID)
	if err != nil || len(detail.Revisions) != 1 || detail.Revisions[0].SkillVersionID != fixture.FirstSkillVersionID {
		t.Fatalf("detail=%#v err=%v", detail, err)
	}
}

func TestAgentPlanCancelPropagatesToActiveInvocation(t *testing.T) {
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
	run, ok, err := repository.GetUserInvocation("user-1", started.Invocation.Run.ID)
	if err != nil || !ok || (run.Status != model.InvocationStatusCancelled && run.Status != model.InvocationStatusCancelRequested) {
		t.Fatalf("invocation=%#v ok=%v err=%v", run, ok, err)
	}
	if _, err := ContinueAgentPlan("user-1", plan.Plan.ID); !errors.Is(err, repository.ErrAgentPlanTransitionConflict) {
		t.Fatalf("continue cancelled err=%v", err)
	}
}

func mustPreflightAndConfirmAgentPlan(t *testing.T, fixture twoStepAgentPlanFixture) AgentPlanDetail {
	t.Helper()
	created, err := CreateAgentPlan("user-1", fixture.CreateInput)
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := PreflightAgentPlan("user-1", created.Plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	confirmed, err := ConfirmAgentPlan("user-1", created.Plan.ID, AgentPlanConfirmInput{
		Revision: preflight.Plan.CurrentRevision, Fingerprint: preflight.Plan.ConfirmationFingerprint, RequirementCodes: agentPlanRequirementCodes(preflight),
	})
	if err != nil {
		t.Fatal(err)
	}
	return confirmed
}

func agentPlanRequirementCodes(result AgentPlanPreflightResult) []string {
	codes := make([]string, 0, len(result.ConfirmationRequirements))
	for _, requirement := range result.ConfirmationRequirements {
		codes = append(codes, requirement.Code)
	}
	return codes
}

func agentPlanRequirementCodesFromInvocation(t *testing.T, invocationID string) []string {
	t.Helper()
	detail, err := GetInvocationDetail("user-1", invocationID)
	if err != nil || len(detail.Revisions) != 1 {
		t.Fatalf("detail=%#v err=%v", detail, err)
	}
	return detail.Revisions[0].ConfirmationRequirements
}
