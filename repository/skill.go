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

func CreateSkillAggregateWithAudit(skill model.SkillDefinition, version model.SkillVersion, audit model.SkillAuditLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&skill).Error; err != nil {
			return err
		}
		if err := tx.Create(&version).Error; err != nil {
			return err
		}
		return tx.Create(&audit).Error
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

func ListSystemSkillDefinitions() ([]model.SkillDefinition, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.SkillDefinition
	err = db.Where("owner_type = ?", model.SkillOwnerSystem).Order("name asc").Find(&items).Error
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

func CreateSkillVersionWithAudit(version model.SkillVersion, audit model.SkillAuditLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&version).Error; err != nil {
			return err
		}
		return tx.Create(&audit).Error
	})
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

func ListSkillVersionsBySkillIDs(skillIDs []string) ([]model.SkillVersion, error) {
	if len(skillIDs) == 0 {
		return []model.SkillVersion{}, nil
	}
	db, err := DB()
	if err != nil {
		return nil, err
	}
	items := []model.SkillVersion{}
	err = db.Where("skill_id IN ?", skillIDs).Order("skill_id asc, created_at desc").Find(&items).Error
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

func ListSkillEvaluationsByVersionIDs(versionIDs []string) ([]model.SkillEvaluation, error) {
	if len(versionIDs) == 0 {
		return []model.SkillEvaluation{}, nil
	}
	db, err := DB()
	if err != nil {
		return nil, err
	}
	items := []model.SkillEvaluation{}
	if db.Dialector.Name() == "mysql" {
		err = db.Where("skill_version_id IN ?", versionIDs).
			Order("skill_version_id asc, created_at desc, id desc").Find(&items).Error
		return items, err
	}
	ranked := db.Model(&model.SkillEvaluation{}).
		Select("skill_evaluations.*, ROW_NUMBER() OVER (PARTITION BY skill_version_id ORDER BY created_at DESC, id DESC) AS relation_rank").
		Where("skill_version_id IN ?", versionIDs)
	err = db.Table("(?) AS ranked_skill_evaluations", ranked).
		Where("relation_rank <= ?", 50).
		Order("skill_version_id asc, created_at desc, id desc").
		Find(&items).Error
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

func ListSkillAuditLogsByVersionIDs(skillVersionIDs []string) ([]model.SkillAuditLog, error) {
	if len(skillVersionIDs) == 0 {
		return []model.SkillAuditLog{}, nil
	}
	db, err := DB()
	if err != nil {
		return nil, err
	}
	items := []model.SkillAuditLog{}
	if db.Dialector.Name() == "mysql" {
		err = db.Where("skill_version_id IN ?", skillVersionIDs).
			Order("created_at desc, id desc").Find(&items).Error
		return items, err
	}
	ranked := db.Table("skill_audit_logs AS audits").
		Select("audits.*, ROW_NUMBER() OVER (PARTITION BY versions.skill_id ORDER BY audits.created_at DESC, audits.id DESC) AS relation_rank").
		Joins("JOIN skill_versions AS versions ON versions.id = audits.skill_version_id").
		Where("audits.skill_version_id IN ?", skillVersionIDs)
	err = db.Table("(?) AS ranked_skill_audits", ranked).
		Where("relation_rank <= ?", 100).
		Order("created_at desc, id desc").
		Find(&items).Error
	return items, err
}

func ArchiveSkillVersionWithAudit(versionID, skillID, updatedAt string, audit model.SkillAuditLog) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.SkillVersion{}).Where("id = ? AND skill_id = ? AND status = ?", strings.TrimSpace(versionID), strings.TrimSpace(skillID), model.SkillVersionPublished).
			Updates(map[string]any{"status": model.SkillVersionArchived, "updated_at": updatedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("只能归档已发布 Skill 版本")
		}
		if err := tx.Model(&model.SkillDefinition{}).Where("id = ? AND recommended_version_id = ?", skillID, versionID).
			Updates(map[string]any{"recommended_version_id": "", "updated_at": updatedAt}).Error; err != nil {
			return err
		}
		return tx.Create(&audit).Error
	})
}

func DeleteUnreferencedSkillDraftWithAudit(versionID string, audit model.SkillAuditLog) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		var version model.SkillVersion
		if err := tx.First(&version, "id = ?", strings.TrimSpace(versionID)).Error; err != nil {
			return err
		}
		if version.Status != model.SkillVersionDraft {
			return errors.New("只能删除未发布草稿版本")
		}
		referenced, err := skillVersionReferenced(tx, version.ID)
		if err != nil {
			return err
		}
		if referenced {
			return errors.New("Skill 草稿已有评测、绑定或引用，不能删除")
		}
		if err := tx.Create(&audit).Error; err != nil {
			return err
		}
		return tx.Delete(&model.SkillVersion{}, "id = ?", version.ID).Error
	})
}

func DeleteUnpublishedSkillDefinitionWithAudit(skillID string, audit model.SkillAuditLog) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		var skill model.SkillDefinition
		if err := tx.First(&skill, "id = ?", strings.TrimSpace(skillID)).Error; err != nil {
			return err
		}
		if strings.HasPrefix(skill.ID, "skill-system-") {
			return errors.New("系统种子 Skill 不能删除")
		}
		var versions []model.SkillVersion
		if err := tx.Where("skill_id = ?", skill.ID).Find(&versions).Error; err != nil {
			return err
		}
		for _, version := range versions {
			if version.Status != model.SkillVersionDraft {
				return errors.New("已发布或已归档 Skill 不能删除")
			}
			referenced, err := skillVersionReferenced(tx, version.ID)
			if err != nil {
				return err
			}
			if referenced {
				return errors.New("Skill 已有评测、绑定或引用，不能删除")
			}
		}
		var definitionRefs int64
		pattern := "%" + skill.ID + "%"
		if err := tx.Model(&model.WorkflowVersion{}).Where("package_json LIKE ?", pattern).Count(&definitionRefs).Error; err != nil {
			return err
		}
		if definitionRefs == 0 {
			if err := tx.Model(&model.AgentVersion{}).Where("default_skill_refs_json LIKE ? OR skill_access_policy_json LIKE ?", pattern, pattern).Count(&definitionRefs).Error; err != nil {
				return err
			}
		}
		if definitionRefs > 0 {
			return errors.New("Skill Definition 已被 Workflow 或 Agent 引用，不能删除")
		}
		if err := tx.Create(&audit).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.SkillVersion{}, "skill_id = ?", skill.ID).Error; err != nil {
			return err
		}
		return tx.Delete(&model.SkillDefinition{}, "id = ?", skill.ID).Error
	})
}

func skillVersionReferenced(tx *gorm.DB, versionID string) (bool, error) {
	checks := []struct {
		model any
		query string
		args  []any
	}{
		{&model.SkillEvaluation{}, "skill_version_id = ?", []any{versionID}},
		{&model.WorkflowStageSkillBinding{}, "skill_version_id = ?", []any{versionID}},
		{&model.InvocationPreflightRevision{}, "skill_version_id = ?", []any{versionID}},
		{&model.WorkflowVersion{}, "package_json LIKE ?", []any{"%" + versionID + "%"}},
		{&model.AgentVersion{}, "default_skill_refs_json LIKE ?", []any{"%" + versionID + "%"}},
	}
	for _, check := range checks {
		var count int64
		if err := tx.Model(check.model).Where(check.query, check.args...).Count(&count).Error; err != nil {
			return false, err
		}
		if count > 0 {
			return true, nil
		}
	}
	return false, nil
}
