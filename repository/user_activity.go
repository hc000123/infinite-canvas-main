package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func SaveUserActivity(item model.UserActivityLog) (model.UserActivityLog, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	if item.ClientEventID == "" {
		item.ClientEventID = "server:" + item.ID
	}
	var saved model.UserActivityLog
	err = db.Where("user_id = ? AND client_event_id = ?", item.UserID, item.ClientEventID).First(&saved).Error
	if err == nil {
		return saved, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return item, err
	}
	if err = db.Create(&item).Error; err == nil {
		return item, nil
	}
	if queryErr := db.Where("user_id = ? AND client_event_id = ?", item.UserID, item.ClientEventID).First(&saved).Error; queryErr == nil {
		return saved, nil
	}
	return item, err
}

func ListUserActivities(q model.UserActivityQuery) ([]model.UserActivityLog, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.UserActivityLog{})
	if v := strings.TrimSpace(q.ExactUserID); v != "" {
		tx = tx.Where("user_id = ?", v)
	}
	if v := strings.TrimSpace(q.Category); v != "" {
		tx = tx.Where("category = ?", v)
	}
	if v := strings.TrimSpace(q.Action); v != "" {
		tx = tx.Where("action = ?", v)
	}
	if v := strings.TrimSpace(q.Result); v != "" {
		tx = tx.Where("result = ?", v)
	}
	if v := strings.TrimSpace(q.IPAddress); v != "" {
		tx = tx.Where("ip_address = ?", v)
	}
	if q.OutsideIPOnly {
		tx = tx.Where("ip_allowed = ?", false)
	}
	if v := strings.TrimSpace(q.StartAt); v != "" {
		tx = tx.Where("created_at >= ?", v)
	}
	if v := strings.TrimSpace(q.EndAt); v != "" {
		tx = tx.Where("created_at <= ?", v)
	}
	if v := strings.TrimSpace(q.Keyword); v != "" {
		like := "%" + v + "%"
		tx = tx.Where("action LIKE ? OR target_id LIKE ? OR target_name LIKE ? OR summary LIKE ?", like, like, like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.UserActivityLog
	err = tx.Order("created_at desc, id desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}
