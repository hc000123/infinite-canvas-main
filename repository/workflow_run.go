package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func SaveWorkflowRun(run model.WorkflowRun) (model.WorkflowRun, error) {
	db, err := DB()
	if err != nil {
		return run, err
	}
	return run, db.Save(&run).Error
}

func GetUserWorkflowRun(userID string, id string) (model.WorkflowRun, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowRun{}, false, err
	}
	var run model.WorkflowRun
	err = db.Where("id = ? AND user_id = ?", strings.TrimSpace(id), strings.TrimSpace(userID)).First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowRun{}, false, nil
	}
	return run, err == nil, err
}
