package repository

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

var (
	ErrWorkflowMediaBatchNotFound = errors.New("workflow media batch not found")
	ErrWorkflowMediaBatchInvalid  = errors.New("workflow media batch invalid")
)

func CreateWorkflowMediaBatch(batch model.WorkflowMediaBatch) (model.WorkflowMediaBatch, error) {
	db, err := DB()
	if err != nil {
		return batch, err
	}
	var existing model.WorkflowMediaBatch
	query := db.Where("user_id = ? AND workflow_run_id = ? AND stage_id = ? AND idempotency_key = ?", batch.UserID, batch.WorkflowRunID, batch.StageID, batch.IdempotencyKey)
	if err := query.First(&existing).Error; err == nil {
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return batch, err
	}
	if err := db.Create(&batch).Error; err != nil {
		if lookupErr := query.First(&existing).Error; lookupErr == nil {
			return existing, nil
		}
		return batch, err
	}
	return batch, nil
}

func GetUserWorkflowMediaBatch(userID string, id string) (model.WorkflowMediaBatchDetail, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowMediaBatchDetail{}, false, err
	}
	var batch model.WorkflowMediaBatch
	err = db.Where("id = ? AND user_id = ?", strings.TrimSpace(id), strings.TrimSpace(userID)).First(&batch).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowMediaBatchDetail{}, false, nil
	}
	if err != nil {
		return model.WorkflowMediaBatchDetail{}, false, err
	}
	var items []model.WorkflowMediaItem
	err = db.Where("batch_id = ?", batch.ID).Order(workflowMediaOrderSQL()).Find(&items).Error
	return model.WorkflowMediaBatchDetail{Batch: batch, Items: items}, err == nil, err
}

func CreateWorkflowMediaItem(item model.WorkflowMediaItem) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var batch model.WorkflowMediaBatch
		if err := tx.Where("id = ? AND status = ?", item.BatchID, model.WorkflowMediaBatchOpen).First(&batch).Error; err != nil {
			return ErrWorkflowMediaBatchInvalid
		}
		var count int64
		if err := tx.Model(&model.WorkflowMediaItem{}).Where("batch_id = ?", item.BatchID).Count(&count).Error; err != nil {
			return err
		}
		if count >= 9 {
			return ErrWorkflowMediaBatchInvalid
		}
		return tx.Create(&item).Error
	})
}

func DeleteOpenWorkflowMediaBatch(userID string, id string) ([]string, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	paths := []string{}
	err = db.Transaction(func(tx *gorm.DB) error {
		var batch model.WorkflowMediaBatch
		if err := tx.Where("id = ? AND user_id = ? AND status = ?", strings.TrimSpace(id), strings.TrimSpace(userID), model.WorkflowMediaBatchOpen).First(&batch).Error; err != nil {
			return err
		}
		var items []model.WorkflowMediaItem
		if err := tx.Where("batch_id = ?", batch.ID).Find(&items).Error; err != nil {
			return err
		}
		for _, item := range items {
			paths = append(paths, item.ServerPath)
		}
		if err := tx.Delete(&model.WorkflowMediaItem{}, "batch_id = ?", batch.ID).Error; err != nil {
			return err
		}
		return tx.Delete(&batch).Error
	})
	return paths, err
}

func SaveAgentRunWithWorkflowMedia(run model.AgentRun, batchID string) (model.AgentRun, bool, error) {
	db, err := DB()
	if err != nil {
		return run, false, err
	}
	key := ""
	if run.IdempotencyKey != nil {
		key = strings.TrimSpace(*run.IdempotencyKey)
	}
	if key == "" {
		return run, false, ErrWorkflowMediaBatchInvalid
	}
	var existing model.AgentRun
	if err := db.Where("user_id = ? AND idempotency_key = ?", run.UserID, key).First(&existing).Error; err == nil {
		return existing, false, nil
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		var batch model.WorkflowMediaBatch
		result := tx.Where("id = ? AND user_id = ? AND workflow_run_id = ? AND stage_id = ? AND idempotency_key = ? AND status = ?", strings.TrimSpace(batchID), run.UserID, run.WorkflowRunID, run.StageID, key, model.WorkflowMediaBatchOpen).First(&batch)
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return ErrWorkflowMediaBatchNotFound
		}
		expiresAt, parseErr := time.Parse(time.RFC3339Nano, batch.ExpiresAt)
		if result.Error != nil || parseErr != nil || !expiresAt.After(time.Now()) {
			if result.Error != nil {
				return result.Error
			}
			return ErrWorkflowMediaBatchInvalid
		}
		var items []model.WorkflowMediaItem
		if err := tx.Where("batch_id = ?", batch.ID).Order(workflowMediaOrderSQL()).Find(&items).Error; err != nil {
			return err
		}
		if len(items) > 9 {
			return ErrWorkflowMediaBatchInvalid
		}
		manifestItems := make([]map[string]any, 0, len(items))
		for index, item := range items {
			manifestItems = append(manifestItems, map[string]any{
				"id": item.ID, "assetId": item.AssetID, "label": item.Label, "kind": item.Kind,
				"version": item.Version, "order": index + 1, "sha256": item.SHA256, "mime": item.MIME,
				"size": item.Size, "serverPath": item.ServerPath,
			})
		}
		reason := ""
		if len(items) == 0 {
			reason = "text-only"
		}
		manifest, _ := json.Marshal(map[string]any{"items": manifestItems, "degraded": len(items) == 0, "reason": reason})
		run.ImageManifestJSON = string(manifest)
		if err := tx.Create(&run).Error; err != nil {
			return err
		}
		updated := tx.Model(&model.WorkflowMediaBatch{}).Where("id = ? AND status = ?", batch.ID, model.WorkflowMediaBatchOpen).Updates(map[string]any{"status": model.WorkflowMediaBatchClaimed, "agent_run_id": run.ID, "updated_at": run.UpdatedAt})
		if updated.Error != nil || updated.RowsAffected != 1 {
			if updated.Error != nil {
				return updated.Error
			}
			return ErrWorkflowMediaBatchInvalid
		}
		return nil
	})
	if err != nil {
		if lookupErr := db.Where("user_id = ? AND idempotency_key = ?", run.UserID, key).First(&existing).Error; lookupErr == nil {
			return existing, false, nil
		}
		return run, false, err
	}
	return run, true, nil
}

func ClaimWorkflowMediaBatchForInvocation(userID, batchID, workflowRunID, stageID, idempotencyKey, agentRunID, manifestJSON, stamp string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var batch model.WorkflowMediaBatch
		if err := tx.Where("id = ? AND user_id = ? AND workflow_run_id = ? AND stage_id = ? AND idempotency_key = ?", strings.TrimSpace(batchID), strings.TrimSpace(userID), strings.TrimSpace(workflowRunID), strings.TrimSpace(stageID), strings.TrimSpace(idempotencyKey)).First(&batch).Error; err != nil {
			return ErrWorkflowMediaBatchNotFound
		}
		if batch.Status == model.WorkflowMediaBatchClaimed {
			if batch.AgentRunID != strings.TrimSpace(agentRunID) {
				return ErrWorkflowMediaBatchInvalid
			}
			return nil
		}
		expiresAt, parseErr := time.Parse(time.RFC3339Nano, batch.ExpiresAt)
		if batch.Status != model.WorkflowMediaBatchOpen || parseErr != nil || !expiresAt.After(time.Now()) {
			return ErrWorkflowMediaBatchInvalid
		}
		updated := tx.Model(&model.AgentRun{}).Where("id = ? AND user_id = ? AND invocation_id <> '' AND status = ?", strings.TrimSpace(agentRunID), strings.TrimSpace(userID), model.AgentRunStatusQueued).Update("image_manifest_json", strings.TrimSpace(manifestJSON))
		if updated.Error != nil || updated.RowsAffected != 1 {
			if updated.Error != nil {
				return updated.Error
			}
			return ErrWorkflowMediaBatchInvalid
		}
		updated = tx.Model(&model.WorkflowMediaBatch{}).Where("id = ? AND status = ?", batch.ID, model.WorkflowMediaBatchOpen).Updates(map[string]any{"status": model.WorkflowMediaBatchClaimed, "agent_run_id": strings.TrimSpace(agentRunID), "updated_at": stamp})
		if updated.Error != nil || updated.RowsAffected != 1 {
			if updated.Error != nil {
				return updated.Error
			}
			return ErrWorkflowMediaBatchInvalid
		}
		return nil
	})
}

func CopyAgentRunImageManifest(userID, sourceAgentRunID, targetAgentRunID string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	var source model.AgentRun
	if err := db.Select("image_manifest_json").Where("id = ? AND user_id = ?", strings.TrimSpace(sourceAgentRunID), strings.TrimSpace(userID)).First(&source).Error; err != nil {
		return err
	}
	if strings.TrimSpace(source.ImageManifestJSON) == "" {
		return nil
	}
	result := db.Model(&model.AgentRun{}).Where("id = ? AND user_id = ? AND invocation_id <> '' AND status = ?", strings.TrimSpace(targetAgentRunID), strings.TrimSpace(userID), model.AgentRunStatusQueued).Update("image_manifest_json", source.ImageManifestJSON)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrWorkflowMediaBatchInvalid
	}
	return nil
}

func workflowMediaOrderSQL() string {
	return "position ASC, CASE kind WHEN 'character' THEN 1 WHEN 'scene' THEN 2 WHEN 'prop' THEN 3 ELSE 4 END, created_at ASC"
}
