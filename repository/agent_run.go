package repository

import (
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

var ErrAgentRunNotFound = errors.New("agent run not found")

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
	db, err := DB()
	if err != nil {
		return model.AgentRun{}, false, err
	}
	nowText := now.UTC().Format(time.RFC3339Nano)
	leaseText := now.UTC().Add(lease).Format(time.RFC3339Nano)
	workerID = strings.TrimSpace(workerID)
	for range 5 {
		var candidate model.AgentRun
		err := db.Where("status = ? AND (available_at = '' OR available_at <= ?) AND (lease_expires_at = '' OR lease_expires_at <= ?)", model.AgentRunStatusQueued, nowText, nowText).
			Order("available_at asc, created_at asc").First(&candidate).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.AgentRun{}, false, nil
		}
		if err != nil {
			return model.AgentRun{}, false, err
		}
		tx := db.Model(&model.AgentRun{}).
			Where("id = ? AND status = ? AND (lease_expires_at = '' OR lease_expires_at <= ?)", candidate.ID, model.AgentRunStatusQueued, nowText).
			Updates(map[string]any{
				"status":           model.AgentRunStatusRunning,
				"lease_owner":      workerID,
				"lease_expires_at": leaseText,
				"heartbeat_at":     nowText,
				"started_at":       nowText,
				"updated_at":       nowText,
				"attempt":          gorm.Expr("attempt + 1"),
			})
		if tx.Error != nil {
			return model.AgentRun{}, false, tx.Error
		}
		if tx.RowsAffected == 0 {
			continue
		}
		claimed, ok, err := GetAgentRun(candidate.ID)
		return claimed, ok, err
	}
	return model.AgentRun{}, false, nil
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
				updates["status"] = model.AgentRunStatusCancelled
				updates["finished_at"] = nowText
			} else if run.MaxAttempts > 0 && run.Attempt >= run.MaxAttempts {
				updates["status"] = model.AgentRunStatusFailed
				updates["finished_at"] = nowText
				updates["error_message"] = "Worker 租约过期且已达到最大重试次数"
			}
			result := tx.Model(&model.AgentRun{}).
				Where("id = ? AND lease_owner = ? AND lease_expires_at = ?", run.ID, run.LeaseOwner, run.LeaseExpiresAt).
				Updates(updates)
			if result.Error != nil {
				return result.Error
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
	var run model.AgentRun
	if err := db.Where("id = ? AND user_id = ?", strings.TrimSpace(id), strings.TrimSpace(userID)).First(&run).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.AgentRun{}, ErrAgentRunNotFound
		}
		return model.AgentRun{}, err
	}
	nowText := time.Now().UTC().Format(time.RFC3339Nano)
	switch run.Status {
	case model.AgentRunStatusCreated, model.AgentRunStatusQueued:
		run.Status = model.AgentRunStatusCancelled
		run.FinishedAt = nowText
	case model.AgentRunStatusRunning:
		run.Status = model.AgentRunStatusCancelRequested
	default:
		return run, nil
	}
	run.UpdatedAt = nowText
	return run, db.Save(&run).Error
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
