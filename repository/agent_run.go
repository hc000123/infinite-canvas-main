package repository

import (
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

var ErrAgentRunNotFound = errors.New("agent run not found")

type AgentRunQueueStats struct {
	Queued      int64
	Running     int64
	StaleLeases int64
}

func SaveAgentConfigRecord(item model.AgentConfigRecord) (model.AgentConfigRecord, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	return item, db.Save(&item).Error
}

func GetAgentConfigRecord(id string) (model.AgentConfigRecord, bool, error) {
	db, err := DB()
	if err != nil {
		return model.AgentConfigRecord{}, false, err
	}
	var item model.AgentConfigRecord
	err = db.Where("id = ?", strings.TrimSpace(id)).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.AgentConfigRecord{}, false, nil
	}
	return item, err == nil, err
}

func ListAgentConfigRecords(userID string, projectID string, episodeID string) ([]model.AgentConfigRecord, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	tx := db.Where("user_id = ?", strings.TrimSpace(userID))
	if projectID != "" {
		tx = tx.Where("project_id = ?", strings.TrimSpace(projectID))
	}
	if episodeID != "" {
		tx = tx.Where("episode_id = ?", strings.TrimSpace(episodeID))
	}
	var items []model.AgentConfigRecord
	err = tx.Order("updated_at desc").Find(&items).Error
	return items, err
}

func SaveAgentRun(run model.AgentRun) (model.AgentRun, error) {
	db, err := DB()
	if err != nil {
		return run, err
	}
	return run, db.Save(&run).Error
}

func ListAgentRunsByIDs(ids []string) (map[string]model.AgentRun, error) {
	result := make(map[string]model.AgentRun, len(ids))
	if len(ids) == 0 {
		return result, nil
	}
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var runs []model.AgentRun
	if err := db.Where("id IN ?", ids).Find(&runs).Error; err != nil {
		return nil, err
	}
	for _, run := range runs {
		result[run.ID] = run
	}
	return result, nil
}

func SaveAgentRunIdempotently(run model.AgentRun) (model.AgentRun, bool, error) {
	db, err := DB()
	if err != nil {
		return run, false, err
	}
	key := ""
	if run.IdempotencyKey != nil {
		key = strings.TrimSpace(*run.IdempotencyKey)
	}
	if key == "" {
		run.IdempotencyKey = nil
		return run, true, db.Create(&run).Error
	}
	run.IdempotencyKey = &key
	var existing model.AgentRun
	query := db.Where("user_id = ? AND idempotency_key = ?", strings.TrimSpace(run.UserID), key)
	if err := query.First(&existing).Error; err == nil {
		return existing, false, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return run, false, err
	}
	if err := db.Create(&run).Error; err != nil {
		if lookupErr := query.First(&existing).Error; lookupErr == nil {
			return existing, false, nil
		}
		return run, false, err
	}
	return run, true, nil
}

func ClaimNextAgentRun(workerID string, now time.Time, lease time.Duration) (model.AgentRun, bool, error) {
	return ClaimNextAgentRunWithUserLimit(workerID, now, lease, 1)
}

func ClaimNextAgentRunWithUserLimit(workerID string, now time.Time, lease time.Duration, userConcurrency int) (model.AgentRun, bool, error) {
	return claimNextAgentRunTx(workerID, now.UTC(), lease, userConcurrency, false)
}

func RenewAgentRunLease(id string, workerID string, now time.Time, lease time.Duration) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	nowText := now.UTC().Format(time.RFC3339Nano)
	tx := db.Model(&model.AgentRun{}).
		Where("id = ? AND lease_owner = ? AND status IN ? AND lease_expires_at >= ?", strings.TrimSpace(id), strings.TrimSpace(workerID), []model.AgentRunStatus{model.AgentRunStatusRunning, model.AgentRunStatusCancelRequested}, nowText).
		Updates(map[string]any{
			"heartbeat_at":     nowText,
			"lease_expires_at": now.UTC().Add(lease).Format(time.RFC3339Nano),
			"updated_at":       nowText,
		})
	return tx.RowsAffected > 0, tx.Error
}

func SaveLeasedAgentRun(run model.AgentRun, leaseOwner string) (model.AgentRun, bool, error) {
	db, err := DB()
	if err != nil {
		return run, false, err
	}
	tx := db.Model(&model.AgentRun{}).
		Where("id = ? AND lease_owner = ?", run.ID, strings.TrimSpace(leaseOwner)).
		Select("*").Updates(&run)
	return run, tx.RowsAffected > 0, tx.Error
}

func RequeueExpiredAgentRuns(now time.Time) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	nowText := now.UTC().Format(time.RFC3339Nano)
	var runs []model.AgentRun
	if err := db.Where("status IN ? AND lease_expires_at <> '' AND lease_expires_at <= ?", []model.AgentRunStatus{model.AgentRunStatusRunning, model.AgentRunStatusCancelRequested}, nowText).Find(&runs).Error; err != nil {
		return 0, err
	}
	_ = invokeRepositoryHook("requeue", "candidate_read")
	var count int64
	err = db.Transaction(func(tx *gorm.DB) error {
		for _, run := range runs {
			status := model.AgentRunStatusQueued
			updates := map[string]any{
				"status":           status,
				"available_at":     nowText,
				"lease_owner":      "",
				"lease_expires_at": "",
				"heartbeat_at":     "",
				"updated_at":       nowText,
			}
			if run.Status == model.AgentRunStatusCancelRequested {
				status = model.AgentRunStatusCancelled
				updates["status"] = model.AgentRunStatusCancelled
				updates["finished_at"] = nowText
			} else if run.MaxAttempts > 0 && run.Attempt >= run.MaxAttempts {
				status = model.AgentRunStatusFailed
				updates["status"] = model.AgentRunStatusFailed
				updates["finished_at"] = nowText
				updates["error_message"] = "Worker 租约过期且已达到最大重试次数"
			}
			result := tx.Model(&model.AgentRun{}).
				Where("id = ? AND status = ? AND lease_owner = ? AND lease_expires_at = ?", run.ID, run.Status, run.LeaseOwner, run.LeaseExpiresAt).
				Updates(updates)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 1 {
				var invocationAttempt model.InvocationAttempt
				attemptResult := tx.Where("agent_run_id = ?", run.ID).Limit(1).Find(&invocationAttempt)
				if attemptResult.Error != nil {
					return attemptResult.Error
				}
				if attemptResult.RowsAffected == 1 {
					invocationStatus := model.InvocationStatusQueued
					attemptStatus := string(model.AgentRunStatusQueued)
					eventType := "attempt.requeued"
					attemptUpdates := map[string]any{"status": attemptStatus, "updated_at": nowText}
					invocationUpdates := map[string]any{"status": invocationStatus, "updated_at": nowText}
					if run.Status == model.AgentRunStatusCancelRequested {
						invocationStatus = model.InvocationStatusCancelled
						attemptStatus = string(model.AgentRunStatusCancelled)
						eventType = "attempt.cancelled"
						attemptUpdates = map[string]any{"status": attemptStatus, "finished_at": nowText, "updated_at": nowText}
						invocationUpdates = map[string]any{"status": invocationStatus, "updated_at": nowText}
					}
					if run.Status != model.AgentRunStatusCancelRequested && run.MaxAttempts > 0 && run.Attempt >= run.MaxAttempts {
						message := "Worker 租约过期且已达到最大重试次数"
						invocationStatus = model.InvocationStatusFailed
						attemptStatus = string(model.AgentRunStatusFailed)
						eventType = "attempt.failed"
						attemptUpdates = map[string]any{"status": attemptStatus, "error_class": "lease_expired", "error_message": message, "finished_at": nowText, "updated_at": nowText}
						invocationUpdates = map[string]any{"status": invocationStatus, "aggregate_error_summary": message, "updated_at": nowText}
					}
					attemptSources := []string{string(model.AgentRunStatusRunning)}
					runSources := []model.InvocationStatus{model.InvocationStatusRunning}
					if run.Status == model.AgentRunStatusCancelRequested {
						attemptSources = append(attemptSources, string(model.AgentRunStatusCancelRequested))
						runSources = append(runSources, model.InvocationStatusCancelRequested)
					}
					attemptUpdate := tx.Model(&model.InvocationAttempt{}).Where("id = ? AND invocation_id = ? AND status IN ?", invocationAttempt.ID, invocationAttempt.InvocationID, attemptSources).Updates(attemptUpdates)
					if attemptUpdate.Error != nil {
						return attemptUpdate.Error
					}
					if attemptUpdate.RowsAffected != 1 {
						return ErrInvocationTransitionConflict
					}
					runUpdate := tx.Model(&model.InvocationRun{}).Where("id = ? AND user_id = ? AND status IN ? AND latest_revision = ? AND latest_attempt = ?", invocationAttempt.InvocationID, invocationAttempt.UserID, runSources, invocationAttempt.Revision, invocationAttempt.Attempt).Updates(invocationUpdates)
					if runUpdate.Error != nil {
						return runUpdate.Error
					}
					if runUpdate.RowsAffected != 1 {
						return ErrInvocationTransitionConflict
					}
					if status == model.AgentRunStatusCancelled || status == model.AgentRunStatusFailed {
						reserved, refunded, settleErr := settleInvocationCreditsTx(tx, run, status, nowText, "")
						if settleErr != nil {
							return settleErr
						}
						if err := tx.Model(&model.AgentRun{}).Where("id = ? AND status = ?", run.ID, status).
							Updates(map[string]any{"credits_reserved": reserved, "credits_refunded": refunded}).Error; err != nil {
							return err
						}
						if err := tx.Model(&model.InvocationAttempt{}).Where("id = ? AND status = ?", invocationAttempt.ID, attemptStatus).
							Updates(map[string]any{"credits_reserved": reserved, "credits_refunded": refunded}).Error; err != nil {
							return err
						}
					}
					if err := tx.Create(&model.InvocationEvent{UserID: invocationAttempt.UserID, InvocationID: invocationAttempt.InvocationID, Type: eventType, Level: "warning", DataJSON: `{}`, Revision: invocationAttempt.Revision, Attempt: invocationAttempt.Attempt, CreatedAt: nowText}).Error; err != nil {
						return err
					}
				}
			}
			count += result.RowsAffected
		}
		return nil
	})
	return count, err
}

func RequestAgentRunCancel(userID string, id string) (model.AgentRun, error) {
	db, err := DB()
	if err != nil {
		return model.AgentRun{}, err
	}
	id, userID = strings.TrimSpace(id), strings.TrimSpace(userID)
	for range 8 {
		var run model.AgentRun
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&run).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return model.AgentRun{}, ErrAgentRunNotFound
			}
			return model.AgentRun{}, err
		}
		nowText := time.Now().UTC().Format(time.RFC3339Nano)
		targetStatus := run.Status
		updates := map[string]any{"updated_at": nowText}
		switch run.Status {
		case model.AgentRunStatusCreated, model.AgentRunStatusQueued:
			targetStatus = model.AgentRunStatusCancelled
			updates["status"] = targetStatus
			updates["finished_at"] = nowText
		case model.AgentRunStatusRunning:
			targetStatus = model.AgentRunStatusCancelRequested
			updates["status"] = targetStatus
		default:
			return run, nil
		}
		result := db.Model(&model.AgentRun{}).Where("id = ? AND user_id = ? AND status = ?", run.ID, run.UserID, run.Status).Updates(updates)
		if result.Error != nil {
			return run, result.Error
		}
		if result.RowsAffected == 0 {
			continue
		}
		run.Status, run.UpdatedAt = targetStatus, nowText
		if targetStatus == model.AgentRunStatusCancelled {
			run.FinishedAt = nowText
		}
		return run, nil
	}
	return model.AgentRun{}, ErrInvocationTransitionConflict
}

func GetAgentRunQueueStats(now time.Time) (AgentRunQueueStats, error) {
	db, err := DB()
	if err != nil {
		return AgentRunQueueStats{}, err
	}
	nowText := now.UTC().Format(time.RFC3339Nano)
	stats := AgentRunQueueStats{}
	if err := db.Model(&model.AgentRun{}).Where("status = ?", model.AgentRunStatusQueued).Count(&stats.Queued).Error; err != nil {
		return stats, err
	}
	if err := db.Model(&model.AgentRun{}).Where("status IN ?", []model.AgentRunStatus{model.AgentRunStatusRunning, model.AgentRunStatusCancelRequested}).Count(&stats.Running).Error; err != nil {
		return stats, err
	}
	if err := db.Model(&model.AgentRun{}).Where("status IN ? AND lease_expires_at <> '' AND lease_expires_at <= ?", []model.AgentRunStatus{model.AgentRunStatusRunning, model.AgentRunStatusCancelRequested}, nowText).Count(&stats.StaleLeases).Error; err != nil {
		return stats, err
	}
	return stats, nil
}

func GetAgentRun(id string) (model.AgentRun, bool, error) {
	db, err := DB()
	if err != nil {
		return model.AgentRun{}, false, err
	}
	var run model.AgentRun
	err = db.Where("id = ?", strings.TrimSpace(id)).First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.AgentRun{}, false, nil
	}
	return run, err == nil, err
}

func ListAgentRuns(userID string, q model.AgentRunQuery) ([]model.AgentRun, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.AgentRun{}).Where("user_id = ?", strings.TrimSpace(userID))
	if value := strings.TrimSpace(q.ProjectID); value != "" {
		tx = tx.Where("project_id = ?", value)
	}
	if value := strings.TrimSpace(q.EpisodeID); value != "" {
		tx = tx.Where("episode_id = ?", value)
	}
	if value := strings.TrimSpace(q.WorkflowRunID); value != "" {
		tx = tx.Where("workflow_run_id = ?", value)
	}
	if value := strings.TrimSpace(q.StageID); value != "" {
		tx = tx.Where("stage_id = ?", value)
	}
	if value := strings.TrimSpace(q.AgentKind); value != "" {
		tx = tx.Where("agent_kind = ?", value)
	}
	if value := strings.TrimSpace(q.Status); value != "" {
		tx = tx.Where("status = ?", value)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.AgentRun
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}
