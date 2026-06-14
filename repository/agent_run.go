package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

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
