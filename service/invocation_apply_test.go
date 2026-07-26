package service

import (
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

func approvedApplyFixture(t *testing.T) (model.InvocationRun, string) {
	t.Helper()
	run := needsReviewLifecycleFixture(t)
	refs, _ := repository.ListInvocationArtifactRefs("user-1", run.ID)
	hash := invocationArtifactSetHash(refs, run.LatestAttempt)
	response, err := ReviewInvocation("user-1", run.ID, InvocationReviewInput{Decision: "approved", Attempt: run.LatestAttempt, ArtifactSetHash: hash})
	if err != nil {
		t.Fatal(err)
	}
	return response.Run, hash
}

func approvedOutputArtifactID(t *testing.T, refs []model.InvocationArtifactRef) string {
	t.Helper()
	for _, ref := range refs {
		if ref.Direction == "output" {
			return ref.ArtifactID
		}
	}
	t.Fatal("approved output artifact missing")
	return ""
}

type invocationApplyAdapterFunc struct {
	name string
	fn   func(*gorm.DB, InvocationApplyContext) (json.RawMessage, error)
}

func (adapter invocationApplyAdapterFunc) TargetName() string { return adapter.name }
func (adapter invocationApplyAdapterFunc) ApplyTx(tx *gorm.DB, context InvocationApplyContext) (json.RawMessage, error) {
	return adapter.fn(tx, context)
}

func TestApplyInvocationIsServerOwnedAndIdempotent(t *testing.T) {
	run, hash := approvedApplyFixture(t)
	input := InvocationApplyInput{IdempotencyKey: "apply-key", Attempt: run.LatestAttempt, ArtifactSetHash: hash, Target: "test_sink", TargetID: "target-1"}
	first, err := ApplyInvocation("user-1", run.ID, input)
	if err != nil || first.Status != "applied" {
		t.Fatalf("first=%#v err=%v", first, err)
	}
	second, err := ApplyInvocation("user-1", run.ID, input)
	if err != nil || second.ID != first.ID || second.Status != "applied" {
		t.Fatalf("second=%#v err=%v", second, err)
	}
	changed := input
	changed.TargetID = "target-2"
	if _, err := ApplyInvocation("user-1", run.ID, changed); !errors.Is(err, repository.ErrInvocationApplyConflict) {
		t.Fatalf("changed err=%v", err)
	}
	arbitrary := input
	arbitrary.IdempotencyKey, arbitrary.Target = "other-key", "project"
	if _, err := ApplyInvocation("user-1", run.ID, arbitrary); err == nil {
		t.Fatal("expected arbitrary target rejection")
	}
	database, _ := repository.DB()
	var receipts int64
	database.Model(&model.InvocationTestSinkReceipt{}).Where("invocation_id = ?", run.ID).Count(&receipts)
	if receipts != 1 {
		t.Fatalf("receipts=%d", receipts)
	}
	stored, ok, err := repository.GetUserInvocation("user-1", run.ID)
	if err != nil || !ok || stored.Status != model.InvocationStatusApplied {
		t.Fatalf("stored=%#v ok=%v err=%v", stored, ok, err)
	}
}

func TestApplyInvocationFailedAdapterRollsBackAndNewKeyCanRetry(t *testing.T) {
	run, hash := approvedApplyFixture(t)
	original := invocationApplyAdapters["test_sink"]
	t.Cleanup(func() { invocationApplyAdapters["test_sink"] = original })
	invocationApplyAdapters["test_sink"] = invocationApplyAdapterFunc{name: "test_sink", fn: func(tx *gorm.DB, context InvocationApplyContext) (json.RawMessage, error) {
		receipt := model.InvocationTestSinkReceipt{ID: "rolled-back", UserID: context.UserID, InvocationID: context.InvocationID, ApplyAttemptID: context.ApplyAttemptID, TargetID: context.TargetID, ArtifactSetHash: context.ArtifactSetHash, CreatedAt: context.CreatedAt}
		if err := tx.Create(&receipt).Error; err != nil {
			return nil, err
		}
		return nil, errors.New("sink failed")
	}}
	input := InvocationApplyInput{IdempotencyKey: "failed-key", Attempt: run.LatestAttempt, ArtifactSetHash: hash, Target: "test_sink", TargetID: "target-1"}
	failed, err := ApplyInvocation("user-1", run.ID, input)
	if err == nil || failed.Status != "failed" {
		t.Fatalf("failed=%#v err=%v", failed, err)
	}
	database, _ := repository.DB()
	var count int64
	database.Model(&model.InvocationTestSinkReceipt{}).Where("invocation_id = ?", run.ID).Count(&count)
	if count != 0 {
		t.Fatalf("rolled back receipts=%d", count)
	}
	stored, _, _ := repository.GetUserInvocation("user-1", run.ID)
	if stored.Status != model.InvocationStatusApproved {
		t.Fatalf("stored=%#v", stored)
	}
	invocationApplyAdapters["test_sink"] = original
	input.IdempotencyKey = "success-key"
	applied, err := ApplyInvocation("user-1", run.ID, input)
	if err != nil || applied.Status != "applied" {
		t.Fatalf("applied=%#v err=%v", applied, err)
	}
	events, _ := repository.ListInvocationEvents("user-1", run.ID, 0, model.MaxPageSize)
	foundFailed, foundApplied := false, false
	for _, event := range events {
		foundFailed = foundFailed || event.Type == "apply.failed"
		foundApplied = foundApplied || event.Type == "apply.applied"
	}
	if !foundFailed || !foundApplied {
		t.Fatalf("events=%#v", events)
	}
}

func TestApplyInvocationConcurrentReplayWritesSinkOnce(t *testing.T) {
	run, hash := approvedApplyFixture(t)
	original := invocationApplyAdapters["test_sink"]
	t.Cleanup(func() { invocationApplyAdapters["test_sink"] = original })
	var calls atomic.Int64
	base := original
	invocationApplyAdapters["test_sink"] = invocationApplyAdapterFunc{name: "test_sink", fn: func(tx *gorm.DB, context InvocationApplyContext) (json.RawMessage, error) {
		calls.Add(1)
		return base.ApplyTx(tx, context)
	}}
	input := InvocationApplyInput{IdempotencyKey: "concurrent-key", Attempt: run.LatestAttempt, ArtifactSetHash: hash, Target: "test_sink", TargetID: "target-1"}
	start := make(chan struct{})
	errs := make(chan error, 8)
	var wait sync.WaitGroup
	for range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			_, err := ApplyInvocation("user-1", run.ID, input)
			errs <- err
		}()
	}
	close(start)
	wait.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("adapter calls=%d", calls.Load())
	}
	database, _ := repository.DB()
	var count int64
	database.Model(&model.InvocationTestSinkReceipt{}).Where("invocation_id = ?", run.ID).Count(&count)
	if count != 1 {
		t.Fatalf("receipts=%d", count)
	}
}

func TestClientLocalReceiptValidatesConsumerCoordinatesAndApprovedArtifacts(t *testing.T) {
	run, hash := approvedApplyFixture(t)
	refs, err := repository.ListInvocationArtifactRefs("user-1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	artifactID := approvedOutputArtifactID(t, refs)
	input := InvocationApplyInput{
		IdempotencyKey: "client-receipt-valid", Attempt: run.LatestAttempt, ArtifactSetHash: hash,
		Target: "client_local_receipt", TargetID: "image-workbench",
		Payload: json.RawMessage(`{"surface":"image","targetKind":"prompt","targetId":"image-workbench","artifactIds":["` + artifactID + `"]}`),
	}
	applied, err := ApplyInvocation("user-1", run.ID, input)
	if err != nil || applied.Status != "applied" {
		t.Fatalf("applied=%#v err=%v", applied, err)
	}
	var receipt struct {
		Surface     string   `json:"surface"`
		TargetKind  string   `json:"targetKind"`
		TargetID    string   `json:"targetId"`
		ArtifactIDs []string `json:"artifactIds"`
	}
	if json.Unmarshal([]byte(applied.ReceiptJSON), &receipt) != nil || receipt.Surface != "image" || receipt.TargetKind != "prompt" || receipt.TargetID != "image-workbench" || len(receipt.ArtifactIDs) != 1 || receipt.ArtifactIDs[0] != artifactID {
		t.Fatalf("receipt=%s", applied.ReceiptJSON)
	}

	for _, test := range []struct {
		name    string
		payload func(string) json.RawMessage
	}{
		{"invalid surface", func(id string) json.RawMessage {
			return json.RawMessage(`{"surface":"workflow","targetKind":"prompt","targetId":"target-1","artifactIds":["` + id + `"]}`)
		}},
		{"invalid target kind", func(id string) json.RawMessage {
			return json.RawMessage(`{"surface":"image","targetKind":"workflow","targetId":"target-1","artifactIds":["` + id + `"]}`)
		}},
		{"target mismatch", func(id string) json.RawMessage {
			return json.RawMessage(`{"surface":"image","targetKind":"prompt","targetId":"other","artifactIds":["` + id + `"]}`)
		}},
		{"foreign artifact", func(string) json.RawMessage {
			return json.RawMessage(`{"surface":"canvas","targetKind":"node","targetId":"target-1","artifactIds":["artifact-foreign"]}`)
		}},
		{"empty artifact set", func(string) json.RawMessage {
			return json.RawMessage(`{"surface":"canvas","targetKind":"message","targetId":"target-1","artifactIds":[]}`)
		}},
		{"too many artifacts", func(id string) json.RawMessage {
			ids := make([]string, 101)
			for index := range ids {
				ids[index] = id
			}
			payload, _ := json.Marshal(map[string]any{"surface": "canvas", "targetKind": "asset", "targetId": "target-1", "artifactIds": ids})
			return payload
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			candidate, candidateHash := approvedApplyFixture(t)
			candidateRefs, refErr := repository.ListInvocationArtifactRefs("user-1", candidate.ID)
			if refErr != nil {
				t.Fatal(refErr)
			}
			candidateArtifactID := approvedOutputArtifactID(t, candidateRefs)
			_, applyErr := ApplyInvocation("user-1", candidate.ID, InvocationApplyInput{
				IdempotencyKey: "client-receipt-invalid-" + test.name, Attempt: candidate.LatestAttempt, ArtifactSetHash: candidateHash,
				Target: "client_local_receipt", TargetID: "target-1", Payload: test.payload(candidateArtifactID),
			})
			if applyErr == nil {
				t.Fatal("expected invalid client receipt rejection")
			}
		})
	}
}
