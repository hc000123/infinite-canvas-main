package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func CreateWorkflowSkillAggregate(skill model.WorkflowSkill, version model.WorkflowSkillVersion) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&skill).Error; err != nil {
			return err
		}
		return tx.Create(&version).Error
	})
}

func SaveWorkflowStageSkillBinding(binding model.WorkflowStageSkillBinding) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Save(&binding).Error
}

func ResolveWorkflowStageSkillBinding(stageKey string, projectID string) (model.WorkflowStageSkillBinding, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowStageSkillBinding{}, false, err
	}
	stageKey = strings.TrimSpace(stageKey)
	projectID = strings.TrimSpace(projectID)
	var binding model.WorkflowStageSkillBinding
	if projectID != "" {
		err = db.Where("stage_key = ? AND scope = ? AND scope_id = ?", stageKey, model.WorkflowSkillScopeProject, projectID).First(&binding).Error
		if err == nil {
			return binding, true, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return binding, false, err
		}
	}
	err = db.Where("stage_key = ? AND scope = ? AND scope_id = ''", stageKey, model.WorkflowSkillScopeGlobal).First(&binding).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowStageSkillBinding{}, false, nil
	}
	return binding, err == nil, err
}

func GetWorkflowSkill(id string) (model.WorkflowSkill, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowSkill{}, false, err
	}
	var skill model.WorkflowSkill
	err = db.First(&skill, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return skill, false, nil
	}
	return skill, err == nil, err
}

func GetWorkflowSkillVersion(id string) (model.WorkflowSkillVersion, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowSkillVersion{}, false, err
	}
	var version model.WorkflowSkillVersion
	err = db.First(&version, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return version, false, nil
	}
	return version, err == nil, err
}

func GetWorkflowSkillWithVersion(versionID string) (model.WorkflowSkill, model.WorkflowSkillVersion, bool, error) {
	version, ok, err := GetWorkflowSkillVersion(versionID)
	if err != nil || !ok {
		return model.WorkflowSkill{}, version, false, err
	}
	skill, ok, err := GetWorkflowSkill(version.SkillID)
	return skill, version, ok, err
}
