package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func SaveWorkflowStageSkillBinding(binding model.WorkflowStageSkillBinding) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if _, err := validatePublishedSystemSkillVersion(tx, binding.SkillVersionID); err != nil {
			return err
		}
		return tx.Save(&binding).Error
	})
}

func UpsertWorkflowStageSkillBinding(binding model.WorkflowStageSkillBinding) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if _, err := validatePublishedSystemSkillVersion(tx, binding.SkillVersionID); err != nil {
			return err
		}
		return upsertWorkflowStageSkillBinding(tx, binding)
	})
}

func UpsertWorkflowStageSkillBindingWithSkillAudit(binding model.WorkflowStageSkillBinding, audit model.SkillAuditLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if _, err := validatePublishedSystemSkillVersion(tx, binding.SkillVersionID); err != nil {
			return err
		}
		if err := upsertWorkflowStageSkillBinding(tx, binding); err != nil {
			return err
		}
		return tx.Create(&audit).Error
	})
}

func upsertWorkflowStageSkillBinding(db *gorm.DB, binding model.WorkflowStageSkillBinding) error {
	return db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "stage_key"}, {Name: "scope"}, {Name: "scope_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"skill_version_id", "updated_at"}),
	}).Create(&binding).Error
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
		err = db.Where("stage_key = ? AND scope = ? AND scope_id = ?", stageKey, model.WorkflowStageSkillScopeProject, projectID).First(&binding).Error
		if err == nil {
			return binding, true, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return binding, false, err
		}
	}
	err = db.Where("stage_key = ? AND scope = ? AND scope_id = ''", stageKey, model.WorkflowStageSkillScopeGlobal).First(&binding).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowStageSkillBinding{}, false, nil
	}
	return binding, err == nil, err
}

func ListWorkflowStageSkillBindings(stageKey string) ([]model.WorkflowStageSkillBinding, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.WorkflowStageSkillBinding
	query := db.Order("scope asc, scope_id asc")
	if strings.TrimSpace(stageKey) != "" {
		query = query.Where("stage_key = ?", strings.TrimSpace(stageKey))
	}
	err = query.Find(&items).Error
	return items, err
}

func ListWorkflowStageSkillBindingsByVersionIDs(versionIDs []string) ([]model.WorkflowStageSkillBinding, error) {
	if len(versionIDs) == 0 {
		return []model.WorkflowStageSkillBinding{}, nil
	}
	db, err := DB()
	if err != nil {
		return nil, err
	}
	items := []model.WorkflowStageSkillBinding{}
	err = db.Where("skill_version_id IN ?", versionIDs).Order("scope asc, scope_id asc").Find(&items).Error
	return items, err
}
