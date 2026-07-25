package repository

import (
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

var invocationTestTime = time.Date(2026, 7, 26, 10, 0, 0, 0, time.UTC)

func invocationFixture(id, key, hash string) (model.InvocationRun, model.InvocationPreflightRevision, []model.InvocationArtifactRef, model.InvocationEvent) {
	keyPointer := &key
	run := model.InvocationRun{ID: id, UserID: "user-1", Source: "canvas", ProjectID: "project-1", EpisodeID: "episode-1", IdempotencyKey: keyPointer, RequestHash: hash, Status: model.InvocationStatusPlanned, LatestRevision: 1, CreatedAt: invocationTestTime.Format(time.RFC3339Nano), UpdatedAt: invocationTestTime.Format(time.RFC3339Nano)}
	revision := model.InvocationPreflightRevision{ID: id + "-revision-1", UserID: run.UserID, InvocationID: id, Revision: 1, RequestHash: hash, SkillID: "skill-1", SkillVersionID: "skill-version-1", SkillVersion: "1.0.0", SkillContentHash: "skill-hash", InputSnapshotJSON: `{"prompt":"draw"}`, ParametersJSON: `{}`, ExecutionPolicyJSON: `{}`, CreatedAt: run.CreatedAt}
	refs := []model.InvocationArtifactRef{{ID: id + "-input-1", UserID: run.UserID, InvocationID: id, Direction: "input", BindingName: "source", ArtifactID: id + "-artifact-input", ArtifactHash: "input-hash", ArtifactType: "source_text", SchemaVersion: "1.0.0", SchemaContentHash: "schema-hash", Revision: 1, Ordinal: 0, CreatedAt: run.CreatedAt}}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: id, Type: "invocation.created", Level: "info", Revision: 1, DataJSON: `{}`, CreatedAt: run.CreatedAt}
	return run, revision, refs, event
}

func createInvocationFixture(t *testing.T, id string, status model.InvocationStatus) model.InvocationRun {
	t.Helper()
	run, revision, refs, event := invocationFixture(id, id+"-key", id+"-hash")
	run.Status = status
	if _, err := CreateArtifact(model.Artifact{ID: id + "-artifact-input", UserID: run.UserID, ArtifactType: "source_text", SchemaVersion: "1.0.0", SchemaContentHash: "schema-hash", ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, ContentHash: "input-hash", PayloadJSON: `{}`, CreatedAt: run.CreatedAt}); err != nil {
		t.Fatal(err)
	}
	created, ok, err := CreateInvocationAggregateIdempotently(run, revision, refs, event)
	if err != nil || !ok {
		t.Fatalf("CreateInvocationAggregateIdempotently run=%#v created=%v err=%v", created, ok, err)
	}
	return created
}

func queuedInvocationFixture(id string) (model.InvocationRun, model.InvocationAttempt, model.AgentRun, []model.InvocationArtifactRef, model.InvocationEvent) {
	run, _, _, _ := invocationFixture(id, id+"-key", id+"-hash")
	run.Status = model.InvocationStatusQueued
	run.LatestAttempt = 1
	run.UpdatedAt = invocationTestTime.Add(time.Minute).Format(time.RFC3339Nano)
	attempt := model.InvocationAttempt{ID: id + "-attempt-1", UserID: run.UserID, InvocationID: id, AgentRunID: id + "-agent", Status: string(model.AgentRunStatusQueued), Revision: 1, Attempt: 1, CreatedAt: run.UpdatedAt, UpdatedAt: run.UpdatedAt}
	key := id + "-agent-key"
	agentRun := model.AgentRun{ID: attempt.AgentRunID, UserID: run.UserID, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, Status: model.AgentRunStatusQueued, IdempotencyKey: &key, AvailableAt: run.UpdatedAt, MaxAttempts: 3, CreatedAt: run.UpdatedAt, UpdatedAt: run.UpdatedAt}
	agentRun.AvailableAt = ""
	refs := []model.InvocationArtifactRef{{ID: id + "-queued-input", UserID: run.UserID, InvocationID: id, Direction: "input", BindingName: "source", ArtifactID: id + "-artifact-input", ArtifactHash: "input-hash", ArtifactType: "source_text", SchemaVersion: "1.0.0", SchemaContentHash: "schema-hash", Revision: 1, Attempt: 1, Ordinal: 0, CreatedAt: run.UpdatedAt}}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: id, Type: "invocation.queued", Level: "info", Revision: 1, Attempt: 1, DataJSON: `{}`, CreatedAt: run.UpdatedAt}
	return run, attempt, agentRun, refs, event
}

func claimedInvocationFixture(t *testing.T, id string) (model.AgentRun, model.InvocationRun, model.InvocationAttempt, []model.Artifact, []model.InvocationArtifactRef, []model.InvocationGateResult, model.InvocationEvent) {
	t.Helper()
	run := createInvocationFixture(t, id, model.InvocationStatusAwaitingConfirmation)
	queued, attempt, agentRun, inputRefs, queueEvent := queuedInvocationFixture(run.ID)
	if err := QueueInvocationAttemptTx(queued, attempt, agentRun, inputRefs, queueEvent); err != nil {
		t.Fatal(err)
	}
	claimed, ok, err := ClaimNextAgentRunWithInvocationTx("worker-1", time.Minute, 1)
	if err != nil || !ok {
		t.Fatalf("claim ok=%v err=%v", ok, err)
	}
	finishedAt := invocationTestTime.Add(2 * time.Minute).Format(time.RFC3339Nano)
	claimed.Status, claimed.RawOutput, claimed.FinishedAt, claimed.UpdatedAt = model.AgentRunStatusNeedsReview, "raw", finishedAt, finishedAt
	queued.Status, queued.UpdatedAt = model.InvocationStatusNeedsReview, finishedAt
	attempt.Status, attempt.RawOutput, attempt.StructuredOutputJSON, attempt.FinishedAt, attempt.UpdatedAt = string(model.AgentRunStatusNeedsReview), "raw", `{"outputs":2}`, finishedAt, finishedAt
	producer := run.ID
	artifacts := []model.Artifact{
		{ID: id + "-output-1", UserID: run.UserID, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", ProducerInvocationID: &producer, ProducerAttempt: 1, ContentHash: "hash-1", PayloadJSON: `{}`, CreatedAt: finishedAt},
		{ID: id + "-output-2", UserID: run.UserID, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", ProducerInvocationID: &producer, ProducerAttempt: 1, ContentHash: "hash-2", PayloadJSON: `{}`, CreatedAt: finishedAt},
	}
	refs := []model.InvocationArtifactRef{
		{ID: id + "-output-ref-1", UserID: run.UserID, InvocationID: run.ID, Direction: "output", BindingName: "images", ArtifactID: artifacts[0].ID, ArtifactHash: "hash-1", ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", Revision: 1, Attempt: 1, Ordinal: 0, CreatedAt: finishedAt},
		{ID: id + "-output-ref-2", UserID: run.UserID, InvocationID: run.ID, Direction: "output", BindingName: "images", ArtifactID: artifacts[1].ID, ArtifactHash: "hash-2", ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", Revision: 1, Attempt: 1, Ordinal: 1, CreatedAt: finishedAt},
	}
	gates := []model.InvocationGateResult{
		{ID: id + "-gate-1", UserID: run.UserID, InvocationID: run.ID, ArtifactID: artifacts[0].ID, ArtifactHash: "hash-1", Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", ValidatorVersion: "1", Passed: true, IssuesJSON: `[]`, CreatedAt: finishedAt},
		{ID: id + "-gate-2", UserID: run.UserID, InvocationID: run.ID, ArtifactID: artifacts[1].ID, ArtifactHash: "hash-2", Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", ValidatorVersion: "1", Passed: true, IssuesJSON: `[]`, CreatedAt: finishedAt},
	}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "attempt.finalized", Revision: 1, Attempt: 1, DataJSON: `{"hash":"set-hash"}`, CreatedAt: finishedAt}
	return claimed, queued, attempt, artifacts, refs, gates, event
}
