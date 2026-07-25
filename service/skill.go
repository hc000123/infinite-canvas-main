package service

import (
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type ResolvedSkill struct {
	Skill   model.SkillDefinition `json:"skill"`
	Version model.SkillVersion    `json:"version"`
	Package SkillPackage          `json:"package"`
}

type SkillDraftInput struct {
	Version string       `json:"version"`
	Package SkillPackage `json:"package"`
}

type SkillAdminItem struct {
	Skill              model.SkillDefinition             `json:"skill"`
	Versions           []model.SkillVersion              `json:"versions"`
	RecommendedPackage *SkillPackage                     `json:"recommendedPackage"`
	Bindings           []model.WorkflowStageSkillBinding `json:"bindings"`
	Evaluations        []model.SkillEvaluation           `json:"evaluations"`
	Audits             []model.SkillAuditLog             `json:"audits"`
}

type SkillOptionFilter struct {
	Capability         string
	InputArtifactType  string
	OutputArtifactType string
}

type SkillOption struct {
	SkillID        string               `json:"skillId"`
	SkillName      string               `json:"skillName"`
	Summary        string               `json:"summary"`
	OwnerType      model.SkillOwnerType `json:"ownerType"`
	OwnerProjectID string               `json:"ownerProjectId"`
	SkillVersionID string               `json:"skillVersionId"`
	Version        string               `json:"version"`
	IsRecommended  bool                 `json:"isRecommended"`
	Manifest       SkillManifest        `json:"manifest"`
}

func ListSkillAdminItems() ([]SkillAdminItem, error) {
	if err := EnsureSkillSeeds(); err != nil {
		return nil, err
	}
	skills, err := repository.ListSkillDefinitions()
	if err != nil {
		return nil, err
	}
	allBindings, err := repository.ListWorkflowStageSkillBindings("")
	if err != nil {
		return nil, err
	}
	items := make([]SkillAdminItem, 0, len(skills))
	for _, skill := range skills {
		versions, err := repository.ListSkillVersions(skill.ID)
		if err != nil {
			return nil, err
		}
		versionIDs := make([]string, 0, len(versions))
		evaluations := []model.SkillEvaluation{}
		for _, version := range versions {
			versionIDs = append(versionIDs, version.ID)
			versionEvaluations, err := repository.ListSkillEvaluations(version.ID)
			if err != nil {
				return nil, err
			}
			evaluations = append(evaluations, versionEvaluations...)
		}
		audits, err := repository.ListSkillAuditLogs(versionIDs)
		if err != nil {
			return nil, err
		}
		idSet := make(map[string]bool, len(versionIDs))
		for _, id := range versionIDs {
			idSet[id] = true
		}
		bindings := []model.WorkflowStageSkillBinding{}
		for _, binding := range allBindings {
			if idSet[binding.SkillVersionID] {
				bindings = append(bindings, binding)
			}
		}
		var recommendedPackage *SkillPackage
		if skill.RecommendedVersionID != "" {
			version, ok, err := repository.GetSkillVersion(skill.RecommendedVersionID)
			if err != nil {
				return nil, err
			}
			if ok {
				packageValue, err := DecodeSkillPackage(version)
				if err != nil {
					return nil, err
				}
				recommendedPackage = &packageValue
			}
		}
		items = append(items, SkillAdminItem{Skill: skill, Versions: versions, RecommendedPackage: recommendedPackage, Bindings: bindings, Evaluations: evaluations, Audits: audits})
	}
	return items, nil
}

func CreateProjectSkill(userID, projectID, name, summary string, draft SkillDraftInput) (ResolvedSkill, error) {
	return CreateSkill(userID, model.SkillOwnerProject, projectID, name, summary, draft)
}

func CreateSkill(userID string, ownerType model.SkillOwnerType, projectID, name, summary string, draft SkillDraftInput) (ResolvedSkill, error) {
	projectID = strings.TrimSpace(projectID)
	name = strings.TrimSpace(name)
	if ownerType == model.SkillOwnerSystem {
		projectID = ""
	} else if ownerType != model.SkillOwnerProject || projectID == "" {
		return ResolvedSkill{}, safeMessageError{message: "项目 Skill 必须指定项目"}
	}
	if name == "" {
		return ResolvedSkill{}, safeMessageError{message: "缺少 Skill 名称"}
	}
	versionName, packageValue, err := normalizeSkillDraftInput(draft)
	if err != nil {
		return ResolvedSkill{}, err
	}
	stamp := now()
	ownerUserID := ""
	if ownerType == model.SkillOwnerProject {
		ownerUserID = strings.TrimSpace(userID)
	}
	skill := model.SkillDefinition{
		ID: newID("skill"), Name: name, Summary: strings.TrimSpace(summary), OwnerType: ownerType,
		OwnerUserID: ownerUserID, OwnerProjectID: projectID, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp,
	}
	version := skillVersionFromPackage(newID("skillversion"), skill.ID, versionName, userID, stamp, packageValue)
	if err := repository.CreateSkillAggregate(skill, version); err != nil {
		return ResolvedSkill{}, err
	}
	return ResolvedSkill{Skill: skill, Version: version, Package: packageValue}, nil
}

func UpdateSkillDefinition(id, name, summary string, enabled *bool) (model.SkillDefinition, error) {
	skill, ok, err := repository.GetSkillDefinition(id)
	if err != nil {
		return skill, err
	}
	if !ok {
		return skill, safeMessageError{message: "Skill 不存在"}
	}
	if strings.TrimSpace(name) != "" {
		skill.Name = strings.TrimSpace(name)
	}
	if summary != "" {
		skill.Summary = strings.TrimSpace(summary)
	}
	if enabled != nil {
		skill.Enabled = *enabled
	}
	skill.UpdatedAt = now()
	return skill, repository.SaveSkillDefinition(skill)
}

func CreateSkillDraft(userID, skillID string, input SkillDraftInput) (model.SkillVersion, error) {
	if _, ok, err := repository.GetSkillDefinition(skillID); err != nil || !ok {
		return model.SkillVersion{}, safeMessageError{message: "Skill 不存在"}
	}
	versionName, packageValue, err := normalizeSkillDraftInput(input)
	if err != nil {
		return model.SkillVersion{}, err
	}
	stamp := now()
	version := skillVersionFromPackage(newID("skillversion"), skillID, versionName, userID, stamp, packageValue)
	return version, repository.CreateSkillVersion(version)
}

func UpdateSkillDraft(versionID string, input SkillDraftInput) (model.SkillVersion, error) {
	version, ok, err := repository.GetSkillVersion(versionID)
	if err != nil {
		return version, err
	}
	if !ok {
		return version, safeMessageError{message: "Skill 版本不存在"}
	}
	if version.Status != model.SkillVersionDraft {
		return version, safeMessageError{message: "已发布版本不可修改"}
	}
	versionName, packageValue, err := normalizeSkillDraftInput(input)
	if err != nil {
		return version, err
	}
	if versionName != version.Version {
		return version, safeMessageError{message: "Skill 草稿版本号不可修改"}
	}
	updated := skillVersionFromPackage(version.ID, version.SkillID, version.Version, version.CreatedBy, version.CreatedAt, packageValue)
	updated.UpdatedAt = now()
	return updated, repository.SaveSkillVersion(updated)
}

func GetSkillVersionPackage(versionID string) (model.SkillVersion, SkillPackage, error) {
	version, ok, err := repository.GetSkillVersion(versionID)
	if err != nil {
		return version, SkillPackage{}, err
	}
	if !ok {
		return version, SkillPackage{}, safeMessageError{message: "Skill 版本不存在"}
	}
	packageValue, err := DecodeSkillPackage(version)
	return version, packageValue, err
}

func ResolveRecommendedSkill(userID, projectID, skillID string) (ResolvedSkill, error) {
	skill, ok, err := repository.GetSkillDefinition(skillID)
	if err != nil || !ok || !skillVisibleTo(skill, userID, projectID) {
		return ResolvedSkill{}, safeMessageError{message: "Skill 不存在"}
	}
	if !skill.Enabled || skill.RecommendedVersionID == "" {
		return ResolvedSkill{}, safeMessageError{message: "Skill 没有可用推荐版本"}
	}
	return resolvePublishedSkillVersion(skill, skill.RecommendedVersionID)
}

func ResolveExactSkillVersion(userID, projectID, versionID string) (ResolvedSkill, error) {
	skill, version, ok, err := repository.GetSkillWithVersion(versionID)
	if err != nil || !ok || !skillVisibleTo(skill, userID, projectID) {
		return ResolvedSkill{}, safeMessageError{message: "Skill 版本不存在"}
	}
	return resolvePublishedSkill(skill, version)
}

func resolveExactSkillVersionForAdmin(versionID string) (ResolvedSkill, error) {
	skill, version, ok, err := repository.GetSkillWithVersion(versionID)
	if err != nil || !ok {
		return ResolvedSkill{}, safeMessageError{message: "Skill 版本不存在"}
	}
	return resolvePublishedSkill(skill, version)
}

func PublishSkillVersion(adminID, versionID string) (ResolvedSkill, error) {
	skill, version, ok, err := repository.GetSkillWithVersion(versionID)
	if err != nil || !ok {
		return ResolvedSkill{}, safeMessageError{message: "Skill 版本不存在"}
	}
	if version.Status != model.SkillVersionDraft {
		return ResolvedSkill{}, safeMessageError{message: "只能发布草稿版本"}
	}
	packageValue, err := DecodeSkillPackage(version)
	if err != nil {
		return ResolvedSkill{}, err
	}
	if _, err := ValidateInvocableSkillPackage(packageValue); err != nil {
		return ResolvedSkill{}, err
	}
	if packageValue.Manifest.EstimatedCostClass != "none" {
		passed, err := repository.HasPassingSkillEvaluation(version.ID, version.ContentHash)
		if err != nil {
			return ResolvedSkill{}, err
		}
		if !passed {
			return ResolvedSkill{}, safeMessageError{message: "该版本尚未通过评测，或评测内容哈希不一致"}
		}
	}
	stamp := now()
	version.PublishedAt, version.UpdatedAt = stamp, stamp
	audit := skillAudit(adminID, "publish", skill, version.ID, stamp)
	if err := repository.PublishSkillVersionWithAudit(version, audit); err != nil {
		return ResolvedSkill{}, err
	}
	version.Status = model.SkillVersionPublished
	return ResolvedSkill{Skill: skill, Version: version, Package: packageValue}, nil
}

func RecommendPublishedSkillVersion(adminID, skillID, versionID string) (ResolvedSkill, error) {
	skill, version, ok, err := repository.GetSkillWithVersion(versionID)
	if err != nil || !ok || skill.ID != strings.TrimSpace(skillID) {
		return ResolvedSkill{}, safeMessageError{message: "Skill 版本不存在"}
	}
	if version.Status != model.SkillVersionPublished {
		return ResolvedSkill{}, safeMessageError{message: "只能推荐已发布版本"}
	}
	packageValue, err := DecodeSkillPackage(version)
	if err != nil {
		return ResolvedSkill{}, err
	}
	action := "recommend"
	if skill.RecommendedVersionID != "" && skill.RecommendedVersionID != version.ID {
		action = "rollback_recommendation"
	}
	stamp := now()
	audit := skillAudit(adminID, action, skill, version.ID, stamp)
	if err := repository.SetRecommendedSkillVersionWithAudit(skill.ID, version.ID, stamp, audit); err != nil {
		return ResolvedSkill{}, err
	}
	skill.RecommendedVersionID, skill.UpdatedAt = version.ID, stamp
	return ResolvedSkill{Skill: skill, Version: version, Package: packageValue}, nil
}

func ListSkillOptions(userID, projectID string, filter SkillOptionFilter) ([]SkillOption, error) {
	if err := EnsureSkillSeeds(); err != nil {
		return nil, err
	}
	skills, err := repository.ListVisibleSkillDefinitions(userID, projectID)
	if err != nil {
		return nil, err
	}
	items := []SkillOption{}
	for _, skill := range skills {
		if !skill.Enabled {
			continue
		}
		versions, err := repository.ListSkillVersions(skill.ID)
		if err != nil {
			return nil, err
		}
		for _, version := range versions {
			if version.Status != model.SkillVersionPublished {
				continue
			}
			packageValue, err := DecodeSkillPackage(version)
			if err != nil {
				return nil, err
			}
			if !skillManifestMatches(packageValue.Manifest, filter) {
				continue
			}
			items = append(items, SkillOption{SkillID: skill.ID, SkillName: skill.Name, Summary: skill.Summary, OwnerType: skill.OwnerType, OwnerProjectID: skill.OwnerProjectID, SkillVersionID: version.ID, Version: version.Version, IsRecommended: version.ID == skill.RecommendedVersionID, Manifest: packageValue.Manifest})
		}
	}
	return items, nil
}

func normalizeSkillDraftInput(input SkillDraftInput) (string, SkillPackage, error) {
	versionName := strings.TrimSpace(input.Version)
	if !skillSemanticVersionRegexp.MatchString(versionName) {
		return "", SkillPackage{}, safeMessageError{message: "Skill 版本号必须使用 x.y.z 语义化版本"}
	}
	packageValue, err := ValidateInvocableSkillPackage(input.Package)
	return versionName, packageValue, err
}

func skillVersionFromPackage(id, skillID, versionName, createdBy, createdAt string, packageValue SkillPackage) model.SkillVersion {
	manifestJSON, _ := json.Marshal(packageValue.Manifest)
	filesJSON, _ := json.Marshal(packageValue.Files)
	inputJSON, _ := json.Marshal(packageValue.InputContract)
	outputJSON, _ := json.Marshal(packageValue.OutputContract)
	gatesJSON, _ := json.Marshal(packageValue.QualityGateProfile)
	return model.SkillVersion{ID: id, SkillID: skillID, Version: versionName, Status: model.SkillVersionDraft, ManifestJSON: string(manifestJSON), FilesJSON: string(filesJSON), InputContractJSON: string(inputJSON), OutputContractJSON: string(outputJSON), QualityGateProfileJSON: string(gatesJSON), ContentHash: packageValue.ContentHash, CreatedBy: strings.TrimSpace(createdBy), CreatedAt: createdAt, UpdatedAt: createdAt}
}

func resolvePublishedSkillVersion(skill model.SkillDefinition, versionID string) (ResolvedSkill, error) {
	version, ok, err := repository.GetSkillVersion(versionID)
	if err != nil || !ok || version.SkillID != skill.ID {
		return ResolvedSkill{}, safeMessageError{message: "Skill 版本不存在"}
	}
	return resolvePublishedSkill(skill, version)
}

func resolvePublishedSkill(skill model.SkillDefinition, version model.SkillVersion) (ResolvedSkill, error) {
	if !skill.Enabled || version.Status != model.SkillVersionPublished {
		return ResolvedSkill{}, safeMessageError{message: "Skill 版本不可用"}
	}
	packageValue, err := DecodeSkillPackage(version)
	if err != nil {
		return ResolvedSkill{}, err
	}
	return ResolvedSkill{Skill: skill, Version: version, Package: packageValue}, nil
}

func skillVisibleTo(skill model.SkillDefinition, userID, projectID string) bool {
	return skill.OwnerType == model.SkillOwnerSystem ||
		(skill.OwnerType == model.SkillOwnerProject &&
			skill.OwnerUserID == strings.TrimSpace(userID) &&
			skill.OwnerProjectID == strings.TrimSpace(projectID))
}

func skillManifestMatches(manifest SkillManifest, filter SkillOptionFilter) bool {
	return (strings.TrimSpace(filter.Capability) == "" || containsSkillToken(manifest.Capabilities, strings.TrimSpace(filter.Capability))) &&
		(strings.TrimSpace(filter.InputArtifactType) == "" || containsSkillToken(manifest.InputArtifactTypes, strings.TrimSpace(filter.InputArtifactType))) &&
		(strings.TrimSpace(filter.OutputArtifactType) == "" || containsSkillToken(manifest.OutputArtifactTypes, strings.TrimSpace(filter.OutputArtifactType)))
}

func skillAudit(adminID, action string, skill model.SkillDefinition, versionID, stamp string) model.SkillAuditLog {
	detail, _ := json.Marshal(map[string]string{"skillId": skill.ID})
	return model.SkillAuditLog{ID: newID("skillaudit"), AdminID: strings.TrimSpace(adminID), Action: action, Scope: string(skill.OwnerType), ScopeID: skill.OwnerProjectID, SkillVersionID: versionID, DetailJSON: string(detail), CreatedAt: stamp}
}
