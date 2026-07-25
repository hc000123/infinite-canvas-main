package repository

import "github.com/basketikun/infinite-canvas/model"

func AdminUserUsageTotals(userID string) (taskCount int64, consumed int64, logCount int64, err error) {
	db, err := DB()
	if err != nil {
		return 0, 0, 0, err
	}
	if err = db.Model(&model.AITask{}).Where("user_id = ?", userID).Count(&taskCount).Error; err != nil {
		return
	}
	if err = db.Model(&model.CreditLog{}).Where("user_id = ?", userID).Count(&logCount).Error; err != nil {
		return
	}
	err = db.Model(&model.CreditLog{}).Where("user_id = ? AND type = ?", userID, model.CreditLogTypeAIConsume).Select("COALESCE(SUM(-amount), 0)").Scan(&consumed).Error
	return
}
