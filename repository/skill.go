package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func CreateSkillDefinition(skill model.SkillDefinition) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(&skill).Error
}

func CreateSkillAggregate(skill model.SkillDefinition, version model.SkillVersion) error {
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

func GetSkillDefinition(id string) (model.SkillDefinition, bool, error) {
	db, err := DB()
	if err != nil {
		return model.SkillDefinition{}, false, err
	}
	var skill model.SkillDefinition
	err = db.First(&skill, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return skill, false, nil
	}
	return skill, err == nil, err
}

func ListSkillDefinitions() ([]model.SkillDefinition, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.SkillDefinition
	err = db.Order("owner_type desc, name asc").Find(&items).Error
	return items, err
}

func ListVisibleSkillDefinitions(projectID string) ([]model.SkillDefinition, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.SkillDefinition
	err = db.Where("owner_type = ? OR (owner_type = ? AND owner_project_id = ?)", model.SkillOwnerSystem, model.SkillOwnerProject, strings.TrimSpace(projectID)).
		Order("owner_type desc, name asc").Find(&items).Error
	return items, err
}

func SaveSkillDefinition(skill model.SkillDefinition) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Save(&skill).Error
}

func CreateSkillVersion(version model.SkillVersion) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(&version).Error
}

func SaveSkillVersion(version model.SkillVersion) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Save(&version).Error
}

func GetSkillVersion(id string) (model.SkillVersion, bool, error) {
	db, err := DB()
	if err != nil {
		return model.SkillVersion{}, false, err
	}
	var version model.SkillVersion
	err = db.First(&version, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return version, false, nil
	}
	return version, err == nil, err
}

func GetSkillWithVersion(versionID string) (model.SkillDefinition, model.SkillVersion, bool, error) {
	version, ok, err := GetSkillVersion(versionID)
	if err != nil || !ok {
		return model.SkillDefinition{}, version, false, err
	}
	skill, ok, err := GetSkillDefinition(version.SkillID)
	return skill, version, ok, err
}

func ListSkillVersions(skillID string) ([]model.SkillVersion, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.SkillVersion
	err = db.Where("skill_id = ?", strings.TrimSpace(skillID)).Order("created_at desc").Find(&items).Error
	return items, err
}

func PublishSkillVersionWithAudit(version model.SkillVersion, audit model.SkillAuditLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.SkillVersion{}).Where("id = ? AND status = ?", version.ID, model.SkillVersionDraft).
			Updates(map[string]any{"status": model.SkillVersionPublished, "published_at": version.PublishedAt, "updated_at": version.UpdatedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("Skill 版本状态已变化")
		}
		return tx.Create(&audit).Error
	})
}

func SetRecommendedSkillVersionWithAudit(skillID, versionID, updatedAt string, audit model.SkillAuditLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.SkillDefinition{}).Where("id = ?", strings.TrimSpace(skillID)).
			Updates(map[string]any{"recommended_version_id": strings.TrimSpace(versionID), "updated_at": updatedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("Skill 不存在")
		}
		return tx.Create(&audit).Error
	})
}

func CreateSkillEvaluation(evaluation model.SkillEvaluation) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(&evaluation).Error
}

func CreateSkillEvaluationAndUpdateSummary(evaluation model.SkillEvaluation, summaryJSON, updatedAt string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&evaluation).Error; err != nil {
			return err
		}
		return tx.Model(&model.SkillVersion{}).Where("id = ?", evaluation.SkillVersionID).
			Updates(map[string]any{"evaluation_summary_json": summaryJSON, "updated_at": updatedAt}).Error
	})
}

func GetSkillEvaluation(id string) (model.SkillEvaluation, bool, error) {
	db, err := DB()
	if err != nil {
		return model.SkillEvaluation{}, false, err
	}
	var evaluation model.SkillEvaluation
	err = db.First(&evaluation, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return evaluation, false, nil
	}
	return evaluation, err == nil, err
}

func ListSkillEvaluations(versionID string) ([]model.SkillEvaluation, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.SkillEvaluation
	err = db.Where("skill_version_id = ?", strings.TrimSpace(versionID)).Order("created_at desc").Limit(50).Find(&items).Error
	return items, err
}

func HasPassingSkillEvaluation(versionID, contentHash string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var count int64
	err = db.Model(&model.SkillEvaluation{}).
		Where("skill_version_id = ? AND content_hash = ? AND input_hash <> '' AND status = ?", strings.TrimSpace(versionID), strings.TrimSpace(contentHash), "passed").
		Count(&count).Error
	return count > 0, err
}

func HasSkillProjectCanary(versionID, contentHash string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var count int64
	err = db.Table("skill_evaluations AS evaluations").
		Joins("JOIN workflow_stage_skill_bindings AS bindings ON bindings.skill_version_id = evaluations.skill_version_id AND bindings.scope = ?", model.WorkflowStageSkillScopeProject).
		Where("evaluations.skill_version_id = ? AND evaluations.content_hash = ? AND evaluations.project_id <> '' AND evaluations.status = ?", strings.TrimSpace(versionID), strings.TrimSpace(contentHash), "passed").
		Count(&count).Error
	return count > 0, err
}

func CreateSkillAuditLog(audit model.SkillAuditLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Create(&audit).Error
}

func ListSkillAuditLogs(skillVersionIDs []string) ([]model.SkillAuditLog, error) {
	if len(skillVersionIDs) == 0 {
		return []model.SkillAuditLog{}, nil
	}
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.SkillAuditLog
	err = db.Where("skill_version_id IN ?", skillVersionIDs).Order("created_at desc").Limit(100).Find(&items).Error
	return items, err
}
