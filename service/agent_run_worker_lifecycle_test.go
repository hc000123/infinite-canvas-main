package service

import (
	"context"
	"net/http"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestWorkerStopsClaimingAfterCancellation(t *testing.T) {
	fixture := newAgentRunWorkerFixture(t, http.StatusOK, `{"choices":[{"message":{"content":"ok"}}]}`)
	run := fixture.queueRun(t, "cancel-before-run-loop")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	fixture.worker.Run(ctx)

	saved, ok, err := repository.GetAgentRun(run.ID)
	if err != nil || !ok || saved.Status != model.AgentRunStatusQueued || saved.Attempt != 0 {
		t.Fatalf("saved=%#v ok=%v err=%v", saved, ok, err)
	}
	if fixture.calls.Load() != 0 {
		t.Fatalf("upstream calls=%d, want 0", fixture.calls.Load())
	}
}
