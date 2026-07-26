package repository

import (
	"errors"
	"sync"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestAgentPlanCreateAggregateIdempotently(t *testing.T) {
	setupRepositoryTestDB(t)
	plan, revision, steps := agentPlanFixture("same-key", "same-hash")
	first, created, err := CreateAgentPlanAggregateIdempotently(plan, revision, steps)
	if err != nil || !created {
		t.Fatalf("created=%v err=%v", created, err)
	}
	plan.ID, revision.ID, revision.AgentPlanID = "duplicate", "duplicate-revision", "duplicate"
	second, created, err := CreateAgentPlanAggregateIdempotently(plan, revision, steps)
	if err != nil || created || second.ID != first.ID {
		t.Fatalf("second=%#v created=%v err=%v", second, created, err)
	}
	plan.RequestHash = "different-hash"
	if _, _, err := CreateAgentPlanAggregateIdempotently(plan, revision, steps); !errors.Is(err, ErrAgentPlanIdempotencyConflict) {
		t.Fatalf("idempotency conflict err=%v", err)
	}
}

func TestAgentPlanAppendRevisionPreservesHistory(t *testing.T) {
	setupRepositoryTestDB(t)
	plan, revision, steps := agentPlanFixture("revision-key", "revision-hash")
	if _, _, err := CreateAgentPlanAggregateIdempotently(plan, revision, steps); err != nil {
		t.Fatal(err)
	}
	plan.CurrentRevision, plan.Goal, plan.Status, plan.UpdatedAt = 2, "第二版目标", model.AgentPlanDraft, "2026-07-26T00:01:00Z"
	revision.ID, revision.Revision, revision.Goal, revision.CreatedAt = "agent-plan-revision-2", 2, plan.Goal, plan.UpdatedAt
	steps[0].ID, steps[0].Revision, steps[0].Label, steps[0].CreatedAt, steps[0].UpdatedAt = "agent-plan-step-2", 2, "第二版", plan.UpdatedAt, plan.UpdatedAt
	if err := AppendAgentPlanRevision(plan, revision, steps); err != nil {
		t.Fatal(err)
	}
	firstRevision, firstSteps, ok, err := GetAgentPlanRevision(plan.ID, 1)
	if err != nil || !ok || firstRevision.Goal != "第一版目标" || len(firstSteps) != 1 || firstSteps[0].Label != "第一版" {
		t.Fatalf("first=%#v steps=%#v ok=%v err=%v", firstRevision, firstSteps, ok, err)
	}
	secondRevision, secondSteps, ok, err := GetAgentPlanRevision(plan.ID, 2)
	if err != nil || !ok || secondRevision.Goal != "第二版目标" || len(secondSteps) != 1 || secondSteps[0].Label != "第二版" {
		t.Fatalf("second=%#v steps=%#v ok=%v err=%v", secondRevision, secondSteps, ok, err)
	}
	saved, ok, err := GetUserAgentPlan(plan.UserID, plan.ID)
	if err != nil || !ok || saved.CurrentRevision != 2 || saved.Goal != plan.Goal {
		t.Fatalf("saved=%#v ok=%v err=%v", saved, ok, err)
	}
}

func TestAgentPlanConfirmUsesFrozenRevisionAndFingerprint(t *testing.T) {
	setupRepositoryTestDB(t)
	plan, revision, steps := agentPlanFixture("confirm-key", "confirm-hash")
	plan.Status = model.AgentPlanAwaitingConfirmation
	plan.ConfirmationFingerprint, plan.EstimatedCredits = "fingerprint-1", 7
	revision.ConfirmationFingerprint, revision.EstimatedCredits = plan.ConfirmationFingerprint, plan.EstimatedCredits
	if _, _, err := CreateAgentPlanAggregateIdempotently(plan, revision, steps); err != nil {
		t.Fatal(err)
	}
	confirmation := model.AgentPlanConfirmation{
		ID: "agent-plan-confirmation-1", UserID: plan.UserID, AgentPlanID: plan.ID, Revision: 1,
		Fingerprint: plan.ConfirmationFingerprint, EstimatedCredits: plan.EstimatedCredits,
		RequirementCodesJSON: `["credits"]`, ConfirmedAt: "2026-07-26T00:01:00Z",
	}
	plan.Status, plan.UpdatedAt = model.AgentPlanRunning, confirmation.ConfirmedAt
	if err := ConfirmAgentPlanTx(plan, confirmation); err != nil {
		t.Fatal(err)
	}
	if err := ConfirmAgentPlanTx(plan, confirmation); !errors.Is(err, ErrAgentPlanTransitionConflict) {
		t.Fatalf("duplicate confirm err=%v", err)
	}
	saved, ok, err := GetUserAgentPlan(plan.UserID, plan.ID)
	if err != nil || !ok || saved.Status != model.AgentPlanRunning {
		t.Fatalf("saved=%#v ok=%v err=%v", saved, ok, err)
	}
}

func TestAgentPlanBindStepInvocationUsesCompareAndSwap(t *testing.T) {
	setupRepositoryTestDB(t)
	plan, revision, steps := agentPlanFixture("bind-key", "bind-hash")
	plan.Status = model.AgentPlanRunning
	steps[0].Status = model.AgentPlanStepReady
	if _, _, err := CreateAgentPlanAggregateIdempotently(plan, revision, steps); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	errorsByInvocation := make(chan error, 2)
	var group sync.WaitGroup
	for _, invocationID := range []string{"invocation-a", "invocation-b"} {
		group.Add(1)
		go func(id string) {
			defer group.Done()
			<-start
			errorsByInvocation <- BindAgentPlanStepInvocation(plan.ID, 1, 1, id, "2026-07-26T00:01:00Z")
		}(invocationID)
	}
	close(start)
	group.Wait()
	close(errorsByInvocation)
	succeeded, conflicted := 0, 0
	for err := range errorsByInvocation {
		if err == nil {
			succeeded++
		} else if errors.Is(err, ErrAgentPlanTransitionConflict) {
			conflicted++
		} else {
			t.Fatalf("unexpected bind err=%v", err)
		}
	}
	if succeeded != 1 || conflicted != 1 {
		t.Fatalf("succeeded=%d conflicted=%d", succeeded, conflicted)
	}
	_, savedSteps, ok, err := GetAgentPlanRevision(plan.ID, 1)
	if err != nil || !ok || len(savedSteps) != 1 || savedSteps[0].InvocationID == "" || savedSteps[0].Status != model.AgentPlanStepQueued {
		t.Fatalf("steps=%#v ok=%v err=%v", savedSteps, ok, err)
	}
}

func TestAgentPlanUpdateStepResultTransitionsPlanAndStepTogether(t *testing.T) {
	setupRepositoryTestDB(t)
	plan, revision, steps := agentPlanFixture("result-key", "result-hash")
	plan.Status = model.AgentPlanRunning
	steps[0].Status, steps[0].InvocationID = model.AgentPlanStepQueued, "invocation-1"
	if _, _, err := CreateAgentPlanAggregateIdempotently(plan, revision, steps); err != nil {
		t.Fatal(err)
	}
	plan.Status, plan.UpdatedAt = model.AgentPlanNeedsReview, "2026-07-26T00:01:00Z"
	step := steps[0]
	step.Status, step.OutputArtifactRefsJSON, step.UpdatedAt = model.AgentPlanStepNeedsReview, `[{"artifactId":"artifact-1"}]`, plan.UpdatedAt
	if err := UpdateAgentPlanStepResult(plan, step); err != nil {
		t.Fatal(err)
	}
	if err := UpdateAgentPlanStepResult(plan, step); !errors.Is(err, ErrAgentPlanTransitionConflict) {
		t.Fatalf("duplicate result err=%v", err)
	}
	saved, ok, err := GetUserAgentPlan(plan.UserID, plan.ID)
	_, savedSteps, revisionOK, revisionErr := GetAgentPlanRevision(plan.ID, 1)
	if err != nil || !ok || revisionErr != nil || !revisionOK || saved.Status != model.AgentPlanNeedsReview || savedSteps[0].Status != model.AgentPlanStepNeedsReview || savedSteps[0].OutputArtifactRefsJSON == "" {
		t.Fatalf("plan=%#v steps=%#v ok=%v revisionOK=%v err=%v revisionErr=%v", saved, savedSteps, ok, revisionOK, err, revisionErr)
	}
}

func agentPlanFixture(idempotencyKey, requestHash string) (model.AgentPlan, model.AgentPlanRevision, []model.AgentPlanStep) {
	stamp := "2026-07-26T00:00:00Z"
	plan := model.AgentPlan{
		ID: "agent-plan-1", UserID: "user-1", ProjectID: "project-1", EpisodeID: "episode-1",
		AgentID: "agent-1", AgentVersionID: "agent-version-1", Goal: "第一版目标", Status: model.AgentPlanDraft,
		CurrentRevision: 1, IdempotencyKey: idempotencyKey, RequestHash: requestHash, CreatedAt: stamp, UpdatedAt: stamp,
	}
	revision := model.AgentPlanRevision{
		ID: "agent-plan-revision-1", UserID: plan.UserID, AgentPlanID: plan.ID, Revision: 1,
		AgentVersionID: plan.AgentVersionID, AgentContentHash: "agent-hash-1", Goal: plan.Goal,
		SourceArtifactRefsJSON: `[{"bindingName":"source","artifactId":"artifact-1","contentHash":"artifact-hash-1"}]`, PlanSnapshotJSON: `{}`, CreatedAt: stamp,
	}
	steps := []model.AgentPlanStep{{
		ID: "agent-plan-step-1", UserID: plan.UserID, AgentPlanID: plan.ID, Revision: 1, Ordinal: 1,
		StepKey: "script", Label: "第一版", Capability: "workflow.stage.script", SkillID: "skill-1",
		InputBindingsJSON: `[]`, ParametersJSON: `{}`, ExpectedOutputType: "production_script",
		Status: model.AgentPlanStepPending, OutputArtifactRefsJSON: `[]`, CreatedAt: stamp, UpdatedAt: stamp,
	}}
	return plan, revision, steps
}
