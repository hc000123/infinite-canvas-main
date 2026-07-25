package repository

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrInvocationNotFound            = errors.New("invocation not found")
	ErrInvocationIdempotencyConflict = errors.New("invocation idempotency conflict")
	ErrInvocationTransitionConflict  = errors.New("invocation transition conflict")
	ErrInvocationAttemptFinalized    = errors.New("invocation attempt already finalized")
	ErrInvocationCompletionConflict  = errors.New("invocation completion conflict")
	ErrInvocationApplyConflict       = errors.New("invocation apply conflict")
)

// Test-only hooks. They stay nil in production and deliberately remain package-private.
var invocationHooks struct {
	sync.RWMutex
	queue, finalize       func(string) error
	claim, apply, requeue func(string)
}

func setInvocationQueueFailpoint(hook func(string) error) func() {
	invocationHooks.Lock()
	invocationHooks.queue = hook
	invocationHooks.Unlock()
	return func() { invocationHooks.Lock(); invocationHooks.queue = nil; invocationHooks.Unlock() }
}
func setInvocationFinalizeFailpoint(hook func(string) error) func() {
	invocationHooks.Lock()
	invocationHooks.finalize = hook
	invocationHooks.Unlock()
	return func() { invocationHooks.Lock(); invocationHooks.finalize = nil; invocationHooks.Unlock() }
}
func setInvocationClaimBarrier(hook func(string)) func() {
	invocationHooks.Lock()
	invocationHooks.claim = hook
	invocationHooks.Unlock()
	return func() { invocationHooks.Lock(); invocationHooks.claim = nil; invocationHooks.Unlock() }
}
func setInvocationApplyBarrier(hook func(string)) func() {
	invocationHooks.Lock()
	invocationHooks.apply = hook
	invocationHooks.Unlock()
	return func() { invocationHooks.Lock(); invocationHooks.apply = nil; invocationHooks.Unlock() }
}
func setInvocationRequeueBarrier(hook func(string)) func() {
	invocationHooks.Lock()
	invocationHooks.requeue = hook
	invocationHooks.Unlock()
	return func() { invocationHooks.Lock(); invocationHooks.requeue = nil; invocationHooks.Unlock() }
}
func invokeRepositoryHook(kind, step string) error {
	invocationHooks.RLock()
	queue, finalize, claim, apply, requeue := invocationHooks.queue, invocationHooks.finalize, invocationHooks.claim, invocationHooks.apply, invocationHooks.requeue
	invocationHooks.RUnlock()
	switch kind {
	case "queue":
		if queue != nil {
			return queue(step)
		}
	case "finalize":
		if finalize != nil {
			return finalize(step)
		}
	case "claim":
		if claim != nil {
			claim(step)
		}
	case "apply":
		if apply != nil {
			apply(step)
		}
	case "requeue":
		if requeue != nil {
			requeue(step)
		}
	}
	return nil
}

func CreateInvocationAggregateIdempotently(run model.InvocationRun, revision model.InvocationPreflightRevision, refs []model.InvocationArtifactRef, event model.InvocationEvent) (model.InvocationRun, bool, error) {
	database, err := DB()
	if err != nil {
		return run, false, err
	}
	key := ""
	if run.IdempotencyKey != nil {
		key = strings.TrimSpace(*run.IdempotencyKey)
	}
	if key == "" {
		run.IdempotencyKey = nil
	} else {
		run.IdempotencyKey = &key
	}
	lookup := func(db *gorm.DB) (model.InvocationRun, bool, error) {
		if key == "" {
			return model.InvocationRun{}, false, nil
		}
		var existing model.InvocationRun
		result := db.Where("user_id = ? AND idempotency_key = ?", strings.TrimSpace(run.UserID), key).Limit(1).Find(&existing)
		return existing, result.RowsAffected == 1, result.Error
	}
	if existing, ok, lookupErr := lookup(database); lookupErr != nil {
		return run, false, lookupErr
	} else if ok {
		if existing.RequestHash != run.RequestHash {
			return existing, false, ErrInvocationIdempotencyConflict
		}
		return existing, false, nil
	}
	if err := validateRevisionEnvelope(run, revision, refs, event); err != nil {
		return run, false, err
	}
	err = database.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&run).Error; err != nil {
			return err
		}
		if err := tx.Create(&revision).Error; err != nil {
			return err
		}
		if len(refs) > 0 {
			if err := tx.Create(&refs).Error; err != nil {
				return err
			}
		}
		return tx.Create(&event).Error
	})
	if err == nil {
		return run, true, nil
	}
	if existing, ok, lookupErr := lookup(database); lookupErr == nil && ok {
		if existing.RequestHash != run.RequestHash {
			return existing, false, ErrInvocationIdempotencyConflict
		}
		return existing, false, nil
	}
	return run, false, err
}

func AppendInvocationPreflightRevision(run model.InvocationRun, revision model.InvocationPreflightRevision, refs []model.InvocationArtifactRef, event model.InvocationEvent, allowedFrom ...model.InvocationStatus) error {
	if err := validateRevisionEnvelope(run, revision, refs, event); err != nil {
		return err
	}
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.InvocationRun{}).
			Where("id = ? AND user_id = ? AND status IN ? AND latest_revision = ? AND latest_attempt = ? AND (project_id = ? OR project_id = '') AND (episode_id = ? OR episode_id = '')", run.ID, run.UserID, allowedFrom, revision.Revision-1, run.LatestAttempt, run.ProjectID, run.EpisodeID).
			Updates(invocationPreflightHeaderUpdates(run))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		if err := tx.Create(&revision).Error; err != nil {
			return err
		}
		if len(refs) > 0 {
			if err := tx.Create(&refs).Error; err != nil {
				return err
			}
		}
		return tx.Create(&event).Error
	})
}

func TransitionInvocation(run model.InvocationRun, event model.InvocationEvent, allowedFrom ...model.InvocationStatus) error {
	if event.UserID != run.UserID || event.InvocationID != run.ID || event.Revision != run.LatestRevision || event.Attempt != run.LatestAttempt {
		return ErrInvocationTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.InvocationRun{}).
			Where("id = ? AND user_id = ? AND status IN ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, allowedFrom, run.LatestRevision, run.LatestAttempt).
			Updates(invocationHeaderUpdates(run))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		return tx.Create(&event).Error
	})
}

func QueueInvocationAttemptTx(run model.InvocationRun, attempt model.InvocationAttempt, agentRun model.AgentRun, refs []model.InvocationArtifactRef, event model.InvocationEvent) error {
	if run.Status != model.InvocationStatusQueued || run.LatestRevision != attempt.Revision || run.LatestAttempt != attempt.Attempt || run.ID != attempt.InvocationID || run.UserID != attempt.UserID || attempt.AgentRunID != agentRun.ID || run.UserID != agentRun.UserID {
		return ErrInvocationTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		if err := validateInputRefsTx(tx, run, attempt, agentRun, refs, event); err != nil {
			return err
		}
		result := tx.Model(&model.InvocationRun{}).
			Where("id = ? AND user_id = ? AND status = ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, model.InvocationStatusAwaitingConfirmation, run.LatestRevision, attempt.Attempt-1).
			Updates(invocationHeaderUpdates(run))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		if err := invokeRepositoryHook("queue", "run"); err != nil {
			return err
		}
		if err := tx.Create(&agentRun).Error; err != nil {
			return err
		}
		if err := invokeRepositoryHook("queue", "agent_run"); err != nil {
			return err
		}
		if err := tx.Create(&attempt).Error; err != nil {
			return err
		}
		if err := invokeRepositoryHook("queue", "attempt"); err != nil {
			return err
		}
		for index := range refs {
			if err := tx.Create(&refs[index]).Error; err != nil {
				return err
			}
			if err := invokeRepositoryHook("queue", fmt.Sprintf("ref:%d", index)); err != nil {
				return err
			}
		}
		if err := tx.Create(&event).Error; err != nil {
			return err
		}
		return invokeRepositoryHook("queue", "event")
	})
}

func ClaimNextAgentRunWithInvocationTx(workerID string, leaseDuration time.Duration, maxUserRunning int) (model.AgentRun, bool, error) {
	return claimNextAgentRunTx(workerID, time.Now().UTC(), leaseDuration, maxUserRunning, true)
}

func claimNextAgentRunTx(workerID string, now time.Time, leaseDuration time.Duration, maxUserRunning int, includeInvocations bool) (model.AgentRun, bool, error) {
	database, err := DB()
	if err != nil {
		return model.AgentRun{}, false, err
	}
	nowText, leaseText := now.Format(time.RFC3339Nano), now.Add(leaseDuration).Format(time.RFC3339Nano)
	if maxUserRunning <= 0 {
		maxUserRunning = 1
	}
	blockedUsers := make([]string, 0)
	for range 20 {
		var claimed model.AgentRun
		var candidate model.AgentRun
		found, candidateFound, capacityBlocked, contended := false, false, false, false
		err = database.Transaction(func(tx *gorm.DB) error {
			query := tx.Where("status = ? AND (available_at = '' OR available_at <= ?) AND (lease_expires_at = '' OR lease_expires_at <= ?) AND (SELECT COUNT(*) FROM agent_runs active WHERE active.user_id = agent_runs.user_id AND active.id <> agent_runs.id AND active.status IN ? AND active.lease_expires_at > ?) < ?", model.AgentRunStatusQueued, nowText, nowText, []model.AgentRunStatus{model.AgentRunStatusRunning, model.AgentRunStatusCancelRequested}, nowText, maxUserRunning).
				Order("available_at asc, created_at asc")
			if len(blockedUsers) > 0 {
				query = query.Where("user_id NOT IN ?", blockedUsers)
			}
			if !includeInvocations {
				query = query.Where("NOT EXISTS (SELECT 1 FROM invocation_attempts ia WHERE ia.agent_run_id = agent_runs.id)")
			}
			query = query.Limit(1).Find(&candidate)
			if query.Error != nil || query.RowsAffected == 0 {
				return query.Error
			}
			candidateFound = true
			_ = invokeRepositoryHook("claim", "candidate_read")
			lockedRuns, err := lockAgentRunUserQueue(tx, candidate, nowText)
			if err != nil {
				return err
			}
			active := countActiveLockedAgentRuns(lockedRuns, nowText)
			if active >= int64(maxUserRunning) {
				capacityBlocked = true
				return nil
			}
			result := updateClaimedAgentRun(tx, candidate, workerID, nowText, leaseText)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				contended = true
				return nil
			}
			var invocationAttempt model.InvocationAttempt
			attemptResult := tx.Where("agent_run_id = ?", candidate.ID).Limit(1).Find(&invocationAttempt)
			if attemptResult.Error != nil {
				return attemptResult.Error
			}
			if attemptResult.RowsAffected == 1 {
				attemptUpdate := tx.Model(&model.InvocationAttempt{}).
					Where("id = ? AND status = ?", invocationAttempt.ID, string(model.AgentRunStatusQueued)).
					Updates(map[string]any{"status": string(model.AgentRunStatusRunning), "started_at": nowText, "updated_at": nowText})
				if attemptUpdate.Error != nil {
					return attemptUpdate.Error
				}
				if attemptUpdate.RowsAffected != 1 {
					return ErrInvocationTransitionConflict
				}
				runUpdate := tx.Model(&model.InvocationRun{}).
					Where("id = ? AND status = ? AND latest_attempt = ? AND latest_revision = ?", invocationAttempt.InvocationID, model.InvocationStatusQueued, invocationAttempt.Attempt, invocationAttempt.Revision).
					Updates(map[string]any{"status": model.InvocationStatusRunning, "updated_at": nowText})
				if runUpdate.Error != nil {
					return runUpdate.Error
				}
				if runUpdate.RowsAffected != 1 {
					return ErrInvocationTransitionConflict
				}
				if err := tx.Create(&model.InvocationEvent{UserID: invocationAttempt.UserID, InvocationID: invocationAttempt.InvocationID, Type: "attempt.running", Level: "info", DataJSON: `{}`, Revision: invocationAttempt.Revision, Attempt: invocationAttempt.Attempt, CreatedAt: nowText}).Error; err != nil {
					return err
				}
			}
			if err := tx.Where("id = ?", candidate.ID).First(&claimed).Error; err != nil {
				return err
			}
			found = true
			return nil
		})
		if err != nil {
			if errors.Is(err, ErrInvocationTransitionConflict) {
				continue
			}
			if isSQLiteContention(database, err) {
				time.Sleep(time.Millisecond)
				continue
			}
			return model.AgentRun{}, false, err
		}
		if found {
			return claimed, true, nil
		}
		if capacityBlocked {
			blockedUsers = append(blockedUsers, candidate.UserID)
			continue
		}
		if !candidateFound {
			return model.AgentRun{}, false, nil
		}
		if contended {
			continue
		}
		return model.AgentRun{}, false, nil
	}
	return model.AgentRun{}, false, ErrInvocationTransitionConflict
}

func lockAgentRunUserQueue(tx *gorm.DB, candidate model.AgentRun, nowText string) ([]model.AgentRun, error) {
	if tx.Dialector.Name() == "sqlite" {
		result := tx.Model(&model.AgentRun{}).Where("id = ? AND status = ? AND (lease_expires_at = '' OR lease_expires_at <= ?)", candidate.ID, model.AgentRunStatusQueued, nowText).UpdateColumn("updated_at", gorm.Expr("updated_at"))
		if result.Error != nil {
			return nil, result.Error
		}
		if result.RowsAffected != 1 {
			return nil, ErrInvocationTransitionConflict
		}
	}
	var runs []model.AgentRun
	err := agentRunUserLockQuery(tx, candidate.UserID).Find(&runs).Error
	return runs, err
}

func agentRunUserLockQuery(tx *gorm.DB, userID string) *gorm.DB {
	query := tx.Model(&model.AgentRun{}).Where("user_id = ? AND status IN ?", userID, []model.AgentRunStatus{model.AgentRunStatusQueued, model.AgentRunStatusRunning, model.AgentRunStatusCancelRequested}).Order("id asc")
	if tx.Dialector.Name() != "sqlite" {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	return query
}

func countActiveLockedAgentRuns(runs []model.AgentRun, nowText string) int64 {
	var active int64
	for _, run := range runs {
		if (run.Status == model.AgentRunStatusRunning || run.Status == model.AgentRunStatusCancelRequested) && run.LeaseExpiresAt > nowText {
			active++
		}
	}
	return active
}

func updateClaimedAgentRun(tx *gorm.DB, candidate model.AgentRun, workerID, nowText, leaseText string) *gorm.DB {
	return tx.Model(&model.AgentRun{}).
		Where("id = ? AND status = ? AND (lease_expires_at = '' OR lease_expires_at <= ?)", candidate.ID, model.AgentRunStatusQueued, nowText).
		Updates(map[string]any{"status": model.AgentRunStatusRunning, "lease_owner": strings.TrimSpace(workerID), "lease_expires_at": leaseText, "heartbeat_at": nowText, "started_at": nowText, "updated_at": nowText, "attempt": gorm.Expr("attempt + 1")})
}

func FinalizeInvocationAttemptTx(agentRun model.AgentRun, run model.InvocationRun, attempt model.InvocationAttempt, artifacts []model.Artifact, refs []model.InvocationArtifactRef, gates []model.InvocationGateResult, event model.InvocationEvent) error {
	if run.ID != attempt.InvocationID || run.UserID != attempt.UserID || run.LatestRevision != attempt.Revision || run.LatestAttempt != attempt.Attempt || attempt.AgentRunID != agentRun.ID || run.UserID != agentRun.UserID {
		return ErrInvocationTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	leaseOwner := agentRun.LeaseOwner
	agentRun.LeaseOwner, agentRun.LeaseExpiresAt, agentRun.HeartbeatAt = "", "", ""
	return database.Transaction(func(tx *gorm.DB) error {
		var current model.InvocationAttempt
		if err := tx.Where("id = ? AND invocation_id = ? AND attempt = ?", attempt.ID, attempt.InvocationID, attempt.Attempt).First(&current).Error; err != nil {
			return err
		}
		if current.FinishedAt != "" {
			same, compareErr := sameInvocationCompletion(tx, current, attempt, agentRun, run, artifacts, refs, gates, event)
			if compareErr != nil {
				return compareErr
			}
			if same {
				return ErrInvocationAttemptFinalized
			}
			return ErrInvocationCompletionConflict
		}
		if err := validateCompletionEnvelope(run, attempt, artifacts, refs, gates, event); err != nil {
			return err
		}
		agentUpdate := tx.Model(&model.AgentRun{}).
			Where("id = ? AND lease_owner = ? AND status IN ?", agentRun.ID, leaseOwner, []model.AgentRunStatus{model.AgentRunStatusRunning, model.AgentRunStatusCancelRequested}).
			Select("status", "raw_output", "structured_draft_json", "error_message", "credits_reserved", "credits_refunded", "duration_ms", "finished_at", "updated_at", "lease_owner", "lease_expires_at", "heartbeat_at").Updates(&agentRun)
		if agentUpdate.Error != nil {
			return agentUpdate.Error
		}
		if agentUpdate.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		if err := invokeRepositoryHook("finalize", "agent_run"); err != nil {
			return err
		}
		attemptUpdate := tx.Model(&model.InvocationAttempt{}).
			Where("id = ? AND invocation_id = ? AND attempt = ? AND status = ? AND finished_at = ''", attempt.ID, attempt.InvocationID, attempt.Attempt, string(model.AgentRunStatusRunning)).
			Select("status", "raw_output", "structured_output_json", "error_class", "error_message", "model", "channel_id", "executor_kind", "tool_trace_json", "credits_reserved", "credits_refunded", "duration_ms", "started_at", "finished_at", "updated_at").Updates(&attempt)
		if attemptUpdate.Error != nil {
			return attemptUpdate.Error
		}
		if attemptUpdate.RowsAffected != 1 {
			return ErrInvocationAttemptFinalized
		}
		if err := invokeRepositoryHook("finalize", "attempt"); err != nil {
			return err
		}
		runUpdate := tx.Model(&model.InvocationRun{}).
			Where("id = ? AND user_id = ? AND status = ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, model.InvocationStatusRunning, run.LatestRevision, attempt.Attempt).
			Updates(invocationHeaderUpdates(run))
		if runUpdate.Error != nil {
			return runUpdate.Error
		}
		if runUpdate.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		if err := invokeRepositoryHook("finalize", "run"); err != nil {
			return err
		}
		for index := range artifacts {
			if err := tx.Create(&artifacts[index]).Error; err != nil {
				return err
			}
			if err := invokeRepositoryHook("finalize", fmt.Sprintf("artifact:%d", index)); err != nil {
				return err
			}
		}
		for index := range refs {
			if err := tx.Create(&refs[index]).Error; err != nil {
				return err
			}
			if err := invokeRepositoryHook("finalize", fmt.Sprintf("ref:%d", index)); err != nil {
				return err
			}
		}
		for index := range gates {
			if err := tx.Create(&gates[index]).Error; err != nil {
				return err
			}
			if err := invokeRepositoryHook("finalize", fmt.Sprintf("gate:%d", index)); err != nil {
				return err
			}
		}
		if err := tx.Create(&event).Error; err != nil {
			return err
		}
		return invokeRepositoryHook("finalize", "event")
	})
}

func sameInvocationCompletion(tx *gorm.DB, current, wanted model.InvocationAttempt, wantedAgent model.AgentRun, wantedRun model.InvocationRun, artifacts []model.Artifact, refs []model.InvocationArtifactRef, gates []model.InvocationGateResult, wantedEvent model.InvocationEvent) (bool, error) {
	invocationID, attemptNumber := wanted.InvocationID, wanted.Attempt
	current.ID, current.UserID, current.InvocationID, current.AgentRunID, current.Revision, current.Attempt, current.CreatedAt = "", "", "", "", 0, 0, ""
	wanted.ID, wanted.UserID, wanted.InvocationID, wanted.AgentRunID, wanted.Revision, wanted.Attempt, wanted.CreatedAt = "", "", "", "", 0, 0, ""
	if !reflect.DeepEqual(current, wanted) {
		return false, nil
	}
	var storedAgent model.AgentRun
	if err := tx.Where("id = ?", wantedAgent.ID).First(&storedAgent).Error; err != nil {
		return false, err
	}
	if !reflect.DeepEqual(storedAgent, wantedAgent) {
		return false, nil
	}
	var storedRun model.InvocationRun
	if err := tx.Where("id = ? AND user_id = ?", wantedRun.ID, wantedRun.UserID).First(&storedRun).Error; err != nil {
		return false, err
	}
	if !reflect.DeepEqual(storedRun, wantedRun) {
		return false, nil
	}
	var storedEvents []model.InvocationEvent
	if err := tx.Where("user_id = ? AND invocation_id = ? AND revision = ? AND attempt = ? AND created_at = ?", wantedEvent.UserID, wantedEvent.InvocationID, wantedEvent.Revision, wantedEvent.Attempt, wantedEvent.CreatedAt).Find(&storedEvents).Error; err != nil {
		return false, err
	}
	wantedEvent.ID = 0
	matches := 0
	for _, storedEvent := range storedEvents {
		storedEvent.ID = 0
		if reflect.DeepEqual(storedEvent, wantedEvent) {
			matches++
		}
	}
	if matches != 1 {
		return false, nil
	}
	var storedRefs []model.InvocationArtifactRef
	var storedGates []model.InvocationGateResult
	var storedArtifacts []model.Artifact
	if err := tx.Where("invocation_id = ? AND attempt = ? AND direction = ?", invocationID, attemptNumber, "output").Order("binding_name, ordinal").Find(&storedRefs).Error; err != nil {
		return false, err
	}
	if err := tx.Where("invocation_id = ? AND attempt = ?", invocationID, attemptNumber).Order("execution_ordinal, layer, validator_id, artifact_hash").Find(&storedGates).Error; err != nil {
		return false, err
	}
	if err := tx.Where("producer_invocation_id = ? AND producer_attempt = ?", invocationID, attemptNumber).Order("id").Find(&storedArtifacts).Error; err != nil {
		return false, err
	}
	refsCopy := append([]model.InvocationArtifactRef(nil), refs...)
	gatesCopy := append([]model.InvocationGateResult(nil), gates...)
	artifactsCopy := append([]model.Artifact(nil), artifacts...)
	sort.Slice(refsCopy, func(i, j int) bool {
		if refsCopy[i].BindingName != refsCopy[j].BindingName {
			return refsCopy[i].BindingName < refsCopy[j].BindingName
		}
		return refsCopy[i].Ordinal < refsCopy[j].Ordinal
	})
	sort.Slice(gatesCopy, func(i, j int) bool {
		if gatesCopy[i].ExecutionOrdinal != gatesCopy[j].ExecutionOrdinal {
			return gatesCopy[i].ExecutionOrdinal < gatesCopy[j].ExecutionOrdinal
		}
		if gatesCopy[i].Layer != gatesCopy[j].Layer {
			return gatesCopy[i].Layer < gatesCopy[j].Layer
		}
		if gatesCopy[i].ValidatorID != gatesCopy[j].ValidatorID {
			return gatesCopy[i].ValidatorID < gatesCopy[j].ValidatorID
		}
		return gatesCopy[i].ArtifactHash < gatesCopy[j].ArtifactHash
	})
	sort.Slice(artifactsCopy, func(i, j int) bool { return artifactsCopy[i].ID < artifactsCopy[j].ID })
	return sameOrderedSlice(storedRefs, refsCopy) && sameOrderedSlice(storedGates, gatesCopy) && sameOrderedSlice(storedArtifacts, artifactsCopy), nil
}

func sameOrderedSlice[T any](left, right []T) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if !reflect.DeepEqual(left[index], right[index]) {
			return false
		}
	}
	return true
}

func RevalidateInvocationAttemptTx(run model.InvocationRun, attempt model.InvocationAttempt, artifacts []model.Artifact, refs []model.InvocationArtifactRef, gates []model.InvocationGateResult, event model.InvocationEvent) error {
	if run.ID != attempt.InvocationID || run.UserID != attempt.UserID || run.LatestRevision != attempt.Revision || run.LatestAttempt != attempt.Attempt {
		return ErrInvocationTransitionConflict
	}
	if err := validateCompletionEnvelope(run, attempt, artifacts, refs, gates, event); err != nil {
		return err
	}
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		var stored model.InvocationAttempt
		if err := tx.Where("id = ? AND invocation_id = ? AND attempt = ?", attempt.ID, run.ID, attempt.Attempt).First(&stored).Error; err != nil {
			return err
		}
		if stored.ID != attempt.ID || stored.UserID != attempt.UserID || stored.InvocationID != attempt.InvocationID || stored.AgentRunID != attempt.AgentRunID || stored.Revision != attempt.Revision || stored.Attempt != attempt.Attempt || stored.CreatedAt != attempt.CreatedAt || stored.StartedAt != attempt.StartedAt {
			return ErrInvocationTransitionConflict
		}
		if stored.FinishedAt == "" {
			return ErrInvocationTransitionConflict
		}
		result := tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ? AND status IN ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, []model.InvocationStatus{model.InvocationStatusNeedsReview, model.InvocationStatusBlocked, model.InvocationStatusPartial, model.InvocationStatusFailed}, run.LatestRevision, attempt.Attempt).Updates(invocationHeaderUpdates(run))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		for index := range artifacts {
			if err := tx.Create(&artifacts[index]).Error; err != nil {
				return err
			}
		}
		for index := range refs {
			if err := tx.Create(&refs[index]).Error; err != nil {
				return err
			}
		}
		for index := range gates {
			if err := tx.Create(&gates[index]).Error; err != nil {
				return err
			}
		}
		return tx.Create(&event).Error
	})
}

func SaveInvocationReviewTx(run model.InvocationRun, review model.InvocationReview, event model.InvocationEvent) error {
	if review.UserID != run.UserID || review.InvocationID != run.ID || review.Attempt != run.LatestAttempt || review.Attempt != run.ReviewedAttempt || review.ArtifactSetHash != run.ReviewedArtifactSetHash || event.UserID != run.UserID || event.InvocationID != run.ID || event.Attempt != review.Attempt || event.Revision != run.LatestRevision {
		return ErrInvocationTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ? AND status = ? AND latest_revision = ? AND latest_attempt = ? AND (reviewed_attempt < ? OR (reviewed_attempt = ? AND reviewed_artifact_set_hash <> ?))", run.ID, run.UserID, model.InvocationStatusNeedsReview, run.LatestRevision, review.Attempt, review.Attempt, review.Attempt, review.ArtifactSetHash).Updates(invocationHeaderUpdates(run))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		if err := tx.Create(&review).Error; err != nil {
			return err
		}
		return tx.Create(&event).Error
	})
}

func ApplyInvocationTx(run model.InvocationRun, attempt model.InvocationApplyAttempt, event model.InvocationEvent, adapter func(*gorm.DB) (json.RawMessage, error)) (model.InvocationApplyAttempt, bool, error) {
	if attempt.UserID != run.UserID || attempt.InvocationID != run.ID || attempt.Attempt != run.LatestAttempt || event.UserID != run.UserID || event.InvocationID != run.ID || event.Attempt != attempt.Attempt || event.Revision != run.LatestRevision {
		return attempt, false, ErrInvocationTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return attempt, false, err
	}
	_ = invokeRepositoryHook("apply", "before_reservation")
	var adapterErr error
	created, duplicate, adapterCalled := false, false, false
	for range 20 {
		err = database.Transaction(func(tx *gorm.DB) error {
			created, duplicate = false, false
			var storedRun model.InvocationRun
			if err := lockInvocationRunForApply(tx, run.ID, run.UserID, &storedRun); err != nil {
				return err
			}
			var existing model.InvocationApplyAttempt
			result := tx.Where("user_id = ? AND invocation_id = ? AND idempotency_key = ?", attempt.UserID, attempt.InvocationID, attempt.IdempotencyKey).Limit(1).Find(&existing)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 1 {
				if existing.RequestHash != attempt.RequestHash || existing.Target != attempt.Target || existing.TargetID != attempt.TargetID || existing.Attempt != attempt.Attempt || existing.ArtifactSetHash != attempt.ArtifactSetHash {
					return ErrInvocationApplyConflict
				}
				attempt = existing
				duplicate = true
				return nil
			}
			if storedRun.Status != model.InvocationStatusApproved || storedRun.LatestRevision != run.LatestRevision || storedRun.LatestAttempt != attempt.Attempt || storedRun.ReviewedAttempt != attempt.Attempt || storedRun.ReviewedArtifactSetHash != attempt.ArtifactSetHash {
				return ErrInvocationTransitionConflict
			}
			attempt.Status = "applying"
			if err := tx.Create(&attempt).Error; err != nil {
				return err
			}
			created = true
			var receipt json.RawMessage
			callErr := tx.Transaction(func(adapterTx *gorm.DB) error {
				adapterCalled = true
				var callErr error
				receipt, callErr = adapter(adapterTx)
				return callErr
			})
			if callErr != nil {
				adapterErr = callErr
				attempt.Status, attempt.ErrorMessage, attempt.ReceiptJSON = "failed", callErr.Error(), ""
				if result := tx.Model(&model.InvocationApplyAttempt{}).Where("id = ? AND status = ?", attempt.ID, "applying").Updates(map[string]any{"status": attempt.Status, "error_message": attempt.ErrorMessage, "receipt_json": "", "updated_at": attempt.UpdatedAt}); result.Error != nil {
					return result.Error
				} else if result.RowsAffected != 1 {
					return ErrInvocationTransitionConflict
				}
				result := tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ? AND status = ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, model.InvocationStatusApproved, run.LatestRevision, attempt.Attempt).Updates(map[string]any{"status": model.InvocationStatusApproved, "aggregate_error_summary": callErr.Error(), "updated_at": attempt.UpdatedAt})
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return ErrInvocationTransitionConflict
				}
				return tx.Create(&event).Error
			}
			attempt.Status, attempt.ReceiptJSON, attempt.ErrorMessage = "applied", string(receipt), ""
			if result := tx.Model(&model.InvocationApplyAttempt{}).Where("id = ? AND status = ?", attempt.ID, "applying").Updates(map[string]any{"status": attempt.Status, "error_message": "", "receipt_json": attempt.ReceiptJSON, "updated_at": attempt.UpdatedAt}); result.Error != nil {
				return result.Error
			} else if result.RowsAffected != 1 {
				return ErrInvocationTransitionConflict
			}
			result = tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ? AND status = ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, model.InvocationStatusApproved, run.LatestRevision, attempt.Attempt).Updates(invocationHeaderUpdates(run))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrInvocationTransitionConflict
			}
			return tx.Create(&event).Error
		})
		if !isSQLiteContention(database, err) || adapterCalled {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if err != nil {
		return attempt, false, err
	}
	if duplicate {
		return attempt, false, nil
	}
	if adapterErr != nil {
		return attempt, created, adapterErr
	}
	return attempt, created, nil
}

func lockInvocationRunForApply(tx *gorm.DB, id, userID string, run *model.InvocationRun) error {
	if tx.Dialector.Name() == "sqlite" {
		result := tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ?", id, userID).UpdateColumn("updated_at", gorm.Expr("updated_at"))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
	}
	return invocationRunApplyLockQuery(tx, id, userID).First(run).Error
}

func invocationRunApplyLockQuery(tx *gorm.DB, id, userID string) *gorm.DB {
	query := tx.Where("id = ? AND user_id = ?", id, userID)
	if tx.Dialector.Name() != "sqlite" {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	return query
}

func isSQLiteContention(database *gorm.DB, err error) bool {
	if err == nil || database.Dialector.Name() != "sqlite" {
		return false
	}
	message := strings.ToUpper(err.Error())
	return strings.Contains(message, "SQLITE_BUSY") || strings.Contains(message, "DATABASE IS LOCKED")
}

func invocationHeaderUpdates(run model.InvocationRun) map[string]any {
	return map[string]any{"request_hash": run.RequestHash, "status": run.Status, "latest_revision": run.LatestRevision, "latest_attempt": run.LatestAttempt, "reviewed_attempt": run.ReviewedAttempt, "reviewed_artifact_set_hash": run.ReviewedArtifactSetHash, "aggregate_error_summary": run.AggregateErrorSummary, "updated_at": run.UpdatedAt}
}

func invocationPreflightHeaderUpdates(run model.InvocationRun) map[string]any {
	updates := invocationHeaderUpdates(run)
	updates["project_id"], updates["episode_id"] = run.ProjectID, run.EpisodeID
	return updates
}

func validateRevisionEnvelope(run model.InvocationRun, revision model.InvocationPreflightRevision, refs []model.InvocationArtifactRef, event model.InvocationEvent) error {
	if revision.UserID != run.UserID || revision.InvocationID != run.ID || revision.Revision != run.LatestRevision || revision.RequestHash != run.RequestHash || event.UserID != run.UserID || event.InvocationID != run.ID || event.Revision != revision.Revision || event.Attempt != run.LatestAttempt {
		return ErrInvocationTransitionConflict
	}
	for _, ref := range refs {
		if ref.UserID != run.UserID || ref.InvocationID != run.ID || ref.Revision != revision.Revision || ref.Attempt != run.LatestAttempt || ref.Direction != "input" {
			return ErrInvocationTransitionConflict
		}
	}
	return nil
}

func validateInputRefsTx(tx *gorm.DB, run model.InvocationRun, attempt model.InvocationAttempt, agent model.AgentRun, refs []model.InvocationArtifactRef, event model.InvocationEvent) error {
	if agent.ProjectID != run.ProjectID || agent.EpisodeID != run.EpisodeID || event.UserID != run.UserID || event.InvocationID != run.ID || event.Revision != attempt.Revision || event.Attempt != attempt.Attempt {
		return ErrInvocationTransitionConflict
	}
	for _, ref := range refs {
		if ref.UserID != run.UserID || ref.InvocationID != run.ID || ref.Revision != attempt.Revision || ref.Attempt != attempt.Attempt || ref.Direction != "input" {
			return ErrInvocationTransitionConflict
		}
		var artifact model.Artifact
		result := tx.Where("id = ? AND user_id = ?", ref.ArtifactID, run.UserID).Limit(1).Find(&artifact)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 || artifact.ContentHash != ref.ArtifactHash || artifact.ArtifactType != ref.ArtifactType || artifact.SchemaVersion != ref.SchemaVersion || artifact.SchemaContentHash != ref.SchemaContentHash || artifact.ProjectID != run.ProjectID || artifact.EpisodeID != run.EpisodeID {
			return ErrInvocationTransitionConflict
		}
	}
	return nil
}

func validateCompletionEnvelope(run model.InvocationRun, attempt model.InvocationAttempt, artifacts []model.Artifact, refs []model.InvocationArtifactRef, gates []model.InvocationGateResult, event model.InvocationEvent) error {
	if event.UserID != run.UserID || event.InvocationID != run.ID || event.Revision != attempt.Revision || event.Attempt != attempt.Attempt || len(refs) != len(artifacts) {
		return ErrInvocationTransitionConflict
	}
	byID := make(map[string]model.Artifact, len(artifacts))
	for _, artifact := range artifacts {
		if artifact.UserID != run.UserID || artifact.ProjectID != run.ProjectID || artifact.EpisodeID != run.EpisodeID || artifact.ProducerInvocationID == nil || *artifact.ProducerInvocationID != run.ID || artifact.ProducerAttempt != attempt.Attempt {
			return ErrInvocationTransitionConflict
		}
		byID[artifact.ID] = artifact
	}
	seen := map[string]bool{}
	for _, ref := range refs {
		artifact, ok := byID[ref.ArtifactID]
		if !ok || seen[ref.ArtifactID] || ref.UserID != run.UserID || ref.InvocationID != run.ID || ref.Direction != "output" || ref.Revision != attempt.Revision || ref.Attempt != attempt.Attempt || ref.ArtifactHash != artifact.ContentHash || ref.ArtifactType != artifact.ArtifactType || ref.SchemaVersion != artifact.SchemaVersion || ref.SchemaContentHash != artifact.SchemaContentHash {
			return ErrInvocationTransitionConflict
		}
		seen[ref.ArtifactID] = true
	}
	hasFailedGate := false
	passedArtifacts := make(map[string]bool, len(artifacts))
	for _, gate := range gates {
		if gate.UserID != run.UserID || gate.InvocationID != run.ID || gate.Attempt != attempt.Attempt {
			return ErrInvocationTransitionConflict
		}
		artifact, ok := byID[gate.ArtifactID]
		if ok && (gate.ArtifactHash != artifact.ContentHash || !gate.Passed) {
			return ErrInvocationTransitionConflict
		}
		if !ok && (gate.Passed || (run.Status != model.InvocationStatusFailed && run.Status != model.InvocationStatusPartial && run.Status != model.InvocationStatusBlocked)) {
			return ErrInvocationTransitionConflict
		}
		if ok && gate.Passed {
			passedArtifacts[gate.ArtifactID] = true
		}
		hasFailedGate = hasFailedGate || !gate.Passed
	}
	for artifactID := range byID {
		if !passedArtifacts[artifactID] {
			return ErrInvocationTransitionConflict
		}
	}
	if hasFailedGate && (run.Status == model.InvocationStatusFailed || run.Status == model.InvocationStatusBlocked) && len(artifacts) != 0 {
		return ErrInvocationTransitionConflict
	}
	return nil
}

func GetUserInvocation(userID, id string) (model.InvocationRun, bool, error) {
	database, err := DB()
	if err != nil {
		return model.InvocationRun{}, false, err
	}
	var item model.InvocationRun
	result := database.Where("user_id = ? AND id = ?", strings.TrimSpace(userID), strings.TrimSpace(id)).Limit(1).Find(&item)
	return item, result.RowsAffected == 1, result.Error
}

func ListUserInvocations(userID string, query model.InvocationQuery) ([]model.InvocationRun, int64, error) {
	database, err := DB()
	if err != nil {
		return nil, 0, err
	}
	query.Normalize()
	tx := database.Model(&model.InvocationRun{}).Where("invocation_runs.user_id = ?", strings.TrimSpace(userID))
	if value := strings.TrimSpace(query.ProjectID); value != "" {
		tx = tx.Where("invocation_runs.project_id = ?", value)
	}
	if value := strings.TrimSpace(query.EpisodeID); value != "" {
		tx = tx.Where("invocation_runs.episode_id = ?", value)
	}
	if value := strings.TrimSpace(query.Source); value != "" {
		tx = tx.Where("invocation_runs.source = ?", value)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		tx = tx.Where("invocation_runs.status = ?", value)
	}
	if value := strings.TrimSpace(query.SkillID); value != "" {
		tx = tx.Joins("JOIN invocation_preflight_revisions revisions ON revisions.invocation_id = invocation_runs.id AND revisions.revision = invocation_runs.latest_revision").Where("revisions.skill_id = ?", value)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.InvocationRun
	err = tx.Order("invocation_runs.updated_at desc, invocation_runs.id desc").Offset(query.Offset()).Limit(query.PageSize).Find(&items).Error
	return items, total, err
}

func ListInvocationEvents(userID, invocationID string, after uint64, limit int) ([]model.InvocationEvent, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	if limit < 1 {
		limit = 100
	}
	if limit > model.MaxPageSize {
		limit = model.MaxPageSize
	}
	var items []model.InvocationEvent
	err = database.Where("user_id = ? AND invocation_id = ? AND id > ?", strings.TrimSpace(userID), strings.TrimSpace(invocationID), after).Order("id asc").Limit(limit).Find(&items).Error
	return items, err
}
func ListInvocationPreflightRevisions(userID, invocationID string) ([]model.InvocationPreflightRevision, error) {
	var items []model.InvocationPreflightRevision
	err := invocationList(userID, invocationID, &items, "revision asc")
	return items, err
}
func ListInvocationGates(userID, invocationID string) ([]model.InvocationGateResult, error) {
	var items []model.InvocationGateResult
	err := invocationList(userID, invocationID, &items, "attempt asc, execution_ordinal asc, layer asc, validator_id asc")
	return items, err
}
func ListInvocationArtifactRefs(userID, invocationID string) ([]model.InvocationArtifactRef, error) {
	var items []model.InvocationArtifactRef
	err := invocationList(userID, invocationID, &items, "revision asc, attempt asc, direction asc, binding_name asc, ordinal asc")
	return items, err
}
func ListInvocationAttempts(userID, invocationID string) ([]model.InvocationAttempt, error) {
	var items []model.InvocationAttempt
	err := invocationList(userID, invocationID, &items, "attempt asc")
	return items, err
}
func ListInvocationReviews(userID, invocationID string) ([]model.InvocationReview, error) {
	var items []model.InvocationReview
	err := invocationList(userID, invocationID, &items, "created_at asc, id asc")
	return items, err
}
func ListInvocationApplyAttempts(userID, invocationID string) ([]model.InvocationApplyAttempt, error) {
	var items []model.InvocationApplyAttempt
	err := invocationList(userID, invocationID, &items, "created_at asc, id asc")
	return items, err
}

func invocationList(userID, invocationID string, destination any, order string) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Where("user_id = ? AND invocation_id = ?", strings.TrimSpace(userID), strings.TrimSpace(invocationID)).Order(order).Find(destination).Error
}
