package service

import (
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func ListVisibleSkillItems(userID, projectID string) ([]SkillAdminItem, error) {
	items, err := ListSkillAdminItems()
	if err != nil {
		return nil, err
	}
	visible := make([]SkillAdminItem, 0, len(items))
	for _, item := range items {
		if skillVisibleTo(item.Skill, userID, projectID) {
			visible = append(visible, item)
		}
	}
	return visible, nil
}

func ListManagedSkillItems(userID, projectID string, isAdmin bool) ([]SkillAdminItem, error) {
	if !isAdmin {
		return ListVisibleSkillItems(userID, projectID)
	}
	items, err := ListSkillAdminItems()
	if err != nil {
		return nil, err
	}
	projectID = strings.TrimSpace(projectID)
	visible := make([]SkillAdminItem, 0, len(items))
	for _, item := range items {
		if item.Skill.OwnerType == model.SkillOwnerSystem || (item.Skill.OwnerType == model.SkillOwnerProject && item.Skill.OwnerProjectID == projectID) {
			visible = append(visible, item)
		}
	}
	return visible, nil
}

func GetVisibleSkillVersionPackage(userID, versionID string) (model.SkillVersion, SkillPackage, error) {
	skill, version, ok, err := repository.GetSkillWithVersion(strings.TrimSpace(versionID))
	if err != nil || !ok || !skillVisibleTo(skill, userID, skill.OwnerProjectID) {
		return version, SkillPackage{}, safeMessageError{message: "Skill 版本不存在"}
	}
	packageValue, err := DecodeSkillPackage(version)
	return version, packageValue, err
}

func GetManagedSkillVersionPackage(userID, versionID string, isAdmin bool) (model.SkillVersion, SkillPackage, error) {
	if !isAdmin {
		return GetVisibleSkillVersionPackage(userID, versionID)
	}
	return GetSkillVersionPackage(versionID)
}

func CreateOwnedProjectSkill(userID, projectID, name, summary string, draft SkillDraftInput) (ResolvedSkill, error) {
	result, err := CreateProjectSkill(userID, projectID, name, summary, draft)
	if err != nil {
		return result, err
	}
	audit := skillAudit(userID, "create_project_skill", result.Skill, result.Version.ID, now())
	if err := repository.CreateSkillAuditLog(audit); err != nil {
		return ResolvedSkill{}, err
	}
	return result, nil
}

func CreateManagedSkill(userID string, isAdmin bool, ownerType model.SkillOwnerType, projectID, name, summary string, draft SkillDraftInput) (ResolvedSkill, error) {
	if !isAdmin {
		return ResolvedSkill{}, safeMessageError{message: "只有管理员可以创建 System Skill"}
	}
	result, err := CreateSkill(userID, ownerType, projectID, name, summary, draft)
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

func CopySystemSkillToProject(userID string, isAdmin bool, systemSkillID, projectID, name, version string) (ResolvedSkill, error) {
	source, ok, err := repository.GetSkillDefinition(strings.TrimSpace(systemSkillID))
	if err != nil || !ok || source.OwnerType != model.SkillOwnerSystem || source.RecommendedVersionID == "" {
		return ResolvedSkill{}, safeMessageError{message: "System Skill 没有可复制的推荐版本"}
	}
	if strings.TrimSpace(userID) == "" && !isAdmin {
		return ResolvedSkill{}, safeMessageError{message: "未登录或权限不足"}
	}
	resolved, err := resolvePublishedSkillVersion(source, source.RecommendedVersionID)
	if err != nil {
		return ResolvedSkill{}, err
	}
	if strings.TrimSpace(name) == "" {
		name = source.Name + "（项目版）"
	}
	result, err := CreateProjectSkill(userID, projectID, name, source.Summary, SkillDraftInput{Version: version, Package: resolved.Package})
	if err != nil {
		return result, err
	}
	detail, _ := json.Marshal(map[string]string{"sourceSkillId": source.ID, "sourceSkillVersionId": resolved.Version.ID})
	audit := skillAudit(userID, "copy_from_system", result.Skill, result.Version.ID, now())
	audit.DetailJSON = string(detail)
	if err := repository.CreateSkillAuditLog(audit); err != nil {
		return ResolvedSkill{}, err
	}
	return result, nil
}

func ArchiveOwnedSkillVersion(userID string, isAdmin bool, versionID string) (model.SkillVersion, error) {
	skill, version, err := editableSkillVersion(userID, isAdmin, versionID)
	if err != nil {
		return version, err
	}
	stamp := now()
	audit := skillAudit(userID, "archive_version", skill, version.ID, stamp)
	if err := repository.ArchiveSkillVersionWithAudit(version.ID, skill.ID, stamp, audit); err != nil {
		return version, err
	}
	version.Status, version.UpdatedAt = model.SkillVersionArchived, stamp
	return version, nil
}

func DeleteOwnedSkillVersion(userID string, isAdmin bool, versionID string) error {
	skill, version, err := editableSkillVersion(userID, isAdmin, versionID)
	if err != nil {
		return err
	}
	return repository.DeleteUnreferencedSkillDraftWithAudit(version.ID, skillAudit(userID, "delete_draft", skill, version.ID, now()))
}

func DeleteOwnedSkillDefinition(userID string, isAdmin bool, skillID string) error {
	skill, err := editableSkill(userID, isAdmin, skillID)
	if err != nil {
		return err
	}
	return repository.DeleteUnpublishedSkillDefinitionWithAudit(skill.ID, skillAudit(userID, "delete_definition", skill, "", now()))
}

func editableSkill(userID string, isAdmin bool, skillID string) (model.SkillDefinition, error) {
	skill, ok, err := repository.GetSkillDefinition(strings.TrimSpace(skillID))
	if err != nil {
		return skill, err
	}
	if !ok || (!isAdmin && (skill.OwnerType != model.SkillOwnerProject || skill.OwnerUserID != strings.TrimSpace(userID))) {
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
