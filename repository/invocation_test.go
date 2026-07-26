package repository

import (
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestSaveInvocationReviewTx(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "invocation-review", model.InvocationStatusNeedsReview)
	run.LatestAttempt = 1
	database, _ := DB()
	if err := database.Model(&model.InvocationRun{}).Where("id = ?", run.ID).Update("latest_attempt", 1).Error; err != nil {
		t.Fatal(err)
	}
	run.Status, run.ReviewedAttempt, run.ReviewedArtifactSetHash = model.InvocationStatusApproved, 1, "artifact-set"
	review := model.InvocationReview{ID: "review-1", UserID: run.UserID, InvocationID: run.ID, Decision: "approved", ArtifactSetHash: "artifact-set", ActorID: "user-1", Attempt: 1, CreatedAt: invocationTestTime.Format(time.RFC3339Nano)}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "review.approved", Revision: 1, Attempt: 1, CreatedAt: review.CreatedAt}
	if err := SaveInvocationReviewTx(run, review, event); err != nil {
		t.Fatal(err)
	}
	if err := SaveInvocationReviewTx(run, review, event); !errors.Is(err, ErrInvocationTransitionConflict) {
		t.Fatalf("duplicate review err=%v", err)
	}
}

func TestSaveInvocationReviewAllowsLaterAttempt(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "invocation-review-later", model.InvocationStatusNeedsReview)
	database, _ := DB()
	if err := database.Model(&model.InvocationRun{}).Where("id = ?", run.ID).Updates(map[string]any{"latest_attempt": 2, "reviewed_attempt": 1, "reviewed_artifact_set_hash": "old-set"}).Error; err != nil {
		t.Fatal(err)
	}
	run.LatestAttempt, run.ReviewedAttempt, run.ReviewedArtifactSetHash = 2, 2, "new-set"
	run.Status = model.InvocationStatusApproved
	review := model.InvocationReview{ID: "review-later", UserID: run.UserID, InvocationID: run.ID, Decision: "approved", ArtifactSetHash: "new-set", ActorID: run.UserID, Attempt: 2, CreatedAt: run.CreatedAt}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "review.approved", Revision: 1, Attempt: 2, CreatedAt: run.CreatedAt}
	if err := SaveInvocationReviewTx(run, review, event); err != nil {
		t.Fatal(err)
	}
}

func TestInvocationApplyAttemptCommitsFailureButRollsBackAdapterWrite(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "invocation-apply", model.InvocationStatusApproved)
	run.LatestAttempt = 1
	run.ReviewedAttempt, run.ReviewedArtifactSetHash = 1, "artifact-set"
	database, _ := DB()
	if err := database.Model(&model.InvocationRun{}).Where("id = ?", run.ID).Updates(map[string]any{"latest_attempt": 1, "reviewed_attempt": 1, "reviewed_artifact_set_hash": "artifact-set"}).Error; err != nil {
		t.Fatal(err)
	}
	attempt := model.InvocationApplyAttempt{ID: "apply-1", UserID: run.UserID, InvocationID: run.ID, IdempotencyKey: "apply-key", RequestHash: "apply-request", ArtifactSetHash: "artifact-set", Target: "setting", TargetID: "target-1", Attempt: 1, CreatedAt: invocationTestTime.Format(time.RFC3339Nano), UpdatedAt: invocationTestTime.Format(time.RFC3339Nano)}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "apply.failed", Revision: 1, Attempt: 1, CreatedAt: attempt.CreatedAt}
	_, created, err := ApplyInvocationTx(run, attempt, event, func(tx *gorm.DB) (json.RawMessage, error) {
		if err := tx.Create(&model.Setting{Key: "must-rollback", Value: json.RawMessage(`"value"`)}).Error; err != nil {
			return nil, err
		}
		return nil, errors.New("adapter failed")
	})
	if err == nil || !created {
		t.Fatalf("created=%v err=%v", created, err)
	}
	var settingCount, applyCount int64
	database.Model(&model.Setting{}).Where("key = ?", "must-rollback").Count(&settingCount)
	database.Model(&model.InvocationApplyAttempt{}).Where("id = ? AND status = ?", attempt.ID, "failed").Count(&applyCount)
	if settingCount != 0 || applyCount != 1 {
		t.Fatalf("settings=%d apply=%d", settingCount, applyCount)
	}
	saved, _, _ := GetUserInvocation(run.UserID, run.ID)
	if saved.Status != model.InvocationStatusApproved {
		t.Fatalf("status=%s", saved.Status)
	}
}

func TestCreateInvocationAggregateIdempotently(t *testing.T) {
	setupRepositoryTestDB(t)
	run, revision, refs, event := invocationFixture("invocation-create", "same-key", "request-hash")
	first, created, err := CreateInvocationAggregateIdempotently(run, revision, refs, event)
	if err != nil || !created {
		t.Fatalf("first create=%v err=%v", created, err)
	}
	run.ID = "invocation-duplicate"
	revision.ID, revision.InvocationID = "duplicate-revision", run.ID
	event.InvocationID = run.ID
	second, created, err := CreateInvocationAggregateIdempotently(run, revision, nil, event)
	if err != nil || created || second.ID != first.ID {
		t.Fatalf("second=%#v created=%v err=%v", second, created, err)
	}
	run.RequestHash = "changed-hash"
	if _, _, err := CreateInvocationAggregateIdempotently(run, revision, nil, event); !errors.Is(err, ErrInvocationIdempotencyConflict) {
		t.Fatalf("changed request hash err=%v", err)
	}
}

func TestInvocationTablesMigrateWithAggregateIndexes(t *testing.T) {
	setupRepositoryTestDB(t)
	database, _ := DB()
	for _, table := range []string{"artifact_schemas", "artifacts", "invocation_runs", "invocation_preflight_revisions", "invocation_attempts", "invocation_artifact_refs", "invocation_events", "invocation_gate_results", "invocation_reviews", "invocation_apply_attempts", "invocation_test_sink_receipts"} {
		if !database.Migrator().HasTable(table) {
			t.Fatalf("missing table %s", table)
		}
	}
	checks := []struct {
		model   any
		name    string
		columns []string
	}{
		{&model.InvocationRun{}, "idx_invocation_run_idempotency", []string{"user_id", "idempotency_key"}},
		{&model.InvocationPreflightRevision{}, "idx_invocation_revision", []string{"invocation_id", "revision"}},
		{&model.InvocationAttempt{}, "idx_invocation_attempt", []string{"invocation_id", "attempt"}},
		{&model.InvocationArtifactRef{}, "idx_invocation_artifact_ref", []string{"invocation_id", "direction", "revision", "attempt", "binding_name", "ordinal"}},
		{&model.InvocationGateResult{}, "idx_invocation_gate", []string{"invocation_id", "attempt", "execution_ordinal", "layer", "validator_id", "binding_name", "output_ordinal", "artifact_hash"}},
		{&model.InvocationReview{}, "idx_invocation_review", []string{"invocation_id", "attempt", "artifact_set_hash", "decision"}},
		{&model.InvocationApplyAttempt{}, "idx_invocation_apply", []string{"user_id", "invocation_id", "idempotency_key"}},
	}
	for _, check := range checks {
		indexes, err := database.Migrator().GetIndexes(check.model)
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, index := range indexes {
			unique, known := index.Unique()
			if index.Name() == check.name && sameIndexColumns(index.Columns(), check.columns) && known && unique {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing unique index %s on %v", check.name, check.columns)
		}
	}
}

func TestInvocationArtifactRefIndexMigratesLegacyWithoutRevision(t *testing.T) {
	setupRepositoryTestDB(t)
	legacy, err := gorm.Open(sqlite.Open(config.Cfg.DatabaseDSN), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := legacy.AutoMigrate(&model.InvocationArtifactRef{}); err != nil {
		t.Fatal(err)
	}
	if err := legacy.Migrator().DropIndex(&model.InvocationArtifactRef{}, "idx_invocation_artifact_ref"); err != nil {
		t.Fatal(err)
	}
	if err := legacy.Exec(`CREATE UNIQUE INDEX idx_invocation_artifact_ref ON invocation_artifact_refs(invocation_id,direction,attempt,binding_name,ordinal)`).Error; err != nil {
		t.Fatal(err)
	}
	if sqlDB, err := legacy.DB(); err == nil {
		_ = sqlDB.Close()
	}
	database, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	indexes, err := database.Migrator().GetIndexes(&model.InvocationArtifactRef{})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"invocation_id", "direction", "revision", "attempt", "binding_name", "ordinal"}
	for _, index := range indexes {
		if index.Name() == "idx_invocation_artifact_ref" && sameIndexColumns(index.Columns(), want) {
			return
		}
	}
	t.Fatal("legacy invocation Artifact ref index was not replaced")
}

func TestInvocationGateIndexMigratesLegacyColumnOrder(t *testing.T) {
	setupRepositoryTestDB(t)
	legacy, err := gorm.Open(sqlite.Open(config.Cfg.DatabaseDSN), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := legacy.AutoMigrate(&model.InvocationGateResult{}); err != nil {
		t.Fatal(err)
	}
	if err := legacy.Migrator().DropIndex(&model.InvocationGateResult{}, "idx_invocation_gate"); err != nil {
		t.Fatal(err)
	}
	if err := legacy.Exec(`CREATE UNIQUE INDEX idx_invocation_gate ON invocation_gate_results(invocation_id,attempt,execution_ordinal,layer,validator_id,output_ordinal,binding_name,artifact_hash)`).Error; err != nil {
		t.Fatal(err)
	}
	if sqlDB, err := legacy.DB(); err == nil {
		_ = sqlDB.Close()
	}
	database, err := DB()
	if err != nil {
		t.Fatal(err)
	}
	indexes, err := database.Migrator().GetIndexes(&model.InvocationGateResult{})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"invocation_id", "attempt", "execution_ordinal", "layer", "validator_id", "binding_name", "output_ordinal", "artifact_hash"}
	for _, index := range indexes {
		unique, known := index.Unique()
		if index.Name() == "idx_invocation_gate" && slices.Equal(index.Columns(), want) && known && unique {
			return
		}
	}
	t.Fatal("legacy invocation gate index was not replaced with the exact ordered unique index")
}

func TestInvocationModelsDeclareOnlyTheSevenPlannedUniqueIndexes(t *testing.T) {
	expected := map[string]bool{
		"idx_invocation_run_idempotency": true, "idx_invocation_revision": true, "idx_invocation_attempt": true,
		"idx_invocation_artifact_ref": true, "idx_invocation_gate": true, "idx_invocation_review": true, "idx_invocation_apply": true,
	}
	models := []any{&model.InvocationRun{}, &model.InvocationPreflightRevision{}, &model.InvocationAttempt{}, &model.InvocationArtifactRef{}, &model.InvocationEvent{}, &model.InvocationGateResult{}, &model.InvocationReview{}, &model.InvocationApplyAttempt{}}
	found := map[string]bool{}
	for _, item := range models {
		parsed, err := schema.Parse(item, &sync.Map{}, schema.NamingStrategy{})
		if err != nil {
			t.Fatal(err)
		}
		for _, index := range parsed.ParseIndexes() {
			if index.Class != "UNIQUE" {
				continue
			}
			if !expected[index.Name] {
				t.Fatalf("unexpected unique index %s", index.Name)
			}
			found[index.Name] = true
		}
	}
	if len(found) != len(expected) {
		t.Fatalf("unique indexes=%v", found)
	}
}

func TestInvocationCompositeUniqueIndexStringsAreMySQLBounded(t *testing.T) {
	tests := []struct {
		item   any
		fields []string
	}{
		{&model.InvocationRun{}, []string{"UserID", "IdempotencyKey"}},
		{&model.InvocationPreflightRevision{}, []string{"InvocationID"}},
		{&model.InvocationAttempt{}, []string{"InvocationID"}},
		{&model.InvocationArtifactRef{}, []string{"InvocationID", "Direction", "BindingName"}},
		{&model.InvocationGateResult{}, []string{"InvocationID", "Layer", "ValidatorID", "ArtifactHash"}},
		{&model.InvocationReview{}, []string{"InvocationID", "ArtifactSetHash", "Decision"}},
		{&model.InvocationApplyAttempt{}, []string{"UserID", "InvocationID", "IdempotencyKey"}},
	}
	for _, test := range tests {
		parsed, err := schema.Parse(test.item, &sync.Map{}, schema.NamingStrategy{})
		if err != nil {
			t.Fatal(err)
		}
		totalBytes := 0
		for _, name := range test.fields {
			field := parsed.LookUpField(name)
			if field == nil || field.Size <= 0 {
				t.Fatalf("%s.%s has unbounded size", parsed.Name, name)
			}
			totalBytes += int(field.Size) * 4
		}
		if totalBytes > 3072 {
			t.Fatalf("%s composite utf8mb4 bytes=%d", parsed.Name, totalBytes)
		}
	}
}

func TestAppendInvocationPreflightRevisionIsImmutable(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "invocation-revision", model.InvocationStatusPlanned)
	nextRun := run
	nextRun.Status, nextRun.LatestRevision = model.InvocationStatusPreflight, 2
	nextRun.RequestHash = "hash-2"
	nextRun.UpdatedAt = invocationTestTime.Add(time.Minute).Format(time.RFC3339Nano)
	revision := model.InvocationPreflightRevision{ID: "revision-2", UserID: run.UserID, InvocationID: run.ID, Revision: 2, RequestHash: "hash-2", SkillID: "skill-1", SkillVersionID: "skill-version-2", SkillVersion: "2.0.0", SkillContentHash: "skill-hash-2", InputSnapshotJSON: `{}`, CreatedAt: nextRun.UpdatedAt}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "preflight.revised", Revision: 2, CreatedAt: nextRun.UpdatedAt}
	if err := AppendInvocationPreflightRevision(nextRun, revision, nil, event, model.InvocationStatusPlanned); err != nil {
		t.Fatal(err)
	}
	if err := AppendInvocationPreflightRevision(nextRun, revision, nil, event, model.InvocationStatusPlanned); !errors.Is(err, ErrInvocationTransitionConflict) {
		t.Fatalf("duplicate append err=%v", err)
	}
	var revisions []model.InvocationPreflightRevision
	revisions, err := ListInvocationPreflightRevisions(run.UserID, run.ID)
	if err != nil || len(revisions) != 2 || revisions[0].RequestHash == revisions[1].RequestHash {
		t.Fatalf("revisions=%#v err=%v", revisions, err)
	}
	saved, _, _ := GetUserInvocation(run.UserID, run.ID)
	if saved.RequestHash != revision.RequestHash {
		t.Fatalf("header request hash=%s", saved.RequestHash)
	}
}

func TestAppendInvocationPreflightRevisionAtomicallyFreezesEmptyCoordinates(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "invocation-coordinate-freeze", model.InvocationStatusBlocked)
	database, _ := DB()
	if err := database.Model(&model.InvocationRun{}).Where("id = ?", run.ID).Updates(map[string]any{"project_id": "", "episode_id": ""}).Error; err != nil {
		t.Fatal(err)
	}
	next := run
	next.ProjectID, next.EpisodeID = "project-1", "episode-1"
	next.RequestHash, next.LatestRevision = "coordinate-hash-2", 2
	revision := model.InvocationPreflightRevision{ID: "coordinate-revision-2", UserID: run.UserID, InvocationID: run.ID, Revision: 2, RequestHash: next.RequestHash, CreatedAt: run.CreatedAt}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "preflight.revised", Revision: 2, CreatedAt: run.CreatedAt}
	if err := AppendInvocationPreflightRevision(next, revision, nil, event, model.InvocationStatusBlocked); err != nil {
		t.Fatal(err)
	}
	saved, _, _ := GetUserInvocation(run.UserID, run.ID)
	if saved.ProjectID != next.ProjectID || saved.EpisodeID != next.EpisodeID {
		t.Fatalf("coordinates were not persisted with revision: %+v", saved)
	}

	changed := next
	changed.ProjectID, changed.RequestHash, changed.LatestRevision = "project-2", "coordinate-hash-3", 3
	revision.ID, revision.Revision, revision.RequestHash = "coordinate-revision-3", 3, changed.RequestHash
	event.Revision = 3
	if err := AppendInvocationPreflightRevision(changed, revision, nil, event, next.Status); !errors.Is(err, ErrInvocationTransitionConflict) {
		t.Fatalf("non-empty coordinates changed: %v", err)
	}
}

func TestQueueInvocationAttemptAndClaimAreAtomic(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "invocation-queue", model.InvocationStatusAwaitingConfirmation)
	queued, attempt, agentRun, refs, event := queuedInvocationFixture(run.ID)
	if err := QueueInvocationAttemptTx(queued, attempt, agentRun, refs, event); err != nil {
		t.Fatal(err)
	}
	claimed, ok, err := ClaimNextAgentRunWithInvocationTx("worker-1", time.Minute, 1)
	if err != nil || !ok || claimed.ID != agentRun.ID {
		t.Fatalf("claimed=%#v ok=%v err=%v", claimed, ok, err)
	}
	saved, _, _ := GetUserInvocation(run.UserID, run.ID)
	if saved.Status != model.InvocationStatusRunning {
		t.Fatalf("invocation status=%s", saved.Status)
	}
	attempts, _ := ListInvocationAttempts(run.UserID, run.ID)
	if len(attempts) != 1 || attempts[0].Status != string(model.AgentRunStatusRunning) {
		t.Fatalf("attempts=%#v", attempts)
	}
	events, _ := ListInvocationEvents(run.UserID, run.ID, 0, 20)
	if len(events) != 3 || events[len(events)-1].Type != "attempt.running" {
		t.Fatalf("events=%#v", events)
	}
}

func TestQueueInvocationAttemptRejectsMismatchedInputArtifact(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "queue-mismatch", model.InvocationStatusAwaitingConfirmation)
	queued, attempt, agent, refs, event := queuedInvocationFixture(run.ID)
	refs[0].ArtifactHash = "foreign-hash"
	if err := QueueInvocationAttemptTx(queued, attempt, agent, refs, event); !errors.Is(err, ErrInvocationTransitionConflict) {
		t.Fatalf("err=%v", err)
	}
	saved, _, _ := GetUserInvocation(run.UserID, run.ID)
	if saved.Status != model.InvocationStatusAwaitingConfirmation {
		t.Fatalf("status=%s", saved.Status)
	}
}

func TestFinalizeInvocationAttemptCreatesMultipleOutputsOnce(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "invocation-finalize", model.InvocationStatusAwaitingConfirmation)
	queued, attempt, agentRun, refs, event := queuedInvocationFixture(run.ID)
	if err := QueueInvocationAttemptTx(queued, attempt, agentRun, refs, event); err != nil {
		t.Fatal(err)
	}
	claimed, ok, err := ClaimNextAgentRunWithInvocationTx("worker-1", time.Minute, 1)
	if err != nil || !ok {
		t.Fatalf("claim ok=%v err=%v", ok, err)
	}
	finishTime := invocationTestTime.Add(2 * time.Minute).Format(time.RFC3339Nano)
	claimed.Status, claimed.RawOutput, claimed.FinishedAt, claimed.UpdatedAt = model.AgentRunStatusNeedsReview, "raw", finishTime, finishTime
	finishedRun := queued
	finishedRun.Status, finishedRun.UpdatedAt = model.InvocationStatusNeedsReview, finishTime
	finishedAttempt := attempt
	finishedAttempt.Status, finishedAttempt.RawOutput, finishedAttempt.StructuredOutputJSON, finishedAttempt.FinishedAt, finishedAttempt.UpdatedAt = string(model.AgentRunStatusNeedsReview), "raw", `{"outputs":2}`, finishTime, finishTime
	producer := run.ID
	artifacts := []model.Artifact{
		{ID: "output-1", UserID: run.UserID, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", ProducerInvocationID: &producer, ProducerAttempt: 1, ContentHash: "hash-1", PayloadJSON: `{}`, CreatedAt: finishTime},
		{ID: "output-2", UserID: run.UserID, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", ProducerInvocationID: &producer, ProducerAttempt: 1, ContentHash: "hash-2", PayloadJSON: `{}`, CreatedAt: finishTime},
	}
	outputRefs := []model.InvocationArtifactRef{
		{ID: "output-ref-1", UserID: run.UserID, InvocationID: run.ID, Direction: "output", BindingName: "images", ArtifactID: "output-1", ArtifactHash: "hash-1", ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", Revision: 1, Attempt: 1, Ordinal: 0, CreatedAt: finishTime},
		{ID: "output-ref-2", UserID: run.UserID, InvocationID: run.ID, Direction: "output", BindingName: "images", ArtifactID: "output-2", ArtifactHash: "hash-2", ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", Revision: 1, Attempt: 1, Ordinal: 1, CreatedAt: finishTime},
	}
	gates := []model.InvocationGateResult{
		{ID: "gate-1", UserID: run.UserID, InvocationID: run.ID, ArtifactID: "output-1", ArtifactHash: "hash-1", Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", ValidatorVersion: "1", Passed: true, IssuesJSON: `[]`, CreatedAt: finishTime},
		{ID: "gate-2", UserID: run.UserID, InvocationID: run.ID, ArtifactID: "output-2", ArtifactHash: "hash-2", Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", ValidatorVersion: "1", Passed: true, IssuesJSON: `[]`, CreatedAt: finishTime},
	}
	finalEvent := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "attempt.finalized", Revision: 1, Attempt: 1, DataJSON: `{"hash":"set-hash"}`, CreatedAt: finishTime}
	if err := FinalizeInvocationAttemptTx(claimed, finishedRun, finishedAttempt, artifacts, outputRefs, gates, finalEvent); err != nil {
		t.Fatal(err)
	}
	savedAgent, ok, err := GetAgentRun(claimed.ID)
	if err != nil || !ok {
		t.Fatalf("saved agent ok=%v err=%v", ok, err)
	}
	if savedAgent.LeaseOwner != "" || savedAgent.LeaseExpiresAt != "" || savedAgent.HeartbeatAt != "" {
		t.Fatalf("lease not cleared: %#v", savedAgent)
	}
	if err := FinalizeInvocationAttemptTx(claimed, finishedRun, finishedAttempt, artifacts, outputRefs, gates, finalEvent); !errors.Is(err, ErrInvocationAttemptFinalized) {
		t.Fatalf("duplicate err=%v", err)
	}
	reversedArtifacts := []model.Artifact{artifacts[1], artifacts[0]}
	reversedRefs := []model.InvocationArtifactRef{outputRefs[1], outputRefs[0]}
	if err := FinalizeInvocationAttemptTx(claimed, finishedRun, finishedAttempt, reversedArtifacts, reversedRefs, gates, finalEvent); !errors.Is(err, ErrInvocationAttemptFinalized) {
		t.Fatalf("reordered duplicate err=%v", err)
	}
	database, _ := DB()
	var artifactCount, refCount, gateCount, eventCount int64
	database.Model(&model.Artifact{}).Where("producer_invocation_id = ?", run.ID).Count(&artifactCount)
	database.Model(&model.InvocationArtifactRef{}).Where("invocation_id = ? AND direction = ?", run.ID, "output").Count(&refCount)
	database.Model(&model.InvocationGateResult{}).Where("invocation_id = ?", run.ID).Count(&gateCount)
	database.Model(&model.InvocationEvent{}).Where("invocation_id = ? AND type = ?", run.ID, finalEvent.Type).Count(&eventCount)
	if artifactCount != 2 || refCount != 2 || gateCount != 2 || eventCount != 1 {
		t.Fatalf("counts artifacts=%d refs=%d gates=%d events=%d", artifactCount, refCount, gateCount, eventCount)
	}
}

func TestFinalizeInvocationAttemptDuplicateComparesWholeCompletion(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*model.AgentRun, *model.InvocationRun, *model.InvocationEvent)
	}{
		{name: "run status", mutate: func(_ *model.AgentRun, run *model.InvocationRun, _ *model.InvocationEvent) {
			run.Status = model.InvocationStatusFailed
		}},
		{name: "run aggregate error", mutate: func(_ *model.AgentRun, run *model.InvocationRun, _ *model.InvocationEvent) {
			run.AggregateErrorSummary = "changed"
		}},
		{name: "agent completion", mutate: func(agent *model.AgentRun, _ *model.InvocationRun, _ *model.InvocationEvent) {
			agent.ErrorMessage = "changed"
		}},
		{name: "event type", mutate: func(_ *model.AgentRun, _ *model.InvocationRun, event *model.InvocationEvent) {
			event.Type = "attempt.changed"
		}},
		{name: "event data", mutate: func(_ *model.AgentRun, _ *model.InvocationRun, event *model.InvocationEvent) {
			event.DataJSON = `{"changed":true}`
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agentRun, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "whole-completion-"+strings.ReplaceAll(test.name, " ", "-"))
			if err := FinalizeInvocationAttemptTx(agentRun, run, attempt, artifacts, refs, gates, event); err != nil {
				t.Fatal(err)
			}
			test.mutate(&agentRun, &run, &event)
			if err := FinalizeInvocationAttemptTx(agentRun, run, attempt, artifacts, refs, gates, event); !errors.Is(err, ErrInvocationCompletionConflict) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestFinalizeInvocationAttemptDuplicateIgnoresReplayClocks(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "duplicate-replay-clocks")
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); err != nil {
		t.Fatal(err)
	}
	replayStamp := invocationTestTime.Add(3 * time.Minute).Format(time.RFC3339Nano)
	agent.FinishedAt, agent.UpdatedAt, agent.DurationMs = replayStamp, replayStamp, agent.DurationMs+101
	attempt.FinishedAt, attempt.UpdatedAt, attempt.DurationMs = replayStamp, replayStamp, attempt.DurationMs+101
	run.UpdatedAt = replayStamp
	for index := range artifacts {
		artifacts[index].CreatedAt = replayStamp
	}
	for index := range refs {
		refs[index].CreatedAt = replayStamp
	}
	for index := range gates {
		gates[index].CreatedAt = replayStamp
	}
	event.CreatedAt = replayStamp
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); !errors.Is(err, ErrInvocationAttemptFinalized) {
		t.Fatalf("replay err=%v", err)
	}
}

func TestFinalizeInvocationAttemptDuplicateComparesCompleteStoredSets(t *testing.T) {
	tests := []struct {
		name   string
		change func(*testing.T, *gorm.DB, string, *[]model.Artifact, model.InvocationEvent)
	}{
		{name: "wanted missing artifact", change: func(_ *testing.T, _ *gorm.DB, _ string, artifacts *[]model.Artifact, _ model.InvocationEvent) {
			*artifacts = (*artifacts)[:1]
		}},
		{name: "stored extra artifact", change: func(t *testing.T, db *gorm.DB, invocationID string, _ *[]model.Artifact, event model.InvocationEvent) {
			producer := invocationID
			extra := model.Artifact{ID: invocationID + "-extra", UserID: "user-1", ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", ProducerInvocationID: &producer, ProducerAttempt: 1, ContentHash: "extra", PayloadJSON: `{}`, CreatedAt: event.CreatedAt}
			if err := db.Create(&extra).Error; err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "set-"+strings.ReplaceAll(test.name, " ", "-"))
			if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); err != nil {
				t.Fatal(err)
			}
			db, _ := DB()
			test.change(t, db, run.ID, &artifacts, event)
			if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); !errors.Is(err, ErrInvocationCompletionConflict) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestFinalizeInvocationAttemptDuplicateFindsEventAmongSameTimestampEvents(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "same-time-event")
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); err != nil {
		t.Fatal(err)
	}
	db, _ := DB()
	other := event
	other.Type = "other.event"
	other.DataJSON = `{"other":true}`
	if err := db.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); !errors.Is(err, ErrInvocationAttemptFinalized) {
		t.Fatalf("err=%v", err)
	}
}

func TestFinalizeInvocationAttemptDuplicatePropagatesQueryError(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "query-error")
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); err != nil {
		t.Fatal(err)
	}
	db, _ := DB()
	if err := db.Migrator().DropTable(&model.Artifact{}); err != nil {
		t.Fatal(err)
	}
	err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event)
	if err == nil || errors.Is(err, ErrInvocationCompletionConflict) {
		t.Fatalf("err=%v", err)
	}
}

func TestInvocationTransactionCrashRollsBackQueue(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "invocation-crash", model.InvocationStatusAwaitingConfirmation)
	queued, attempt, agentRun, refs, event := queuedInvocationFixture(run.ID)
	cleanupFailpoint := setInvocationQueueFailpoint(func(step string) error {
		if step == "attempt" {
			return errors.New("crash")
		}
		return nil
	})
	t.Cleanup(cleanupFailpoint)
	if err := QueueInvocationAttemptTx(queued, attempt, agentRun, refs, event); err == nil {
		t.Fatal("expected failpoint error")
	}
	database, _ := DB()
	var count int64
	database.Model(&model.AgentRun{}).Where("id = ?", agentRun.ID).Count(&count)
	if count != 0 {
		t.Fatalf("agent runs=%d", count)
	}
	saved, _, _ := GetUserInvocation(run.UserID, run.ID)
	if saved.Status != model.InvocationStatusAwaitingConfirmation {
		t.Fatalf("status=%s", saved.Status)
	}
}

func TestInvocationTransitionRaceQueuesOnce(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "invocation-race", model.InvocationStatusAwaitingConfirmation)
	queued, attempt, agentRun, refs, event := queuedInvocationFixture(run.ID)
	secondAttempt, secondAgent := attempt, agentRun
	secondAttempt.ID, secondAgent.ID, secondAttempt.AgentRunID = "attempt-race-2", "agent-race-2", "agent-race-2"
	start := make(chan struct{})
	results := make(chan error, 2)
	go func() { <-start; results <- QueueInvocationAttemptTx(queued, attempt, agentRun, refs, event) }()
	go func() { <-start; results <- QueueInvocationAttemptTx(queued, secondAttempt, secondAgent, nil, event) }()
	close(start)
	first, second := <-results, <-results
	if (first == nil) == (second == nil) {
		t.Fatalf("errors=%v, %v", first, second)
	}
}

func TestInvocationClaimUpdateHasNoAgentRunSelfReferencingSubquery(t *testing.T) {
	setupRepositoryTestDB(t)
	database, _ := DB()
	dry := database.Session(&gorm.Session{DryRun: true})
	candidate := model.AgentRun{ID: "claim-sql", UserID: "user-1"}
	result := updateClaimedAgentRun(dry, candidate, "worker-1", "2026-07-26T10:00:00Z", "2026-07-26T10:01:00Z")
	sql := strings.ToLower(result.Statement.SQL.String())
	if !strings.Contains(sql, "update `agent_runs`") && !strings.Contains(sql, "update agent_runs") {
		t.Fatalf("not an agent_runs update: %s", sql)
	}
	if strings.Contains(sql, "select") || strings.Count(sql, "agent_runs") != 1 {
		t.Fatalf("self-referencing claim update: %s", sql)
	}
}

func TestInvocationClaimSQLIsPortableAcrossDialects(t *testing.T) {
	dialects := []struct {
		name string
		open func() (*gorm.DB, error)
	}{
		{name: "mysql", open: func() (*gorm.DB, error) {
			return gorm.Open(mysql.New(mysql.Config{DSN: "user:pass@tcp(localhost:3306)/db", SkipInitializeWithVersion: true}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
		}},
		{name: "postgres", open: func() (*gorm.DB, error) {
			return gorm.Open(postgres.New(postgres.Config{DSN: "host=localhost user=user password=pass dbname=db sslmode=disable", PreferSimpleProtocol: true}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
		}},
	}
	for _, dialect := range dialects {
		t.Run(dialect.name, func(t *testing.T) {
			db, err := dialect.open()
			if err != nil {
				t.Fatal(err)
			}
			var rows []model.AgentRun
			lock := agentRunUserLockQuery(db, "user-1").Find(&rows)
			lockSQL := strings.ToUpper(lock.Statement.SQL.String())
			if !strings.Contains(lockSQL, "FOR UPDATE") {
				t.Fatalf("lock sql=%s", lockSQL)
			}
			sql := strings.ToUpper(db.ToSQL(func(tx *gorm.DB) *gorm.DB {
				return updateClaimedAgentRun(tx, model.AgentRun{ID: "run-1"}, "worker", "now", "lease")
			}))
			if strings.Contains(sql, "SELECT") || strings.Count(sql, "AGENT_RUNS") != 1 {
				t.Fatalf("update sql=%s", sql)
			}
		})
	}
}

func TestInvocationClaimConcurrentSameUserNeverExceedsLimit(t *testing.T) {
	setupRepositoryTestDB(t)
	database, _ := DB()
	database.Exec("PRAGMA journal_mode = WAL")
	database.Exec("PRAGMA busy_timeout = 5000")
	for _, id := range []string{"legacy-limit-a", "legacy-limit-b"} {
		run := queueTestAgentRun(id, id+"-key", invocationTestTime)
		run.AvailableAt = ""
		if _, err := SaveAgentRun(run); err != nil {
			t.Fatal(err)
		}
	}
	start := make(chan struct{})
	results := make(chan struct {
		ok  bool
		err error
	}, 2)
	for _, workerID := range []string{"worker-a", "worker-b"} {
		go func(worker string) {
			<-start
			_, ok, err := ClaimNextAgentRunWithInvocationTx(worker, time.Minute, 1)
			results <- struct {
				ok  bool
				err error
			}{ok, err}
		}(workerID)
	}
	close(start)
	claimed := 0
	for range 2 {
		result := <-results
		if result.err != nil {
			t.Fatal(result.err)
		}
		if result.ok {
			claimed++
		}
	}
	var running int64
	if err := database.Model(&model.AgentRun{}).Where("user_id = ? AND status = ?", "user-1", model.AgentRunStatusRunning).Count(&running).Error; err != nil {
		t.Fatal(err)
	}
	if claimed != 1 || running != 1 {
		t.Fatalf("claimed=%d running=%d", claimed, running)
	}
}

func TestInvocationClaimCountsCurrentLockedRows(t *testing.T) {
	now := "2026-07-26T10:00:00Z"
	rows := []model.AgentRun{
		{Status: model.AgentRunStatusRunning, LeaseExpiresAt: "2026-07-26T10:01:00Z"},
		{Status: model.AgentRunStatusCancelRequested, LeaseExpiresAt: "2026-07-26T10:02:00Z"},
		{Status: model.AgentRunStatusRunning, LeaseExpiresAt: "2026-07-26T09:59:00Z"},
		{Status: model.AgentRunStatusQueued},
	}
	if active := countActiveLockedAgentRuns(rows, now); active != 2 {
		t.Fatalf("active=%d", active)
	}
}

func TestInvocationClaimSkipsUserAlreadyAtCapacity(t *testing.T) {
	setupRepositoryTestDB(t)
	now := time.Now().UTC()
	running := queueTestAgentRun("capacity-running", "capacity-running-key", now.Add(-3*time.Minute))
	running.Status, running.LeaseOwner, running.LeaseExpiresAt = model.AgentRunStatusRunning, "worker-existing", now.Add(time.Minute).Format(time.RFC3339Nano)
	blocked := queueTestAgentRun("capacity-blocked", "capacity-blocked-key", now.Add(-2*time.Minute))
	other := queueTestAgentRun("capacity-other", "capacity-other-key", now.Add(-time.Minute))
	other.UserID = "user-2"
	for _, run := range []model.AgentRun{running, blocked, other} {
		run.AvailableAt = ""
		if _, err := SaveAgentRun(run); err != nil {
			t.Fatal(err)
		}
	}
	claimed, ok, err := ClaimNextAgentRunWithInvocationTx("worker-new", time.Minute, 1)
	if err != nil || !ok || claimed.ID != other.ID {
		t.Fatalf("claimed=%#v ok=%v err=%v", claimed, ok, err)
	}
}

func TestInvocationClaimCapacityRaceContinuesToOtherUser(t *testing.T) {
	setupRepositoryTestDB(t)
	db, _ := DB()
	db.Exec("PRAGMA journal_mode = WAL")
	db.Exec("PRAGMA busy_timeout = 5000")
	for index, id := range []string{"race-a1", "race-a2", "race-b1"} {
		run := queueTestAgentRun(id, id+"-key", invocationTestTime.Add(time.Duration(index)*time.Minute))
		run.AvailableAt = ""
		if id == "race-b1" {
			run.UserID = "user-2"
		}
		if _, err := SaveAgentRun(run); err != nil {
			t.Fatal(err)
		}
	}
	arrived := make(chan struct{}, 2)
	release := make(chan struct{})
	var barrierCalls atomic.Int32
	cleanup := setInvocationClaimBarrier(func(step string) {
		if step == "candidate_read" && barrierCalls.Add(1) <= 2 {
			arrived <- struct{}{}
			<-release
		}
	})
	defer cleanup()
	results := make(chan model.AgentRun, 2)
	errs := make(chan error, 2)
	for _, worker := range []string{"race-worker-1", "race-worker-2"} {
		go func(worker string) {
			run, _, err := ClaimNextAgentRunWithInvocationTx(worker, time.Minute, 1)
			results <- run
			errs <- err
		}(worker)
	}
	<-arrived
	<-arrived
	close(release)
	users := map[string]bool{}
	for range 2 {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
		run := <-results
		if run.ID != "" {
			users[run.UserID] = true
		}
	}
	if !users["user-1"] || !users["user-2"] {
		t.Fatalf("claimed users=%v", users)
	}
}

func TestLegacyClaimDoesNotTakeInvocationJob(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "legacy-skip-invocation", model.InvocationStatusAwaitingConfirmation)
	queued, attempt, invocationJob, refs, event := queuedInvocationFixture(run.ID)
	if err := QueueInvocationAttemptTx(queued, attempt, invocationJob, refs, event); err != nil {
		t.Fatal(err)
	}
	legacy := queueTestAgentRun("legacy-only-job", "legacy-only-key", invocationTestTime.Add(2*time.Hour))
	legacy.AvailableAt = ""
	if _, err := SaveAgentRun(legacy); err != nil {
		t.Fatal(err)
	}
	claimed, ok, err := ClaimNextAgentRunWithUserLimit("legacy-worker", time.Now().UTC(), time.Minute, 1)
	if err != nil || !ok || claimed.ID != legacy.ID {
		t.Fatalf("claimed=%#v ok=%v err=%v", claimed, ok, err)
	}
	stored, _, _ := GetAgentRun(invocationJob.ID)
	if stored.Status != model.AgentRunStatusQueued {
		t.Fatalf("invocation job status=%s", stored.Status)
	}
}

func TestRequeueExpiredInvocationAgentRunsKeepsAggregateAtomic(t *testing.T) {
	tests := []struct {
		name              string
		agentStatus       model.AgentRunStatus
		agentAttempt, max int
		wantAgent         model.AgentRunStatus
		wantInvocation    model.InvocationStatus
		wantEvent         string
	}{{"retry", model.AgentRunStatusRunning, 1, 3, model.AgentRunStatusQueued, model.InvocationStatusQueued, "attempt.requeued"}, {"cancel", model.AgentRunStatusCancelRequested, 1, 3, model.AgentRunStatusCancelled, model.InvocationStatusCancelled, "attempt.cancelled"}, {"exhausted", model.AgentRunStatusRunning, 3, 3, model.AgentRunStatusFailed, model.InvocationStatusFailed, "attempt.failed"}}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, run, _, _, _, _, _ := claimedInvocationFixture(t, "requeue-"+test.name)
			now := time.Now().UTC()
			expired := now.Add(-time.Minute).Format(time.RFC3339Nano)
			db, _ := DB()
			db.Model(&model.AgentRun{}).Where("id = ?", agent.ID).Updates(map[string]any{"status": test.agentStatus, "attempt": test.agentAttempt, "max_attempts": test.max, "lease_expires_at": expired})
			count, err := RequeueExpiredAgentRuns(now)
			if err != nil || count != 1 {
				t.Fatalf("count=%d err=%v", count, err)
			}
			savedAgent, _, _ := GetAgentRun(agent.ID)
			savedRun, _, _ := GetUserInvocation(run.UserID, run.ID)
			attempts, _ := ListInvocationAttempts(run.UserID, run.ID)
			events, _ := ListInvocationEvents(run.UserID, run.ID, 0, 100)
			if savedAgent.Status != test.wantAgent || savedRun.Status != test.wantInvocation || attempts[0].Status != string(test.wantAgent) || events[len(events)-1].Type != test.wantEvent {
				t.Fatalf("agent=%s run=%s attempt=%s event=%s", savedAgent.Status, savedRun.Status, attempts[0].Status, events[len(events)-1].Type)
			}
			if test.wantAgent == model.AgentRunStatusQueued {
				claimed, ok, err := ClaimNextAgentRunWithInvocationTx("reclaimer", time.Minute, 1)
				if err != nil || !ok || claimed.ID != agent.ID {
					t.Fatalf("reclaim=%#v ok=%v err=%v", claimed, ok, err)
				}
			}
		})
	}
}

func TestRequeueExpiredInvocationRacesFinalizeWithOneWinner(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "requeue-finalize-race")
	now := time.Now().UTC()
	db, _ := DB()
	db.Model(&model.AgentRun{}).Where("id = ?", agent.ID).Update("lease_expires_at", now.Add(-time.Minute).Format(time.RFC3339Nano))
	start := make(chan struct{})
	requeueResult := make(chan struct {
		count int64
		err   error
	}, 1)
	finalizeResult := make(chan error, 1)
	go func() {
		<-start
		count, err := RequeueExpiredAgentRuns(now)
		requeueResult <- struct {
			count int64
			err   error
		}{count, err}
	}()
	go func() {
		<-start
		finalizeResult <- FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event)
	}()
	close(start)
	rq, finalErr := <-requeueResult, <-finalizeResult
	winners := 0
	if rq.err == nil && rq.count == 1 {
		winners++
	}
	if finalErr == nil {
		winners++
	}
	if winners != 1 {
		t.Fatalf("requeue count=%d err=%v finalize=%v", rq.count, rq.err, finalErr)
	}
}

func TestRequeueExpiredInvocationDoesNotOverwriteStatusChangedAfterScan(t *testing.T) {
	tests := []struct {
		name   string
		change func(*testing.T, *gorm.DB, model.AgentRun, model.InvocationRun, model.InvocationAttempt, []model.Artifact, []model.InvocationArtifactRef, []model.InvocationGateResult, model.InvocationEvent)
		want   model.AgentRunStatus
	}{
		{
			name: "cancel_requested",
			change: func(t *testing.T, db *gorm.DB, agent model.AgentRun, _ model.InvocationRun, _ model.InvocationAttempt, _ []model.Artifact, _ []model.InvocationArtifactRef, _ []model.InvocationGateResult, _ model.InvocationEvent) {
				t.Helper()
				if err := db.Model(&model.AgentRun{}).Where("id = ?", agent.ID).Update("status", model.AgentRunStatusCancelRequested).Error; err != nil {
					t.Fatal(err)
				}
			},
			want: model.AgentRunStatusCancelRequested,
		},
		{
			name: "finalized",
			change: func(t *testing.T, _ *gorm.DB, agent model.AgentRun, run model.InvocationRun, attempt model.InvocationAttempt, artifacts []model.Artifact, refs []model.InvocationArtifactRef, gates []model.InvocationGateResult, event model.InvocationEvent) {
				t.Helper()
				if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); err != nil {
					t.Fatal(err)
				}
			},
			want: model.AgentRunStatusNeedsReview,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "requeue-stale-"+test.name)
			now := time.Now().UTC()
			database, _ := DB()
			if err := database.Model(&model.AgentRun{}).Where("id = ?", agent.ID).Update("lease_expires_at", now.Add(-time.Minute).Format(time.RFC3339Nano)).Error; err != nil {
				t.Fatal(err)
			}
			var changed atomic.Bool
			cleanup := setInvocationRequeueBarrier(func(step string) {
				if step != "candidate_read" || !changed.CompareAndSwap(false, true) {
					return
				}
				test.change(t, database, agent, run, attempt, artifacts, refs, gates, event)
			})
			defer cleanup()

			count, err := RequeueExpiredAgentRuns(now)
			if err != nil || count != 0 {
				t.Fatalf("count=%d err=%v", count, err)
			}
			saved, _, err := GetAgentRun(agent.ID)
			if err != nil || saved.Status != test.want {
				t.Fatalf("status=%s err=%v", saved.Status, err)
			}
			savedRun, _, _ := GetUserInvocation(run.UserID, run.ID)
			attempts, _ := ListInvocationAttempts(run.UserID, run.ID)
			if test.want == model.AgentRunStatusCancelRequested {
				if savedRun.Status != model.InvocationStatusRunning || attempts[0].Status != string(model.AgentRunStatusRunning) {
					t.Fatalf("stale cancel run=%s attempt=%s", savedRun.Status, attempts[0].Status)
				}
				count, err = RequeueExpiredAgentRuns(now)
				if err != nil || count != 1 {
					t.Fatalf("cancel count=%d err=%v", count, err)
				}
				savedRun, _, _ = GetUserInvocation(run.UserID, run.ID)
				attempts, _ = ListInvocationAttempts(run.UserID, run.ID)
				if savedRun.Status != model.InvocationStatusCancelled || attempts[0].Status != string(model.AgentRunStatusCancelled) {
					t.Fatalf("run=%s attempt=%s", savedRun.Status, attempts[0].Status)
				}
			} else if savedRun.Status != model.InvocationStatusNeedsReview || attempts[0].Status != string(model.AgentRunStatusNeedsReview) {
				t.Fatalf("finalized run=%s attempt=%s", savedRun.Status, attempts[0].Status)
			}
		})
	}
}

func TestFinalizeInvocationAttemptAllowsFailedGateWithoutArtifact(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, _, _, _, event := claimedInvocationFixture(t, "failed-gate")
	finished := event.CreatedAt
	agent.Status = model.AgentRunStatusFailed
	agent.FinishedAt = finished
	run.Status = model.InvocationStatusFailed
	attempt.Status = string(model.AgentRunStatusFailed)
	attempt.RawOutput = "invalid"
	attempt.ErrorClass = "output_schema"
	attempt.FinishedAt = finished
	gate := model.InvocationGateResult{ID: "failed-candidate-gate", UserID: run.UserID, InvocationID: run.ID, ArtifactID: "candidate-1", ArtifactHash: "candidate-hash", Attempt: 1, ExecutionOrdinal: 1, Layer: "output_schema", ValidatorID: "core", Passed: false, IssuesJSON: `["invalid"]`, CreatedAt: finished}
	event.Type = "attempt.failed"
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, nil, nil, []model.InvocationGateResult{gate}, event); err != nil {
		t.Fatal(err)
	}
}

func TestFinalizeInvocationAttemptDuplicateFailedWithoutArtifactsIsIdempotent(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, _, _, _, event := claimedInvocationFixture(t, "failed-duplicate-empty")
	agent.Status, agent.FinishedAt = model.AgentRunStatusFailed, event.CreatedAt
	run.Status = model.InvocationStatusFailed
	attempt.Status, attempt.RawOutput, attempt.ErrorClass, attempt.FinishedAt = string(model.AgentRunStatusFailed), "invalid", "output_schema", event.CreatedAt
	gate := model.InvocationGateResult{ID: "failed-empty-gate", UserID: run.UserID, InvocationID: run.ID, ArtifactID: "candidate", ArtifactHash: "bad", Attempt: 1, ExecutionOrdinal: 1, Layer: "output_schema", ValidatorID: "core", Passed: false, CreatedAt: event.CreatedAt}
	event.Type = "attempt.failed"
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, nil, nil, []model.InvocationGateResult{gate}, event); err != nil {
		t.Fatal(err)
	}
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, nil, nil, []model.InvocationGateResult{gate}, event); !errors.Is(err, ErrInvocationAttemptFinalized) {
		t.Fatalf("duplicate err=%v", err)
	}
	database, _ := DB()
	var artifacts, refs, gates, events int64
	database.Model(&model.Artifact{}).Where("producer_invocation_id = ?", run.ID).Count(&artifacts)
	database.Model(&model.InvocationArtifactRef{}).Where("invocation_id = ? AND direction = ?", run.ID, "output").Count(&refs)
	database.Model(&model.InvocationGateResult{}).Where("invocation_id = ?", run.ID).Count(&gates)
	database.Model(&model.InvocationEvent{}).Where("invocation_id = ? AND type = ?", run.ID, event.Type).Count(&events)
	if artifacts != 0 || refs != 0 || gates != 1 || events != 1 {
		t.Fatalf("artifacts=%d refs=%d gates=%d events=%d", artifacts, refs, gates, events)
	}
}

func TestFinalizeInvocationAttemptRejectsPassedUnknownGate(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, _, _, _, event := claimedInvocationFixture(t, "passed-unknown")
	agent.Status = model.AgentRunStatusFailed
	run.Status = model.InvocationStatusFailed
	attempt.Status = string(model.AgentRunStatusFailed)
	attempt.FinishedAt = event.CreatedAt
	gate := model.InvocationGateResult{ID: "passed-unknown-gate", UserID: run.UserID, InvocationID: run.ID, ArtifactID: "candidate", ArtifactHash: "hash", Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", Passed: true, CreatedAt: event.CreatedAt}
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, nil, nil, []model.InvocationGateResult{gate}, event); !errors.Is(err, ErrInvocationTransitionConflict) {
		t.Fatalf("err=%v", err)
	}
}

func TestFinalizeInvocationAttemptAllowsPartialMixedOutputs(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, artifacts, refs, _, event := claimedInvocationFixture(t, "partial-mixed")
	agent.Status = model.AgentRunStatusNeedsReview
	run.Status = model.InvocationStatusPartial
	attempt.Status = string(model.AgentRunStatusNeedsReview)
	attempt.FinishedAt = event.CreatedAt
	gates := []model.InvocationGateResult{{ID: "partial-pass", UserID: run.UserID, InvocationID: run.ID, ArtifactID: artifacts[0].ID, ArtifactHash: artifacts[0].ContentHash, Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", Passed: true, CreatedAt: event.CreatedAt}, {ID: "partial-fail", UserID: run.UserID, InvocationID: run.ID, ArtifactID: "candidate-failed", ArtifactHash: "failed-hash", Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", Passed: false, CreatedAt: event.CreatedAt}}
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts[:1], refs[:1], gates, event); err != nil {
		t.Fatal(err)
	}
}

func TestFinalizeInvocationAttemptRejectsArtifactWithoutPassedGate(t *testing.T) {
	tests := []struct {
		name          string
		artifactCount int
		passedCount   int
	}{
		{name: "only_unknown_failed_candidate", artifactCount: 1},
		{name: "second_artifact_missing_gate", artifactCount: 2, passedCount: 1},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, run, attempt, artifacts, refs, _, event := claimedInvocationFixture(t, "missing-passed-gate-"+test.name)
			run.Status = model.InvocationStatusPartial
			gates := make([]model.InvocationGateResult, 0, test.passedCount+1)
			for index := range test.passedCount {
				gates = append(gates, model.InvocationGateResult{ID: "passed-" + artifacts[index].ID, UserID: run.UserID, InvocationID: run.ID, ArtifactID: artifacts[index].ID, ArtifactHash: artifacts[index].ContentHash, Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", Passed: true, CreatedAt: event.CreatedAt})
			}
			gates = append(gates, model.InvocationGateResult{ID: "failed-candidate", UserID: run.UserID, InvocationID: run.ID, ArtifactID: "candidate", ArtifactHash: "candidate-hash", Attempt: 1, ExecutionOrdinal: 1, Layer: "business_gate", ValidatorID: "core", Passed: false, CreatedAt: event.CreatedAt})
			if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts[:test.artifactCount], refs[:test.artifactCount], gates, event); !errors.Is(err, ErrInvocationTransitionConflict) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestFinalizeInvocationAttemptAllowsPassedGateForEveryArtifact(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, artifacts, refs, _, event := claimedInvocationFixture(t, "all-artifacts-passed")
	gates := make([]model.InvocationGateResult, 0, len(artifacts))
	for index := range artifacts {
		gates = append(gates, model.InvocationGateResult{ID: "passed-" + artifacts[index].ID, UserID: run.UserID, InvocationID: run.ID, ArtifactID: artifacts[index].ID, ArtifactHash: artifacts[index].ContentHash, Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", Passed: true, CreatedAt: event.CreatedAt})
	}
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); err != nil {
		t.Fatal(err)
	}
}

func TestFinalizeInvocationAttemptRejectsInvalidFailedGateArtifactCombinations(t *testing.T) {
	tests := []struct {
		name       string
		status     model.InvocationStatus
		failedGate string
	}{
		{name: "needs_review_persisted_failed_gate", status: model.InvocationStatusNeedsReview, failedGate: "persisted"},
		{name: "partial_persisted_failed_gate", status: model.InvocationStatusPartial, failedGate: "persisted"},
		{name: "failed_with_artifact", status: model.InvocationStatusFailed, failedGate: "candidate"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, run, attempt, artifacts, refs, _, event := claimedInvocationFixture(t, "invalid-gates-"+test.name)
			run.Status = test.status
			if test.status == model.InvocationStatusFailed {
				agent.Status = model.AgentRunStatusFailed
				attempt.Status = string(model.AgentRunStatusFailed)
				event.Type = "attempt.failed"
			}
			persistedGate := model.InvocationGateResult{ID: "persisted-gate", UserID: run.UserID, InvocationID: run.ID, ArtifactID: artifacts[0].ID, ArtifactHash: artifacts[0].ContentHash, Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", Passed: test.failedGate != "persisted", CreatedAt: event.CreatedAt}
			gates := []model.InvocationGateResult{persistedGate}
			if test.failedGate == "candidate" {
				gates = append(gates, model.InvocationGateResult{ID: "failed-candidate", UserID: run.UserID, InvocationID: run.ID, ArtifactID: "candidate", ArtifactHash: "candidate-hash", Attempt: 1, ExecutionOrdinal: 1, Layer: "business_gate", ValidatorID: "core", Passed: false, CreatedAt: event.CreatedAt})
			}
			if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts[:1], refs[:1], gates, event); !errors.Is(err, ErrInvocationTransitionConflict) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestFinalizeInvocationAttemptRejectsInvalidGlobalGate(t *testing.T) {
	tests := []struct {
		name         string
		passed       bool
		artifactHash string
	}{
		{name: "failed_gate_for_needs_review", passed: false},
		{name: "hash_without_artifact_id", passed: true, artifactHash: "forged-hash"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "invalid-global-gate-"+test.name)
			gates = append(gates, model.InvocationGateResult{
				ID: "global-" + test.name, UserID: run.UserID, InvocationID: run.ID,
				ArtifactHash: test.artifactHash, Attempt: attempt.Attempt, ExecutionOrdinal: 2,
				Layer: "input_contract", ValidatorID: "frozen-input", Passed: test.passed, CreatedAt: event.CreatedAt,
			})
			if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); !errors.Is(err, ErrInvocationTransitionConflict) {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestRevalidateInvocationAttemptFromFailedPreservesRawOutput(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, _, _, _, event := claimedInvocationFixture(t, "revalidate-failed")
	agent.Status = model.AgentRunStatusFailed
	agent.FinishedAt = event.CreatedAt
	run.Status = model.InvocationStatusFailed
	attempt.Status = string(model.AgentRunStatusFailed)
	attempt.RawOutput = "immutable raw"
	attempt.ErrorClass = "output_schema"
	attempt.FinishedAt = event.CreatedAt
	failedGate := model.InvocationGateResult{ID: "revalidate-failed-gate", UserID: run.UserID, InvocationID: run.ID, ArtifactID: "candidate", ArtifactHash: "bad", Attempt: 1, ExecutionOrdinal: 1, Layer: "schema", ValidatorID: "core", Passed: false, CreatedAt: event.CreatedAt}
	event.Type = "attempt.failed"
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, nil, nil, []model.InvocationGateResult{failedGate}, event); err != nil {
		t.Fatal(err)
	}
	producer := run.ID
	artifact := model.Artifact{ID: "revalidated-output", UserID: run.UserID, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", ProducerInvocationID: &producer, ProducerAttempt: 1, ContentHash: "good", PayloadJSON: `{}`, CreatedAt: event.CreatedAt}
	ref := model.InvocationArtifactRef{ID: "revalidated-ref", UserID: run.UserID, InvocationID: run.ID, Direction: "output", BindingName: "images", ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, ArtifactType: artifact.ArtifactType, SchemaVersion: artifact.SchemaVersion, SchemaContentHash: artifact.SchemaContentHash, Revision: 1, Attempt: 1, Ordinal: 0, CreatedAt: event.CreatedAt}
	gate := model.InvocationGateResult{ID: "revalidated-gate", UserID: run.UserID, InvocationID: run.ID, ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, Attempt: 1, ExecutionOrdinal: 2, Layer: "schema", ValidatorID: "core", Passed: true, CreatedAt: event.CreatedAt}
	run.Status = model.InvocationStatusNeedsReview
	event.Type = "attempt.revalidated"
	if err := RevalidateInvocationAttemptTx(run, attempt, []model.Artifact{artifact}, []model.InvocationArtifactRef{ref}, []model.InvocationGateResult{gate}, event); err != nil {
		t.Fatal(err)
	}
	attempts, _ := ListInvocationAttempts(run.UserID, run.ID)
	if attempts[0].RawOutput != "immutable raw" {
		t.Fatalf("raw=%q", attempts[0].RawOutput)
	}
}

func TestRevalidateInvocationAttemptRejectsForgedAttemptIdentity(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*model.InvocationAttempt, *model.InvocationArtifactRef, *model.InvocationEvent)
	}{
		{name: "foreign_user", mutate: func(attempt *model.InvocationAttempt, _ *model.InvocationArtifactRef, _ *model.InvocationEvent) {
			attempt.UserID = "foreign"
		}},
		{name: "foreign_invocation", mutate: func(attempt *model.InvocationAttempt, _ *model.InvocationArtifactRef, _ *model.InvocationEvent) {
			attempt.InvocationID = "foreign"
		}},
		{name: "foreign_revision", mutate: func(attempt *model.InvocationAttempt, ref *model.InvocationArtifactRef, event *model.InvocationEvent) {
			attempt.Revision, ref.Revision, event.Revision = 2, 2, 2
		}},
		{name: "foreign_agent_run", mutate: func(attempt *model.InvocationAttempt, _ *model.InvocationArtifactRef, _ *model.InvocationEvent) {
			attempt.AgentRunID = "foreign"
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, run, attempt, _, _, _, event := claimedInvocationFixture(t, "revalidate-identity-"+test.name)
			agent.Status, agent.FinishedAt = model.AgentRunStatusFailed, event.CreatedAt
			run.Status = model.InvocationStatusFailed
			attempt.Status, attempt.RawOutput, attempt.ErrorClass, attempt.FinishedAt = string(model.AgentRunStatusFailed), "immutable raw", "output_schema", event.CreatedAt
			failedGate := model.InvocationGateResult{ID: "initial-failed-" + test.name, UserID: run.UserID, InvocationID: run.ID, ArtifactID: "candidate", ArtifactHash: "bad", Attempt: 1, ExecutionOrdinal: 1, Layer: "output_schema", ValidatorID: "core", Passed: false, CreatedAt: event.CreatedAt}
			event.Type = "attempt.failed"
			if err := FinalizeInvocationAttemptTx(agent, run, attempt, nil, nil, []model.InvocationGateResult{failedGate}, event); err != nil {
				t.Fatal(err)
			}
			producer := run.ID
			artifact := model.Artifact{ID: "corrected-" + test.name, UserID: run.UserID, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, ArtifactType: "image", SchemaVersion: "1.0.0", SchemaContentHash: "s", ProducerInvocationID: &producer, ProducerAttempt: 1, ContentHash: "good", PayloadJSON: `{}`, CreatedAt: event.CreatedAt}
			ref := model.InvocationArtifactRef{ID: "corrected-ref-" + test.name, UserID: run.UserID, InvocationID: run.ID, Direction: "output", BindingName: "images", ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, ArtifactType: artifact.ArtifactType, SchemaVersion: artifact.SchemaVersion, SchemaContentHash: artifact.SchemaContentHash, Revision: 1, Attempt: 1, CreatedAt: event.CreatedAt}
			gate := model.InvocationGateResult{ID: "corrected-gate-" + test.name, UserID: run.UserID, InvocationID: run.ID, ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, Attempt: 1, ExecutionOrdinal: 2, Layer: "schema", ValidatorID: "core", Passed: true, CreatedAt: event.CreatedAt}
			run.Status, event.Type = model.InvocationStatusNeedsReview, "attempt.revalidated"
			test.mutate(&attempt, &ref, &event)
			if err := RevalidateInvocationAttemptTx(run, attempt, []model.Artifact{artifact}, []model.InvocationArtifactRef{ref}, []model.InvocationGateResult{gate}, event); !errors.Is(err, ErrInvocationTransitionConflict) {
				t.Fatalf("err=%v", err)
			}
			savedRun, _, _ := GetUserInvocation(run.UserID, run.ID)
			attempts, _ := ListInvocationAttempts(run.UserID, run.ID)
			database, _ := DB()
			var outputs, outputRefs, gates int64
			database.Model(&model.Artifact{}).Where("producer_invocation_id = ?", run.ID).Count(&outputs)
			database.Model(&model.InvocationArtifactRef{}).Where("invocation_id = ? AND direction = ?", run.ID, "output").Count(&outputRefs)
			database.Model(&model.InvocationGateResult{}).Where("invocation_id = ?", run.ID).Count(&gates)
			if savedRun.Status != model.InvocationStatusFailed || attempts[0].RawOutput != "immutable raw" || outputs != 0 || outputRefs != 0 || gates != 1 {
				t.Fatalf("status=%s raw=%q outputs=%d refs=%d gates=%d", savedRun.Status, attempts[0].RawOutput, outputs, outputRefs, gates)
			}
		})
	}
}

func TestInvocationTransactionCrashRollsBackEveryQueueStepAfterReopen(t *testing.T) {
	for _, step := range []string{"run", "agent_run", "attempt", "ref:0", "event"} {
		t.Run(step, func(t *testing.T) {
			setupRepositoryTestDB(t)
			run := createInvocationFixture(t, "queue-crash-"+step, model.InvocationStatusAwaitingConfirmation)
			queued, attempt, agentRun, refs, event := queuedInvocationFixture(run.ID)
			cleanupFailpoint := setInvocationQueueFailpoint(func(current string) error {
				if current == step {
					return errors.New("crash")
				}
				return nil
			})
			err := QueueInvocationAttemptTx(queued, attempt, agentRun, refs, event)
			cleanupFailpoint()
			if err == nil {
				t.Fatal("expected failpoint error")
			}
			ResetForTest()
			database, reopenErr := DB()
			if reopenErr != nil {
				t.Fatal(reopenErr)
			}
			var agents, attempts int64
			database.Model(&model.AgentRun{}).Where("id = ?", agentRun.ID).Count(&agents)
			database.Model(&model.InvocationAttempt{}).Where("id = ?", attempt.ID).Count(&attempts)
			saved, _, _ := GetUserInvocation(run.UserID, run.ID)
			if agents != 0 || attempts != 0 || saved.Status != model.InvocationStatusAwaitingConfirmation {
				t.Fatalf("agents=%d attempts=%d status=%s", agents, attempts, saved.Status)
			}
		})
	}
}

func TestInvocationTransactionCrashRollsBackEveryFinalizeStepAfterReopen(t *testing.T) {
	for _, step := range []string{"agent_run", "attempt", "run", "artifact:0", "artifact:1", "ref:0", "ref:1", "gate:0", "gate:1", "event"} {
		t.Run(step, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agentRun, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "finalize-crash-"+step)
			cleanupFailpoint := setInvocationFinalizeFailpoint(func(current string) error {
				if current == step {
					return errors.New("crash")
				}
				return nil
			})
			err := FinalizeInvocationAttemptTx(agentRun, run, attempt, artifacts, refs, gates, event)
			cleanupFailpoint()
			if err == nil {
				t.Fatal("expected failpoint error")
			}
			ResetForTest()
			database, reopenErr := DB()
			if reopenErr != nil {
				t.Fatal(reopenErr)
			}
			var outputs int64
			database.Model(&model.Artifact{}).Where("producer_invocation_id = ?", run.ID).Count(&outputs)
			saved, _, _ := GetUserInvocation(run.UserID, run.ID)
			attempts, _ := ListInvocationAttempts(run.UserID, run.ID)
			if outputs != 0 || saved.Status != model.InvocationStatusRunning || len(attempts) != 1 || attempts[0].FinishedAt != "" {
				t.Fatalf("outputs=%d status=%s attempts=%#v", outputs, saved.Status, attempts)
			}
		})
	}
}

func TestFinalizeInvocationAttemptRejectsChangedCompletion(t *testing.T) {
	setupRepositoryTestDB(t)
	agentRun, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "finalize-changed")
	if err := FinalizeInvocationAttemptTx(agentRun, run, attempt, artifacts, refs, gates, event); err != nil {
		t.Fatal(err)
	}
	attempt.RawOutput = "changed"
	if err := FinalizeInvocationAttemptTx(agentRun, run, attempt, artifacts, refs, gates, event); !errors.Is(err, ErrInvocationCompletionConflict) {
		t.Fatalf("err=%v", err)
	}
}

func TestInvocationTransitionRaceConfirmCancel(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "confirm-cancel", model.InvocationStatusAwaitingConfirmation)
	queued, attempt, agentRun, refs, event := queuedInvocationFixture(run.ID)
	cancelled := run
	cancelled.Status = model.InvocationStatusCancelled
	cancelEvent := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "invocation.cancelled", Revision: 1, CreatedAt: run.CreatedAt}
	start := make(chan struct{})
	results := make(chan error, 2)
	go func() { <-start; results <- QueueInvocationAttemptTx(queued, attempt, agentRun, refs, event) }()
	go func() {
		<-start
		results <- TransitionInvocation(cancelled, cancelEvent, model.InvocationStatusAwaitingConfirmation)
	}()
	close(start)
	first, second := <-results, <-results
	if (first == nil) == (second == nil) {
		t.Fatalf("errors=%v, %v", first, second)
	}
}

func TestInvocationTransitionRaceDoubleFinalize(t *testing.T) {
	setupRepositoryTestDB(t)
	agentRun, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "double-finalize")
	start := make(chan struct{})
	results := make(chan error, 2)
	for range 2 {
		go func() {
			<-start
			results <- FinalizeInvocationAttemptTx(agentRun, run, attempt, artifacts, refs, gates, event)
		}()
	}
	close(start)
	first, second := <-results, <-results
	if (first == nil) == (second == nil) {
		t.Fatalf("errors=%v, %v", first, second)
	}
}

func TestInvocationTransitionRaceFinalizeCancel(t *testing.T) {
	setupRepositoryTestDB(t)
	agentRun, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "finalize-cancel")
	cancelled := run
	cancelled.Status = model.InvocationStatusCancelled
	cancelEvent := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "invocation.cancelled", Revision: 1, Attempt: 1, CreatedAt: run.UpdatedAt}
	start := make(chan struct{})
	results := make(chan error, 2)
	go func() {
		<-start
		results <- FinalizeInvocationAttemptTx(agentRun, run, attempt, artifacts, refs, gates, event)
	}()
	go func() {
		<-start
		results <- TransitionInvocation(cancelled, cancelEvent, model.InvocationStatusRunning)
	}()
	close(start)
	first, second := <-results, <-results
	if (first == nil) == (second == nil) {
		t.Fatalf("errors=%v, %v", first, second)
	}
}

func TestFinalizeInvocationAttemptRejectsCompletionAfterCancelRequested(t *testing.T) {
	for _, terminal := range []model.AgentRunStatus{model.AgentRunStatusNeedsReview, model.AgentRunStatusFailed} {
		t.Run(string(terminal), func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "cancel-race-"+string(terminal))
			database, _ := DB()
			if err := database.Model(&model.AgentRun{}).Where("id = ?", agent.ID).Update("status", model.AgentRunStatusCancelRequested).Error; err != nil {
				t.Fatal(err)
			}
			if terminal == model.AgentRunStatusFailed {
				agent.Status, run.Status, attempt.Status = terminal, model.InvocationStatusFailed, string(terminal)
				attempt.ErrorClass, event.Type = "execution_failure", "attempt.failed"
				artifacts, refs, gates = nil, nil, nil
			}
			if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); !errors.Is(err, ErrInvocationTransitionConflict) {
				t.Fatalf("err=%v", err)
			}
			savedAgent, _, _ := GetAgentRun(agent.ID)
			savedRun, _, _ := GetUserInvocation(run.UserID, run.ID)
			attempts, _ := ListInvocationAttempts(run.UserID, run.ID)
			var outputs int64
			database.Model(&model.Artifact{}).Where("producer_invocation_id = ?", run.ID).Count(&outputs)
			if savedAgent.Status != model.AgentRunStatusCancelRequested || savedRun.Status != model.InvocationStatusRunning || len(attempts) != 1 || attempts[0].Status != string(model.AgentRunStatusRunning) || outputs != 0 {
				t.Fatalf("agent=%s run=%s attempts=%#v outputs=%d", savedAgent.Status, savedRun.Status, attempts, outputs)
			}
		})
	}
}

func TestFinalizeInvocationAttemptAllowsCancelledAfterCancelRequested(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, _, _, _, event := claimedInvocationFixture(t, "cancel-race-cancelled")
	database, _ := DB()
	if err := database.Model(&model.AgentRun{}).Where("id = ?", agent.ID).Update("status", model.AgentRunStatusCancelRequested).Error; err != nil {
		t.Fatal(err)
	}
	agent.Status, run.Status, attempt.Status = model.AgentRunStatusCancelled, model.InvocationStatusCancelled, string(model.AgentRunStatusCancelled)
	attempt.ErrorClass, event.Type = "cancelled", "attempt.cancelled"
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, nil, nil, nil, event); err != nil {
		t.Fatal(err)
	}
}

func TestInvocationApplyAttemptIsIdempotentAndRejectsChangedTarget(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "apply-success", model.InvocationStatusApproved)
	run.LatestAttempt = 1
	run.ReviewedAttempt, run.ReviewedArtifactSetHash = 1, "set"
	database, _ := DB()
	database.Model(&model.InvocationRun{}).Where("id = ?", run.ID).Updates(map[string]any{"latest_attempt": 1, "reviewed_attempt": 1, "reviewed_artifact_set_hash": "set"})
	run.Status = model.InvocationStatusApplied
	attempt := model.InvocationApplyAttempt{ID: "apply-success-1", UserID: run.UserID, InvocationID: run.ID, IdempotencyKey: "key", RequestHash: "request", ArtifactSetHash: "set", Target: "setting", TargetID: "one", Attempt: 1, CreatedAt: run.CreatedAt, UpdatedAt: run.UpdatedAt}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "apply.succeeded", Revision: 1, Attempt: 1, CreatedAt: run.CreatedAt}
	adapterCalls := 0
	adapter := func(*gorm.DB) (json.RawMessage, error) { adapterCalls++; return json.RawMessage(`{"ok":true}`), nil }
	if _, created, err := ApplyInvocationTx(run, attempt, event, adapter); err != nil || !created {
		t.Fatalf("created=%v err=%v", created, err)
	}
	if _, created, err := ApplyInvocationTx(run, attempt, event, adapter); err != nil || created || adapterCalls != 1 {
		t.Fatalf("created=%v calls=%d err=%v", created, adapterCalls, err)
	}
	changed := attempt
	changed.TargetID = "two"
	if _, _, err := ApplyInvocationTx(run, changed, event, adapter); !errors.Is(err, ErrInvocationApplyConflict) {
		t.Fatalf("err=%v", err)
	}
}

func TestInvocationCreditReservationConcurrentReplayConsumesOnce(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, _, _, _, _, _, _ := claimedInvocationFixture(t, "credit-reserve-concurrent")
	seedInvocationCreditAccount(t, agent.ID, 5)
	start := make(chan struct{})
	results := make(chan error, 2)
	for range 2 {
		go func() {
			<-start
			_, err := ReserveInvocationAttemptCreditsTx(agent, invocationTestTime.Add(2*time.Minute).Format(time.RFC3339Nano))
			results <- err
		}()
	}
	close(start)
	if first, second := <-results, <-results; first != nil || second != nil {
		t.Fatalf("reservation errors=%v, %v", first, second)
	}
	assertInvocationCreditState(t, agent.ID, 95, 1, 0, 5, 0)
}

func TestInvocationCreditReservationAcceptsNoopRowsAfterExactReread(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, _, _, _, _, _, _ := claimedInvocationFixture(t, "credit-reserve-noop-rows")
	seedInvocationCreditAccount(t, agent.ID, 5)
	reserved, err := ReserveInvocationAttemptCreditsTx(agent, agent.StartedAt)
	if err != nil {
		t.Fatal(err)
	}
	attempts, err := ListInvocationAttempts(agent.UserID, agent.InvocationID)
	if err != nil || len(attempts) != 1 {
		t.Fatalf("attempts=%#v err=%v", attempts, err)
	}
	database, _ := DB()
	noRowsChanged := &gorm.DB{RowsAffected: 0}
	if err := verifyInvocationAgentCreditUpdateTx(database, noRowsChanged, reserved, 5, 0); err != nil {
		t.Fatalf("AgentRun no-op reread: %v", err)
	}
	if err := verifyInvocationAttemptCreditUpdateTx(database, noRowsChanged, attempts[0], 5, 0); err != nil {
		t.Fatalf("attempt no-op reread: %v", err)
	}
	if err := database.Model(&model.AgentRun{}).Where("id = ?", reserved.ID).Update("lease_owner", "other-worker").Error; err != nil {
		t.Fatal(err)
	}
	if err := verifyInvocationAgentCreditUpdateTx(database, noRowsChanged, reserved, 5, 0); !errors.Is(err, ErrInvocationTransitionConflict) {
		t.Fatalf("forged AgentRun reread err=%v", err)
	}
	if err := database.Model(&model.InvocationAttempt{}).Where("id = ?", attempts[0].ID).Update("agent_run_id", "other-agent").Error; err != nil {
		t.Fatal(err)
	}
	if err := verifyInvocationAttemptCreditUpdateTx(database, noRowsChanged, attempts[0], 5, 0); !errors.Is(err, ErrInvocationTransitionConflict) {
		t.Fatalf("forged attempt reread err=%v", err)
	}
}

func TestInvocationCreditReservationMySQLLocksContextForUpdate(t *testing.T) {
	database, err := gorm.Open(mysql.New(mysql.Config{DSN: "user:pass@tcp(localhost:3306)/db", SkipInitializeWithVersion: true}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, table string
		model       any
	}{
		{name: "agent_run", table: "AGENT_RUNS", model: &model.AgentRun{}},
		{name: "attempt", table: "INVOCATION_ATTEMPTS", model: &model.InvocationAttempt{}},
		{name: "run", table: "INVOCATION_RUNS", model: &model.InvocationRun{}},
	} {
		t.Run(test.name, func(t *testing.T) {
			query := invocationCreditContextLockQuery(database, test.model).Where("id = ?", "row-1").Find(test.model)
			sql := strings.ToUpper(query.Statement.SQL.String())
			t.Logf("lock sql=%s", sql)
			if !strings.Contains(sql, test.table) || !strings.Contains(sql, "FOR UPDATE") {
				t.Fatalf("lock sql=%s", sql)
			}
		})
	}
}

func TestFinalizeInvocationLocksSettlementContextInCreditOrder(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "finalize-credit-lock-order")
	seedInvocationCreditAccount(t, agent.ID, 5)
	reserved, err := ReserveInvocationAttemptCreditsTx(agent, agent.StartedAt)
	if err != nil {
		t.Fatal(err)
	}
	agent.CreditsReserved = reserved.CreditsReserved
	database, _ := DB()
	order := []string{}
	seen := map[string]bool{}
	record := func(tx *gorm.DB) {
		table := tx.Statement.Table
		if (table == "agent_runs" || table == "invocation_attempts" || table == "invocation_runs") && !seen[table] {
			seen[table] = true
			order = append(order, table)
		}
	}
	queryCallback, updateCallback := "test:finalize_credit_query_order", "test:finalize_credit_update_order"
	database.Callback().Query().Before("gorm:query").Register(queryCallback, record)
	database.Callback().Update().Before("gorm:update").Register(updateCallback, record)
	defer database.Callback().Query().Remove(queryCallback)
	defer database.Callback().Update().Remove(updateCallback)
	if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); err != nil {
		t.Fatal(err)
	}
	want := []string{"agent_runs", "invocation_attempts", "invocation_runs"}
	if !reflect.DeepEqual(order, want) {
		t.Fatalf("settlement lock order=%v want=%v", order, want)
	}
}

func TestFinalizeInvocationGateFailureConcurrentReplayRefundsOnce(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, _, _, _, event := claimedInvocationFixture(t, "credit-failed-concurrent")
	seedInvocationCreditAccount(t, agent.ID, 5)
	reserved, err := ReserveInvocationAttemptCreditsTx(agent, agent.StartedAt)
	if err != nil {
		t.Fatal(err)
	}
	agent.Credits, agent.CreditsReserved = reserved.Credits, reserved.CreditsReserved
	agent.Status = model.AgentRunStatusFailed
	run.Status = model.InvocationStatusFailed
	attempt.Status, attempt.ErrorClass = string(model.AgentRunStatusFailed), "output_schema"
	failedGate := model.InvocationGateResult{ID: "credit-failed-gate", UserID: run.UserID, InvocationID: run.ID, Attempt: attempt.Attempt, ExecutionOrdinal: 2, Layer: "output_schema", ValidatorID: "core", Passed: false, CreatedAt: event.CreatedAt}
	event.Type = "attempt.failed"
	start := make(chan struct{})
	results := make(chan error, 2)
	for range 2 {
		go func() {
			<-start
			results <- FinalizeInvocationAttemptTx(agent, run, attempt, nil, nil, []model.InvocationGateResult{failedGate}, event)
		}()
	}
	close(start)
	first, second := <-results, <-results
	if (first == nil) == (second == nil) {
		t.Fatalf("finalize errors=%v, %v", first, second)
	}
	assertInvocationCreditState(t, agent.ID, 100, 1, 1, 5, 5)
}

func TestFinalizeInvocationRejectsStoredAttemptAgentRunRebinding(t *testing.T) {
	setupRepositoryTestDB(t)
	agentA, runA, attemptA, _, _, _, eventA := claimedInvocationFixture(t, "binding-cas-a")
	runBBase := createInvocationFixture(t, "binding-cas-b", model.InvocationStatusAwaitingConfirmation)
	queuedB, attemptB, queuedAgentB, inputRefsB, queueEventB := queuedInvocationFixture(runBBase.ID)
	if err := QueueInvocationAttemptTx(queuedB, attemptB, queuedAgentB, inputRefsB, queueEventB); err != nil {
		t.Fatal(err)
	}
	agentB, ok, err := ClaimNextAgentRunWithInvocationTx("worker-1", time.Minute, 2)
	if err != nil || !ok || agentB.ID != queuedAgentB.ID {
		t.Fatalf("AgentRun B=%#v ok=%v err=%v", agentB, ok, err)
	}
	seedInvocationCreditAccount(t, agentA.ID, 5)
	database, _ := DB()
	if err := database.Model(&model.AgentRun{}).Where("id = ?", agentB.ID).Update("credits", 5).Error; err != nil {
		t.Fatal(err)
	}
	reservedA, err := ReserveInvocationAttemptCreditsTx(agentA, agentA.StartedAt)
	if err != nil {
		t.Fatal(err)
	}
	reservedB, err := ReserveInvocationAttemptCreditsTx(agentB, agentB.StartedAt)
	if err != nil {
		t.Fatal(err)
	}
	forgedAgent := reservedB
	forgedAgent.Status, forgedAgent.FinishedAt = model.AgentRunStatusFailed, eventA.CreatedAt
	forgedRun := runA
	forgedRun.Status = model.InvocationStatusFailed
	forgedAttempt := attemptA
	forgedAttempt.AgentRunID, forgedAttempt.Status, forgedAttempt.ErrorClass = reservedB.ID, string(model.AgentRunStatusFailed), "output_schema"
	forgedEvent := eventA
	forgedEvent.Type = "attempt.failed"
	if err := FinalizeInvocationAttemptTx(forgedAgent, forgedRun, forgedAttempt, nil, nil, nil, forgedEvent); !errors.Is(err, ErrInvocationTransitionConflict) {
		t.Fatalf("err=%v", err)
	}
	assertInvocationCreditState(t, reservedA.ID, 90, 1, 0, 5, 0)
	assertInvocationCreditState(t, reservedB.ID, 90, 1, 0, 5, 0)
	for _, item := range []struct {
		runID, agentID string
	}{
		{runID: runA.ID, agentID: reservedA.ID},
		{runID: runBBase.ID, agentID: reservedB.ID},
	} {
		savedRun, _, _ := GetUserInvocation("user-1", item.runID)
		savedAgent, _, _ := GetAgentRun(item.agentID)
		attempts, _ := ListInvocationAttempts("user-1", item.runID)
		if savedRun.Status != model.InvocationStatusRunning || savedAgent.Status != model.AgentRunStatusRunning || len(attempts) != 1 || attempts[0].Status != string(model.AgentRunStatusRunning) {
			t.Fatalf("run=%#v AgentRun=%#v attempts=%#v", savedRun, savedAgent, attempts)
		}
	}
}

func TestFinalizeInvocationSuccessRacesGateFailureWithConsistentSettlement(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "credit-success-failure-race")
	seedInvocationCreditAccount(t, agent.ID, 5)
	reserved, err := ReserveInvocationAttemptCreditsTx(agent, agent.StartedAt)
	if err != nil {
		t.Fatal(err)
	}
	agent.Credits, agent.CreditsReserved = reserved.Credits, reserved.CreditsReserved
	failedAgent, failedRun, failedAttempt, failedEvent := agent, run, attempt, event
	failedAgent.Status = model.AgentRunStatusFailed
	failedRun.Status = model.InvocationStatusFailed
	failedAttempt.Status, failedAttempt.ErrorClass = string(model.AgentRunStatusFailed), "output_schema"
	failedEvent.Type = "attempt.failed"
	failedGate := model.InvocationGateResult{ID: "credit-race-failed-gate", UserID: run.UserID, InvocationID: run.ID, Attempt: attempt.Attempt, ExecutionOrdinal: 2, Layer: "output_schema", ValidatorID: "core", Passed: false, CreatedAt: event.CreatedAt}
	start := make(chan struct{})
	results := make(chan error, 2)
	go func() {
		<-start
		results <- FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event)
	}()
	go func() {
		<-start
		results <- FinalizeInvocationAttemptTx(failedAgent, failedRun, failedAttempt, nil, nil, []model.InvocationGateResult{failedGate}, failedEvent)
	}()
	close(start)
	first, second := <-results, <-results
	if (first == nil) == (second == nil) {
		t.Fatalf("finalize errors=%v, %v", first, second)
	}
	saved, _, _ := GetUserInvocation(run.UserID, run.ID)
	outputs, _, _ := ListUserArtifacts(run.UserID, ArtifactQuery{ProducerInvocationID: run.ID, Page: 1, PageSize: 10})
	if saved.Status == model.InvocationStatusNeedsReview {
		if len(outputs) != len(artifacts) {
			t.Fatalf("success outputs=%d", len(outputs))
		}
		assertInvocationCreditState(t, agent.ID, 95, 1, 0, 5, 0)
	} else if saved.Status == model.InvocationStatusFailed {
		if len(outputs) != 0 {
			t.Fatalf("failed outputs=%d", len(outputs))
		}
		assertInvocationCreditState(t, agent.ID, 100, 1, 1, 5, 5)
	} else {
		t.Fatalf("status=%s", saved.Status)
	}
}

func TestInvocationCreditReservationFailpointsRollbackAndReplay(t *testing.T) {
	for _, step := range []string{"consume:log", "consume:balance", "agent_run", "attempt"} {
		t.Run(step, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, _, _, _, _, _, _ := claimedInvocationFixture(t, "credit-reserve-crash-"+strings.ReplaceAll(step, ":", "-"))
			seedInvocationCreditAccount(t, agent.ID, 5)
			cleanup := setInvocationCreditFailpoint(func(current string) error {
				if current == step {
					return errors.New("crash")
				}
				return nil
			})
			_, err := ReserveInvocationAttemptCreditsTx(agent, agent.StartedAt)
			cleanup()
			if err == nil {
				t.Fatal("expected failpoint error")
			}
			ResetForTest()
			assertInvocationCreditState(t, agent.ID, 100, 0, 0, 0, 0)
			if _, err := ReserveInvocationAttemptCreditsTx(agent, agent.StartedAt); err != nil {
				t.Fatal(err)
			}
			assertInvocationCreditState(t, agent.ID, 95, 1, 0, 5, 0)
		})
	}
}

func TestInvocationFinalizerSettlementFailpointsRollbackAndReplay(t *testing.T) {
	for _, step := range []string{"refund:balance", "refund:log", "artifact:0", "gate:0", "event"} {
		t.Run(step, func(t *testing.T) {
			setupRepositoryTestDB(t)
			agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "credit-finalize-crash-"+strings.ReplaceAll(step, ":", "-"))
			seedInvocationCreditAccount(t, agent.ID, 5)
			reserved, err := ReserveInvocationAttemptCreditsTx(agent, agent.StartedAt)
			if err != nil {
				t.Fatal(err)
			}
			agent.Credits, agent.CreditsReserved = reserved.Credits, reserved.CreditsReserved
			if step != "artifact:0" {
				agent.Status, run.Status, attempt.Status = model.AgentRunStatusFailed, model.InvocationStatusFailed, string(model.AgentRunStatusFailed)
				attempt.ErrorClass, event.Type = "output_schema", "attempt.failed"
				artifacts, refs = nil, nil
				gates = []model.InvocationGateResult{{ID: "credit-crash-gate-" + step, UserID: run.UserID, InvocationID: run.ID, Attempt: attempt.Attempt, ExecutionOrdinal: 2, Layer: "output_schema", ValidatorID: "core", Passed: false, CreatedAt: event.CreatedAt}}
			}
			cleanup := setInvocationFinalizeFailpoint(func(current string) error {
				if current == step {
					return errors.New("crash")
				}
				return nil
			})
			err = FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event)
			cleanup()
			if err == nil {
				t.Fatal("expected failpoint error")
			}
			ResetForTest()
			saved, _, _ := GetUserInvocation(run.UserID, run.ID)
			if saved.Status != model.InvocationStatusRunning {
				t.Fatalf("status=%s", saved.Status)
			}
			assertInvocationCreditState(t, agent.ID, 95, 1, 0, 5, 0)
			if err := FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event); err != nil {
				t.Fatal(err)
			}
			if run.Status == model.InvocationStatusFailed {
				assertInvocationCreditState(t, agent.ID, 100, 1, 1, 5, 5)
			} else {
				assertInvocationCreditState(t, agent.ID, 95, 1, 0, 5, 0)
			}
		})
	}
}

func TestRequeueExpiredCancelledInvocationRefundsReservation(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, _, _, _, _, _, _ := claimedInvocationFixture(t, "credit-reaper-cancel")
	seedInvocationCreditAccount(t, agent.ID, 5)
	if _, err := ReserveInvocationAttemptCreditsTx(agent, agent.StartedAt); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	database, _ := DB()
	if err := database.Model(&model.AgentRun{}).Where("id = ?", agent.ID).Updates(map[string]any{"status": model.AgentRunStatusCancelRequested, "lease_expires_at": now.Add(-time.Minute).Format(time.RFC3339Nano)}).Error; err != nil {
		t.Fatal(err)
	}
	if count, err := RequeueExpiredAgentRuns(now); err != nil || count != 1 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	assertInvocationCreditState(t, agent.ID, 100, 1, 1, 5, 5)
}

func TestInvocationCancelSuccessReaperRaceKeepsSettlementConsistent(t *testing.T) {
	setupRepositoryTestDB(t)
	agent, run, attempt, artifacts, refs, gates, event := claimedInvocationFixture(t, "credit-cancel-success-reaper")
	seedInvocationCreditAccount(t, agent.ID, 5)
	reserved, err := ReserveInvocationAttemptCreditsTx(agent, agent.StartedAt)
	if err != nil {
		t.Fatal(err)
	}
	agent.Credits, agent.CreditsReserved = reserved.Credits, reserved.CreditsReserved
	now := time.Now().UTC()
	database, _ := DB()
	database.Exec("PRAGMA busy_timeout = 5000")
	if err := database.Model(&model.AgentRun{}).Where("id = ?", agent.ID).Update("lease_expires_at", now.Add(-time.Minute).Format(time.RFC3339Nano)).Error; err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	done := make(chan struct{}, 3)
	go func() {
		<-start
		_ = FinalizeInvocationAttemptTx(agent, run, attempt, artifacts, refs, gates, event)
		done <- struct{}{}
	}()
	go func() {
		<-start
		_, _ = RequestAgentRunCancel(agent.UserID, agent.ID)
		done <- struct{}{}
	}()
	go func() {
		<-start
		_, _ = RequeueExpiredAgentRuns(now)
		done <- struct{}{}
	}()
	close(start)
	for range 3 {
		<-done
	}
	_, _ = RequeueExpiredAgentRuns(now.Add(time.Second))
	saved, _, _ := GetUserInvocation(run.UserID, run.ID)
	outputs, _, _ := ListUserArtifacts(run.UserID, ArtifactQuery{ProducerInvocationID: run.ID, Page: 1, PageSize: 10})
	switch saved.Status {
	case model.InvocationStatusNeedsReview:
		if len(outputs) != len(artifacts) {
			t.Fatalf("success outputs=%d", len(outputs))
		}
		assertInvocationCreditState(t, agent.ID, 95, 1, 0, 5, 0)
	case model.InvocationStatusCancelled, model.InvocationStatusFailed:
		if len(outputs) != 0 {
			t.Fatalf("terminal outputs=%d status=%s", len(outputs), saved.Status)
		}
		assertInvocationCreditState(t, agent.ID, 100, 1, 1, 5, 5)
	default:
		t.Fatalf("non-terminal status=%s", saved.Status)
	}
}

func seedInvocationCreditAccount(t *testing.T, agentRunID string, credits int) {
	t.Helper()
	stamp := invocationTestTime.Format(time.RFC3339Nano)
	if _, err := SaveUser(model.User{ID: "user-1", Username: "invocation-credit-user", Credits: 100, Status: model.UserStatusActive, CreatedAt: stamp, UpdatedAt: stamp}); err != nil {
		t.Fatal(err)
	}
	database, _ := DB()
	if err := database.Model(&model.AgentRun{}).Where("id = ?", agentRunID).Update("credits", credits).Error; err != nil {
		t.Fatal(err)
	}
}

func assertInvocationCreditState(t *testing.T, agentRunID string, balance int, consumeLogs, refundLogs int64, reserved, refunded int) {
	t.Helper()
	user, ok, err := GetUserByID("user-1")
	if err != nil || !ok || user.Credits != balance {
		t.Fatalf("user=%#v ok=%v err=%v", user, ok, err)
	}
	consume, _ := CountCreditLogsByRelatedIDAndType(agentRunID, model.CreditLogTypeAIConsume)
	refund, _ := CountCreditLogsByRelatedIDAndType(agentRunID, model.CreditLogTypeAIRefund)
	logs, _ := ListCreditLogsByRelatedID(agentRunID)
	for _, log := range logs {
		if log.Type == model.CreditLogTypeAIConsume && (log.ID != invocationCreditLogID(agentRunID, "consume") || log.Amount != -reserved) {
			t.Fatalf("consume log=%#v", log)
		}
		if log.Type == model.CreditLogTypeAIRefund && (log.ID != invocationCreditLogID(agentRunID, "refund") || log.Amount != refunded || log.Balance != balance) {
			t.Fatalf("refund log=%#v", log)
		}
	}
	agent, ok, err := GetAgentRun(agentRunID)
	if err != nil || !ok {
		t.Fatalf("AgentRun=%#v ok=%v err=%v", agent, ok, err)
	}
	attempts, err := ListInvocationAttempts(agent.UserID, agent.InvocationID)
	if err != nil || len(attempts) != 1 || consume != consumeLogs || refund != refundLogs || agent.CreditsReserved != reserved || agent.CreditsRefunded != refunded || attempts[0].CreditsReserved != reserved || attempts[0].CreditsRefunded != refunded {
		t.Fatalf("consume=%d refund=%d AgentRun=%#v attempts=%#v err=%v", consume, refund, agent, attempts, err)
	}
}

func TestInvocationApplyLocksRunBeforeReservation(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "apply-lock-order", model.InvocationStatusApproved)
	run.LatestAttempt, run.ReviewedAttempt, run.ReviewedArtifactSetHash = 1, 1, "set"
	database, _ := DB()
	database.Model(&model.InvocationRun{}).Where("id = ?", run.ID).Updates(map[string]any{"latest_attempt": 1, "reviewed_attempt": 1, "reviewed_artifact_set_hash": "set"})
	run.Status = model.InvocationStatusApplied
	attempt := model.InvocationApplyAttempt{ID: "apply-lock-order-1", UserID: run.UserID, InvocationID: run.ID, IdempotencyKey: "key", RequestHash: "request", ArtifactSetHash: "set", Target: "setting", TargetID: "one", Attempt: 1}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Revision: 1, Attempt: 1}
	runLocked, reservationBeforeLock, reservationOnConflict := false, false, false
	updateCallback := "test:apply_run_lock"
	createCallback := "test:apply_reservation"
	database.Callback().Update().Before("gorm:update").Register(updateCallback, func(tx *gorm.DB) {
		if tx.Statement.Table == "invocation_runs" {
			runLocked = true
		}
	})
	database.Callback().Create().Before("gorm:create").Register(createCallback, func(tx *gorm.DB) {
		if tx.Statement.Table == "invocation_apply_attempts" {
			reservationBeforeLock = !runLocked
			_, reservationOnConflict = tx.Statement.Clauses["ON CONFLICT"]
		}
	})
	defer database.Callback().Update().Remove(updateCallback)
	defer database.Callback().Create().Remove(createCallback)
	if _, created, err := ApplyInvocationTx(run, attempt, event, func(*gorm.DB) (json.RawMessage, error) { return json.RawMessage(`{}`), nil }); err != nil || !created {
		t.Fatalf("created=%v err=%v", created, err)
	}
	if reservationBeforeLock || reservationOnConflict {
		t.Fatalf("beforeLock=%v onConflict=%v", reservationBeforeLock, reservationOnConflict)
	}
}

func TestInvocationApplyMySQLUsesForUpdateAndPlainInsert(t *testing.T) {
	database, err := gorm.Open(mysql.New(mysql.Config{DSN: "user:pass@tcp(localhost:3306)/db", SkipInitializeWithVersion: true}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	var run model.InvocationRun
	lock := invocationRunApplyLockQuery(database, "invocation-1", "user-1").First(&run)
	lockSQL := strings.ToUpper(lock.Statement.SQL.String())
	if !strings.Contains(lockSQL, "INVOCATION_RUNS") || !strings.Contains(lockSQL, "FOR UPDATE") {
		t.Fatalf("lock sql=%s", lockSQL)
	}
	reservation := database.Create(&model.InvocationApplyAttempt{ID: "apply-1", UserID: "user-1", InvocationID: "invocation-1", IdempotencyKey: "key"})
	reservationSQL := strings.ToUpper(reservation.Statement.SQL.String())
	if strings.Contains(reservationSQL, "ON DUPLICATE") || strings.Contains(reservationSQL, "ON CONFLICT") {
		t.Fatalf("reservation sql=%s", reservationSQL)
	}
}

func TestInvocationApplyAttemptConcurrentReservationCallsAdapterOnce(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "apply-race", model.InvocationStatusApproved)
	run.LatestAttempt = 1
	run.ReviewedAttempt = 1
	run.ReviewedArtifactSetHash = "set"
	db, _ := DB()
	db.Exec("PRAGMA journal_mode = WAL")
	db.Exec("PRAGMA busy_timeout = 5000")
	db.Model(&model.InvocationRun{}).Where("id = ?", run.ID).Updates(map[string]any{"latest_attempt": 1, "reviewed_attempt": 1, "reviewed_artifact_set_hash": "set"})
	run.Status = model.InvocationStatusApplied
	attempt := model.InvocationApplyAttempt{ID: "apply-race-1", UserID: run.UserID, InvocationID: run.ID, IdempotencyKey: "same", RequestHash: "request", ArtifactSetHash: "set", Target: "setting", TargetID: "one", Attempt: 1, CreatedAt: run.CreatedAt, UpdatedAt: run.UpdatedAt}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "apply.succeeded", Revision: 1, Attempt: 1, CreatedAt: run.CreatedAt}
	arrived := make(chan struct{}, 2)
	release := make(chan struct{})
	cleanup := setInvocationApplyBarrier(func(step string) {
		if step == "before_reservation" {
			arrived <- struct{}{}
			<-release
		}
	})
	defer cleanup()
	var calls atomic.Int32
	results := make(chan error, 2)
	createds := make(chan bool, 2)
	adapter := func(*gorm.DB) (json.RawMessage, error) { calls.Add(1); return json.RawMessage(`{"ok":true}`), nil }
	for range 2 {
		go func() {
			_, created, err := ApplyInvocationTx(run, attempt, event, adapter)
			createds <- created
			results <- err
		}()
	}
	<-arrived
	<-arrived
	close(release)
	createdCount := 0
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
		if <-createds {
			createdCount++
		}
	}
	if calls.Load() != 1 || createdCount != 1 {
		t.Fatalf("calls=%d created=%d", calls.Load(), createdCount)
	}
}

func TestInvocationApplyAttemptDBErrorRollsBackWithoutFakeSuccess(t *testing.T) {
	setupRepositoryTestDB(t)
	run := createInvocationFixture(t, "apply-db-error", model.InvocationStatusApproved)
	run.LatestAttempt = 1
	run.ReviewedAttempt = 1
	run.ReviewedArtifactSetHash = "set"
	db, _ := DB()
	db.Model(&model.InvocationRun{}).Where("id = ?", run.ID).Updates(map[string]any{"latest_attempt": 1, "reviewed_attempt": 1, "reviewed_artifact_set_hash": "set"})
	run.Status = model.InvocationStatusApplied
	attempt := model.InvocationApplyAttempt{ID: "apply-db-error-1", UserID: run.UserID, InvocationID: run.ID, IdempotencyKey: "key", RequestHash: "request", ArtifactSetHash: "set", Target: "setting", TargetID: "one", Attempt: 1, CreatedAt: run.CreatedAt, UpdatedAt: run.UpdatedAt}
	event := model.InvocationEvent{ID: 1, UserID: run.UserID, InvocationID: run.ID, Type: "apply.succeeded", Revision: 1, Attempt: 1, CreatedAt: run.CreatedAt}
	_, created, err := ApplyInvocationTx(run, attempt, event, func(tx *gorm.DB) (json.RawMessage, error) {
		return json.RawMessage(`{}`), tx.Create(&model.Setting{Key: "apply-must-rollback", Value: json.RawMessage(`"x"`)}).Error
	})
	if err == nil || created {
		t.Fatalf("created=%v err=%v", created, err)
	}
	var settings, attempts int64
	db.Model(&model.Setting{}).Where("key = ?", "apply-must-rollback").Count(&settings)
	db.Model(&model.InvocationApplyAttempt{}).Where("id = ?", attempt.ID).Count(&attempts)
	if settings != 0 || attempts != 0 {
		t.Fatalf("settings=%d attempts=%d", settings, attempts)
	}
}
