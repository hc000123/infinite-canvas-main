package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func SaveAITask(task model.AITask) (model.AITask, error) {
	db, err := DB()
	if err != nil {
		return task, err
	}
	return task, db.Save(&task).Error
}

func GetAITask(id string) (model.AITask, bool, error) {
	db, err := DB()
	if err != nil {
		return model.AITask{}, false, err
	}
	var task model.AITask
	err = db.Where("id = ?", id).First(&task).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.AITask{}, false, nil
	}
	return task, err == nil, err
}

func GetAITaskByUpstreamTaskID(upstreamTaskID string) (model.AITask, bool, error) {
	db, err := DB()
	if err != nil {
		return model.AITask{}, false, err
	}
	var task model.AITask
	err = db.Where("upstream_task_id = ?", upstreamTaskID).Order("created_at desc").First(&task).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.AITask{}, false, nil
	}
	return task, err == nil, err
}

func ListAITasks(q model.AITaskQuery) ([]model.AITask, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := applyAITaskFilters(db.Model(&model.AITask{}), q)
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var tasks []model.AITask
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&tasks).Error
	return tasks, total, err
}

func ListCreditLogsByRelatedID(relatedID string) ([]model.CreditLog, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var logs []model.CreditLog
	err = db.Where("related_id = ?", relatedID).Order("created_at desc").Find(&logs).Error
	return logs, err
}

func CountCreditLogsByRelatedIDAndType(relatedID string, logType model.CreditLogType) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var total int64
	err = db.Model(&model.CreditLog{}).Where("related_id = ? AND type = ?", relatedID, logType).Count(&total).Error
	return total, err
}

func LatestCreditLogByRelatedIDAndType(relatedID string, logType model.CreditLogType) (model.CreditLog, bool, error) {
	db, err := DB()
	if err != nil {
		return model.CreditLog{}, false, err
	}
	var log model.CreditLog
	err = db.Where("related_id = ? AND type = ?", relatedID, logType).Order("created_at desc").First(&log).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.CreditLog{}, false, nil
	}
	return log, err == nil, err
}

func applyAITaskFilters(tx *gorm.DB, q model.AITaskQuery) *gorm.DB {
	if value := strings.TrimSpace(q.User); value != "" {
		like := "%" + value + "%"
		tx = tx.Where("user_id LIKE ?", like)
	}
	if value := strings.TrimSpace(q.Status); value != "" {
		tx = tx.Where("status = ?", value)
	}
	if value := strings.TrimSpace(q.Kind); value != "" {
		tx = tx.Where("kind = ?", value)
	}
	if value := strings.TrimSpace(q.ActionType); value != "" {
		tx = tx.Where("action_type = ?", value)
	}
	if value := strings.TrimSpace(q.Model); value != "" {
		tx = tx.Where("model = ?", value)
	}
	if value := strings.TrimSpace(q.Provider); value != "" {
		tx = tx.Where("provider = ?", value)
	}
	if value := strings.TrimSpace(q.UpstreamTaskID); value != "" {
		tx = tx.Where("upstream_task_id = ?", value)
	}
	if value := strings.TrimSpace(q.StartAt); value != "" {
		tx = tx.Where("created_at >= ?", value)
	}
	if value := strings.TrimSpace(q.EndAt); value != "" {
		tx = tx.Where("created_at <= ?", value)
	}
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("id LIKE ? OR user_id LIKE ? OR kind LIKE ? OR task_type LIKE ? OR action_type LIKE ? OR model LIKE ? OR provider LIKE ? OR upstream_task_id LIKE ? OR error_code LIKE ? OR error_message LIKE ? OR request_json LIKE ? OR response_json LIKE ?", like, like, like, like, like, like, like, like, like, like, like, like)
	}
	return tx
}
