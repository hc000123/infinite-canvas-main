package service

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func GetManagedSkillVersionPackage(userID, versionID string, isAdmin bool) (model.SkillVersion, SkillPackage, error) {
	if !isAdmin {
		return model.SkillVersion{}, SkillPackage{}, safeMessageError{message: "Skill 版本不存在或无权操作"}
	}
	skill, version, ok, err := repository.GetSkillWithVersion(strings.TrimSpace(versionID))
	if err != nil {
		return version, SkillPackage{}, err
	}
	if !ok || skill.OwnerType != model.SkillOwnerSystem {
		return version, SkillPackage{}, safeMessageError{message: "Skill 版本不存在或无权操作"}
	}
	packageValue, err := DecodeSkillPackage(version)
	return version, packageValue, err
}

func CreateManagedSystemSkill(userID string, isAdmin bool, name, summary string, draft SkillDraftInput) (ResolvedSkill, error) {
	if !isAdmin {
		return ResolvedSkill{}, safeMessageError{message: "只有管理员可以创建 Skill"}
	}
	result, err := CreateSystemSkill(userID, name, summary, draft)
	if err != nil {
		return result, err
	}
	if err := repository.CreateSkillAuditLog(skillAudit(userID, "create_skill", result.Skill, result.Version.ID, now())); err != nil {
		return ResolvedSkill{}, err
	}
	return result, nil
}

func UpdateOwnedSkillDefinition(userID string, isAdmin bool, skillID, name, summary string, enabled *bool) (model.SkillDefinition, error) {
	if _, err := editableSkill(userID, isAdmin, skillID); err != nil {
		return model.SkillDefinition{}, err
	}
	updated, err := UpdateSkillDefinition(skillID, name, summary, enabled)
	if err != nil {
		return updated, err
	}
	action := "update_definition"
	if enabled != nil && !*enabled {
		action = "disable_definition"
	}
	if err := repository.CreateSkillAuditLog(skillAudit(userID, action, updated, updated.RecommendedVersionID, now())); err != nil {
		return model.SkillDefinition{}, err
	}
	return updated, nil
}

func CreateOwnedSkillDraft(userID string, isAdmin bool, skillID string, input SkillDraftInput) (model.SkillVersion, error) {
	skill, err := editableSkill(userID, isAdmin, skillID)
	if err != nil {
		return model.SkillVersion{}, err
	}
	version, err := CreateSkillDraft(userID, skill.ID, input)
	if err != nil {
		return version, err
	}
	if err := repository.CreateSkillAuditLog(skillAudit(userID, "create_draft", skill, version.ID, now())); err != nil {
		return model.SkillVersion{}, err
	}
	return version, nil
}

func UpdateOwnedSkillDraft(userID string, isAdmin bool, versionID string, input SkillDraftInput) (model.SkillVersion, error) {
	skill, version, err := editableSkillVersion(userID, isAdmin, versionID)
	if err != nil {
		return version, err
	}
	updated, err := UpdateSkillDraft(version.ID, input)
	if err != nil {
		return updated, err
	}
	if err := repository.CreateSkillAuditLog(skillAudit(userID, "update_draft", skill, version.ID, now())); err != nil {
		return model.SkillVersion{}, err
	}
	return updated, nil
}

func ValidateOwnedSkillVersion(userID string, isAdmin bool, versionID string) (map[string]any, error) {
	_, version, err := editableSkillVersion(userID, isAdmin, versionID)
	if err != nil {
		return nil, err
	}
	packageValue, err := DecodeSkillPackage(version)
	if err != nil {
		return nil, err
	}
	if _, err := ValidateInvocableSkillPackage(packageValue); err != nil {
		return nil, err
	}
	return map[string]any{"valid": true, "versionId": version.ID, "contentHash": packageValue.ContentHash}, nil
}

func EvaluateOwnedSkillVersion(userID string, isAdmin bool, versionID string, input SkillEvaluationInput) (SkillEvaluationResult, error) {
	if _, _, err := editableSkillVersion(userID, isAdmin, versionID); err != nil {
		return SkillEvaluationResult{}, err
	}
	return EvaluateSkill(userID, versionID, input)
}

func TrialOwnedSkillVersion(userID string, isAdmin bool, versionID string, input SkillTrialInput) (SkillTrialResult, error) {
	if _, _, err := editableSkillVersion(userID, isAdmin, versionID); err != nil {
		return SkillTrialResult{}, err
	}
	return TrialSkill(userID, versionID, input)
}

func PublishOwnedSkillVersion(userID string, isAdmin bool, versionID string) (ResolvedSkill, error) {
	if _, _, err := editableSkillVersion(userID, isAdmin, versionID); err != nil {
		return ResolvedSkill{}, err
	}
	return PublishSkillVersion(userID, versionID)
}

func RecommendOwnedSkillVersion(userID string, isAdmin bool, skillID, versionID string) (ResolvedSkill, error) {
	if _, err := editableSkill(userID, isAdmin, skillID); err != nil {
		return ResolvedSkill{}, err
	}
	return RecommendPublishedSkillVersion(userID, skillID, versionID)
}

func ArchiveOwnedSkillVersion(userID string, isAdmin bool, versionID string) (model.SkillVersion, error) {
	skill, version, err := editableSkillVersion(userID, isAdmin, versionID)
	if err != nil {
		return version, err
	}
	stamp := now()
	audit := skillAudit(userID, "archive_version", skill, version.ID, stamp)
	if err := repository.ArchiveSkillVersionWithAudit(version.ID, skill.ID, stamp, audit); err != nil {
		return version, safeSkillLifecycleError(err)
	}
	version.Status, version.UpdatedAt = model.SkillVersionArchived, stamp
	return version, nil
}

func DeleteOwnedSkillVersion(userID string, isAdmin bool, versionID string) error {
	skill, version, err := editableSkillVersion(userID, isAdmin, versionID)
	if err != nil {
		return err
	}
	return safeSkillLifecycleError(repository.DeleteUnreferencedSkillDraftWithAudit(version.ID, skillAudit(userID, "delete_draft", skill, version.ID, now())))
}

func DeleteOwnedSkillDefinition(userID string, isAdmin bool, skillID string) error {
	skill, err := editableSkill(userID, isAdmin, skillID)
	if err != nil {
		return err
	}
	return safeSkillLifecycleError(repository.DeleteUnpublishedSkillDefinitionWithAudit(skill.ID, skillAudit(userID, "delete_definition", skill, "", now())))
}

func safeSkillLifecycleError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, repository.ErrSkillVersionMustBePublished):
		return safeMessageError{message: "只能归档已发布 Skill 版本"}
	case errors.Is(err, repository.ErrSkillVersionActiveReference):
		return safeMessageError{message: "Skill 版本仍被已发布 Workflow、Agent 或工作流阶段绑定引用，不能归档"}
	case errors.Is(err, repository.ErrSkillVersionMustBeDraft):
		return safeMessageError{message: "只能删除未发布草稿版本"}
	case errors.Is(err, repository.ErrSkillVersionReferenced):
		return safeMessageError{message: "Skill 已有评测、绑定或引用，不能删除"}
	case errors.Is(err, repository.ErrSkillDefinitionSeedProtected):
		return safeMessageError{message: "系统种子 Skill 不能删除"}
	case errors.Is(err, repository.ErrSkillDefinitionHasHistory):
		return safeMessageError{message: "已发布或已归档 Skill 不能删除"}
	case errors.Is(err, repository.ErrSkillDefinitionReferenced):
		return safeMessageError{message: "Skill Definition 已被 Workflow 或 Agent 引用，不能删除"}
	default:
		return err
	}
}

func editableSkill(userID string, isAdmin bool, skillID string) (model.SkillDefinition, error) {
	skill, ok, err := repository.GetSkillDefinition(strings.TrimSpace(skillID))
	if err != nil {
		return skill, err
	}
	if !ok || !isAdmin || skill.OwnerType != model.SkillOwnerSystem {
		return skill, safeMessageError{message: "Skill 不存在或无权操作"}
	}
	return skill, nil
}

func editableSkillVersion(userID string, isAdmin bool, versionID string) (model.SkillDefinition, model.SkillVersion, error) {
	version, ok, err := repository.GetSkillVersion(strings.TrimSpace(versionID))
	if err != nil || !ok {
		return model.SkillDefinition{}, version, safeMessageError{message: "Skill 版本不存在或无权操作"}
	}
	skill, err := editableSkill(userID, isAdmin, version.SkillID)
	return skill, version, err
}
