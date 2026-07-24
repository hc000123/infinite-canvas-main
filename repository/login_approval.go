package repository

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

func ListUserAllowedIPs(userID string) ([]model.UserAllowedIP, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.UserAllowedIP
	err = db.Where("user_id = ?", userID).Order("created_at desc").Find(&items).Error
	return items, err
}
func SaveUserAllowedIP(item model.UserAllowedIP) (model.UserAllowedIP, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	return item, db.Create(&item).Error
}
func DeleteUserAllowedIP(userID, id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.UserAllowedIP{}, "id = ? AND user_id = ?", id, userID).Error
}
func SaveLoginApproval(item model.LoginApproval) (model.LoginApproval, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	return item, db.Create(&item).Error
}
func GetLoginApproval(id string) (model.LoginApproval, bool, error) {
	db, err := DB()
	if err != nil {
		return model.LoginApproval{}, false, err
	}
	var item model.LoginApproval
	tx := db.Where("id = ?", id).First(&item)
	return item, tx.RowsAffected > 0, tx.Error
}
func GetLoginApprovalByTokenHash(hash string) (model.LoginApproval, bool, error) {
	db, err := DB()
	if err != nil {
		return model.LoginApproval{}, false, err
	}
	var item model.LoginApproval
	tx := db.Where("token_hash = ?", hash).First(&item)
	return item, tx.RowsAffected > 0, tx.Error
}
func DecideLoginApproval(id string, status model.LoginApprovalStatus, scope model.LoginApprovalScope, actor, at string) (model.LoginApproval, bool, error) {
	db, err := DB()
	if err != nil {
		return model.LoginApproval{}, false, err
	}
	tx := db.Model(&model.LoginApproval{}).Where("id = ? AND status = ?", id, model.LoginApprovalPending).Updates(map[string]any{"status": status, "scope": scope, "decided_by": actor, "decided_at": at})
	if tx.Error != nil || tx.RowsAffected == 0 {
		return model.LoginApproval{}, false, tx.Error
	}
	item, _, err := GetLoginApproval(id)
	return item, true, err
}
func ConsumeLoginApproval(id, hash, at string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	tx := db.Model(&model.LoginApproval{}).Where("id = ? AND token_hash = ? AND status = ?", id, hash, model.LoginApprovalApproved).Updates(map[string]any{"status": model.LoginApprovalConsumed, "consumed_at": at})
	return tx.RowsAffected == 1, tx.Error
}
func ListLoginApprovals(q model.LoginApprovalQuery) ([]model.LoginApproval, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.LoginApproval{})
	if v := strings.TrimSpace(q.Status); v != "" {
		tx = tx.Where("status = ?", v)
	}
	if v := strings.TrimSpace(q.ExactUserID); v != "" {
		tx = tx.Where("user_id = ?", v)
	}
	if v := strings.TrimSpace(q.Keyword); v != "" {
		like := "%" + v + "%"
		tx = tx.Where("requested_ip LIKE ? OR user_id LIKE ? OR user_id IN (SELECT id FROM users WHERE username LIKE ? OR display_name LIKE ?)", like, like, like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.LoginApproval
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}
