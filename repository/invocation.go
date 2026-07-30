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
	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
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
	queue, finalize, credit func(string) error
	claim, apply, requeue   func(string)
}

func setInvocationCreditFailpoint(hook func(string) error) func() {
	invocationHooks.Lock()
	invocationHooks.credit = hook
	invocationHooks.Unlock()
	return func() { invocationHooks.Lock(); invocationHooks.credit = nil; invocationHooks.Unlock() }
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
	queue, finalize, credit, claim, apply, requeue := invocationHooks.queue, invocationHooks.finalize, invocationHooks.credit, invocationHooks.claim, invocationHooks.apply, invocationHooks.requeue
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
	case "credit":
		if credit != nil {
			return credit(step)
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
	for range 20 {
		err = database.Transaction(func(tx *gorm.DB) error {
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
		if !isSQLiteContention(database, err) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	return err
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

func CancelInvocationTx(userID, invocationID, stamp string) (model.InvocationRun, *model.InvocationAttempt, error) {
	database, err := DB()
	if err != nil {
		return model.InvocationRun{}, nil, err
	}
	var run model.InvocationRun
	var attempt *model.InvocationAttempt
	for range 20 {
		run, attempt = model.InvocationRun{}, nil
		err = database.Transaction(func(tx *gorm.DB) error {
			query := invocationCreditContextLockQuery(tx, &model.InvocationRun{}).
				Where("id = ? AND user_id = ?", strings.TrimSpace(invocationID), strings.TrimSpace(userID)).Limit(1).Find(&run)
			if query.Error != nil {
				return query.Error
			}
			if query.RowsAffected != 1 {
				return ErrInvocationNotFound
			}
			switch run.Status {
			case model.InvocationStatusCancelled, model.InvocationStatusCancelRequested:
				return loadLatestInvocationAttemptTx(tx, run, &attempt)
			case model.InvocationStatusPlanned, model.InvocationStatusPreflight, model.InvocationStatusAwaitingConfirmation, model.InvocationStatusBlocked:
				run.Status, run.UpdatedAt = model.InvocationStatusCancelled, stamp
				result := tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ? AND status IN ? AND latest_attempt = ?", run.ID, run.UserID,
					[]model.InvocationStatus{model.InvocationStatusPlanned, model.InvocationStatusPreflight, model.InvocationStatusAwaitingConfirmation, model.InvocationStatusBlocked}, 0).
					Updates(invocationHeaderUpdates(run))
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return ErrInvocationTransitionConflict
				}
				return tx.Create(&model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: "invocation.cancelled", Level: "info", DataJSON: `{}`, Revision: run.LatestRevision, Attempt: 0, CreatedAt: stamp}).Error
			case model.InvocationStatusQueued, model.InvocationStatusRunning:
				return cancelQueuedInvocationAttemptTx(tx, &run, &attempt, stamp)
			default:
				return loadLatestInvocationAttemptTx(tx, run, &attempt)
			}
		})
		if !isSQLiteContention(database, err) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	return run, attempt, err
}

func loadLatestInvocationAttemptTx(tx *gorm.DB, run model.InvocationRun, destination **model.InvocationAttempt) error {
	if run.LatestAttempt < 1 {
		return nil
	}
	var attempt model.InvocationAttempt
	query := tx.Where("user_id = ? AND invocation_id = ? AND attempt = ?", run.UserID, run.ID, run.LatestAttempt).Limit(1).Find(&attempt)
	if query.Error != nil {
		return query.Error
	}
	if query.RowsAffected != 1 {
		return ErrInvocationTransitionConflict
	}
	*destination = &attempt
	return nil
}

func cancelQueuedInvocationAttemptTx(tx *gorm.DB, run *model.InvocationRun, destination **model.InvocationAttempt, stamp string) error {
	var attempt model.InvocationAttempt
	if err := tx.Where("user_id = ? AND invocation_id = ? AND attempt = ?", run.UserID, run.ID, run.LatestAttempt).First(&attempt).Error; err != nil {
		return err
	}
	var agent model.AgentRun
	if err := tx.Where("id = ? AND user_id = ?", attempt.AgentRunID, run.UserID).First(&agent).Error; err != nil {
		return err
	}
	sourceRun, sourceAttempt, sourceAgent := run.Status, attempt.Status, agent.Status
	targetRun, targetAgent := model.InvocationStatusCancelled, model.AgentRunStatusCancelled
	finishedAt := stamp
	if run.Status == model.InvocationStatusRunning {
		targetRun, targetAgent, finishedAt = model.InvocationStatusCancelRequested, model.AgentRunStatusCancelRequested, ""
	}
	agentUpdates := map[string]any{"status": targetAgent, "updated_at": stamp}
	attemptUpdates := map[string]any{"status": string(targetAgent), "updated_at": stamp}
	if finishedAt != "" {
		agentUpdates["finished_at"], attemptUpdates["finished_at"] = finishedAt, finishedAt
	}
	result := tx.Model(&model.AgentRun{}).Where("id = ? AND user_id = ? AND status = ?", agent.ID, agent.UserID, sourceAgent).Updates(agentUpdates)
	if result.Error != nil || result.RowsAffected != 1 {
		if result.Error != nil {
			return result.Error
		}
		return ErrInvocationTransitionConflict
	}
	result = tx.Model(&model.InvocationAttempt{}).Where("id = ? AND invocation_id = ? AND status = ? AND finished_at = ''", attempt.ID, attempt.InvocationID, sourceAttempt).Updates(attemptUpdates)
	if result.Error != nil || result.RowsAffected != 1 {
		if result.Error != nil {
			return result.Error
		}
		return ErrInvocationTransitionConflict
	}
	run.Status, run.UpdatedAt = targetRun, stamp
	result = tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ? AND status = ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, sourceRun, run.LatestRevision, run.LatestAttempt).Updates(invocationHeaderUpdates(*run))
	if result.Error != nil || result.RowsAffected != 1 {
		if result.Error != nil {
			return result.Error
		}
		return ErrInvocationTransitionConflict
	}
	if targetAgent == model.AgentRunStatusCancelled {
		reserved, refunded, err := settleInvocationCreditsTx(tx, agent, targetAgent, stamp, "")
		if err != nil {
			return err
		}
		agentUpdates["credits_reserved"], agentUpdates["credits_refunded"] = reserved, refunded
		attemptUpdates["credits_reserved"], attemptUpdates["credits_refunded"] = reserved, refunded
		if err := tx.Model(&model.AgentRun{}).Where("id = ? AND status = ?", agent.ID, targetAgent).Updates(map[string]any{"credits_reserved": reserved, "credits_refunded": refunded}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.InvocationAttempt{}).Where("id = ? AND status = ?", attempt.ID, string(targetAgent)).Updates(map[string]any{"credits_reserved": reserved, "credits_refunded": refunded}).Error; err != nil {
			return err
		}
	}
	agent.Status, agent.UpdatedAt, agent.FinishedAt = targetAgent, stamp, finishedAt
	attempt.Status, attempt.UpdatedAt, attempt.FinishedAt = string(targetAgent), stamp, finishedAt
	*destination = &attempt
	eventType := "attempt.cancel_requested"
	if targetAgent == model.AgentRunStatusCancelled {
		eventType = "attempt.cancelled"
	}
	return tx.Create(&model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: eventType, Level: "info", DataJSON: `{}`, Revision: attempt.Revision, Attempt: attempt.Attempt, CreatedAt: stamp}).Error
}

func QueueInvocationAttemptTx(run model.InvocationRun, attempt model.InvocationAttempt, agentRun model.AgentRun, refs []model.InvocationArtifactRef, event model.InvocationEvent) error {
	wantKey := fmt.Sprintf("invocation:%s:revision:%d:attempt:%d", run.ID, attempt.Revision, attempt.Attempt)
	if run.Status != model.InvocationStatusQueued || run.LatestRevision != attempt.Revision || run.LatestAttempt != attempt.Attempt || run.ID != attempt.InvocationID || run.UserID != attempt.UserID || attempt.AgentRunID != agentRun.ID || run.UserID != agentRun.UserID || agentRun.InvocationID != run.ID || agentRun.InvocationRevision != attempt.Revision || agentRun.InvocationAttempt != attempt.Attempt || agentRun.IdempotencyKey == nil || *agentRun.IdempotencyKey != wantKey || agentRun.AllowFallback || agentRun.Model != attempt.Model || agentRun.ChannelID != attempt.ChannelID || agentRun.Executor != attempt.ExecutorKind {
		return ErrInvocationTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	for range 20 {
		err = database.Transaction(func(tx *gorm.DB) error {
			if err := validateInputRefsTx(tx, run, attempt, agentRun, refs, event); err != nil {
				return err
			}
			if err := validateInvocationRetryPlanTx(tx, run, attempt); err != nil {
				return err
			}
			sourceStatuses := []model.InvocationStatus{model.InvocationStatusAwaitingConfirmation}
			if attempt.Attempt > 1 {
				sourceStatuses = append(sourceStatuses, model.InvocationStatusFailed, model.InvocationStatusCancelled, model.InvocationStatusRejected, model.InvocationStatusPartial)
			}
			result := tx.Model(&model.InvocationRun{}).
				Where("id = ? AND user_id = ? AND status IN ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, sourceStatuses, run.LatestRevision, attempt.Attempt-1).
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
		if !isSQLiteContention(database, err) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	return err
}

func validateInvocationRetryPlanTx(tx *gorm.DB, run model.InvocationRun, attempt model.InvocationAttempt) error {
	type retryOutputRef struct {
		BindingName       string `json:"bindingName"`
		Ordinal           int    `json:"ordinal"`
		ArtifactID        string `json:"artifactId"`
		ArtifactHash      string `json:"artifactHash"`
		ArtifactType      string `json:"artifactType"`
		SchemaVersion     string `json:"schemaVersion"`
		SchemaContentHash string `json:"schemaContentHash"`
	}
	type coordinate struct {
		BindingName string `json:"bindingName"`
		Ordinal     int    `json:"ordinal"`
	}
	var plan struct {
		PreservedOutputRefs       []retryOutputRef `json:"preservedOutputRefs"`
		RequestedOutputs          []coordinate     `json:"requestedOutputs"`
		RejectedParentArtifactIDs []string         `json:"rejectedParentArtifactIds"`
	}
	raw := []byte(strings.TrimSpace(attempt.RetryPlanJSON))
	if len(raw) == 0 && attempt.Attempt == 1 {
		return nil
	}
	if len(raw) == 0 || json.Unmarshal(raw, &plan) != nil {
		return ErrInvocationTransitionConflict
	}
	canonical, err := jsoncanonicalizer.Transform(raw)
	if err != nil || string(canonical) != string(raw) {
		return ErrInvocationTransitionConflict
	}
	if attempt.Attempt == 1 {
		if len(plan.PreservedOutputRefs) != 0 || len(plan.RequestedOutputs) != 0 || len(plan.RejectedParentArtifactIDs) != 0 {
			return ErrInvocationTransitionConflict
		}
		return nil
	}
	var previous model.InvocationAttempt
	if result := tx.Where("user_id = ? AND invocation_id = ? AND attempt = ?", run.UserID, run.ID, attempt.Attempt-1).Limit(1).Find(&previous); result.Error != nil || result.RowsAffected != 1 {
		return ErrInvocationTransitionConflict
	}
	if attempt.Revision > previous.Revision {
		if len(plan.PreservedOutputRefs) != 0 || len(plan.RequestedOutputs) != 0 || len(plan.RejectedParentArtifactIDs) != 0 {
			return ErrInvocationTransitionConflict
		}
		return nil
	}
	previousTerminal := previous.Status == string(model.AgentRunStatusFailed) || previous.Status == string(model.AgentRunStatusCancelled)
	if previousTerminal {
		var previousPlan struct {
			PreservedOutputRefs       []retryOutputRef `json:"preservedOutputRefs"`
			RequestedOutputs          []coordinate     `json:"requestedOutputs"`
			RejectedParentArtifactIDs []string         `json:"rejectedParentArtifactIds"`
		}
		previousRaw := []byte(strings.TrimSpace(previous.RetryPlanJSON))
		if len(previousRaw) > 0 && json.Unmarshal(previousRaw, &previousPlan) != nil {
			return ErrInvocationTransitionConflict
		}
		if len(previousPlan.PreservedOutputRefs) > 0 || len(previousPlan.RequestedOutputs) > 0 || len(previousPlan.RejectedParentArtifactIDs) > 0 {
			previousCanonical, canonicalErr := jsoncanonicalizer.Transform(previousRaw)
			if canonicalErr != nil || string(previousCanonical) != string(previousRaw) {
				return ErrInvocationTransitionConflict
			}
			coordinates := map[string]bool{}
			for _, coordinate := range previousPlan.RequestedOutputs {
				key := fmt.Sprintf("%s\x00%d", strings.TrimSpace(coordinate.BindingName), coordinate.Ordinal)
				if strings.TrimSpace(coordinate.BindingName) == "" || coordinate.Ordinal < 0 || coordinates[key] {
					return ErrInvocationTransitionConflict
				}
				coordinates[key] = true
			}
			for _, frozen := range previousPlan.PreservedOutputRefs {
				key := fmt.Sprintf("%s\x00%d", strings.TrimSpace(frozen.BindingName), frozen.Ordinal)
				if strings.TrimSpace(frozen.BindingName) == "" || frozen.Ordinal < 0 || frozen.ArtifactID == "" || frozen.ArtifactHash == "" || frozen.ArtifactType == "" || frozen.SchemaVersion == "" || frozen.SchemaContentHash == "" || coordinates[key] {
					return ErrInvocationTransitionConflict
				}
				coordinates[key] = true
			}
			parents := map[string]bool{}
			for _, artifactID := range previousPlan.RejectedParentArtifactIDs {
				if strings.TrimSpace(artifactID) == "" || parents[artifactID] {
					return ErrInvocationTransitionConflict
				}
				parents[artifactID] = true
			}
			if len(previousPlan.RequestedOutputs) == 0 || string(raw) != string(previousRaw) {
				return ErrInvocationTransitionConflict
			}
			return nil
		}
		if len(plan.PreservedOutputRefs) != 0 || len(plan.RejectedParentArtifactIDs) != 0 {
			return ErrInvocationTransitionConflict
		}
		var revision model.InvocationPreflightRevision
		result := tx.Where("user_id = ? AND invocation_id = ? AND revision = ?", run.UserID, run.ID, previous.Revision).Limit(1).Find(&revision)
		if result.Error != nil || result.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		var snapshot struct {
			Package struct {
				OutputContract struct {
					ArtifactOutputs []struct {
						BindingName string `json:"bindingName"`
						Min         int    `json:"min"`
					} `json:"artifactOutputs"`
				} `json:"outputContract"`
			} `json:"package"`
		}
		if json.Unmarshal([]byte(revision.SkillSnapshotJSON), &snapshot) != nil {
			return ErrInvocationTransitionConflict
		}
		expected := map[string]bool{}
		for _, output := range snapshot.Package.OutputContract.ArtifactOutputs {
			if strings.TrimSpace(output.BindingName) == "" || output.Min < 0 {
				return ErrInvocationTransitionConflict
			}
			for ordinal := 0; ordinal < output.Min; ordinal++ {
				expected[fmt.Sprintf("%s\x00%d", output.BindingName, ordinal)] = true
			}
		}
		if len(plan.RequestedOutputs) != len(expected) {
			return ErrInvocationTransitionConflict
		}
		seen := map[string]bool{}
		for _, coordinate := range plan.RequestedOutputs {
			key := fmt.Sprintf("%s\x00%d", coordinate.BindingName, coordinate.Ordinal)
			if !expected[key] || seen[key] {
				return ErrInvocationTransitionConflict
			}
			seen[key] = true
		}
		return nil
	}
	if len(plan.RequestedOutputs) == 0 {
		return ErrInvocationTransitionConflict
	}
	var previousRefs []model.InvocationArtifactRef
	if err := tx.Where("user_id = ? AND invocation_id = ? AND direction = ? AND attempt = ?", run.UserID, run.ID, "output", previous.Attempt).Order("binding_name asc, ordinal asc").Find(&previousRefs).Error; err != nil {
		return err
	}
	coordinates := map[string]bool{}
	for _, coordinate := range plan.RequestedOutputs {
		key := fmt.Sprintf("%s\x00%d", strings.TrimSpace(coordinate.BindingName), coordinate.Ordinal)
		if coordinate.BindingName == "" || coordinate.Ordinal < 0 || coordinates[key] {
			return ErrInvocationTransitionConflict
		}
		coordinates[key] = true
	}
	for _, frozen := range plan.PreservedOutputRefs {
		key := fmt.Sprintf("%s\x00%d", frozen.BindingName, frozen.Ordinal)
		if coordinates[key] || frozen.Ordinal < 0 {
			return ErrInvocationTransitionConflict
		}
		coordinates[key] = true
		var ref model.InvocationArtifactRef
		result := tx.Where("user_id = ? AND invocation_id = ? AND direction = ? AND binding_name = ? AND ordinal = ? AND artifact_id = ? AND artifact_hash = ? AND artifact_type = ? AND schema_version = ? AND schema_content_hash = ? AND attempt < ?", run.UserID, run.ID, "output", frozen.BindingName, frozen.Ordinal, frozen.ArtifactID, frozen.ArtifactHash, frozen.ArtifactType, frozen.SchemaVersion, frozen.SchemaContentHash, attempt.Attempt).Limit(1).Find(&ref)
		if result.Error != nil || result.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
	}
	if len(plan.RejectedParentArtifactIDs) > 0 {
		var reviews int64
		if err := tx.Model(&model.InvocationReview{}).Where("user_id = ? AND invocation_id = ? AND attempt = ? AND decision = ?", run.UserID, run.ID, attempt.Attempt-1, "rejected").Count(&reviews).Error; err != nil || reviews != 1 {
			return ErrInvocationTransitionConflict
		}
		seen := map[string]bool{}
		for _, artifactID := range plan.RejectedParentArtifactIDs {
			if artifactID == "" || seen[artifactID] {
				return ErrInvocationTransitionConflict
			}
			seen[artifactID] = true
			var count int64
			if err := tx.Model(&model.InvocationArtifactRef{}).Where("user_id = ? AND invocation_id = ? AND direction = ? AND attempt = ? AND artifact_id = ?", run.UserID, run.ID, "output", attempt.Attempt-1, artifactID).Count(&count).Error; err != nil || count != 1 {
				return ErrInvocationTransitionConflict
			}
		}
	}
	if previous.Status == "partial" {
		if len(plan.PreservedOutputRefs) != len(previousRefs) {
			return ErrInvocationTransitionConflict
		}
		for index, ref := range previousRefs {
			frozen := plan.PreservedOutputRefs[index]
			if frozen.BindingName != ref.BindingName || frozen.Ordinal != ref.Ordinal || frozen.ArtifactID != ref.ArtifactID || frozen.ArtifactHash != ref.ArtifactHash || frozen.ArtifactType != ref.ArtifactType || frozen.SchemaVersion != ref.SchemaVersion || frozen.SchemaContentHash != ref.SchemaContentHash {
				return ErrInvocationTransitionConflict
			}
		}
		var failedGates []model.InvocationGateResult
		if err := tx.Where("user_id = ? AND invocation_id = ? AND attempt = ? AND passed = ? AND binding_name <> '' AND output_ordinal >= 0", run.UserID, run.ID, previous.Attempt, false).Find(&failedGates).Error; err != nil {
			return err
		}
		expected := map[string]bool{}
		for _, gate := range failedGates {
			expected[fmt.Sprintf("%s\x00%d", gate.BindingName, gate.OutputOrdinal)] = true
		}
		if len(expected) != len(plan.RequestedOutputs) {
			return ErrInvocationTransitionConflict
		}
		for _, coordinate := range plan.RequestedOutputs {
			if !expected[fmt.Sprintf("%s\x00%d", coordinate.BindingName, coordinate.Ordinal)] {
				return ErrInvocationTransitionConflict
			}
		}
		if len(plan.RejectedParentArtifactIDs) != 0 {
			return ErrInvocationTransitionConflict
		}
	}
	if previous.Status == string(model.AgentRunStatusRejected) {
		if len(plan.PreservedOutputRefs) != 0 || len(plan.RequestedOutputs) != len(previousRefs) || len(plan.RejectedParentArtifactIDs) != len(previousRefs) {
			return ErrInvocationTransitionConflict
		}
		parentIDs := map[string]bool{}
		coordinates := map[string]bool{}
		for _, ref := range previousRefs {
			parentIDs[ref.ArtifactID] = true
			coordinates[fmt.Sprintf("%s\x00%d", ref.BindingName, ref.Ordinal)] = true
		}
		for _, id := range plan.RejectedParentArtifactIDs {
			if !parentIDs[id] {
				return ErrInvocationTransitionConflict
			}
		}
		for _, coordinate := range plan.RequestedOutputs {
			if !coordinates[fmt.Sprintf("%s\x00%d", coordinate.BindingName, coordinate.Ordinal)] {
				return ErrInvocationTransitionConflict
			}
		}
	}
	return nil
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
	if run.ID != attempt.InvocationID || run.UserID != attempt.UserID || run.LatestRevision != attempt.Revision || run.LatestAttempt != attempt.Attempt || attempt.AgentRunID != agentRun.ID || run.UserID != agentRun.UserID || agentRun.InvocationID != run.ID || agentRun.InvocationRevision != attempt.Revision || agentRun.InvocationAttempt != attempt.Attempt {
		return ErrInvocationTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	leaseOwner := agentRun.LeaseOwner
	agentRun.LeaseOwner, agentRun.LeaseExpiresAt, agentRun.HeartbeatAt = "", "", ""
	return database.Transaction(func(tx *gorm.DB) error {
		var currentAgent model.AgentRun
		agentQuery := invocationCreditContextLockQuery(tx, &model.AgentRun{}).
			Where("id = ? AND user_id = ? AND invocation_id = ? AND invocation_revision = ? AND invocation_attempt = ?", agentRun.ID, agentRun.UserID, run.ID, attempt.Revision, attempt.Attempt).
			Limit(1).Find(&currentAgent)
		if agentQuery.Error != nil {
			return agentQuery.Error
		}
		if agentQuery.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		var current model.InvocationAttempt
		attemptQuery := invocationCreditContextLockQuery(tx, &model.InvocationAttempt{}).
			Where("id = ? AND invocation_id = ? AND attempt = ?", attempt.ID, attempt.InvocationID, attempt.Attempt).
			Limit(1).Find(&current)
		if attemptQuery.Error != nil {
			return attemptQuery.Error
		}
		if attemptQuery.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		if current.UserID != attempt.UserID || current.InvocationID != attempt.InvocationID || current.AgentRunID != attempt.AgentRunID || current.Revision != attempt.Revision || current.Attempt != attempt.Attempt {
			return ErrInvocationTransitionConflict
		}
		var currentRun model.InvocationRun
		runQuery := invocationCreditContextLockQuery(tx, &model.InvocationRun{}).
			Where("id = ? AND user_id = ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, run.LatestRevision, run.LatestAttempt).
			Limit(1).Find(&currentRun)
		if runQuery.Error != nil {
			return runQuery.Error
		}
		if runQuery.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		if current.FinishedAt != "" {
			reserved, refunded, creditErr := invocationCreditTotalsTx(tx, agentRun)
			if creditErr != nil {
				return creditErr
			}
			agentRun.CreditsReserved, agentRun.CreditsRefunded = reserved, refunded
			attempt.CreditsReserved, attempt.CreditsRefunded = reserved, refunded
			same, compareErr := sameInvocationCompletion(tx, current, attempt, agentRun, run, artifacts, refs, gates, event)
			if compareErr != nil {
				return compareErr
			}
			if same {
				return ErrInvocationAttemptFinalized
			}
			return ErrInvocationCompletionConflict
		}
		if err := validateCompletionEnvelopeTx(tx, run, attempt, artifacts, refs, gates, event); err != nil {
			return err
		}
		agentSourceStatuses := []model.AgentRunStatus{model.AgentRunStatusRunning}
		if agentRun.Status == model.AgentRunStatusCancelled {
			agentSourceStatuses = append(agentSourceStatuses, model.AgentRunStatusCancelRequested)
		}
		agentUpdate := tx.Model(&model.AgentRun{}).
			Where("id = ? AND user_id = ? AND invocation_id = ? AND invocation_revision = ? AND invocation_attempt = ? AND lease_owner = ? AND status IN ?", agentRun.ID, agentRun.UserID, run.ID, attempt.Revision, attempt.Attempt, leaseOwner, agentSourceStatuses).
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
		attemptSourceStatuses := []string{string(model.AgentRunStatusRunning)}
		if attempt.Status == string(model.AgentRunStatusCancelled) {
			attemptSourceStatuses = append(attemptSourceStatuses, string(model.AgentRunStatusCancelRequested))
		}
		attemptUpdate := tx.Model(&model.InvocationAttempt{}).
			Where("id = ? AND invocation_id = ? AND attempt = ? AND status IN ? AND finished_at = ''", attempt.ID, attempt.InvocationID, attempt.Attempt, attemptSourceStatuses).
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
		runSourceStatuses := []model.InvocationStatus{model.InvocationStatusRunning}
		if run.Status == model.InvocationStatusCancelled {
			runSourceStatuses = append(runSourceStatuses, model.InvocationStatusCancelRequested)
		}
		runUpdate := tx.Model(&model.InvocationRun{}).
			Where("id = ? AND user_id = ? AND status IN ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, runSourceStatuses, run.LatestRevision, attempt.Attempt).
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
		reserved, refunded, err := settleInvocationCreditsTx(tx, agentRun, agentRun.Status, attempt.FinishedAt, "finalize")
		if err != nil {
			return err
		}
		agentRun.CreditsReserved, agentRun.CreditsRefunded = reserved, refunded
		attempt.CreditsReserved, attempt.CreditsRefunded = reserved, refunded
		if err := tx.Model(&model.AgentRun{}).Where("id = ? AND status = ?", agentRun.ID, agentRun.Status).
			Updates(map[string]any{"credits_reserved": reserved, "credits_refunded": refunded}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.InvocationAttempt{}).Where("id = ? AND status = ?", attempt.ID, attempt.Status).
			Updates(map[string]any{"credits_reserved": reserved, "credits_refunded": refunded}).Error; err != nil {
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
	current.DurationMs, current.StartedAt, current.FinishedAt, current.UpdatedAt = 0, "", "", ""
	wanted.DurationMs, wanted.StartedAt, wanted.FinishedAt, wanted.UpdatedAt = 0, "", "", ""
	if !reflect.DeepEqual(current, wanted) {
		return false, nil
	}
	var storedAgent model.AgentRun
	if err := tx.Where("id = ?", wantedAgent.ID).First(&storedAgent).Error; err != nil {
		return false, err
	}
	storedAgent.DurationMs, storedAgent.StartedAt, storedAgent.FinishedAt, storedAgent.UpdatedAt = 0, "", "", ""
	wantedAgent.DurationMs, wantedAgent.StartedAt, wantedAgent.FinishedAt, wantedAgent.UpdatedAt = 0, "", "", ""
	if !reflect.DeepEqual(storedAgent, wantedAgent) {
		return false, nil
	}
	var storedRun model.InvocationRun
	if err := tx.Where("id = ? AND user_id = ?", wantedRun.ID, wantedRun.UserID).First(&storedRun).Error; err != nil {
		return false, err
	}
	storedRun.UpdatedAt, wantedRun.UpdatedAt = "", ""
	if !reflect.DeepEqual(storedRun, wantedRun) {
		return false, nil
	}
	var storedEvents []model.InvocationEvent
	if err := tx.Where("user_id = ? AND invocation_id = ? AND revision = ? AND attempt = ?", wantedEvent.UserID, wantedEvent.InvocationID, wantedEvent.Revision, wantedEvent.Attempt).Find(&storedEvents).Error; err != nil {
		return false, err
	}
	wantedEvent.ID, wantedEvent.CreatedAt = 0, ""
	matches := 0
	for _, storedEvent := range storedEvents {
		storedEvent.ID, storedEvent.CreatedAt = 0, ""
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
	for index := range storedRefs {
		storedRefs[index].CreatedAt = ""
	}
	for index := range refsCopy {
		refsCopy[index].CreatedAt = ""
	}
	for index := range storedGates {
		storedGates[index].CreatedAt = ""
	}
	for index := range gatesCopy {
		gatesCopy[index].CreatedAt = ""
	}
	for index := range storedArtifacts {
		storedArtifacts[index].CreatedAt = ""
	}
	for index := range artifactsCopy {
		artifactsCopy[index].CreatedAt = ""
	}
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
	database, err := DB()
	if err != nil {
		return err
	}
	var expected model.InvocationAttempt
	if err := database.Where("id = ? AND user_id = ? AND invocation_id = ?", attempt.ID, attempt.UserID, attempt.InvocationID).First(&expected).Error; err != nil {
		return ErrInvocationTransitionConflict
	}
	return RevalidateInvocationAttemptCASTx(run, expected, attempt, artifacts, refs, gates, event)
}

func RevalidateInvocationAttemptCASTx(run model.InvocationRun, expected, attempt model.InvocationAttempt, artifacts []model.Artifact, refs []model.InvocationArtifactRef, gates []model.InvocationGateResult, event model.InvocationEvent) error {
	if run.ID != attempt.InvocationID || run.UserID != attempt.UserID || run.LatestRevision != attempt.Revision || run.LatestAttempt != attempt.Attempt || attempt.ID != expected.ID || attempt.AgentRunID != expected.AgentRunID {
		return ErrInvocationTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	for range 20 {
		err = database.Transaction(func(tx *gorm.DB) error {
			if err := validateCompletionEnvelopeTx(tx, run, attempt, artifacts, refs, gates, event); err != nil {
				return err
			}
			var stored model.InvocationAttempt
			if err := tx.Where("id = ? AND invocation_id = ? AND attempt = ?", attempt.ID, run.ID, attempt.Attempt).First(&stored).Error; err != nil {
				return err
			}
			if stored.ID != expected.ID || stored.UserID != expected.UserID || stored.InvocationID != expected.InvocationID || stored.AgentRunID != expected.AgentRunID || stored.Revision != expected.Revision || stored.Attempt != expected.Attempt || stored.CreatedAt != expected.CreatedAt || stored.StartedAt != expected.StartedAt || stored.Status != string(model.AgentRunStatusFailed) || (stored.ErrorClass != "output_schema" && stored.ErrorClass != "business_gate") {
				return ErrInvocationTransitionConflict
			}
			if stored.FinishedAt == "" {
				return ErrInvocationTransitionConflict
			}
			if stored.RawOutput != expected.RawOutput || stored.StructuredOutputJSON != expected.StructuredOutputJSON || stored.CorrectionTraceJSON != expected.CorrectionTraceJSON || stored.ErrorClass != expected.ErrorClass || stored.ErrorMessage != expected.ErrorMessage || attempt.RawOutput != expected.RawOutput {
				return ErrInvocationTransitionConflict
			}
			result := tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ? AND status = ? AND latest_revision = ? AND latest_attempt = ?", run.ID, run.UserID, model.InvocationStatusFailed, run.LatestRevision, attempt.Attempt).Updates(invocationHeaderUpdates(run))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrInvocationTransitionConflict
			}
			attemptUpdate := tx.Model(&model.InvocationAttempt{}).
				Where("id = ? AND user_id = ? AND invocation_id = ? AND attempt = ? AND status = ? AND error_class = ? AND raw_output = ? AND structured_output_json = ? AND correction_trace_json = ? AND finished_at = ?", stored.ID, stored.UserID, stored.InvocationID, stored.Attempt, expected.Status, expected.ErrorClass, expected.RawOutput, expected.StructuredOutputJSON, expected.CorrectionTraceJSON, stored.FinishedAt).
				Updates(map[string]any{"status": attempt.Status, "structured_output_json": attempt.StructuredOutputJSON, "error_class": attempt.ErrorClass, "error_message": attempt.ErrorMessage, "correction_trace_json": attempt.CorrectionTraceJSON, "updated_at": attempt.UpdatedAt})
			if attemptUpdate.Error != nil || attemptUpdate.RowsAffected != 1 {
				if attemptUpdate.Error != nil {
					return attemptUpdate.Error
				}
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
		if !isSQLiteContention(database, err) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	return err
}

func SaveInvocationReviewTx(run model.InvocationRun, review model.InvocationReview, event model.InvocationEvent) error {
	if review.UserID != run.UserID || review.InvocationID != run.ID || review.Attempt != run.LatestAttempt || review.Attempt != run.ReviewedAttempt || review.ArtifactSetHash != run.ReviewedArtifactSetHash || event.UserID != run.UserID || event.InvocationID != run.ID || event.Attempt != review.Attempt || event.Revision != run.LatestRevision {
		return ErrInvocationTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	for range 20 {
		err = database.Transaction(func(tx *gorm.DB) error {
			result := tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ? AND status = ? AND latest_revision = ? AND latest_attempt = ? AND (reviewed_attempt < ? OR (reviewed_attempt = ? AND reviewed_artifact_set_hash <> ?))", run.ID, run.UserID, model.InvocationStatusNeedsReview, run.LatestRevision, review.Attempt, review.Attempt, review.Attempt, review.ArtifactSetHash).Updates(invocationHeaderUpdates(run))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrInvocationTransitionConflict
			}
			var attempt model.InvocationAttempt
			attemptQuery := tx.Where("user_id = ? AND invocation_id = ? AND attempt = ?", run.UserID, run.ID, review.Attempt).Limit(1).Find(&attempt)
			if attemptQuery.Error != nil {
				return attemptQuery.Error
			}
			if attemptQuery.RowsAffected == 1 {
				target := string(model.AgentRunStatusApproved)
				if review.Decision == "rejected" {
					target = string(model.AgentRunStatusRejected)
				}
				updated := tx.Model(&model.InvocationAttempt{}).Where("id = ? AND status = ?", attempt.ID, string(model.AgentRunStatusNeedsReview)).Updates(map[string]any{"status": target, "updated_at": review.CreatedAt})
				if updated.Error != nil || updated.RowsAffected != 1 {
					if updated.Error != nil {
						return updated.Error
					}
					return ErrInvocationTransitionConflict
				}
				var agent model.AgentRun
				if err := tx.Where("id = ? AND user_id = ?", attempt.AgentRunID, run.UserID).First(&agent).Error; err != nil {
					return err
				}
				if agent.Status == model.AgentRunStatusNeedsReview {
					updated = tx.Model(&model.AgentRun{}).Where("id = ? AND user_id = ? AND status = ?", attempt.AgentRunID, run.UserID, model.AgentRunStatusNeedsReview).Updates(map[string]any{"status": model.AgentRunStatus(target), "updated_at": review.CreatedAt})
					if updated.Error != nil || updated.RowsAffected != 1 {
						if updated.Error != nil {
							return updated.Error
						}
						return ErrInvocationTransitionConflict
					}
				} else if agent.Status != model.AgentRunStatusFailed || strings.TrimSpace(attempt.CorrectionTraceJSON) == "" {
					return ErrInvocationTransitionConflict
				}
			}
			if err := tx.Create(&review).Error; err != nil {
				return err
			}
			return tx.Create(&event).Error
		})
		if !isSQLiteContention(database, err) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	return err
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
				event.Type, event.Level = "apply.failed", "warning"
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
			event.Type, event.Level = "apply.applied", "info"
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
	if revision.UserID != run.UserID || revision.InvocationID != run.ID || revision.Revision != run.LatestRevision || revision.RequestHash != run.RequestHash || event.UserID != run.UserID || event.InvocationID != run.ID || event.Revision != revision.Revision || event.Attempt != 0 {
		return ErrInvocationTransitionConflict
	}
	for _, ref := range refs {
		if ref.UserID != run.UserID || ref.InvocationID != run.ID || ref.Revision != revision.Revision || ref.Attempt != 0 || ref.Direction != "input" {
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

func validateCompletionEnvelopeTx(tx *gorm.DB, run model.InvocationRun, attempt model.InvocationAttempt, artifacts []model.Artifact, refs []model.InvocationArtifactRef, gates []model.InvocationGateResult, event model.InvocationEvent) error {
	if event.UserID != run.UserID || event.InvocationID != run.ID || event.Revision != attempt.Revision || event.Attempt != attempt.Attempt {
		return ErrInvocationTransitionConflict
	}
	byID := make(map[string]model.Artifact, len(artifacts))
	for _, artifact := range artifacts {
		if artifact.UserID != run.UserID || artifact.ProjectID != run.ProjectID || artifact.EpisodeID != run.EpisodeID || artifact.ProducerInvocationID == nil || *artifact.ProducerInvocationID != run.ID || artifact.ProducerAttempt != attempt.Attempt {
			return ErrInvocationTransitionConflict
		}
		byID[artifact.ID] = artifact
	}
	type preservedRef struct {
		BindingName, ArtifactID, ArtifactHash, ArtifactType, SchemaVersion, SchemaContentHash string
		Ordinal                                                                               int
	}
	var plan struct {
		PreservedOutputRefs []preservedRef `json:"preservedOutputRefs"`
	}
	if strings.TrimSpace(attempt.RetryPlanJSON) != "" && json.Unmarshal([]byte(attempt.RetryPlanJSON), &plan) != nil {
		return ErrInvocationTransitionConflict
	}
	terminalWithoutOutputs := run.Status == model.InvocationStatusFailed || run.Status == model.InvocationStatusBlocked || run.Status == model.InvocationStatusCancelled
	if terminalWithoutOutputs && (len(artifacts) != 0 || len(refs) != 0) {
		return ErrInvocationTransitionConflict
	}
	preserved := map[string]preservedRef{}
	for _, ref := range plan.PreservedOutputRefs {
		if terminalWithoutOutputs {
			break
		}
		key := fmt.Sprintf("%s\x00%d", ref.BindingName, ref.Ordinal)
		if _, duplicate := preserved[key]; duplicate || attempt.Attempt < 2 {
			return ErrInvocationTransitionConflict
		}
		preserved[key] = ref
		var artifact model.Artifact
		result := tx.Where("id = ? AND user_id = ?", ref.ArtifactID, run.UserID).Limit(1).Find(&artifact)
		if result.Error != nil || result.RowsAffected != 1 {
			return ErrInvocationTransitionConflict
		}
		if artifact.ProjectID != run.ProjectID || artifact.EpisodeID != run.EpisodeID || artifact.ContentHash != ref.ArtifactHash || artifact.ArtifactType != ref.ArtifactType || artifact.SchemaVersion != ref.SchemaVersion || artifact.SchemaContentHash != ref.SchemaContentHash {
			return ErrInvocationTransitionConflict
		}
		byID[artifact.ID] = artifact
	}
	if len(refs) != len(artifacts)+len(preserved) {
		return ErrInvocationTransitionConflict
	}
	seen := map[string]bool{}
	seenPreserved := map[string]bool{}
	for _, ref := range refs {
		artifact, ok := byID[ref.ArtifactID]
		if !ok || seen[ref.ArtifactID] || ref.UserID != run.UserID || ref.InvocationID != run.ID || ref.Direction != "output" || ref.Revision != attempt.Revision || ref.Attempt != attempt.Attempt || ref.ArtifactHash != artifact.ContentHash || ref.ArtifactType != artifact.ArtifactType || ref.SchemaVersion != artifact.SchemaVersion || ref.SchemaContentHash != artifact.SchemaContentHash {
			return ErrInvocationTransitionConflict
		}
		key := fmt.Sprintf("%s\x00%d", ref.BindingName, ref.Ordinal)
		if wanted, isPreserved := preserved[key]; isPreserved {
			if wanted.ArtifactID != ref.ArtifactID || wanted.ArtifactHash != ref.ArtifactHash || wanted.ArtifactType != ref.ArtifactType || wanted.SchemaVersion != ref.SchemaVersion || wanted.SchemaContentHash != ref.SchemaContentHash {
				return ErrInvocationTransitionConflict
			}
			seenPreserved[key] = true
		} else if artifact.ProducerAttempt != attempt.Attempt {
			return ErrInvocationTransitionConflict
		}
		seen[ref.ArtifactID] = true
	}
	if len(seenPreserved) != len(preserved) {
		return ErrInvocationTransitionConflict
	}
	hasFailedGate := false
	passedArtifacts := make(map[string]bool, len(artifacts))
	for _, gate := range gates {
		if gate.UserID != run.UserID || gate.InvocationID != run.ID || gate.Attempt != attempt.Attempt {
			return ErrInvocationTransitionConflict
		}
		artifact, ok := byID[gate.ArtifactID]
		if gate.ArtifactID == "" {
			if gate.ArtifactHash != "" || (!gate.Passed && run.Status != model.InvocationStatusFailed && run.Status != model.InvocationStatusBlocked && run.Status != model.InvocationStatusPartial) {
				return ErrInvocationTransitionConflict
			}
			hasFailedGate = hasFailedGate || !gate.Passed
			continue
		}
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

func GetInvocationAttempt(userID, invocationID string, attempt int) (model.InvocationAttempt, bool, error) {
	database, err := DB()
	if err != nil {
		return model.InvocationAttempt{}, false, err
	}
	var item model.InvocationAttempt
	result := database.Where("user_id = ? AND invocation_id = ? AND attempt = ?", strings.TrimSpace(userID), strings.TrimSpace(invocationID), attempt).Limit(1).Find(&item)
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
