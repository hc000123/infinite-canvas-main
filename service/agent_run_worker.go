package service

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type AgentRunWorkerOptions struct {
	ID                string
	PollInterval      time.Duration
	LeaseDuration     time.Duration
	HeartbeatInterval time.Duration
	MaxConcurrency    int
	UserConcurrency   int
	Now               func() time.Time
	HTTPClient        *http.Client
	Executor          AgentRunExecutor
}

type AgentRunWorker struct {
	id                string
	pollInterval      time.Duration
	leaseDuration     time.Duration
	heartbeatInterval time.Duration
	maxConcurrency    int
	userConcurrency   int
	now               func() time.Time
	executor          AgentRunExecutor
}

type agentRunCallResult struct {
	rawOutput      string
	structuredJSON string
	toolTraceJSON  string
	message        string
	errorClass     string
	retryable      bool
}

func NewAgentRunWorker(options AgentRunWorkerOptions) *AgentRunWorker {
	if strings.TrimSpace(options.ID) == "" {
		options.ID = "workflow-worker"
	}
	if options.PollInterval <= 0 {
		options.PollInterval = 2 * time.Second
	}
	if options.LeaseDuration <= 0 {
		options.LeaseDuration = time.Minute
	}
	if options.HeartbeatInterval <= 0 || options.HeartbeatInterval >= options.LeaseDuration {
		options.HeartbeatInterval = options.LeaseDuration / 6
	}
	if options.MaxConcurrency <= 0 {
		options.MaxConcurrency = 2
	}
	if options.UserConcurrency <= 0 {
		options.UserConcurrency = 1
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.Executor == nil {
		options.Executor = NewAPIAgentRunExecutor(options.HTTPClient)
	}
	return &AgentRunWorker{
		id:                strings.TrimSpace(options.ID),
		pollInterval:      options.PollInterval,
		leaseDuration:     options.LeaseDuration,
		heartbeatInterval: options.HeartbeatInterval,
		maxConcurrency:    options.MaxConcurrency,
		userConcurrency:   options.UserConcurrency,
		now:               options.Now,
		executor:          options.Executor,
	}
}

func (w *AgentRunWorker) Run(ctx context.Context) {
	var workers sync.WaitGroup
	for range w.maxConcurrency {
		workers.Add(1)
		go func() {
			defer workers.Done()
			w.runLoop(ctx)
		}()
	}
	workers.Wait()
}

func (w *AgentRunWorker) runLoop(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		_ = w.ProcessOne(ctx)
		timer := time.NewTimer(w.pollInterval)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return
		case <-timer.C:
		}
	}
}

func (w *AgentRunWorker) ProcessOne(ctx context.Context) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	currentTime := w.now().UTC()
	markWorkflowWorkerHeartbeat(w.id, currentTime)
	if _, err := repository.RequeueExpiredAgentRuns(currentTime); err != nil {
		return err
	}
	run, ok, err := repository.ClaimNextAgentRunWithInvocationTx(w.id, w.leaseDuration, w.userConcurrency)
	if err != nil || !ok {
		return err
	}
	return w.execute(ctx, run)
}

func (w *AgentRunWorker) execute(ctx context.Context, run model.AgentRun) error {
	if run.InvocationID != "" {
		return w.executeInvocation(ctx, run)
	}
	leaseOwner := run.LeaseOwner
	if err := SyncWorkflowStageFromAgentRun(run); err != nil {
		return err
	}
	frozenExecutor := strings.TrimSpace(run.Executor)
	if frozenExecutor == "" {
		frozenExecutor = AgentRunExecutorAPI
	}
	if frozenExecutor != w.executor.Kind() {
		return w.finishFailure(&run, leaseOwner, "任务执行器与当前 Worker 不匹配", false)
	}
	if cancelled, err := agentRunCancellationRequested(run.ID); err != nil {
		return err
	} else if cancelled {
		return w.finishCancelled(&run, leaseOwner)
	}
	if err := w.executor.ReserveCredits(&run); err != nil {
		return w.finishFailure(&run, leaseOwner, err.Error(), false)
	}
	if _, saved, err := repository.SaveLeasedAgentRun(run, leaseOwner); err != nil {
		return err
	} else if !saved {
		return errors.New("Agent Run 租约已失效")
	}

	callCtx, cancel := context.WithCancel(ctx)
	monitorDone := make(chan struct{})
	go w.maintainLease(callCtx, run.ID, cancel, monitorDone)
	startedAt := time.Now()
	result := w.executor.Call(callCtx, run)
	cancel()
	<-monitorDone
	run.DurationMs = time.Since(startedAt).Milliseconds()

	cancelled, cancelErr := agentRunCancellationRequested(run.ID)
	if cancelErr != nil {
		return cancelErr
	}
	if cancelled {
		return w.finishCancelled(&run, leaseOwner)
	}
	if result.message != "" {
		return w.finishFailure(&run, leaseOwner, result.message, result.retryable)
	}
	run.RawOutput = result.rawOutput
	run.StructuredDraftJSON = result.structuredJSON
	run.Status = model.AgentRunStatusNeedsReview
	run.ErrorMessage = ""
	run.FinishedAt = workerTime(w.now())
	run.UpdatedAt = run.FinishedAt
	clearAgentRunLease(&run)
	_, saved, err := repository.SaveLeasedAgentRun(run, leaseOwner)
	if err != nil {
		return err
	}
	if !saved {
		return errors.New("Agent Run 完成时租约已失效")
	}
	return CompleteWorkflowStageAgentRun(run)
}

func (w *AgentRunWorker) executeInvocation(ctx context.Context, run model.AgentRun) error {
	if err := validateClaimedInvocationAgentRun(run); err != nil {
		return w.finishInvocationFailure(&run, "execution_target_unavailable", err.Error())
	}
	frozenExecutor := strings.TrimSpace(run.Executor)
	if frozenExecutor == "" || frozenExecutor != w.executor.Kind() {
		return w.finishInvocationFailure(&run, "execution_target_unavailable", "任务执行器与当前 Worker 不匹配")
	}
	if err := w.executor.Available(ctx); err != nil {
		return w.finishInvocationFailure(&run, "execution_target_unavailable", err.Error())
	}
	if cancelled, err := agentRunCancellationRequested(run.ID); err != nil {
		return err
	} else if cancelled {
		return w.finishInvocationCancelled(&run)
	}
	reservedRun, err := repository.ReserveInvocationAttemptCreditsTx(run, workerTime(w.now()))
	if err != nil {
		return w.finishInvocationFailure(&run, "execution_target_unavailable", err.Error())
	}
	run = reservedRun
	if err := validateClaimedInvocationAgentRun(run); err != nil {
		return w.finishInvocationFailure(&run, "execution_target_unavailable", err.Error())
	}
	callCtx, cancel := context.WithCancel(ctx)
	monitorDone := make(chan struct{})
	go w.maintainLease(callCtx, run.ID, cancel, monitorDone)
	startedAt := time.Now()
	result := w.executor.Call(callCtx, run)
	cancel()
	<-monitorDone
	run.DurationMs = time.Since(startedAt).Milliseconds()
	if cancelled, err := agentRunCancellationRequested(run.ID); err != nil {
		return err
	} else if cancelled {
		return w.finishInvocationCancelled(&run)
	}
	if result.message != "" {
		errorClass := result.errorClass
		if errorClass == "" {
			errorClass = "execution_failure"
		}
		return w.finishInvocationFailure(&run, errorClass, result.message)
	}
	err = finalizeInvocationAgentRun(run, result, workerTime(w.now()))
	if !errors.Is(err, repository.ErrInvocationTransitionConflict) {
		return err
	}
	current, ok, readErr := repository.GetAgentRun(run.ID)
	if readErr != nil {
		return readErr
	}
	if !ok || current.Status != model.AgentRunStatusCancelRequested {
		return err
	}
	return w.finishInvocationCancelled(&current)
}

func (w *AgentRunWorker) finishInvocationFailure(run *model.AgentRun, errorClass, message string) error {
	return finalizeInvocationTerminal(*run, model.AgentRunStatusFailed, model.InvocationStatusFailed, errorClass, strings.TrimSpace(message), workerTime(w.now()))
}

func (w *AgentRunWorker) finishInvocationCancelled(run *model.AgentRun) error {
	return finalizeInvocationTerminal(*run, model.AgentRunStatusCancelled, model.InvocationStatusCancelled, "cancelled", "", workerTime(w.now()))
}

func (w *AgentRunWorker) maintainLease(ctx context.Context, id string, cancel context.CancelFunc, done chan<- struct{}) {
	defer close(done)
	ticker := time.NewTicker(w.heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cancelled, err := agentRunCancellationRequested(id)
			if err != nil || cancelled {
				cancel()
				return
			}
			renewed, err := repository.RenewAgentRunLease(id, w.id, w.now().UTC(), w.leaseDuration)
			if err != nil || !renewed {
				cancel()
				return
			}
		}
	}
}

func (w *AgentRunWorker) finishFailure(run *model.AgentRun, leaseOwner string, message string, retryable bool) error {
	if err := w.executor.RefundCredits(run); err != nil {
		return err
	}
	stamp := workerTime(w.now())
	run.ErrorMessage = strings.TrimSpace(message)
	run.UpdatedAt = stamp
	if retryable && (run.MaxAttempts <= 0 || run.Attempt < run.MaxAttempts) {
		run.Status = model.AgentRunStatusQueued
		run.AvailableAt = w.now().UTC().Add(agentRunRetryDelay(run.Attempt)).Format(time.RFC3339Nano)
		run.FinishedAt = ""
	} else {
		run.Status = model.AgentRunStatusFailed
		run.FinishedAt = stamp
	}
	clearAgentRunLease(run)
	_, saved, err := repository.SaveLeasedAgentRun(*run, leaseOwner)
	if err != nil {
		return err
	}
	if !saved {
		return errors.New("Agent Run 失败写入时租约已失效")
	}
	return SyncWorkflowStageFromAgentRun(*run)
}

func (w *AgentRunWorker) finishCancelled(run *model.AgentRun, leaseOwner string) error {
	if err := w.executor.RefundCredits(run); err != nil {
		return err
	}
	stamp := workerTime(w.now())
	run.Status = model.AgentRunStatusCancelled
	run.ErrorMessage = ""
	run.FinishedAt = stamp
	run.UpdatedAt = stamp
	clearAgentRunLease(run)
	_, saved, err := repository.SaveLeasedAgentRun(*run, leaseOwner)
	if err != nil {
		return err
	}
	if !saved {
		return errors.New("Agent Run 取消写入时租约已失效")
	}
	return SyncWorkflowStageFromAgentRun(*run)
}

func reserveAgentRunCredits(run *model.AgentRun) error {
	reserved, refunded, err := agentRunCreditTotals(run.ID)
	if err != nil {
		return err
	}
	run.CreditsReserved = reserved
	run.CreditsRefunded = refunded
	if reserved > refunded || run.Credits <= 0 {
		return nil
	}
	charged, err := ConsumeUserCreditsForTask(run.UserID, run.Model, run.Credits, "/agent-runs", run.ID)
	if err != nil {
		return err
	}
	if charged {
		run.CreditsReserved += run.Credits
	}
	return nil
}

func refundAgentRunCredits(run *model.AgentRun) error {
	reserved, refunded, err := agentRunCreditTotals(run.ID)
	if err != nil {
		return err
	}
	run.CreditsReserved = reserved
	run.CreditsRefunded = refunded
	amount := reserved - refunded
	if amount <= 0 {
		return nil
	}
	if err := RefundUserCreditsForTask(run.UserID, run.Model, amount, "/agent-runs", run.ID); err != nil {
		return err
	}
	run.CreditsRefunded += amount
	return nil
}

func agentRunCreditTotals(id string) (int, int, error) {
	logs, err := repository.ListCreditLogsByRelatedID(id)
	if err != nil {
		return 0, 0, err
	}
	reserved := 0
	refunded := 0
	for _, log := range logs {
		switch log.Type {
		case model.CreditLogTypeAIConsume:
			reserved -= log.Amount
		case model.CreditLogTypeAIRefund:
			refunded += log.Amount
		}
	}
	return reserved, refunded, nil
}

func agentRunCancellationRequested(id string) (bool, error) {
	run, ok, err := repository.GetAgentRun(id)
	if err != nil || !ok {
		return false, err
	}
	return run.Status == model.AgentRunStatusCancelRequested || run.Status == model.AgentRunStatusCancelled, nil
}

func clearAgentRunLease(run *model.AgentRun) {
	run.LeaseOwner = ""
	run.LeaseExpiresAt = ""
	run.HeartbeatAt = ""
}

func agentRunRetryDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if attempt > 5 {
		attempt = 5
	}
	return time.Duration(1<<(attempt-1)) * time.Second
}

func workerTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}
