package service

import (
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type agentPlanRevisionSnapshot struct {
	Package          AgentPackage                     `json:"package"`
	RequirementCodes []string                         `json:"requirementCodes"`
	Steps            []agentPlanStepPreflightSnapshot `json:"steps"`
}

type agentPlanStepPreflightSnapshot struct {
	StepKey          string   `json:"stepKey"`
	EstimatedCredits int      `json:"estimatedCredits"`
	RequirementCodes []string `json:"requirementCodes"`
}

func CreateAgentPlan(userID string, input AgentPlanCreateInput) (AgentPlanDetail, error) {
	userID = strings.TrimSpace(userID)
	input.ProjectID, input.EpisodeID, input.Goal = strings.TrimSpace(input.ProjectID), strings.TrimSpace(input.EpisodeID), strings.TrimSpace(input.Goal)
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	if userID == "" || input.ProjectID == "" || input.Goal == "" || input.IdempotencyKey == "" {
		return AgentPlanDetail{}, safeMessageError{message: "Agent Plan 缺少用户、项目、目标或幂等键"}
	}
	agent, version, packageValue, err := resolveAgentPlanVersion(userID, input.ProjectID, input.AgentID, input.AgentVersionID)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	packageValue, sourceRefs, err := normalizeAgentPlanInputs(packageValue, input.SkillOverrides, input.SourceArtifactRefs)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	stamp := now()
	planID := newID("agentplan")
	plan := model.AgentPlan{
		ID: planID, UserID: userID, ProjectID: input.ProjectID, EpisodeID: input.EpisodeID,
		AgentID: agent.ID, AgentVersionID: version.ID, Goal: input.Goal, Status: model.AgentPlanDraft,
		CurrentRevision: 1, IdempotencyKey: input.IdempotencyKey, CreatedAt: stamp, UpdatedAt: stamp,
	}
	revision, steps, err := buildAgentPlanRevision(plan, version, packageValue, sourceRefs, stamp)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	hashPayload, _ := marshalInvocationCanonical(struct {
		UserID     string                    `json:"userId"`
		ProjectID  string                    `json:"projectId"`
		EpisodeID  string                    `json:"episodeId"`
		AgentID    string                    `json:"agentId"`
		VersionID  string                    `json:"agentVersionId"`
		AgentHash  string                    `json:"agentContentHash"`
		Goal       string                    `json:"goal"`
		SourceRefs []ArtifactRefInput        `json:"sourceArtifactRefs"`
		Snapshot   agentPlanRevisionSnapshot `json:"snapshot"`
	}{userID, plan.ProjectID, plan.EpisodeID, plan.AgentID, plan.AgentVersionID, version.ContentHash, plan.Goal, sourceRefs, agentPlanRevisionSnapshot{Package: packageValue, RequirementCodes: []string{}, Steps: []agentPlanStepPreflightSnapshot{}}})
	plan.RequestHash = invocationSHA256(hashPayload)
	stored, _, err := repository.CreateAgentPlanAggregateIdempotently(plan, revision, steps)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	return GetAgentPlanDetail(userID, stored.ID)
}

func CreateAgentPlanRevision(userID, planID string, input AgentPlanRevisionInput) (AgentPlanDetail, error) {
	plan, ok, err := repository.GetUserAgentPlan(userID, planID)
	if err != nil || !ok {
		return AgentPlanDetail{}, safeMessageError{message: "Agent Plan 不存在"}
	}
	if plan.Status != model.AgentPlanDraft && plan.Status != model.AgentPlanAwaitingConfirmation && plan.Status != model.AgentPlanBlocked {
		return AgentPlanDetail{}, safeMessageError{message: "当前 Agent Plan 状态不可创建新 Revision"}
	}
	input.Goal = strings.TrimSpace(input.Goal)
	if input.Goal == "" {
		return AgentPlanDetail{}, safeMessageError{message: "Agent Plan 必须填写目标"}
	}
	agent, version, packageValue, err := resolveAgentPlanVersion(userID, plan.ProjectID, plan.AgentID, input.AgentVersionID)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	if agent.ID != plan.AgentID {
		return AgentPlanDetail{}, safeMessageError{message: "Agent Plan Revision 不能更换 Agent"}
	}
	packageValue, sourceRefs, err := normalizeAgentPlanInputs(packageValue, input.SkillOverrides, input.SourceArtifactRefs)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	stamp := now()
	plan.AgentVersionID, plan.Goal, plan.Status = version.ID, input.Goal, model.AgentPlanDraft
	plan.CurrentRevision++
	plan.EstimatedCredits, plan.ConfirmationFingerprint, plan.UpdatedAt = 0, "", stamp
	revision, steps, err := buildAgentPlanRevision(plan, version, packageValue, sourceRefs, stamp)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	if err := repository.AppendAgentPlanRevision(plan, revision, steps); err != nil {
		return AgentPlanDetail{}, err
	}
	return GetAgentPlanDetail(userID, plan.ID)
}

func GetAgentPlanDetail(userID, planID string) (AgentPlanDetail, error) {
	plan, ok, err := repository.GetUserAgentPlan(strings.TrimSpace(userID), strings.TrimSpace(planID))
	if err != nil {
		return AgentPlanDetail{}, err
	}
	if !ok {
		return AgentPlanDetail{}, safeMessageError{message: "Agent Plan 不存在"}
	}
	revision, steps, ok, err := repository.GetAgentPlanRevision(plan.ID, plan.CurrentRevision)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	if !ok {
		return AgentPlanDetail{}, safeMessageError{message: "Agent Plan Revision 不存在"}
	}
	details := make([]AgentPlanStepDetail, 0, len(steps))
	for _, step := range steps {
		detail := AgentPlanStepDetail{Step: step, InputBindings: []AgentStepInputBinding{}, Parameters: json.RawMessage(`{}`), OutputArtifactRefs: []ArtifactRefInput{}}
		if json.Unmarshal([]byte(step.InputBindingsJSON), &detail.InputBindings) != nil ||
			json.Unmarshal([]byte(step.ParametersJSON), &detail.Parameters) != nil ||
			json.Unmarshal([]byte(step.OutputArtifactRefsJSON), &detail.OutputArtifactRefs) != nil {
			return AgentPlanDetail{}, safeMessageError{message: "Agent Plan Step 内容损坏"}
		}
		details = append(details, detail)
	}
	result := AgentPlanDetail{Plan: plan, Revision: revision, Steps: details}
	if confirmation, found, err := repository.GetAgentPlanConfirmation(plan.ID, plan.CurrentRevision); err != nil {
		return AgentPlanDetail{}, err
	} else if found {
		result.Confirmation = &confirmation
	}
	return result, nil
}

func resolveAgentPlanVersion(userID, projectID, agentID, versionID string) (model.AgentDefinition, model.AgentVersion, AgentPackage, error) {
	agentID, versionID = strings.TrimSpace(agentID), strings.TrimSpace(versionID)
	var agent model.AgentDefinition
	var version model.AgentVersion
	var ok bool
	var err error
	if agentID == "" && versionID != "" {
		version, ok, err = repository.GetAgentVersion(versionID)
		if err != nil || !ok {
			return agent, version, AgentPackage{}, safeMessageError{message: "Agent 版本不存在"}
		}
		agentID = version.AgentID
	}
	agent, ok, err = repository.GetAgentDefinition(agentID)
	if err != nil {
		return agent, version, AgentPackage{}, err
	}
	if !ok || !agent.Enabled || !agentVisibleTo(agent, userID, projectID) {
		return agent, version, AgentPackage{}, safeMessageError{message: "Agent 不存在"}
	}
	if versionID == "" {
		versionID = agent.RecommendedVersionID
	}
	version, ok, err = repository.GetAgentVersion(versionID)
	if err != nil {
		return agent, version, AgentPackage{}, err
	}
	if !ok || version.AgentID != agent.ID || version.Status != model.AgentVersionPublished {
		return agent, version, AgentPackage{}, safeMessageError{message: "Agent 版本不可用"}
	}
	packageValue, err := DecodeAgentPackage(version)
	return agent, version, packageValue, err
}

func normalizeAgentPlanInputs(packageValue AgentPackage, overrides []AgentSkillRef, sourceRefs []ArtifactRefInput) (AgentPackage, []ArtifactRefInput, error) {
	if packageValue.PlannerMode == AgentPlannerCatalog && len(overrides) == 0 {
		return packageValue, nil, safeMessageError{message: "catalog_plan Agent 必须提供运行时 Skill 计划"}
	}
	if len(overrides) > 0 {
		if !packageValue.ExecutionPolicy.AllowRuntimeSkillOverride {
			return packageValue, nil, safeMessageError{message: "该 Agent 不允许运行时替换 Skill"}
		}
		packageValue.DefaultSkillRefs = overrides
		var err error
		packageValue, err = NormalizeAgentPackage(packageValue)
		if err != nil {
			return packageValue, nil, err
		}
	}
	if len(packageValue.DefaultSkillRefs) == 0 {
		return packageValue, nil, safeMessageError{message: "Agent Plan 必须至少包含一个 Skill Step"}
	}
	seen := map[string]bool{}
	result := make([]ArtifactRefInput, 0, len(sourceRefs))
	for _, ref := range sourceRefs {
		ref.BindingName = strings.ToLower(strings.TrimSpace(ref.BindingName))
		ref.ArtifactID, ref.ContentHash = strings.TrimSpace(ref.ArtifactID), strings.TrimSpace(ref.ContentHash)
		if !skillManifestTokenPattern.MatchString(ref.BindingName) || ref.ArtifactID == "" || ref.ContentHash == "" || seen[ref.BindingName] {
			return packageValue, nil, safeMessageError{message: "Agent Plan 来源 Artifact 绑定无效或重复"}
		}
		seen[ref.BindingName] = true
		result = append(result, ref)
	}
	if len(result) == 0 {
		return packageValue, nil, safeMessageError{message: "Agent Plan 必须提供来源 Artifact"}
	}
	return packageValue, result, nil
}

func buildAgentPlanRevision(plan model.AgentPlan, version model.AgentVersion, packageValue AgentPackage, sourceRefs []ArtifactRefInput, stamp string) (model.AgentPlanRevision, []model.AgentPlanStep, error) {
	sourceJSON, _ := json.Marshal(sourceRefs)
	snapshotJSON, _ := json.Marshal(agentPlanRevisionSnapshot{Package: packageValue, RequirementCodes: []string{}, Steps: []agentPlanStepPreflightSnapshot{}})
	revision := model.AgentPlanRevision{
		ID: newID("agentplanrevision"), UserID: plan.UserID, AgentPlanID: plan.ID, Revision: plan.CurrentRevision,
		AgentVersionID: version.ID, AgentContentHash: version.ContentHash, Goal: plan.Goal,
		SourceArtifactRefsJSON: string(sourceJSON), PlanSnapshotJSON: string(snapshotJSON), CreatedAt: stamp,
	}
	steps := make([]model.AgentPlanStep, 0, len(packageValue.DefaultSkillRefs))
	for index, ref := range packageValue.DefaultSkillRefs {
		bindings := ref.InputBindings
		if index == 0 && len(bindings) == 0 {
			bindings = make([]AgentStepInputBinding, 0, len(sourceRefs))
			for _, source := range sourceRefs {
				bindings = append(bindings, AgentStepInputBinding{BindingName: source.BindingName, ArtifactID: source.ArtifactID, ContentHash: source.ContentHash})
			}
		}
		bindingsJSON, _ := json.Marshal(bindings)
		label := strings.TrimSpace(ref.Label)
		if label == "" {
			label = ref.StepKey
		}
		steps = append(steps, model.AgentPlanStep{
			ID: newID("agentplanstep"), UserID: plan.UserID, AgentPlanID: plan.ID, Revision: plan.CurrentRevision, Ordinal: index + 1,
			StepKey: ref.StepKey, Label: label, Capability: ref.Capability, SkillID: ref.SkillID, SkillVersionID: ref.SkillVersionID,
			InputBindingsJSON: string(bindingsJSON), ParametersJSON: string(ref.Parameters), ExpectedOutputType: ref.ExpectedOutputType,
			Status: model.AgentPlanStepPending, OutputArtifactRefsJSON: `[]`, CreatedAt: stamp, UpdatedAt: stamp,
		})
	}
	return revision, steps, nil
}

func decodeAgentPlanSnapshot(revision model.AgentPlanRevision) (agentPlanRevisionSnapshot, error) {
	var snapshot agentPlanRevisionSnapshot
	if json.Unmarshal([]byte(revision.PlanSnapshotJSON), &snapshot) != nil {
		return snapshot, safeMessageError{message: "Agent Plan Snapshot 损坏"}
	}
	return snapshot, nil
}
