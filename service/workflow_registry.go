package service

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func CreateProjectWorkflow(userID string, input WorkflowCreateInput) (WorkflowVersionDetail, error) {
	userID, input.ProjectID, input.Name = strings.TrimSpace(userID), strings.TrimSpace(input.ProjectID), strings.TrimSpace(input.Name)
	input.Version = strings.TrimSpace(input.Version)
	if userID == "" || input.ProjectID == "" || input.Name == "" {
		return WorkflowVersionDetail{}, safeMessageError{message: "Workflow 名称和项目不能为空"}
	}
	if !skillSemanticVersionRegexp.MatchString(input.Version) {
		return WorkflowVersionDetail{}, safeMessageError{message: "Workflow 版本号必须使用 x.y.z 语义化版本"}
	}
	pkg, err := NormalizeWorkflowPackage(input.Package)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	stamp := now()
	definition := model.WorkflowDefinition{
		ID: newID("workflow"), Name: input.Name, Summary: strings.TrimSpace(input.Summary),
		TagsJSON: encodeWorkflowTags(input.Tags), OwnerType: model.WorkflowOwnerProject,
		OwnerUserID: userID, OwnerProjectID: input.ProjectID, Enabled: true, CreatedAt: stamp, UpdatedAt: stamp,
	}
	version := workflowVersionFromPackage(newID("workflowversion"), definition.ID, input.Version, userID, stamp, pkg)
	if err := repository.CreateWorkflowDefinitionAggregate(definition, version); err != nil {
		return WorkflowVersionDetail{}, err
	}
	return WorkflowVersionDetail{Workflow: definition, Version: version, Package: pkg, Tags: decodeWorkflowTags(definition.TagsJSON)}, nil
}

func ListVisibleWorkflows(userID, projectID string) ([]WorkflowRegistryItem, error) {
	definitions, err := repository.ListVisibleWorkflowDefinitions(strings.TrimSpace(userID), strings.TrimSpace(projectID))
	if err != nil {
		return nil, err
	}
	items := make([]WorkflowRegistryItem, 0, len(definitions))
	for _, definition := range definitions {
		versions, err := repository.ListWorkflowVersions(definition.ID)
		if err != nil {
			return nil, err
		}
		item := WorkflowRegistryItem{Workflow: definition, Tags: decodeWorkflowTags(definition.TagsJSON), Versions: versions}
		for _, version := range versions {
			if version.ID == definition.RecommendedVersionID && version.Status == model.WorkflowVersionPublished {
				pkg, err := DecodeWorkflowPackage(version)
				if err != nil {
					return nil, err
				}
				item.RecommendedPackage = &pkg
			}
		}
		items = append(items, item)
	}
	return items, nil
}

func GetVisibleWorkflow(userID, projectID, workflowID string) (WorkflowRegistryItem, error) {
	definition, ok, err := repository.GetWorkflowDefinition(workflowID)
	if err != nil {
		return WorkflowRegistryItem{}, err
	}
	if !ok || !workflowVisibleTo(definition, userID, projectID) {
		return WorkflowRegistryItem{}, safeMessageError{message: "Workflow 不存在"}
	}
	versions, err := repository.ListWorkflowVersions(definition.ID)
	if err != nil {
		return WorkflowRegistryItem{}, err
	}
	item := WorkflowRegistryItem{Workflow: definition, Tags: decodeWorkflowTags(definition.TagsJSON), Versions: versions}
	for _, version := range versions {
		if version.ID == definition.RecommendedVersionID && version.Status == model.WorkflowVersionPublished {
			pkg, err := DecodeWorkflowPackage(version)
			if err != nil {
				return WorkflowRegistryItem{}, err
			}
			item.RecommendedPackage = &pkg
		}
	}
	return item, nil
}

func GetVisibleWorkflowVersion(userID, versionID string) (WorkflowVersionDetail, error) {
	version, ok, err := repository.GetWorkflowVersion(versionID)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	if !ok {
		return WorkflowVersionDetail{}, safeMessageError{message: "Workflow 版本不存在"}
	}
	definition, ok, err := repository.GetWorkflowDefinition(version.WorkflowID)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	if !ok || !workflowVisibleTo(definition, userID, definition.OwnerProjectID) {
		return WorkflowVersionDetail{}, safeMessageError{message: "Workflow 版本不存在"}
	}
	pkg, err := DecodeWorkflowPackage(version)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	return WorkflowVersionDetail{Workflow: definition, Version: version, Package: pkg, Tags: decodeWorkflowTags(definition.TagsJSON)}, nil
}

func CopyWorkflowToProject(userID, workflowID, projectID, name string) (WorkflowVersionDetail, error) {
	item, err := GetVisibleWorkflow(userID, projectID, workflowID)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	if item.RecommendedPackage == nil {
		return WorkflowVersionDetail{}, safeMessageError{message: "Workflow 没有可复制的推荐版本"}
	}
	if strings.TrimSpace(name) == "" {
		name = item.Workflow.Name + "（项目版）"
	}
	return CreateProjectWorkflow(userID, WorkflowCreateInput{
		ProjectID: projectID, Name: name, Summary: item.Workflow.Summary,
		Tags: item.Tags, Version: "1.0.0", Package: *item.RecommendedPackage,
	})
}

func CreateWorkflowDraft(userID, workflowID string, input WorkflowDraftInput) (model.WorkflowVersion, error) {
	definition, err := editableWorkflow(userID, workflowID)
	if err != nil {
		return model.WorkflowVersion{}, err
	}
	input.Version = strings.TrimSpace(input.Version)
	if !skillSemanticVersionRegexp.MatchString(input.Version) {
		return model.WorkflowVersion{}, safeMessageError{message: "Workflow 版本号必须使用 x.y.z 语义化版本"}
	}
	pkg, err := NormalizeWorkflowPackage(input.Package)
	if err != nil {
		return model.WorkflowVersion{}, err
	}
	stamp := now()
	version := workflowVersionFromPackage(newID("workflowversion"), definition.ID, input.Version, userID, stamp, pkg)
	return version, repository.CreateWorkflowVersion(version)
}

func UpdateWorkflowDraft(userID, versionID string, input WorkflowDraftInput) (model.WorkflowVersion, error) {
	_, version, err := editableWorkflowVersion(userID, versionID)
	if err != nil {
		return version, err
	}
	if version.Status != model.WorkflowVersionDraft {
		return version, safeMessageError{message: "已发布 Workflow 版本不可修改"}
	}
	if strings.TrimSpace(input.Version) != version.Version {
		return version, safeMessageError{message: "Workflow 草稿版本号不可修改"}
	}
	pkg, err := NormalizeWorkflowPackage(input.Package)
	if err != nil {
		return version, err
	}
	updated := workflowVersionFromPackage(version.ID, version.WorkflowID, version.Version, version.CreatedBy, version.CreatedAt, pkg)
	updated.UpdatedAt = now()
	return updated, repository.SaveWorkflowDraft(updated)
}

func ValidateWorkflowVersion(userID, versionID string) (WorkflowValidationResult, error) {
	definition, version, err := editableWorkflowVersion(userID, versionID)
	if err != nil {
		return WorkflowValidationResult{}, err
	}
	pkg, err := DecodeWorkflowPackage(version)
	if err != nil {
		return WorkflowValidationResult{}, err
	}
	pkg, resolved, err := resolveWorkflowPublication(userID, definition.OwnerProjectID, pkg)
	if err != nil {
		return WorkflowValidationResult{}, err
	}
	return WorkflowValidationResult{ContentHash: pkg.ContentHash, ResolvedNodes: resolved}, nil
}

func PublishWorkflowVersion(userID, versionID string) (WorkflowVersionDetail, error) {
	definition, version, err := editableWorkflowVersion(userID, versionID)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	if version.Status != model.WorkflowVersionDraft {
		return WorkflowVersionDetail{}, safeMessageError{message: "只能发布 Workflow 草稿版本"}
	}
	pkg, err := DecodeWorkflowPackage(version)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	pkg, _, err = resolveWorkflowPublication(userID, definition.OwnerProjectID, pkg)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	stamp := now()
	version.PackageJSON = mustWorkflowPackageJSON(pkg)
	version.ContentHash, version.PublishedAt, version.UpdatedAt = pkg.ContentHash, stamp, stamp
	if err := repository.PublishWorkflowVersion(version); err != nil {
		return WorkflowVersionDetail{}, err
	}
	version.Status = model.WorkflowVersionPublished
	return WorkflowVersionDetail{Workflow: definition, Version: version, Package: pkg, Tags: decodeWorkflowTags(definition.TagsJSON)}, nil
}

func RecommendWorkflowVersion(userID, workflowID, versionID string) (WorkflowVersionDetail, error) {
	definition, err := editableWorkflow(userID, workflowID)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	version, ok, err := repository.GetWorkflowVersion(versionID)
	if err != nil || !ok || version.WorkflowID != definition.ID || version.Status != model.WorkflowVersionPublished {
		return WorkflowVersionDetail{}, safeMessageError{message: "只能推荐该 Workflow 的已发布版本"}
	}
	pkg, err := DecodeWorkflowPackage(version)
	if err != nil {
		return WorkflowVersionDetail{}, err
	}
	stamp := now()
	if err := repository.SetRecommendedWorkflowVersion(definition.ID, version.ID, stamp); err != nil {
		return WorkflowVersionDetail{}, err
	}
	definition.RecommendedVersionID, definition.UpdatedAt = version.ID, stamp
	return WorkflowVersionDetail{Workflow: definition, Version: version, Package: pkg, Tags: decodeWorkflowTags(definition.TagsJSON)}, nil
}

func DecodeWorkflowPackage(version model.WorkflowVersion) (WorkflowPackage, error) {
	var pkg WorkflowPackage
	if json.Unmarshal([]byte(version.PackageJSON), &pkg) != nil {
		return pkg, errors.New("Workflow package 无效")
	}
	normalized, err := NormalizeWorkflowPackage(pkg)
	if err != nil {
		return pkg, err
	}
	if version.ContentHash != "" && normalized.ContentHash != version.ContentHash {
		return pkg, errors.New("Workflow package 内容哈希不一致")
	}
	return normalized, nil
}

func resolveWorkflowPublication(userID, projectID string, pkg WorkflowPackage) (WorkflowPackage, []ResolvedWorkflowNode, error) {
	var resolved []ResolvedWorkflowNode
	for index := range pkg.Nodes {
		node := &pkg.Nodes[index]
		row := ResolvedWorkflowNode{NodeKey: node.NodeKey, ExecutorType: node.ExecutorType}
		if node.ExecutorType == WorkflowExecutorAdapter {
			adapter, err := ResolveWorkflowAdapter(*node.AdapterRef)
			if err != nil {
				return pkg, nil, err
			}
			if err := validateWorkflowAdapterNodeContracts(adapter, *node); err != nil {
				return pkg, nil, err
			}
			row.AdapterID, row.AdapterVersion, row.AdapterContentHash = adapter.ID, adapter.Version, adapter.ContentHash
		} else if node.ExecutorType == WorkflowExecutorAgent {
			definition, version, err := resolveWorkflowAgentReference(userID, projectID, *node.AgentRef)
			if err != nil {
				return pkg, nil, err
			}
			node.AgentRef.AgentID, node.AgentRef.AgentVersionID, node.AgentRef.AgentVersionConstraint = definition.ID, version.ID, ""
			row.AgentID, row.AgentVersionID = definition.ID, version.ID
		} else if node.SkillBinding.Mode == WorkflowSkillBindingFixed {
			definition, version, skillPackage, err := resolveWorkflowFixedSkill(userID, projectID, *node.SkillBinding)
			if err != nil {
				return pkg, nil, err
			}
			if !containsSkillToken(skillPackage.Manifest.OutputArtifactTypes, node.OutputArtifactType) {
				return pkg, nil, safeMessageError{message: "固定 Skill 输出 Artifact 类型与 Workflow 节点不兼容"}
			}
			node.SkillBinding.SkillID, node.SkillBinding.SkillVersionID, node.SkillBinding.SkillVersionConstraint = definition.ID, version.ID, ""
			row.SkillID, row.SkillVersionID, row.SkillContentHash = definition.ID, version.ID, version.ContentHash
		} else if !workflowRouteHasCandidate(userID, projectID, *node.SkillBinding, node.OutputArtifactType) {
			return pkg, nil, safeMessageError{message: "Workflow 路由没有兼容的已发布 Skill"}
		}
		resolved = append(resolved, row)
	}
	normalized, err := NormalizeWorkflowPackage(pkg)
	return normalized, resolved, err
}

func resolveWorkflowFixedSkill(userID, projectID string, ref WorkflowSkillBinding) (model.SkillDefinition, model.SkillVersion, SkillPackage, error) {
	if ref.SkillVersionID != "" {
		definition, version, ok, err := repository.GetSkillWithVersion(ref.SkillVersionID)
		if err != nil || !ok || version.Status != model.SkillVersionPublished || !skillVisibleTo(definition, userID, projectID) {
			return definition, version, SkillPackage{}, safeMessageError{message: "固定 Skill 版本不可用"}
		}
		pkg, err := DecodeSkillPackage(version)
		return definition, version, pkg, err
	}
	definition, ok, err := repository.GetSkillDefinition(ref.SkillID)
	if err != nil || !ok || !skillVisibleTo(definition, userID, projectID) {
		return definition, model.SkillVersion{}, SkillPackage{}, safeMessageError{message: "固定 Skill 不可用"}
	}
	versions, err := repository.ListSkillVersions(definition.ID)
	if err != nil {
		return definition, model.SkillVersion{}, SkillPackage{}, err
	}
	version, ok := chooseWorkflowSkillVersion(definition, versions, ref.SkillVersionConstraint)
	if !ok {
		return definition, version, SkillPackage{}, safeMessageError{message: "固定 Skill 没有兼容的已发布版本"}
	}
	pkg, err := DecodeSkillPackage(version)
	return definition, version, pkg, err
}

func chooseWorkflowSkillVersion(definition model.SkillDefinition, versions []model.SkillVersion, constraintValue string) (model.SkillVersion, bool) {
	if strings.TrimSpace(constraintValue) == "" {
		for _, version := range versions {
			if version.ID == definition.RecommendedVersionID && version.Status == model.SkillVersionPublished {
				return version, true
			}
		}
		return model.SkillVersion{}, false
	}
	constraint, err := semver.NewConstraint(constraintValue)
	if err != nil {
		return model.SkillVersion{}, false
	}
	sort.SliceStable(versions, func(i, j int) bool {
		a, ea := semver.StrictNewVersion(versions[i].Version)
		b, eb := semver.StrictNewVersion(versions[j].Version)
		return ea == nil && (eb != nil || a.GreaterThan(b))
	})
	for _, version := range versions {
		parsed, err := semver.StrictNewVersion(version.Version)
		if err == nil && version.Status == model.SkillVersionPublished && constraint.Check(parsed) {
			return version, true
		}
	}
	return model.SkillVersion{}, false
}

func resolveWorkflowAgentReference(userID, projectID string, ref WorkflowAgentRef) (model.AgentDefinition, model.AgentVersion, error) {
	if ref.AgentVersionID != "" {
		version, ok, err := repository.GetAgentVersion(ref.AgentVersionID)
		if err != nil || !ok || version.Status != model.AgentVersionPublished {
			return model.AgentDefinition{}, version, safeMessageError{message: "Agent 版本不可用"}
		}
		definition, ok, err := repository.GetAgentDefinition(version.AgentID)
		if err != nil || !ok || !agentVisibleTo(definition, userID, projectID) {
			return definition, version, safeMessageError{message: "Agent 版本不可用"}
		}
		return definition, version, nil
	}
	definition, ok, err := repository.GetAgentDefinition(ref.AgentID)
	if err != nil || !ok || !agentVisibleTo(definition, userID, projectID) {
		return definition, model.AgentVersion{}, safeMessageError{message: "Agent 不可用"}
	}
	versions, err := repository.ListAgentVersions(definition.ID)
	if err != nil {
		return definition, model.AgentVersion{}, err
	}
	for _, version := range versions {
		if version.ID == definition.RecommendedVersionID && version.Status == model.AgentVersionPublished {
			return definition, version, nil
		}
	}
	return definition, model.AgentVersion{}, safeMessageError{message: "Agent 没有推荐的已发布版本"}
}

func workflowRouteHasCandidate(userID, projectID string, ref WorkflowSkillBinding, outputType string) bool {
	definitions, err := repository.ListSkillDefinitions()
	if err != nil {
		return false
	}
	for _, definition := range definitions {
		if !definition.Enabled || !skillVisibleTo(definition, userID, projectID) || (len(ref.CandidateSkillIDs) > 0 && !containsInvocationString(ref.CandidateSkillIDs, definition.ID)) {
			continue
		}
		versions, err := repository.ListSkillVersions(definition.ID)
		if err != nil {
			continue
		}
		for _, version := range versions {
			if version.Status != model.SkillVersionPublished {
				continue
			}
			pkg, err := DecodeSkillPackage(version)
			if err == nil && containsSkillToken(pkg.Manifest.Capabilities, ref.Capability) && containsSkillToken(pkg.Manifest.OutputArtifactTypes, outputType) {
				return true
			}
		}
	}
	return false
}

func editableWorkflow(userID, workflowID string) (model.WorkflowDefinition, error) {
	definition, ok, err := repository.GetWorkflowDefinition(strings.TrimSpace(workflowID))
	if err != nil {
		return definition, err
	}
	if !ok || definition.OwnerType != model.WorkflowOwnerProject || definition.OwnerUserID != strings.TrimSpace(userID) {
		return definition, safeMessageError{message: "Workflow 不可编辑"}
	}
	return definition, nil
}

func editableWorkflowVersion(userID, versionID string) (model.WorkflowDefinition, model.WorkflowVersion, error) {
	version, ok, err := repository.GetWorkflowVersion(strings.TrimSpace(versionID))
	if err != nil || !ok {
		return model.WorkflowDefinition{}, version, safeMessageError{message: "Workflow 版本不存在"}
	}
	definition, err := editableWorkflow(userID, version.WorkflowID)
	return definition, version, err
}

func workflowVisibleTo(definition model.WorkflowDefinition, userID, projectID string) bool {
	return definition.OwnerType == model.WorkflowOwnerSystem || (definition.OwnerType == model.WorkflowOwnerProject && definition.OwnerUserID == strings.TrimSpace(userID) && definition.OwnerProjectID == strings.TrimSpace(projectID))
}

func workflowVersionFromPackage(id, workflowID, versionName, createdBy, createdAt string, pkg WorkflowPackage) model.WorkflowVersion {
	return model.WorkflowVersion{ID: id, WorkflowID: workflowID, Version: versionName, Status: model.WorkflowVersionDraft, PackageJSON: mustWorkflowPackageJSON(pkg), ContentHash: pkg.ContentHash, CreatedBy: createdBy, CreatedAt: createdAt, UpdatedAt: createdAt}
}

func mustWorkflowPackageJSON(pkg WorkflowPackage) string {
	raw, _ := json.Marshal(pkg)
	return string(raw)
}

func encodeWorkflowTags(tags []string) string {
	raw, _ := json.Marshal(normalizedStringSet(tags, true))
	return string(raw)
}

func decodeWorkflowTags(raw string) []string {
	var tags []string
	_ = json.Unmarshal([]byte(raw), &tags)
	return normalizedStringSet(tags, true)
}
