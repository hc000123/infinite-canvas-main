package service

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func NormalizeAgentPackage(value AgentPackage) (AgentPackage, error) {
	value.RolePrompt = normalizeAgentText(value.RolePrompt)
	if value.RolePrompt == "" {
		return value, safeMessageError{message: "Agent 必须填写职位设定"}
	}
	value.PlannerMode = strings.ToLower(strings.TrimSpace(value.PlannerMode))
	if value.PlannerMode != AgentPlannerConfiguredChain {
		return value, safeMessageError{message: "Agent plannerMode 仅支持 configured_chain"}
	}
	if len(value.DefaultSkillRefs) == 0 || len(value.DefaultSkillRefs) > 32 {
		return value, safeMessageError{message: "Agent 必须配置 1–32 个默认 Skill"}
	}
	seenSteps := map[string]bool{}
	refs := make([]AgentSkillRef, 0, len(value.DefaultSkillRefs))
	for _, ref := range value.DefaultSkillRefs {
		ref.StepKey = strings.ToLower(strings.TrimSpace(ref.StepKey))
		if !skillManifestTokenPattern.MatchString(ref.StepKey) {
			return value, safeMessageError{message: "Agent Step Key 格式无效"}
		}
		if seenSteps[ref.StepKey] {
			return value, safeMessageError{message: "Agent Step Key 重复"}
		}
		seenSteps[ref.StepKey] = true
		ref.Label = strings.TrimSpace(ref.Label)
		ref.Capability = strings.ToLower(strings.TrimSpace(ref.Capability))
		ref.SkillID = strings.TrimSpace(ref.SkillID)
		ref.SkillVersionID = strings.TrimSpace(ref.SkillVersionID)
		ref.SkillVersionConstraint = strings.Join(strings.Fields(ref.SkillVersionConstraint), " ")
		if ref.SkillVersionID == "" && ref.SkillID == "" && ref.Capability == "" {
			return value, safeMessageError{message: "Agent Step 必须指定 Skill Version、Skill 或 Capability"}
		}
		if ref.SkillVersionID == "" && ref.SkillID != "" && ref.SkillVersionConstraint != "" {
			if _, err := semver.NewConstraint(ref.SkillVersionConstraint); err != nil {
				return value, safeMessageError{message: "Agent Skill 版本约束无效"}
			}
		}
		if ref.SkillID == "" && ref.SkillVersionConstraint != "" {
			return value, safeMessageError{message: "Agent Skill 版本约束必须配合 Skill ID"}
		}
		if ref.Capability != "" && !skillManifestTokenPattern.MatchString(ref.Capability) {
			return value, safeMessageError{message: "Agent Capability 格式无效"}
		}
		bindings, err := normalizeAgentInputBindings(ref.InputBindings)
		if err != nil {
			return value, err
		}
		ref.InputBindings = bindings
		if len(strings.TrimSpace(string(ref.Parameters))) == 0 {
			ref.Parameters = json.RawMessage(`{}`)
		}
		parameters, err := canonicalInvocationParameters(ref.Parameters)
		if err != nil {
			return value, safeMessageError{message: "Agent Step Parameters 必须是有效 JSON"}
		}
		ref.Parameters = json.RawMessage(parameters)
		ref.ExpectedOutputType = strings.ToLower(strings.TrimSpace(ref.ExpectedOutputType))
		refs = append(refs, ref)
	}
	value.DefaultSkillRefs = refs
	policy, err := normalizeAgentAccessPolicy(value.SkillAccessPolicy)
	if err != nil {
		return value, err
	}
	value.SkillAccessPolicy = policy
	value.ModelPolicy = normalizeAgentModelPolicy(value.ModelPolicy)
	value.ToolPolicy.AllowedTools = normalizedStringSet(value.ToolPolicy.AllowedTools, true)
	if value.ExecutionPolicy.MaxSteps == 0 {
		value.ExecutionPolicy.MaxSteps = len(value.DefaultSkillRefs)
	}
	if value.ExecutionPolicy.MaxSteps < len(value.DefaultSkillRefs) || value.ExecutionPolicy.MaxSteps > 32 {
		return value, safeMessageError{message: "Agent 最大步骤数必须覆盖默认 Skill 且不超过 32"}
	}
	value.ContentHash = agentPackageHash(value)
	return value, nil
}

func DecodeAgentPackage(version model.AgentVersion) (AgentPackage, error) {
	value := AgentPackage{RolePrompt: version.RolePrompt, PlannerMode: version.PlannerMode}
	if json.Unmarshal([]byte(version.DefaultSkillRefsJSON), &value.DefaultSkillRefs) != nil ||
		json.Unmarshal([]byte(version.SkillAccessPolicyJSON), &value.SkillAccessPolicy) != nil ||
		json.Unmarshal([]byte(version.ModelPolicyJSON), &value.ModelPolicy) != nil ||
		json.Unmarshal([]byte(version.ToolPolicyJSON), &value.ToolPolicy) != nil ||
		json.Unmarshal([]byte(version.ExecutionPolicyJSON), &value.ExecutionPolicy) != nil {
		return AgentPackage{}, safeMessageError{message: "Agent 版本内容损坏"}
	}
	normalized, err := NormalizeAgentPackage(value)
	if err != nil {
		return AgentPackage{}, err
	}
	if normalized.ContentHash != version.ContentHash {
		return AgentPackage{}, safeMessageError{message: "Agent 内容哈希不一致"}
	}
	return normalized, nil
}

func CreateProjectAgent(userID string, input AgentCreateInput) (AgentVersionDetail, error) {
	userID = strings.TrimSpace(userID)
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	input.Name = strings.TrimSpace(input.Name)
	input.Summary = strings.TrimSpace(input.Summary)
	input.Version = strings.TrimSpace(input.Version)
	if userID == "" || input.ProjectID == "" || input.Name == "" {
		return AgentVersionDetail{}, safeMessageError{message: "缺少 Agent 项目、名称或用户"}
	}
	if !skillSemanticVersionRegexp.MatchString(input.Version) {
		return AgentVersionDetail{}, safeMessageError{message: "Agent 版本号必须使用 x.y.z 语义化版本"}
	}
	packageValue, err := NormalizeAgentPackage(input.Package)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	tags := normalizedStringSet(input.Tags, true)
	tagsJSON, _ := json.Marshal(tags)
	stamp := now()
	agent := model.AgentDefinition{
		ID: newID("agent"), Name: input.Name, Summary: input.Summary, TagsJSON: string(tagsJSON),
		OwnerType: model.AgentOwnerProject, OwnerUserID: userID, OwnerProjectID: input.ProjectID,
		Enabled: true, CreatedAt: stamp, UpdatedAt: stamp,
	}
	version := agentVersionFromPackage(newID("agentversion"), agent.ID, input.Version, userID, stamp, packageValue)
	if err := repository.CreateAgentAggregate(agent, version); err != nil {
		return AgentVersionDetail{}, err
	}
	return AgentVersionDetail{Agent: agent, Version: version, Package: packageValue, Tags: tags}, nil
}

func ListVisibleAgents(userID, projectID string) ([]AgentRegistryItem, error) {
	agents, err := repository.ListVisibleAgentDefinitions(userID, projectID)
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
		if agent.RecommendedVersionID != "" {
			for _, version := range versions {
				if version.ID != agent.RecommendedVersionID || version.Status != model.AgentVersionPublished {
					continue
				}
				packageValue, err := DecodeAgentPackage(version)
				if err != nil {
					return nil, err
				}
				item.RecommendedPackage = &packageValue
				break
			}
		}
		items = append(items, item)
	}
	return items, nil
}

func GetVisibleAgent(userID, projectID, agentID string) (AgentRegistryItem, error) {
	agent, ok, err := repository.GetAgentDefinition(agentID)
	if err != nil {
		return AgentRegistryItem{}, err
	}
	if !ok || !agentVisibleTo(agent, userID, projectID) {
		return AgentRegistryItem{}, safeMessageError{message: "Agent 不存在"}
	}
	versions, err := repository.ListAgentVersions(agent.ID)
	if err != nil {
		return AgentRegistryItem{}, err
	}
	item := AgentRegistryItem{Agent: agent, Tags: decodeAgentTags(agent.TagsJSON), Versions: versions}
	for _, version := range versions {
		if version.ID == agent.RecommendedVersionID && version.Status == model.AgentVersionPublished {
			packageValue, err := DecodeAgentPackage(version)
			if err != nil {
				return AgentRegistryItem{}, err
			}
			item.RecommendedPackage = &packageValue
		}
	}
	return item, nil
}

func GetVisibleAgentVersion(userID, versionID string) (AgentVersionDetail, error) {
	version, ok, err := repository.GetAgentVersion(strings.TrimSpace(versionID))
	if err != nil {
		return AgentVersionDetail{}, err
	}
	if !ok {
		return AgentVersionDetail{}, safeMessageError{message: "Agent 版本不存在"}
	}
	agent, ok, err := repository.GetAgentDefinition(version.AgentID)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	if !ok || !agentVisibleTo(agent, strings.TrimSpace(userID), agent.OwnerProjectID) {
		return AgentVersionDetail{}, safeMessageError{message: "Agent 版本不存在"}
	}
	packageValue, err := DecodeAgentPackage(version)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	return AgentVersionDetail{Agent: agent, Version: version, Package: packageValue, Tags: decodeAgentTags(agent.TagsJSON)}, nil
}

func CreateAgentDraft(userID, agentID string, input AgentDraftInput) (model.AgentVersion, error) {
	agent, err := editableAgent(userID, agentID)
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
	version := agentVersionFromPackage(newID("agentversion"), agent.ID, input.Version, userID, stamp, packageValue)
	return version, repository.CreateAgentVersion(version)
}

func UpdateAgentDraft(userID, versionID string, input AgentDraftInput) (model.AgentVersion, error) {
	agent, version, err := editableAgentVersion(userID, versionID)
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
	updated.UpdatedAt = now()
	return updated, repository.SaveAgentDraft(updated)
}

func ValidateAgentVersion(userID, versionID string) (AgentValidationResult, error) {
	agent, version, err := editableAgentVersion(userID, versionID)
	if err != nil {
		return AgentValidationResult{}, err
	}
	packageValue, err := DecodeAgentPackage(version)
	if err != nil {
		return AgentValidationResult{}, err
	}
	resolved := make([]ResolvedAgentSkillRef, 0, len(packageValue.DefaultSkillRefs))
	for _, ref := range packageValue.DefaultSkillRefs {
		skill, err := resolveAgentSkillReference(userID, agent.OwnerProjectID, ref)
		if err != nil {
			return AgentValidationResult{}, err
		}
		if err := validateAgentSkillAccess(packageValue, ref, skill); err != nil {
			return AgentValidationResult{}, err
		}
		resolved = append(resolved, ResolvedAgentSkillRef{
			StepKey: ref.StepKey, SkillID: skill.Skill.ID, SkillVersionID: skill.Version.ID,
			SkillVersion: skill.Version.Version, SkillContentHash: skill.Version.ContentHash, Manifest: skill.Package.Manifest,
		})
	}
	return AgentValidationResult{ContentHash: packageValue.ContentHash, ResolvedSkills: resolved}, nil
}

func PublishAgentVersion(userID, versionID string) (AgentVersionDetail, error) {
	agent, version, err := editableAgentVersion(userID, versionID)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	if version.Status != model.AgentVersionDraft {
		return AgentVersionDetail{}, safeMessageError{message: "只能发布 Agent 草稿版本"}
	}
	validation, err := ValidateAgentVersion(userID, version.ID)
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

func RecommendAgentVersion(userID, agentID, versionID string) (AgentVersionDetail, error) {
	agent, err := editableAgent(userID, agentID)
	if err != nil {
		return AgentVersionDetail{}, err
	}
	version, ok, err := repository.GetAgentVersion(versionID)
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

func agentVersionFromPackage(id, agentID, versionName, createdBy, createdAt string, value AgentPackage) model.AgentVersion {
	refs, _ := json.Marshal(value.DefaultSkillRefs)
	access, _ := json.Marshal(value.SkillAccessPolicy)
	modelPolicy, _ := json.Marshal(value.ModelPolicy)
	toolPolicy, _ := json.Marshal(value.ToolPolicy)
	execution, _ := json.Marshal(value.ExecutionPolicy)
	return model.AgentVersion{
		ID: id, AgentID: agentID, Version: versionName, Status: model.AgentVersionDraft,
		RolePrompt: value.RolePrompt, PlannerMode: value.PlannerMode,
		DefaultSkillRefsJSON: string(refs), SkillAccessPolicyJSON: string(access),
		ModelPolicyJSON: string(modelPolicy), ToolPolicyJSON: string(toolPolicy), ExecutionPolicyJSON: string(execution),
		ContentHash: value.ContentHash, CreatedBy: strings.TrimSpace(createdBy), CreatedAt: createdAt, UpdatedAt: createdAt,
	}
}

func agentPackageHash(value AgentPackage) string {
	payload, _ := marshalInvocationCanonical(struct {
		RolePrompt        string                 `json:"rolePrompt"`
		PlannerMode       string                 `json:"plannerMode"`
		DefaultSkillRefs  []AgentSkillRef        `json:"defaultSkillRefs"`
		SkillAccessPolicy AgentSkillAccessPolicy `json:"skillAccessPolicy"`
		ModelPolicy       AgentModelPolicy       `json:"modelPolicy"`
		ToolPolicy        AgentToolPolicy        `json:"toolPolicy"`
		ExecutionPolicy   AgentExecutionPolicy   `json:"executionPolicy"`
	}{value.RolePrompt, value.PlannerMode, value.DefaultSkillRefs, value.SkillAccessPolicy, value.ModelPolicy, value.ToolPolicy, value.ExecutionPolicy})
	return invocationSHA256(payload)
}

func normalizeAgentText(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	lines := strings.Split(value, "\n")
	for index := range lines {
		lines[index] = strings.TrimRight(lines[index], " \t")
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func normalizeAgentInputBindings(values []AgentStepInputBinding) ([]AgentStepInputBinding, error) {
	seen := map[string]bool{}
	result := make([]AgentStepInputBinding, 0, len(values))
	for _, value := range values {
		value.BindingName = strings.ToLower(strings.TrimSpace(value.BindingName))
		value.ArtifactID = strings.TrimSpace(value.ArtifactID)
		value.ContentHash = strings.TrimSpace(value.ContentHash)
		value.FromStepKey = strings.ToLower(strings.TrimSpace(value.FromStepKey))
		value.FromOutputBinding = strings.ToLower(strings.TrimSpace(value.FromOutputBinding))
		if !skillManifestTokenPattern.MatchString(value.BindingName) || seen[value.BindingName] {
			return nil, safeMessageError{message: "Agent 输入绑定格式无效或重复"}
		}
		seen[value.BindingName] = true
		if value.ArtifactID != "" && value.FromStepKey != "" {
			return nil, safeMessageError{message: "Agent 输入绑定不能同时引用 Artifact 和上游 Step"}
		}
		if value.ArtifactID != "" && value.ContentHash == "" {
			return nil, safeMessageError{message: "Agent Artifact 输入必须携带内容哈希"}
		}
		if value.FromStepKey != "" && value.FromOutputBinding == "" {
			return nil, safeMessageError{message: "Agent 上游输入必须指定输出绑定"}
		}
		result = append(result, value)
	}
	return result, nil
}

func normalizeAgentAccessPolicy(value AgentSkillAccessPolicy) (AgentSkillAccessPolicy, error) {
	value.AllowedSkillIDs = normalizedStringSet(value.AllowedSkillIDs, false)
	value.AllowedCapabilities = normalizedStringSet(value.AllowedCapabilities, true)
	seen := map[model.SkillOwnerType]bool{}
	owners := make([]model.SkillOwnerType, 0, len(value.AllowedOwnerTypes))
	for _, owner := range value.AllowedOwnerTypes {
		if owner != model.SkillOwnerSystem && owner != model.SkillOwnerProject {
			return value, safeMessageError{message: "Agent Skill 所有者范围无效"}
		}
		if !seen[owner] {
			seen[owner] = true
			owners = append(owners, owner)
		}
	}
	sort.Slice(owners, func(i, j int) bool { return owners[i] < owners[j] })
	value.AllowedOwnerTypes = owners
	return value, nil
}

func normalizeAgentModelPolicy(value AgentModelPolicy) AgentModelPolicy {
	value.PreferredModel = strings.TrimSpace(value.PreferredModel)
	value.AllowedModels = normalizedStringSet(value.AllowedModels, false)
	value.ReasoningLevel = strings.TrimSpace(value.ReasoningLevel)
	if value.Temperature < 0 || value.Temperature > 2 {
		value.Temperature = 0
	}
	if value.MaxOutputTokens < 0 {
		value.MaxOutputTokens = 0
	}
	return value
}

func resolveAgentSkillReference(userID, projectID string, ref AgentSkillRef) (ResolvedSkill, error) {
	if ref.SkillVersionID != "" {
		return ResolveExactSkillVersion(userID, projectID, ref.SkillVersionID)
	}
	if ref.SkillID != "" && ref.SkillVersionConstraint == "" {
		return ResolveRecommendedSkill(userID, projectID, ref.SkillID)
	}
	options, err := ListSkillOptions(userID, projectID, SkillOptionFilter{Capability: ref.Capability})
	if err != nil {
		return ResolvedSkill{}, err
	}
	if ref.SkillID != "" {
		constraint, _ := semver.NewConstraint(ref.SkillVersionConstraint)
		filtered := options[:0]
		for _, option := range options {
			version, parseErr := semver.NewVersion(option.Version)
			if option.SkillID == ref.SkillID && parseErr == nil && constraint.Check(version) {
				filtered = append(filtered, option)
			}
		}
		options = filtered
	}
	if len(options) == 0 {
		return ResolvedSkill{}, safeMessageError{message: "Agent Step 没有可用 Skill 版本"}
	}
	sort.SliceStable(options, func(i, j int) bool {
		if options[i].IsRecommended != options[j].IsRecommended {
			return options[i].IsRecommended
		}
		return options[i].SkillVersionID < options[j].SkillVersionID
	})
	return ResolveExactSkillVersion(userID, projectID, options[0].SkillVersionID)
}

func validateAgentSkillAccess(agent AgentPackage, ref AgentSkillRef, skill ResolvedSkill) error {
	policy := agent.SkillAccessPolicy
	if len(policy.AllowedSkillIDs) > 0 && !containsInvocationString(policy.AllowedSkillIDs, skill.Skill.ID) {
		return safeMessageError{message: "Skill 不在 Agent 访问范围内"}
	}
	if len(policy.AllowedOwnerTypes) > 0 {
		allowed := false
		for _, owner := range policy.AllowedOwnerTypes {
			allowed = allowed || owner == skill.Skill.OwnerType
		}
		if !allowed {
			return safeMessageError{message: "Skill 所有者不在 Agent 访问范围内"}
		}
	}
	if ref.Capability != "" && !containsSkillToken(skill.Package.Manifest.Capabilities, ref.Capability) {
		return safeMessageError{message: "Skill Capability 与 Agent Step 不匹配"}
	}
	if len(policy.AllowedCapabilities) > 0 {
		allowed := false
		for _, capability := range skill.Package.Manifest.Capabilities {
			allowed = allowed || containsInvocationString(policy.AllowedCapabilities, capability)
		}
		if !allowed {
			return safeMessageError{message: "Skill Capability 不在 Agent 访问范围内"}
		}
	}
	for _, tool := range skill.Package.Manifest.RequiredTools {
		if !containsInvocationString(agent.ToolPolicy.AllowedTools, tool) {
			return safeMessageError{message: "Skill 所需工具不在 Agent 访问范围内"}
		}
	}
	return nil
}

func editableAgent(userID, agentID string) (model.AgentDefinition, error) {
	agent, ok, err := repository.GetAgentDefinition(agentID)
	if err != nil {
		return agent, err
	}
	if !ok || agent.OwnerType != model.AgentOwnerProject || agent.OwnerUserID != strings.TrimSpace(userID) {
		return agent, safeMessageError{message: "Agent 不存在或不可编辑"}
	}
	return agent, nil
}

func editableAgentVersion(userID, versionID string) (model.AgentDefinition, model.AgentVersion, error) {
	version, ok, err := repository.GetAgentVersion(versionID)
	if err != nil || !ok {
		return model.AgentDefinition{}, version, safeMessageError{message: "Agent 版本不存在"}
	}
	agent, err := editableAgent(userID, version.AgentID)
	return agent, version, err
}

func agentVisibleTo(agent model.AgentDefinition, userID, projectID string) bool {
	return agent.OwnerType == model.AgentOwnerSystem ||
		(agent.OwnerType == model.AgentOwnerProject && agent.OwnerUserID == strings.TrimSpace(userID) && agent.OwnerProjectID == strings.TrimSpace(projectID))
}

func decodeAgentTags(raw string) []string {
	var tags []string
	if json.Unmarshal([]byte(raw), &tags) != nil {
		return []string{}
	}
	return normalizedStringSet(tags, true)
}
