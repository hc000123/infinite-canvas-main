package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func ReplaceLoginSession(item model.LoginSession, replacedReason string) (model.LoginSession, *model.LoginSession, error) {
	database, err := DB()
	if err != nil {
		return item, nil, err
	}
	var previous *model.LoginSession
	err = database.Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", item.UserID).First(&user).Error; err != nil {
			return err
		}
		if user.ActiveSessionID != "" {
			var saved model.LoginSession
			if err := tx.Where("id = ? AND user_id = ?", user.ActiveSessionID, user.ID).First(&saved).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			} else if err == nil {
				saved.Status = model.LoginSessionReplaced
				saved.RevokedAt = item.CreatedAt
				saved.RevokeReason = strings.TrimSpace(replacedReason)
				saved.UpdatedAt = item.CreatedAt
				if err := tx.Save(&saved).Error; err != nil {
					return err
				}
				previous = &saved
			}
		}
		if err := tx.Create(&item).Error; err != nil {
			return err
		}
		query := tx.Model(&model.User{}).Where("id = ?", user.ID)
		if user.ActiveSessionID == "" {
			query = query.Where("active_session_id IS NULL OR active_session_id = ''")
		} else {
			query = query.Where("active_session_id = ?", user.ActiveSessionID)
		}
		result := query.Update("active_session_id", item.ID)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("登录状态已变化，请重试")
		}
		return nil
	})
	return item, previous, err
}

func GetLoginSession(id string) (model.LoginSession, bool, error) {
	database, err := DB()
	if err != nil {
		return model.LoginSession{}, false, err
	}
	var item model.LoginSession
	err = database.Where("id = ?", strings.TrimSpace(id)).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.LoginSession{}, false, nil
	}
	return item, err == nil, err
}

func GetActiveLoginSessionForUser(userID string) (model.LoginSession, bool, error) {
	user, ok, err := GetUserByID(strings.TrimSpace(userID))
	if err != nil || !ok || user.ActiveSessionID == "" {
		return model.LoginSession{}, false, err
	}
	return GetLoginSession(user.ActiveSessionID)
}

func ListActiveLoginSessionsForUsers(userIDs []string) (map[string]model.LoginSession, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	if len(userIDs) == 0 {
		return map[string]model.LoginSession{}, nil
	}
	var items []model.LoginSession
	if err := database.Where("user_id IN ? AND status = ?", userIDs, model.LoginSessionActive).Order("created_at desc").Find(&items).Error; err != nil {
		return nil, err
	}
	result := make(map[string]model.LoginSession, len(items))
	for _, item := range items {
		if _, exists := result[item.UserID]; !exists {
			result[item.UserID] = item
		}
	}
	return result, nil
}

func TouchLoginSession(id, lastActiveAt, updatedAt string) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Model(&model.LoginSession{}).Where("id = ? AND status = ?", id, model.LoginSessionActive).Updates(map[string]any{"last_active_at": lastActiveAt, "updated_at": updatedAt}).Error
}

func RevokeCurrentLoginSession(userID, sessionID string, status model.LoginSessionStatus, actorID, reason, at string) (model.LoginSession, bool, error) {
	database, err := DB()
	if err != nil {
		return model.LoginSession{}, false, err
	}
	var item model.LoginSession
	changed := false
	err = database.Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		if sessionID == "" {
			sessionID = user.ActiveSessionID
		}
		if sessionID == "" || user.ActiveSessionID != sessionID {
			return nil
		}
		if err := tx.Where("id = ? AND user_id = ?", sessionID, userID).First(&item).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		item.Status = status
		item.RevokedAt = at
		item.RevokedBy = actorID
		item.RevokeReason = strings.TrimSpace(reason)
		item.UpdatedAt = at
		if err := tx.Save(&item).Error; err != nil {
			return err
		}
		result := tx.Model(&model.User{}).Where("id = ? AND active_session_id = ?", userID, sessionID).Update("active_session_id", "")
		if result.Error != nil {
			return result.Error
		}
		changed = result.RowsAffected == 1
		return nil
	})
	return item, changed, err
}
