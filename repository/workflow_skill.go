package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

func UpsertWorkflowStageSkillBinding(binding model.WorkflowStageSkillBinding) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "stage_key"}, {Name: "scope"}, {Name: "scope_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"skill_version_id", "updated_at"}),
	}).Create(&binding).Error
}

func PublishWorkflowSkillVersionBinding(version model.WorkflowSkillVersion, binding model.WorkflowStageSkillBinding) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.WorkflowSkillVersion{}).
			Where("id = ? AND status = ?", version.ID, model.WorkflowSkillVersionDraft).
			Updates(map[string]any{"status": version.Status, "published_at": version.PublishedAt, "updated_at": version.UpdatedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("Skill 版本状态已变化")
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "stage_key"}, {Name: "scope"}, {Name: "scope_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"skill_version_id", "updated_at"}),
		}).Create(&binding).Error
	})
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

func FindWorkflowSkillByStage(stageKey string) (model.WorkflowSkill, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowSkill{}, false, err
	}
	var skill model.WorkflowSkill
	err = db.First(&skill, "stage_key = ?", strings.TrimSpace(stageKey)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return skill, false, nil
	}
	return skill, err == nil, err
}

func ListWorkflowSkills() ([]model.WorkflowSkill, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.WorkflowSkill
	err = db.Order("stage_key asc").Find(&items).Error
	return items, err
}

func SaveWorkflowSkill(skill model.WorkflowSkill) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Save(&skill).Error
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

func ListWorkflowSkillVersions(skillID string) ([]model.WorkflowSkillVersion, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.WorkflowSkillVersion
	err = db.Where("skill_id = ?", strings.TrimSpace(skillID)).Order("created_at desc").Find(&items).Error
	return items, err
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

func CreateWorkflowSkillVersion(version model.WorkflowSkillVersion) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(&version).Error
}

func SaveWorkflowSkillVersion(version model.WorkflowSkillVersion) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Save(&version).Error
}

func CreateWorkflowSkillEvaluation(evaluation model.WorkflowSkillEvaluation) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(&evaluation).Error
}

func GetWorkflowSkillEvaluation(id string) (model.WorkflowSkillEvaluation, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowSkillEvaluation{}, false, err
	}
	var evaluation model.WorkflowSkillEvaluation
	err = db.First(&evaluation, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return evaluation, false, nil
	}
	return evaluation, err == nil, err
}

func HasPassingWorkflowSkillEvaluation(versionID string, contentHash string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var count int64
	err = db.Model(&model.WorkflowSkillEvaluation{}).
		Where("skill_version_id = ? AND content_hash = ? AND input_hash <> '' AND status = ?", strings.TrimSpace(versionID), strings.TrimSpace(contentHash), "passed").
		Count(&count).Error
	return count > 0, err
}

func HasWorkflowSkillProjectCanary(versionID string, contentHash string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var count int64
	err = db.Table("workflow_skill_evaluations AS evaluations").
		Joins("JOIN workflow_stage_skill_bindings AS bindings ON bindings.skill_version_id = evaluations.skill_version_id AND bindings.scope = ?", model.WorkflowSkillScopeProject).
		Where("evaluations.skill_version_id = ? AND evaluations.content_hash = ? AND evaluations.project_id <> '' AND evaluations.status = ?", strings.TrimSpace(versionID), strings.TrimSpace(contentHash), "passed").
		Count(&count).Error
	return count > 0, err
}

func GetWorkflowSkillWithVersion(versionID string) (model.WorkflowSkill, model.WorkflowSkillVersion, bool, error) {
	version, ok, err := GetWorkflowSkillVersion(versionID)
	if err != nil || !ok {
		return model.WorkflowSkill{}, version, false, err
	}
	skill, ok, err := GetWorkflowSkill(version.SkillID)
	return skill, version, ok, err
}
