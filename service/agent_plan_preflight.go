package service

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func PreflightAgentPlan(userID, planID string) (AgentPlanPreflightResult, error) {
	detail, err := GetAgentPlanDetail(userID, planID)
	if err != nil {
		return AgentPlanPreflightResult{}, err
	}
	snapshot, err := decodeAgentPlanSnapshot(detail.Revision)
	if err != nil {
		return AgentPlanPreflightResult{}, err
	}
	if detail.Plan.Status == model.AgentPlanAwaitingConfirmation {
		return agentPlanPreflightResult(detail, snapshot.RequirementCodes), nil
	}
	if detail.Plan.Status != model.AgentPlanDraft {
		return AgentPlanPreflightResult{}, safeMessageError{message: "当前 Agent Plan 状态不可预检"}
	}
	if len(snapshot.Package.DefaultSkillRefs) != len(detail.Steps) {
		return AgentPlanPreflightResult{}, safeMessageError{message: "Agent Plan Snapshot 与 Step 数量不一致"}
	}
	var sourceRefs []ArtifactRefInput
	if json.Unmarshal([]byte(detail.Revision.SourceArtifactRefsJSON), &sourceRefs) != nil {
		return AgentPlanPreflightResult{}, safeMessageError{message: "Agent Plan 来源 Artifact 损坏"}
	}
	resolvedPackages := map[string]SkillPackage{}
	resolvedIndexes := map[string]int{}
	requirementSet := map[string]bool{}
	estimatedCredits := int64(0)
	snapshot.Steps = make([]agentPlanStepPreflightSnapshot, 0, len(detail.Steps))
	stamp := now()
	for index, ref := range snapshot.Package.DefaultSkillRefs {
		resolved, err := resolveAgentPlanSkillRef(userID, detail.Plan.ProjectID, snapshot.Package.SkillAccessPolicy, ref)
		if err != nil {
			return AgentPlanPreflightResult{}, err
		}
		packageValue, err := ValidateInvocableSkillPackage(resolved.Package)
		if err != nil {
			return AgentPlanPreflightResult{}, err
		}
		if err := ValidateSkillArtifactContracts(packageValue); err != nil {
			return AgentPlanPreflightResult{}, err
		}
		bindings := detail.Steps[index].InputBindings
		if index == 0 {
			bindings, err = validateAgentPlanSourceBindings(userID, detail.Plan, sourceRefs, packageValue)
		} else {
			err = validateAgentPlanSymbolicBindings(index, snapshot.Package.DefaultSkillRefs, resolvedPackages, resolvedIndexes, packageValue, bindings)
		}
		if err != nil {
			return AgentPlanPreflightResult{}, err
		}
		if !agentPlanProducesType(packageValue, ref.ExpectedOutputType) {
			return AgentPlanPreflightResult{}, safeMessageError{message: "Agent Step 预期输出类型与 Skill 不匹配"}
		}
		codes := invocationConfirmationCodes(packageValue.Manifest, packageValue.OutputContract.ArtifactOutputs, nil)
		for _, code := range codes {
			requirementSet[code] = true
		}
		policy, err := resolveInvocationExecutionPolicy(InvocationRequest{
			ProjectID: detail.Plan.ProjectID, EpisodeID: detail.Plan.EpisodeID,
			ExecutionPolicyOverride: InvocationExecutionPolicyOverride{Model: snapshot.Package.ModelPolicy.PreferredModel},
		}, packageValue, nil, len(codes) > 0)
		if err != nil {
			return AgentPlanPreflightResult{}, err
		}
		estimatedCredits += int64(policy.EstimatedCredits)
		snapshot.Steps = append(snapshot.Steps, agentPlanStepPreflightSnapshot{StepKey: ref.StepKey, EstimatedCredits: policy.EstimatedCredits, RequirementCodes: codes})
		bindingsJSON, _ := json.Marshal(bindings)
		step := &detail.Steps[index]
		step.InputBindings = bindings
		step.Step.SkillID, step.Step.SkillVersionID = resolved.Skill.ID, resolved.Version.ID
		step.Step.SkillVersion, step.Step.SkillContentHash = resolved.Version.Version, resolved.Version.ContentHash
		step.Step.InputBindingsJSON, step.Step.UpdatedAt = string(bindingsJSON), stamp
		if index == 0 {
			step.Step.Status = model.AgentPlanStepReady
		} else {
			step.Step.Status = model.AgentPlanStepPending
		}
		ref.SkillID, ref.SkillVersionID, ref.SkillVersionConstraint = resolved.Skill.ID, resolved.Version.ID, ""
		snapshot.Package.DefaultSkillRefs[index] = ref
		resolvedPackages[ref.StepKey], resolvedIndexes[ref.StepKey] = packageValue, index
	}
	snapshot.RequirementCodes = orderedAgentPlanRequirementCodes(requirementSet)
	snapshotJSON, _ := json.Marshal(snapshot)
	detail.Revision.PlanSnapshotJSON = string(snapshotJSON)
	detail.Revision.EstimatedCredits = estimatedCredits
	steps := make([]model.AgentPlanStep, len(detail.Steps))
	for index := range detail.Steps {
		steps[index] = detail.Steps[index].Step
	}
	fingerprint := agentPlanFingerprint(detail.Revision, steps)
	detail.Revision.ConfirmationFingerprint = fingerprint
	detail.Plan.Status, detail.Plan.EstimatedCredits = model.AgentPlanAwaitingConfirmation, estimatedCredits
	detail.Plan.ConfirmationFingerprint, detail.Plan.UpdatedAt = fingerprint, stamp
	if err := repository.ApplyAgentPlanPreflight(detail.Plan, detail.Revision, steps); err != nil {
		return AgentPlanPreflightResult{}, err
	}
	stored, err := GetAgentPlanDetail(userID, planID)
	if err != nil {
		return AgentPlanPreflightResult{}, err
	}
	return agentPlanPreflightResult(stored, snapshot.RequirementCodes), nil
}

func resolveAgentPlanSkillRef(userID, projectID string, policy AgentSkillAccessPolicy, ref AgentSkillRef) (ResolvedSkill, error) {
	resolved, err := resolveAgentSkillReference(userID, projectID, ref)
	if err != nil {
		return ResolvedSkill{}, err
	}
	if ref.SkillID != "" && ref.SkillID != resolved.Skill.ID {
		return ResolvedSkill{}, safeMessageError{message: "Agent Step Skill ID 与版本不匹配"}
	}
	if err := validateAgentSkillAccess(AgentPackage{SkillAccessPolicy: policy}, ref, resolved); err != nil {
		return ResolvedSkill{}, err
	}
	return resolved, nil
}

func validateAgentStepHandoff(previous SkillPackage, next SkillPackage, binding AgentStepInputBinding) error {
	var output *ArtifactOutputSpec
	for index := range previous.OutputContract.ArtifactOutputs {
		candidate := &previous.OutputContract.ArtifactOutputs[index]
		if candidate.BindingName == binding.FromOutputBinding {
			output = candidate
			break
		}
	}
	var input *ArtifactInputSpec
	for index := range next.InputContract.ArtifactInputs {
		candidate := &next.InputContract.ArtifactInputs[index]
		if candidate.BindingName == binding.BindingName {
			input = candidate
			break
		}
	}
	if output == nil || input == nil || output.ArtifactType != input.ArtifactType || !ArtifactSchemaVersionMatches(output.SchemaVersion, input.SchemaConstraint) {
		return safeMessageError{message: "Agent Step 上下游 Artifact 契约不兼容"}
	}
	return nil
}

func agentPlanFingerprint(revision model.AgentPlanRevision, steps []model.AgentPlanStep) string {
	type fingerprintStep struct {
		Ordinal            int    `json:"ordinal"`
		StepKey            string `json:"stepKey"`
		Label              string `json:"label"`
		Capability         string `json:"capability"`
		SkillID            string `json:"skillId"`
		SkillVersionID     string `json:"skillVersionId"`
		SkillVersion       string `json:"skillVersion"`
		SkillContentHash   string `json:"skillContentHash"`
		InputBindingsJSON  string `json:"inputBindingsJson"`
		ParametersJSON     string `json:"parametersJson"`
		ExpectedOutputType string `json:"expectedOutputType"`
	}
	frozenSteps := make([]fingerprintStep, 0, len(steps))
	for _, step := range steps {
		frozenSteps = append(frozenSteps, fingerprintStep{
			Ordinal: step.Ordinal, StepKey: step.StepKey, Label: step.Label, Capability: step.Capability,
			SkillID: step.SkillID, SkillVersionID: step.SkillVersionID, SkillVersion: step.SkillVersion,
			SkillContentHash: step.SkillContentHash, InputBindingsJSON: step.InputBindingsJSON,
			ParametersJSON: step.ParametersJSON, ExpectedOutputType: step.ExpectedOutputType,
		})
	}
	payload, _ := marshalInvocationCanonical(struct {
		AgentPlanID            string            `json:"agentPlanId"`
		Revision               int               `json:"revision"`
		AgentVersionID         string            `json:"agentVersionId"`
		AgentContentHash       string            `json:"agentContentHash"`
		Goal                   string            `json:"goal"`
		SourceArtifactRefsJSON string            `json:"sourceArtifactRefsJson"`
		PlanSnapshotJSON       string            `json:"planSnapshotJson"`
		EstimatedCredits       int64             `json:"estimatedCredits"`
		Steps                  []fingerprintStep `json:"steps"`
	}{revision.AgentPlanID, revision.Revision, revision.AgentVersionID, revision.AgentContentHash, revision.Goal, revision.SourceArtifactRefsJSON, revision.PlanSnapshotJSON, revision.EstimatedCredits, frozenSteps})
	return invocationSHA256(payload)
}

func validateAgentPlanSourceBindings(userID string, plan model.AgentPlan, sourceRefs []ArtifactRefInput, packageValue SkillPackage) ([]AgentStepInputBinding, error) {
	bindings := make([]AgentStepInputBinding, 0, len(sourceRefs))
	counts := map[string]int{}
	for _, ref := range sourceRefs {
		artifact, err := GetArtifact(userID, ref.ArtifactID)
		if err != nil {
			return nil, err
		}
		if artifact.Artifact.ContentHash != ref.ContentHash || artifact.Artifact.ProjectID != plan.ProjectID ||
			(plan.EpisodeID != "" && artifact.Artifact.EpisodeID != plan.EpisodeID) {
			return nil, safeMessageError{message: "Agent Plan 来源 Artifact 已变化或不属于当前项目"}
		}
		spec := agentPlanInputSpec(packageValue, ref.BindingName)
		if spec == nil || spec.ArtifactType != artifact.Artifact.ArtifactType || !ArtifactSchemaVersionMatches(artifact.Artifact.SchemaVersion, spec.SchemaConstraint) {
			return nil, safeMessageError{message: "Agent Plan 来源 Artifact 与第一步 Skill 不兼容"}
		}
		approved, err := invocationArtifactApproved(userID, artifact.Artifact)
		if err != nil || (spec.RequiresApproval && !approved) {
			return nil, safeMessageError{message: "Agent Plan 来源 Artifact 尚未批准"}
		}
		counts[ref.BindingName]++
		bindings = append(bindings, AgentStepInputBinding{BindingName: ref.BindingName, ArtifactID: ref.ArtifactID, ContentHash: ref.ContentHash})
	}
	if err := validateAgentPlanBindingCounts(packageValue, counts); err != nil {
		return nil, err
	}
	return bindings, nil
}

func validateAgentPlanSymbolicBindings(index int, refs []AgentSkillRef, packages map[string]SkillPackage, indexes map[string]int, next SkillPackage, bindings []AgentStepInputBinding) error {
	counts := map[string]int{}
	for _, binding := range bindings {
		previous, ok := packages[binding.FromStepKey]
		if !ok || indexes[binding.FromStepKey] >= index || binding.ArtifactID != "" {
			return safeMessageError{message: "Agent Step 上游引用不存在或顺序无效"}
		}
		if err := validateAgentStepHandoff(previous, next, binding); err != nil {
			return err
		}
		counts[binding.BindingName]++
	}
	_ = refs
	return validateAgentPlanBindingCounts(next, counts)
}

func validateAgentPlanBindingCounts(packageValue SkillPackage, counts map[string]int) error {
	for _, spec := range packageValue.InputContract.ArtifactInputs {
		count := counts[spec.BindingName]
		minimum := spec.Min
		if spec.Required && minimum < 1 {
			minimum = 1
		}
		if count < minimum || (spec.Max > 0 && count > spec.Max) {
			return safeMessageError{message: "Agent Step 输入绑定数量不符合 Skill 契约"}
		}
	}
	return nil
}

func agentPlanInputSpec(packageValue SkillPackage, bindingName string) *ArtifactInputSpec {
	for index := range packageValue.InputContract.ArtifactInputs {
		if packageValue.InputContract.ArtifactInputs[index].BindingName == bindingName {
			return &packageValue.InputContract.ArtifactInputs[index]
		}
	}
	return nil
}

func agentPlanProducesType(packageValue SkillPackage, expected string) bool {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return true
	}
	for _, output := range packageValue.OutputContract.ArtifactOutputs {
		if output.ArtifactType == expected {
			return true
		}
	}
	return false
}

func orderedAgentPlanRequirementCodes(set map[string]bool) []string {
	order := []string{"api_cost", "image_generation", "video_generation", "batch", "external_tool", "business_write"}
	result := make([]string, 0, len(set))
	for _, code := range order {
		if set[code] {
			result = append(result, code)
			delete(set, code)
		}
	}
	extra := make([]string, 0, len(set))
	for code := range set {
		extra = append(extra, code)
	}
	sort.Strings(extra)
	return append(result, extra...)
}

func agentPlanPreflightResult(detail AgentPlanDetail, codes []string) AgentPlanPreflightResult {
	requirements := make([]InvocationConfirmationRequirement, 0, len(codes))
	for _, code := range codes {
		message := map[string]string{
			"api_cost": "确认调用模型并消耗额度", "image_generation": "确认生成图片", "video_generation": "确认生成视频",
			"batch": "确认批量生成", "external_tool": "确认调用外部工具", "business_write": "确认写入业务数据",
		}[code]
		requirements = append(requirements, InvocationConfirmationRequirement{Code: code, Message: message})
	}
	return AgentPlanPreflightResult{AgentPlanDetail: detail, ConfirmationRequirements: requirements}
}
