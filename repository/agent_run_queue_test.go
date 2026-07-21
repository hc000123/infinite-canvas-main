package repository

import (
	"sync"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

func TestClaimAgentRunOnlyOnce(t *testing.T) {
	setupRepositoryTestDB(t)
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	run := queueTestAgentRun("run-claim", "idem-claim", now)
	if _, err := SaveAgentRun(run); err != nil {
		t.Fatalf("SaveAgentRun returned error: %v", err)
	}

	first, ok, err := ClaimNextAgentRun("worker-a", now, time.Minute)
	if err != nil || !ok || first.ID != run.ID {
		t.Fatalf("first claim run=%#v ok=%v err=%v", first, ok, err)
	}
	if first.Status != model.AgentRunStatusRunning || first.Attempt != 1 || first.LeaseOwner != "worker-a" {
		t.Fatalf("first claim fields=%#v", first)
	}
	if second, ok, err := ClaimNextAgentRun("worker-b", now, time.Minute); err != nil || ok {
		t.Fatalf("second claim run=%#v ok=%v err=%v", second, ok, err)
	}
}

func TestConcurrentWorkersClaimAgentRunOnce(t *testing.T) {
	setupRepositoryTestDB(t)
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	if _, err := SaveAgentRun(queueTestAgentRun("run-race", "idem-race", now)); err != nil {
		t.Fatalf("SaveAgentRun returned error: %v", err)
	}

	type result struct {
		ok  bool
		err error
	}
	results := make(chan result, 2)
	start := make(chan struct{})
	var workers sync.WaitGroup
	for _, workerID := range []string{"worker-a", "worker-b"} {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			_, ok, err := ClaimNextAgentRun(workerID, now, time.Minute)
			results <- result{ok: ok, err: err}
		}()
	}
	close(start)
	workers.Wait()
	close(results)

	claimed := 0
	for item := range results {
		if item.err != nil {
			t.Fatalf("ClaimNextAgentRun returned error: %v", item.err)
		}
		if item.ok {
			claimed++
		}
	}
	if claimed != 1 {
		t.Fatalf("claimed=%d, want 1", claimed)
	}
}

func TestClaimAgentRunRespectsPerUserConcurrency(t *testing.T) {
	setupRepositoryTestDB(t)
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	if _, err := SaveAgentRun(queueTestAgentRun("run-user-a", "idem-user-a", now)); err != nil {
		t.Fatalf("SaveAgentRun returned error: %v", err)
	}
	if _, err := SaveAgentRun(queueTestAgentRun("run-user-b", "idem-user-b", now)); err != nil {
		t.Fatalf("SaveAgentRun returned error: %v", err)
	}
	if _, ok, err := ClaimNextAgentRunWithUserLimit("worker-a", now, time.Minute, 1); err != nil || !ok {
		t.Fatalf("first claim ok=%v err=%v", ok, err)
	}
	if run, ok, err := ClaimNextAgentRunWithUserLimit("worker-b", now, time.Minute, 1); err != nil || ok {
		t.Fatalf("second same-user claim run=%#v ok=%v err=%v", run, ok, err)
	}
}

func TestSaveAgentRunIdempotently(t *testing.T) {
	setupRepositoryTestDB(t)
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	first, created, err := SaveAgentRunIdempotently(queueTestAgentRun("run-first", "same-key", now))
	if err != nil || !created {
		t.Fatalf("first save run=%#v created=%v err=%v", first, created, err)
	}
	second, createdAgain, err := SaveAgentRunIdempotently(queueTestAgentRun("run-second", "same-key", now))
	if err != nil || createdAgain || first.ID != second.ID {
		t.Fatalf("second save run=%#v created=%v err=%v", second, createdAgain, err)
	}
}

func TestRequeueExpiredAgentRuns(t *testing.T) {
	setupRepositoryTestDB(t)
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	run := queueTestAgentRun("run-expired", "idem-expired", now)
	run.Status = model.AgentRunStatusRunning
	run.Attempt = 1
	run.LeaseOwner = "dead-worker"
	run.LeaseExpiresAt = now.Add(-time.Minute).Format(time.RFC3339Nano)
	if _, err := SaveAgentRun(run); err != nil {
		t.Fatalf("SaveAgentRun returned error: %v", err)
	}

	count, err := RequeueExpiredAgentRuns(now)
	if err != nil || count != 1 {
		t.Fatalf("RequeueExpiredAgentRuns count=%d err=%v", count, err)
	}
	saved, ok, err := GetAgentRun(run.ID)
	if err != nil || !ok || saved.Status != model.AgentRunStatusQueued || saved.LeaseOwner != "" {
		t.Fatalf("saved=%#v ok=%v err=%v", saved, ok, err)
	}
}

func TestRenewAgentRunLeaseRequiresCurrentOwner(t *testing.T) {
	setupRepositoryTestDB(t)
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	if _, err := SaveAgentRun(queueTestAgentRun("run-renew", "idem-renew", now)); err != nil {
		t.Fatalf("SaveAgentRun returned error: %v", err)
	}
	if _, ok, err := ClaimNextAgentRun("worker-a", now, time.Minute); err != nil || !ok {
		t.Fatalf("ClaimNextAgentRun ok=%v err=%v", ok, err)
	}
	if renewed, err := RenewAgentRunLease("run-renew", "worker-b", now.Add(10*time.Second), time.Minute); err != nil || renewed {
		t.Fatalf("wrong owner renewed=%v err=%v", renewed, err)
	}
	if renewed, err := RenewAgentRunLease("run-renew", "worker-a", now.Add(10*time.Second), time.Minute); err != nil || !renewed {
		t.Fatalf("current owner renewed=%v err=%v", renewed, err)
	}
}

func TestRequestAgentRunCancelPreventsClaim(t *testing.T) {
	setupRepositoryTestDB(t)
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	run := queueTestAgentRun("run-cancel", "idem-cancel", now)
	if _, err := SaveAgentRun(run); err != nil {
		t.Fatalf("SaveAgentRun returned error: %v", err)
	}

	cancelled, err := RequestAgentRunCancel("user-1", run.ID)
	if err != nil || cancelled.Status != model.AgentRunStatusCancelled {
		t.Fatalf("cancelled=%#v err=%v", cancelled, err)
	}
	if claimed, ok, err := ClaimNextAgentRun("worker-a", now, time.Minute); err != nil || ok {
		t.Fatalf("claimed=%#v ok=%v err=%v", claimed, ok, err)
	}
}

func queueTestAgentRun(id string, key string, now time.Time) model.AgentRun {
	return model.AgentRun{
		ID:             id,
		UserID:         "user-1",
		Status:         model.AgentRunStatusQueued,
		IdempotencyKey: &key,
		MaxAttempts:    3,
		AvailableAt:    now.Format(time.RFC3339Nano),
		CreatedAt:      now.Format(time.RFC3339Nano),
		UpdatedAt:      now.Format(time.RFC3339Nano),
	}
}
