package service

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func ListSystemAgentAdminItems() ([]AgentRegistryItem, error) {
	agents, err := repository.ListSystemAgentDefinitions()
	if err != nil {
		return nil, err
	}
	items := make([]AgentRegistryItem, 0, len(agents))
	for _, agent := range agents {
		versions, err := repository.ListAgentVersions(agent.ID)
		if err != nil {
			return nil, err
		}
		item := AgentRegistryItem{Agent: agent, Tags: decodeAgentTags(agent.TagsJSON), Versions: versions}
		for _, version := range versions {
			if version.ID != agent.RecommendedVersionID || version.Status != model.AgentVersionPublished {
				continue
			}
			packageValue, err := DecodeAgentPackage(version)
			if err != nil {
				return nil, err
			}
			item.RecommendedPackage = &packageValue
		}
		items = append(items, item)
	}
	return items, nil
}

func GetSystemAgentVersion(versionID string) (AgentVersionDetail, error) {
	agent, version, err := editableSystemAgentVersion(versionID)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	packageValue, err := DecodeAgentPackage(version)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	return AgentVersionDetail{Agent: agent, Version: version, Package: packageValue, Tags: decodeAgentTags(agent.TagsJSON)}, nil
}

func CreateSystemAgentDraft(adminID, agentID string, input AgentDraftInput) (model.AgentVersion, error) {
	agent, err := editableSystemAgent(agentID)
	if err != nil {
		return model.AgentVersion{}, err
	}
	input.Version = strings.TrimSpace(input.Version)
	if !skillSemanticVersionRegexp.MatchString(input.Version) {
		return model.AgentVersion{}, safeMessageError{message: "Agent 版本号必须使用 x.y.z 语义化版本"}
	}
	packageValue, err := NormalizeAgentPackage(input.Package)
	if err != nil {
		return model.AgentVersion{}, err
	}
	stamp := now()
	version := agentVersionFromPackage(newID("agentversion"), agent.ID, input.Version, strings.TrimSpace(adminID), stamp, packageValue)
	return version, repository.CreateAgentVersion(version)
}

func UpdateSystemAgentDraft(adminID, versionID string, input AgentDraftInput) (model.AgentVersion, error) {
	agent, version, err := editableSystemAgentVersion(versionID)
	if err != nil {
		return version, err
	}
	if version.Status != model.AgentVersionDraft {
		return version, safeMessageError{message: "已发布 Agent 版本不可修改"}
	}
	if strings.TrimSpace(input.Version) != version.Version {
		return version, safeMessageError{message: "Agent 草稿版本号不可修改"}
	}
	packageValue, err := NormalizeAgentPackage(input.Package)
	if err != nil {
		return version, err
	}
	updated := agentVersionFromPackage(version.ID, agent.ID, version.Version, version.CreatedBy, version.CreatedAt, packageValue)
	if updated.CreatedBy == "" {
		updated.CreatedBy = strings.TrimSpace(adminID)
	}
	updated.UpdatedAt = now()
	return updated, repository.SaveAgentDraft(updated)
}

func ValidateSystemAgentVersion(_ string, versionID string) (AgentValidationResult, error) {
	agent, version, err := editableSystemAgentVersion(versionID)
	if err != nil {
		return AgentValidationResult{}, err
	}
	packageValue, err := DecodeAgentPackage(version)
	if err != nil {
		return AgentValidationResult{}, err
	}
	resolved := make([]ResolvedAgentSkillRef, 0, len(packageValue.DefaultSkillRefs))
	for _, ref := range packageValue.DefaultSkillRefs {
		skill, err := resolveAgentSkillReference("", agent.OwnerProjectID, ref)
		if err != nil {
			return AgentValidationResult{}, err
		}
		if err := validateAgentSkillAccess(packageValue, ref, skill); err != nil {
			return AgentValidationResult{}, err
		}
		resolved = append(resolved, ResolvedAgentSkillRef{StepKey: ref.StepKey, SkillID: skill.Skill.ID, SkillVersionID: skill.Version.ID, SkillVersion: skill.Version.Version, SkillContentHash: skill.Version.ContentHash, Manifest: skill.Package.Manifest})
	}
	return AgentValidationResult{ContentHash: packageValue.ContentHash, ResolvedSkills: resolved}, nil
}

func PublishSystemAgentVersion(adminID, versionID string) (AgentVersionDetail, error) {
	agent, version, err := editableSystemAgentVersion(versionID)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	if version.Status != model.AgentVersionDraft {
		return AgentVersionDetail{}, safeMessageError{message: "只能发布 Agent 草稿版本"}
	}
	validation, err := ValidateSystemAgentVersion(adminID, version.ID)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	packageValue, err := DecodeAgentPackage(version)
	if err != nil || validation.ContentHash != packageValue.ContentHash {
		return AgentVersionDetail{}, safeMessageError{message: "Agent 校验内容哈希不一致"}
	}
	stamp := now()
	version.PublishedAt, version.UpdatedAt = stamp, stamp
	if err := repository.PublishAgentVersion(version); err != nil {
		return AgentVersionDetail{}, err
	}
	version.Status = model.AgentVersionPublished
	return AgentVersionDetail{Agent: agent, Version: version, Package: packageValue, Tags: decodeAgentTags(agent.TagsJSON)}, nil
}

func RecommendSystemAgentVersion(_ string, agentID, versionID string) (AgentVersionDetail, error) {
	agent, err := editableSystemAgent(agentID)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	version, ok, err := repository.GetAgentVersion(strings.TrimSpace(versionID))
	if err != nil || !ok || version.AgentID != agent.ID || version.Status != model.AgentVersionPublished {
		return AgentVersionDetail{}, safeMessageError{message: "只能推荐该 Agent 的已发布版本"}
	}
	packageValue, err := DecodeAgentPackage(version)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	stamp := now()
	if err := repository.SetRecommendedAgentVersion(agent.ID, version.ID, stamp); err != nil {
		return AgentVersionDetail{}, err
	}
	agent.RecommendedVersionID, agent.UpdatedAt = version.ID, stamp
	return AgentVersionDetail{Agent: agent, Version: version, Package: packageValue, Tags: decodeAgentTags(agent.TagsJSON)}, nil
}

func editableSystemAgent(agentID string) (model.AgentDefinition, error) {
	agent, ok, err := repository.GetAgentDefinition(strings.TrimSpace(agentID))
	if err != nil {
		return agent, err
	}
	if !ok || agent.OwnerType != model.AgentOwnerSystem {
		return agent, safeMessageError{message: "系统 Agent 不存在或不可编辑"}
	}
	return agent, nil
}

func editableSystemAgentVersion(versionID string) (model.AgentDefinition, model.AgentVersion, error) {
	version, ok, err := repository.GetAgentVersion(strings.TrimSpace(versionID))
	if err != nil || !ok {
		return model.AgentDefinition{}, version, safeMessageError{message: "系统 Agent 版本不存在"}
	}
	agent, err := editableSystemAgent(version.AgentID)
	return agent, version, err
}
