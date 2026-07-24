package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// ListUsers 分页查询用户。
func ListUsers(q model.Query) ([]model.User, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.User{}).Where("role = ?", model.UserRoleUser)
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("username LIKE ? OR display_name LIKE ? OR email LIKE ? OR linux_do_id LIKE ?", like, like, like, like)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []model.User
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&users).Error
	return users, total, err
}

func ListAdminAccounts(q model.AdminAccountQuery) ([]model.User, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.User{}).Where("role IN ?", []model.UserRole{model.UserRoleAdmin, model.UserRoleSuperAdmin})
	if role := strings.TrimSpace(q.Role); role != "" {
		tx = tx.Where("role = ?", role)
	}
	if status := strings.TrimSpace(q.Status); status != "" {
		tx = tx.Where("status = ?", status)
	}
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("username LIKE ? OR display_name LIKE ? OR email LIKE ?", like, like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var users []model.User
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&users).Error
	return users, total, err
}

func CountActiveSuperAdmins() (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var count int64
	err = db.Model(&model.User{}).Where("role = ? AND status = ?", model.UserRoleSuperAdmin, model.UserStatusActive).Count(&count).Error
	return count, err
}

func UpdatePrivilegedUser(actorID string, target model.User, removesActiveSuperAdmin bool) (model.User, error) {
	db, err := DB()
	if err != nil {
		return target, err
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		var saved model.User
		if err := tx.Where("id = ? AND role IN ?", target.ID, []model.UserRole{model.UserRoleAdmin, model.UserRoleSuperAdmin}).First(&saved).Error; err != nil {
			return err
		}
		if saved.ID == actorID {
			return errors.New("不能修改自己的管理员状态")
		}
		if removesActiveSuperAdmin && saved.Role == model.UserRoleSuperAdmin && saved.Status == model.UserStatusActive {
			var count int64
			if err := tx.Model(&model.User{}).Where("role = ? AND status = ?", model.UserRoleSuperAdmin, model.UserStatusActive).Count(&count).Error; err != nil {
				return err
			}
			if count <= 1 {
				return errors.New("必须保留至少一个有效超级管理员")
			}
		}
		return tx.Save(&target).Error
	})
	return target, err
}

func DeletePrivilegedUser(actorID string, targetID string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var saved model.User
		if err := tx.Where("id = ? AND role IN ?", targetID, []model.UserRole{model.UserRoleAdmin, model.UserRoleSuperAdmin}).First(&saved).Error; err != nil {
			return err
		}
		if saved.ID == actorID {
			return errors.New("不能删除自己的管理员账号")
		}
		if saved.Role == model.UserRoleSuperAdmin && saved.Status == model.UserStatusActive {
			var count int64
			if err := tx.Model(&model.User{}).Where("role = ? AND status = ?", model.UserRoleSuperAdmin, model.UserStatusActive).Count(&count).Error; err != nil {
				return err
			}
			if count <= 1 {
				return errors.New("必须保留至少一个有效超级管理员")
			}
		}
		return tx.Delete(&model.User{}, "id = ?", targetID).Error
	})
}

// CountUsers 返回用户总数。
func CountUsers() (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var total int64
	return total, db.Model(&model.User{}).Count(&total).Error
}

// HasAdmin 判断系统中是否存在管理员。
func HasAdmin() (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var total int64
	err = db.Model(&model.User{}).Where("role IN ?", []model.UserRole{model.UserRoleAdmin, model.UserRoleSuperAdmin}).Count(&total).Error
	return total > 0, err
}

// GetUserByID 根据 ID 查询用户。
func GetUserByID(id string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "id = ?", id)
}

// GetUserByUsername 根据用户名查询用户。
func GetUserByUsername(username string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "username = ?", username)
}

// SaveUser 保存用户信息。
func SaveUser(user model.User) (model.User, error) {
	db, err := DB()
	if err != nil {
		return user, err
	}
	return user, db.Save(&user).Error
}

func ConsumeUserCredits(id string, credits int, now string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	if credits <= 0 {
		user, ok, err := GetUserByID(id)
		return user, ok, err
	}
	tx := db.Model(&model.User{}).Where("id = ? AND credits >= ?", id, credits).Updates(map[string]any{
		"credits":    gorm.Expr("credits - ?", credits),
		"updated_at": now,
	})
	if tx.Error != nil {
		return model.User{}, false, tx.Error
	}
	user, ok, err := GetUserByID(id)
	return user, ok && tx.RowsAffected > 0, err
}

func RefundUserCredits(id string, credits int, now string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	if credits <= 0 {
		user, ok, err := GetUserByID(id)
		return user, ok, err
	}
	tx := db.Model(&model.User{}).Where("id = ?", id).Updates(map[string]any{
		"credits":    gorm.Expr("credits + ?", credits),
		"updated_at": now,
	})
	if tx.Error != nil {
		return model.User{}, false, tx.Error
	}
	user, ok, err := GetUserByID(id)
	return user, ok && tx.RowsAffected > 0, err
}

// SaveCreditLog 保存算力点变更流水。
func SaveCreditLog(log model.CreditLog) (model.CreditLog, error) {
	db, err := DB()
	if err != nil {
		return log, err
	}
	return log, db.Save(&log).Error
}

func ListCreditLogs(q model.Query) ([]model.CreditLog, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.CreditLog{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		if types := creditLogTypesForKeyword(keyword); len(types) > 0 {
			tx = tx.Where("user_id LIKE ? OR type LIKE ? OR type IN ? OR remark LIKE ? OR related_id LIKE ?", like, like, types, like, like)
		} else {
			tx = tx.Where("user_id LIKE ? OR type LIKE ? OR remark LIKE ? OR related_id LIKE ?", like, like, like, like)
		}
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var logs []model.CreditLog
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&logs).Error
	return logs, total, err
}

func DeleteCreditLog(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.CreditLog{}, "id = ?", id).Error
}

func creditLogTypesForKeyword(keyword string) []model.CreditLogType {
	keyword = strings.ToLower(strings.TrimSpace(keyword))
	result := []model.CreditLogType{}
	if strings.Contains(keyword, "消费") {
		result = append(result, model.CreditLogTypeAIConsume)
	}
	if strings.Contains(keyword, "返还") {
		result = append(result, model.CreditLogTypeAIRefund)
	}
	if strings.Contains(keyword, "调整") || strings.Contains(keyword, "后台") {
		result = append(result, model.CreditLogTypeAdminAdjust)
	}
	return result
}

// DeleteUser 删除指定用户。
func DeleteUser(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.User{}, "id = ?", id).Error
}

// GetUserByLinuxDoID 根据 Linux.do ID 查询用户。
func GetUserByLinuxDoID(id string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "linux_do_id = ?", id)
}

// findUser 查询单个用户，并将未命中转换为 ok=false。
func findUser(db *gorm.DB, query string, args ...any) (model.User, bool, error) {
	user := model.User{}
	err := db.Where(query, args...).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.User{}, false, nil
	}
	return user, err == nil, err
}
