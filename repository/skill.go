package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrSkillVersionMustBePublished      = errors.New("skill version must be published")
	ErrSkillVersionActiveReference     = errors.New("skill version has active references")
	ErrSkillVersionMustBeDraft          = errors.New("skill version must be a draft")
	ErrSkillVersionReferenced           = errors.New("skill version is referenced")
	ErrSkillDefinitionSeedProtected     = errors.New("seed skill definition is protected")
	ErrSkillDefinitionHasHistory        = errors.New("skill definition has published or archived versions")
	ErrSkillDefinitionReferenced        = errors.New("skill definition is referenced")
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
	return db.Transaction(func(tx *gorm.DB) error {
		return createSystemSkillVersion(tx, version)
	})
}

func CreateSkillVersionWithAudit(version model.SkillVersion, audit model.SkillAuditLog) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := createSystemSkillVersion(tx, version); err != nil {
			return err
		}
		return tx.Create(&audit).Error
	})
}

func SaveSkillVersion(version model.SkillVersion) error {
	version.SkillID = strings.TrimSpace(version.SkillID)
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		skill, current, err := lockSkillVersionTarget(tx, version.ID)
		if err != nil {
			return err
		}
		if current.SkillID != version.SkillID || skill.ID != current.SkillID {
			return ErrSkillReferenceTargetUnavailable
		}
		if current.Status != model.SkillVersionDraft || version.Status != model.SkillVersionDraft {
			return ErrSkillVersionMustBeDraft
		}
		return tx.Save(&version).Error
	})
}

func createSystemSkillVersion(tx *gorm.DB, version model.SkillVersion) error {
	version.SkillID = strings.TrimSpace(version.SkillID)
	skill, err := lockSkillDefinitionTarget(tx, version.SkillID)
	if err != nil {
		return err
	}
	if skill.OwnerType != model.SkillOwnerSystem {
		return ErrSkillReferenceTargetUnavailable
	}
	return tx.Create(&version).Error
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
		skill, current, err := lockSkillVersionTarget(tx, version.ID)
		if err != nil {
			return err
		}
		if skill.OwnerType != model.SkillOwnerSystem || !skill.Enabled || current.Status != model.SkillVersionDraft {
			return errors.New("Skill 版本状态已变化")
		}
		result := tx.Model(&model.SkillVersion{}).Where("id = ? AND skill_id = ? AND status = ?", current.ID, skill.ID, model.SkillVersionDraft).
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
	skillID, versionID = strings.TrimSpace(skillID), strings.TrimSpace(versionID)
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		skills, versions, err := lockSkillTargets(tx, []string{skillID}, []string{versionID})
		if err != nil {
			return err
		}
		skill, version := skills[skillID], versions[versionID]
		if skill.OwnerType != model.SkillOwnerSystem || !skill.Enabled || version.SkillID != skill.ID || version.Status != model.SkillVersionPublished {
			return ErrSkillReferenceTargetUnavailable
		}
		result := tx.Model(&model.SkillDefinition{}).Where("id = ? AND owner_type = ? AND enabled = ?", skill.ID, model.SkillOwnerSystem, true).
			Updates(map[string]any{"recommended_version_id": version.ID, "updated_at": updatedAt})
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
	evaluation.SkillVersionID = strings.TrimSpace(evaluation.SkillVersionID)
	evaluation.BaselineVersionID = strings.TrimSpace(evaluation.BaselineVersionID)
	if evaluation.SkillVersionID == "" {
		return ErrSkillEvaluationTargetUnavailable
	}
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		versionIDs := []string{evaluation.SkillVersionID}
		if evaluation.BaselineVersionID != "" {
			versionIDs = append(versionIDs, evaluation.BaselineVersionID)
		}
		if err := validateEvaluationSkillVersions(tx, versionIDs); err != nil {
			return err
		}
		return tx.Create(&evaluation).Error
	})
}

func CreateSkillEvaluationAndUpdateSummary(evaluation model.SkillEvaluation, summaryJSON, updatedAt string) error {
	evaluation.SkillVersionID = strings.TrimSpace(evaluation.SkillVersionID)
	evaluation.BaselineVersionID = strings.TrimSpace(evaluation.BaselineVersionID)
	if evaluation.SkillVersionID == "" {
		return ErrSkillEvaluationTargetUnavailable
	}
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		versionIDs := []string{evaluation.SkillVersionID}
		if evaluation.BaselineVersionID != "" {
			versionIDs = append(versionIDs, evaluation.BaselineVersionID)
		}
		if err := validateEvaluationSkillVersions(tx, versionIDs); err != nil {
			return err
		}
		if err := tx.Create(&evaluation).Error; err != nil {
			return err
		}
		result := tx.Model(&model.SkillVersion{}).Where("id = ?", evaluation.SkillVersionID).
			Updates(map[string]any{"evaluation_summary_json": summaryJSON, "updated_at": updatedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrSkillEvaluationTargetUnavailable
		}
		return nil
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
		skill, err := lockSkillDefinitionTarget(tx, skillID)
		if errors.Is(err, ErrSkillReferenceTargetUnavailable) {
			return ErrSkillVersionMustBePublished
		}
		if err != nil {
			return err
		}
		var version model.SkillVersion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&version, "id = ?", strings.TrimSpace(versionID)).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrSkillVersionMustBePublished
			}
			return err
		}
		if version.SkillID != skill.ID || version.Status != model.SkillVersionPublished {
			return ErrSkillVersionMustBePublished
		}
		referenced, err := activeSkillVersionReferenced(tx, strings.TrimSpace(versionID))
		if err != nil {
			return err
		}
		if referenced {
			return ErrSkillVersionActiveReference
		}
		result := tx.Model(&model.SkillVersion{}).Where("id = ? AND skill_id = ? AND status = ?", strings.TrimSpace(versionID), strings.TrimSpace(skillID), model.SkillVersionPublished).
			Updates(map[string]any{"status": model.SkillVersionArchived, "updated_at": updatedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrSkillVersionMustBePublished
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
		_, version, err := lockSkillVersionTarget(tx, versionID)
		if errors.Is(err, ErrSkillReferenceTargetUnavailable) {
			return ErrSkillVersionMustBeDraft
		}
		if err != nil {
			return err
		}
		if version.Status != model.SkillVersionDraft {
			return ErrSkillVersionMustBeDraft
		}
		referenced, err := skillVersionReferenced(tx, version.ID)
		if err != nil {
			return err
		}
		if referenced {
			return ErrSkillVersionReferenced
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
		skill, err := lockSkillDefinitionTarget(tx, skillID)
		if err != nil {
			return err
		}
		if strings.HasPrefix(skill.ID, "skill-system-") {
			return ErrSkillDefinitionSeedProtected
		}
		var versions []model.SkillVersion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("skill_id = ?", skill.ID).Order("id asc").Find(&versions).Error; err != nil {
			return err
		}
		for _, version := range versions {
			if version.Status != model.SkillVersionDraft {
				return ErrSkillDefinitionHasHistory
			}
			referenced, err := skillVersionReferenced(tx, version.ID)
			if err != nil {
				return err
			}
			if referenced {
				return ErrSkillVersionReferenced
			}
		}
		definitionReferenced, err := skillDefinitionReferenced(tx, skill.ID)
		if err != nil {
			return err
		}
		if definitionReferenced {
			return ErrSkillDefinitionReferenced
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
		{&model.SkillEvaluation{}, "skill_version_id = ? OR baseline_version_id = ?", []any{versionID, versionID}},
		{&model.WorkflowStageSkillBinding{}, "skill_version_id = ?", []any{versionID}},
		{&model.InvocationPreflightRevision{}, "skill_version_id = ?", []any{versionID}},
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
	var workflows []model.WorkflowVersion
	if err := tx.Select("package_json").Find(&workflows).Error; err != nil {
		return false, err
	}
	for _, workflow := range workflows {
		refs, err := parseWorkflowSkillReferences(workflow.PackageJSON)
		if err != nil {
			return false, err
		}
		for _, ref := range refs {
			if strings.TrimSpace(ref.SkillVersionID) == versionID {
				return true, nil
			}
		}
	}
	var agents []model.AgentVersion
	if err := tx.Select("default_skill_refs_json").Find(&agents).Error; err != nil {
		return false, err
	}
	for _, agent := range agents {
		refs, err := parseAgentSkillReferences(agent.DefaultSkillRefsJSON)
		if err != nil {
			return false, err
		}
		for _, ref := range refs {
			if strings.TrimSpace(ref.SkillVersionID) == versionID {
				return true, nil
			}
		}
	}
	return false, nil
}

func activeSkillVersionReferenced(tx *gorm.DB, versionID string) (bool, error) {
	var bindingCount int64
	if err := tx.Model(&model.WorkflowStageSkillBinding{}).Where("skill_version_id = ?", versionID).Count(&bindingCount).Error; err != nil {
		return false, err
	}
	if bindingCount > 0 {
		return true, nil
	}
	var workflows []model.WorkflowVersion
	if err := tx.Select("package_json").Where("status = ?", model.WorkflowVersionPublished).Find(&workflows).Error; err != nil {
		return false, err
	}
	for _, workflow := range workflows {
		refs, err := parseWorkflowSkillReferences(workflow.PackageJSON)
		if err != nil {
			return false, err
		}
		for _, ref := range refs {
			if strings.TrimSpace(ref.SkillVersionID) == versionID {
				return true, nil
			}
		}
	}
	var agents []model.AgentVersion
	if err := tx.Select("default_skill_refs_json").Where("status = ?", model.AgentVersionPublished).Find(&agents).Error; err != nil {
		return false, err
	}
	for _, agent := range agents {
		refs, err := parseAgentSkillReferences(agent.DefaultSkillRefsJSON)
		if err != nil {
			return false, err
		}
		for _, ref := range refs {
			if strings.TrimSpace(ref.SkillVersionID) == versionID {
				return true, nil
			}
		}
	}
	return false, nil
}

func skillDefinitionReferenced(tx *gorm.DB, skillID string) (bool, error) {
	var workflows []model.WorkflowVersion
	if err := tx.Select("package_json").Find(&workflows).Error; err != nil {
		return false, err
	}
	for _, workflow := range workflows {
		refs, err := parseWorkflowSkillReferences(workflow.PackageJSON)
		if err != nil {
			return false, err
		}
		for _, ref := range refs {
			if strings.TrimSpace(ref.SkillID) == skillID {
				return true, nil
			}
			for _, candidateSkillID := range ref.CandidateSkillIDs {
				if strings.TrimSpace(candidateSkillID) == skillID {
					return true, nil
				}
			}
		}
	}
	var agents []model.AgentVersion
	if err := tx.Select("default_skill_refs_json, skill_access_policy_json").Find(&agents).Error; err != nil {
		return false, err
	}
	for _, agent := range agents {
		refs, err := parseAgentSkillReferences(agent.DefaultSkillRefsJSON)
		if err != nil {
			return false, err
		}
		for _, ref := range refs {
			if strings.TrimSpace(ref.SkillID) == skillID {
				return true, nil
			}
		}
		allowedSkillIDs, err := parseAgentAllowedSkillIDs(agent.SkillAccessPolicyJSON)
		if err != nil {
			return false, err
		}
		for _, allowedSkillID := range allowedSkillIDs {
			if strings.TrimSpace(allowedSkillID) == skillID {
				return true, nil
			}
		}
	}
	return false, nil
}
