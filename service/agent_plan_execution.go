package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func ConfirmAgentPlan(userID, planID string, input AgentPlanConfirmInput) (AgentPlanDetail, error) {
	detail, err := GetAgentPlanDetail(userID, planID)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	snapshot, err := decodeAgentPlanSnapshot(detail.Revision)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	provided := normalizedStringSet(input.RequirementCodes, true)
	required := normalizedStringSet(snapshot.RequirementCodes, true)
	if input.Revision != detail.Plan.CurrentRevision || strings.TrimSpace(input.Fingerprint) != detail.Plan.ConfirmationFingerprint || !sameInvocationStrings(provided, required) {
		return AgentPlanDetail{}, safeMessageError{message: "Agent Plan 确认内容与冻结预检不一致"}
	}
	if detail.Plan.Status != model.AgentPlanAwaitingConfirmation {
		if detail.Confirmation != nil && detail.Confirmation.Revision == input.Revision && detail.Confirmation.Fingerprint == input.Fingerprint {
			return detail, nil
		}
		return AgentPlanDetail{}, repository.ErrAgentPlanTransitionConflict
	}
	codesJSON, _ := json.Marshal(required)
	stamp := now()
	confirmation := model.AgentPlanConfirmation{
		ID: newID("agentplanconfirmation"), UserID: detail.Plan.UserID, AgentPlanID: detail.Plan.ID,
		Revision: detail.Plan.CurrentRevision, Fingerprint: detail.Plan.ConfirmationFingerprint,
		EstimatedCredits: detail.Plan.EstimatedCredits, RequirementCodesJSON: string(codesJSON), ConfirmedAt: stamp,
	}
	detail.Plan.Status, detail.Plan.UpdatedAt = model.AgentPlanRunning, stamp
	if err := repository.ConfirmAgentPlanTx(detail.Plan, confirmation); err != nil {
		if errors.Is(err, repository.ErrAgentPlanTransitionConflict) {
			current, reloadErr := GetAgentPlanDetail(userID, planID)
			if reloadErr == nil && current.Confirmation != nil && current.Confirmation.Fingerprint == input.Fingerprint {
				return current, nil
			}
		}
		return AgentPlanDetail{}, err
	}
	return GetAgentPlanDetail(userID, planID)
}

func ContinueAgentPlan(userID, planID string) (AgentPlanContinueResult, error) {
	for guard := 0; guard < 64; guard++ {
		detail, err := GetAgentPlanDetail(userID, planID)
		if err != nil {
			return AgentPlanContinueResult{}, err
		}
		switch detail.Plan.Status {
		case model.AgentPlanCompleted:
			return AgentPlanContinueResult{AgentPlanDetail: detail}, nil
		case model.AgentPlanCancelled, model.AgentPlanFailed:
			return AgentPlanContinueResult{}, repository.ErrAgentPlanTransitionConflict
		case model.AgentPlanRunning, model.AgentPlanNeedsReview:
		default:
			return AgentPlanContinueResult{}, repository.ErrAgentPlanTransitionConflict
		}
		advanced := false
	stepLoop:
		for index := range detail.Steps {
			step := detail.Steps[index]
			if step.Step.Status == model.AgentPlanStepCompleted {
				continue
			}
			if step.Step.Status == model.AgentPlanStepPending {
				if index == 0 || detail.Steps[index-1].Step.Status != model.AgentPlanStepCompleted {
					return AgentPlanContinueResult{}, repository.ErrAgentPlanTransitionConflict
				}
				if err := readyAgentPlanStep(detail, index); err != nil {
					return AgentPlanContinueResult{}, err
				}
				advanced = true
				break stepLoop
			}
			if step.Step.Status == model.AgentPlanStepReady && step.Step.InvocationID == "" {
				return materializeAgentPlanStepInvocation(userID, detail.Plan, detail.Revision, step)
			}
			if step.Step.InvocationID == "" {
				return AgentPlanContinueResult{}, repository.ErrAgentPlanTransitionConflict
			}
			invocation, err := GetInvocationDetail(userID, step.Step.InvocationID)
			if err != nil {
				return AgentPlanContinueResult{}, err
			}
			switch invocation.Run.Status {
			case model.InvocationStatusAwaitingConfirmation:
				confirmed, err := ConfirmInvocationFromAgentPlan(userID, invocation.Run.ID, detail.Plan.ID, detail.Plan.CurrentRevision, step.Step.StepKey)
				if err != nil {
					return AgentPlanContinueResult{}, err
				}
				refreshed, _ := GetAgentPlanDetail(userID, planID)
				return agentPlanContinueWithInvocation(refreshed, index, SafeInvocationLifecycle(confirmed)), nil
			case model.InvocationStatusQueued:
				return agentPlanContinueWithInvocation(detail, index, invocationLifecycleFromDetail(invocation)), nil
			case model.InvocationStatusRunning:
				if step.Step.Status == model.AgentPlanStepQueued {
					planUpdate, stepUpdate := detail.Plan, step.Step
					planUpdate.Status, planUpdate.UpdatedAt = model.AgentPlanRunning, now()
					stepUpdate.Status, stepUpdate.UpdatedAt = model.AgentPlanStepRunning, planUpdate.UpdatedAt
					if err := repository.UpdateAgentPlanStepResult(planUpdate, stepUpdate); err != nil && !errors.Is(err, repository.ErrAgentPlanTransitionConflict) {
						return AgentPlanContinueResult{}, err
					}
					detail, _ = GetAgentPlanDetail(userID, planID)
				}
				return agentPlanContinueWithInvocation(detail, index, invocationLifecycleFromDetail(invocation)), nil
			case model.InvocationStatusNeedsReview:
				if step.Step.Status != model.AgentPlanStepNeedsReview {
					outputRefs := agentPlanInvocationOutputRefs(invocation)
					outputJSON, _ := json.Marshal(outputRefs)
					planUpdate, stepUpdate := detail.Plan, step.Step
					planUpdate.Status, planUpdate.UpdatedAt = model.AgentPlanNeedsReview, now()
					stepUpdate.Status, stepUpdate.OutputArtifactRefsJSON, stepUpdate.UpdatedAt = model.AgentPlanStepNeedsReview, string(outputJSON), planUpdate.UpdatedAt
					if err := repository.UpdateAgentPlanStepResult(planUpdate, stepUpdate); err != nil && !errors.Is(err, repository.ErrAgentPlanTransitionConflict) {
						return AgentPlanContinueResult{}, err
					}
					detail, _ = GetAgentPlanDetail(userID, planID)
				}
				return agentPlanContinueWithInvocation(detail, index, invocationLifecycleFromDetail(invocation)), nil
			case model.InvocationStatusApproved, model.InvocationStatusApplied:
				outputRefs := agentPlanInvocationOutputRefs(invocation)
				if len(outputRefs) == 0 {
					return AgentPlanContinueResult{}, safeMessageError{message: "已批准 Invocation 缺少输出 Artifact"}
				}
				outputJSON, _ := json.Marshal(outputRefs)
				planUpdate, stepUpdate := detail.Plan, step.Step
				if index == len(detail.Steps)-1 {
					planUpdate.Status = model.AgentPlanCompleted
				} else {
					planUpdate.Status = model.AgentPlanRunning
				}
				planUpdate.UpdatedAt = now()
				stepUpdate.Status, stepUpdate.OutputArtifactRefsJSON, stepUpdate.UpdatedAt = model.AgentPlanStepCompleted, string(outputJSON), planUpdate.UpdatedAt
				if err := repository.UpdateAgentPlanStepResult(planUpdate, stepUpdate); err != nil && !errors.Is(err, repository.ErrAgentPlanTransitionConflict) {
					return AgentPlanContinueResult{}, err
				}
				advanced = true
				break stepLoop
			case model.InvocationStatusFailed, model.InvocationStatusRejected, model.InvocationStatusBlocked, model.InvocationStatusPartial:
				planUpdate, stepUpdate := detail.Plan, step.Step
				planUpdate.Status, planUpdate.UpdatedAt = model.AgentPlanFailed, now()
				stepUpdate.Status, stepUpdate.ErrorCode, stepUpdate.ErrorMessage, stepUpdate.UpdatedAt = model.AgentPlanStepFailed, string(invocation.Run.Status), "Invocation 执行失败", planUpdate.UpdatedAt
				if err := repository.UpdateAgentPlanStepResult(planUpdate, stepUpdate); err != nil && !errors.Is(err, repository.ErrAgentPlanTransitionConflict) {
					return AgentPlanContinueResult{}, err
				}
				failed, _ := GetAgentPlanDetail(userID, planID)
				return agentPlanContinueWithInvocation(failed, index, invocationLifecycleFromDetail(invocation)), nil
			case model.InvocationStatusCancelled, model.InvocationStatusCancelRequested:
				planUpdate, stepUpdate := detail.Plan, step.Step
				planUpdate.Status, planUpdate.UpdatedAt = model.AgentPlanCancelled, now()
				stepUpdate.Status, stepUpdate.ErrorCode, stepUpdate.UpdatedAt = model.AgentPlanStepCancelled, string(invocation.Run.Status), planUpdate.UpdatedAt
				if err := repository.UpdateAgentPlanStepResult(planUpdate, stepUpdate); err != nil && !errors.Is(err, repository.ErrAgentPlanTransitionConflict) {
					return AgentPlanContinueResult{}, err
				}
				cancelled, _ := GetAgentPlanDetail(userID, planID)
				return agentPlanContinueWithInvocation(cancelled, index, invocationLifecycleFromDetail(invocation)), nil
			default:
				return agentPlanContinueWithInvocation(detail, index, invocationLifecycleFromDetail(invocation)), nil
			}
		}
		if advanced {
			continue
		}
		return AgentPlanContinueResult{}, repository.ErrAgentPlanTransitionConflict
	}
	return AgentPlanContinueResult{}, repository.ErrAgentPlanTransitionConflict
}

func CancelAgentPlan(userID, planID string) (AgentPlanDetail, error) {
	detail, err := GetAgentPlanDetail(userID, planID)
	if err != nil {
		return AgentPlanDetail{}, err
	}
	if detail.Plan.Status == model.AgentPlanCancelled {
		return detail, nil
	}
	for _, step := range detail.Steps {
		if step.Step.InvocationID == "" || step.Step.Status == model.AgentPlanStepCompleted {
			continue
		}
		if _, err := CancelInvocation(userID, step.Step.InvocationID); err != nil && !errors.Is(err, repository.ErrInvocationTransitionConflict) {
			return AgentPlanDetail{}, err
		}
	}
	if _, err := repository.CancelAgentPlanTx(userID, planID, now()); err != nil {
		return AgentPlanDetail{}, err
	}
	return GetAgentPlanDetail(userID, planID)
}

func ConfirmInvocationFromAgentPlan(userID, invocationID, planID string, revision int, stepKey string) (InvocationResponse, error) {
	run, ok, err := repository.GetUserInvocation(userID, invocationID)
	if err != nil || !ok {
		return InvocationResponse{}, repository.ErrInvocationNotFound
	}
	if run.Source != "agent_plan" || run.ConfirmationSource != "agent_plan" || run.AgentPlanID != planID || run.AgentPlanRevision != revision || run.AgentPlanStepKey != stepKey {
		return InvocationResponse{}, safeMessageError{message: "Invocation 不属于指定 Agent Plan Step"}
	}
	detail, err := GetAgentPlanDetail(userID, planID)
	if err != nil {
		return InvocationResponse{}, err
	}
	if detail.Plan.CurrentRevision != revision || (detail.Plan.Status != model.AgentPlanRunning && detail.Plan.Status != model.AgentPlanNeedsReview) || detail.Confirmation == nil {
		return InvocationResponse{}, repository.ErrAgentPlanTransitionConflict
	}
	var step *AgentPlanStepDetail
	for index := range detail.Steps {
		if detail.Steps[index].Step.StepKey == stepKey {
			step = &detail.Steps[index]
		}
	}
	if step == nil || step.Step.InvocationID != invocationID {
		return InvocationResponse{}, repository.ErrAgentPlanTransitionConflict
	}
	planSnapshot, err := decodeAgentPlanSnapshot(detail.Revision)
	if err != nil {
		return InvocationResponse{}, err
	}
	var frozenStep *agentPlanStepPreflightSnapshot
	for index := range planSnapshot.Steps {
		if planSnapshot.Steps[index].StepKey == stepKey {
			frozenStep = &planSnapshot.Steps[index]
		}
	}
	if frozenStep == nil {
		return InvocationResponse{}, repository.ErrAgentPlanTransitionConflict
	}
	invocation, err := loadInvocationPreflightSnapshot(userID, run)
	if err != nil {
		return InvocationResponse{}, err
	}
	if invocation.Revision.SkillVersionID != step.Step.SkillVersionID || invocation.Revision.SkillContentHash != step.Step.SkillContentHash ||
		invocation.Revision.ParametersJSON != step.Step.ParametersJSON || invocation.ExecutionPolicy.EstimatedCredits != frozenStep.EstimatedCredits ||
		!sameInvocationStrings(normalizedStringSet(invocation.ConfirmationRequirements, true), normalizedStringSet(frozenStep.RequirementCodes, true)) ||
		!sameAgentPlanInvocationInputs(step.InputBindings, invocation.InputArtifactRefs) {
		return InvocationResponse{}, safeMessageError{message: "Invocation 与冻结 Agent Plan Step 不一致"}
	}
	var confirmedCodes []string
	if json.Unmarshal([]byte(detail.Confirmation.RequirementCodesJSON), &confirmedCodes) != nil || !agentPlanRequirementsContain(confirmedCodes, frozenStep.RequirementCodes) {
		return InvocationResponse{}, safeMessageError{message: "Agent Plan 确认未覆盖当前 Step"}
	}
	return confirmInvocationRun(userID, run, InvocationConfirmation{RequirementCodes: frozenStep.RequirementCodes})
}

func materializeAgentPlanStepInvocation(userID string, plan model.AgentPlan, revision model.AgentPlanRevision, step AgentPlanStepDetail) (AgentPlanContinueResult, error) {
	inputs := make([]ArtifactRefInput, 0, len(step.InputBindings))
	for _, binding := range step.InputBindings {
		if binding.ArtifactID == "" || binding.ContentHash == "" || binding.FromStepKey != "" {
			return AgentPlanContinueResult{}, safeMessageError{message: "Agent Plan Step 尚未解析为真实 Artifact 输入"}
		}
		inputs = append(inputs, ArtifactRefInput{BindingName: binding.BindingName, ArtifactID: binding.ArtifactID, ContentHash: binding.ContentHash})
	}
	snapshot, err := decodeAgentPlanSnapshot(revision)
	if err != nil {
		return AgentPlanContinueResult{}, err
	}
	request := InvocationRequest{
		Source: "agent_plan", ProjectID: plan.ProjectID, EpisodeID: plan.EpisodeID,
		SkillVersionID: step.Step.SkillVersionID, ExpectedOutputArtifactType: step.Step.ExpectedOutputType,
		InputArtifactRefs: inputs, Parameters: step.Parameters,
		ExecutionPolicyOverride: InvocationExecutionPolicyOverride{Model: snapshot.Package.ModelPolicy.PreferredModel},
		IdempotencyKey:          "agent-plan:" + plan.ID + ":" + strconv.Itoa(plan.CurrentRevision) + ":" + step.Step.StepKey,
		AgentPlanID:             plan.ID, AgentPlanRevision: plan.CurrentRevision, AgentPlanStepKey: step.Step.StepKey, ConfirmationSource: "agent_plan",
	}
	preflight, err := PreflightInvocation(userID, request)
	if err != nil {
		return AgentPlanContinueResult{}, err
	}
	if preflight.Run.Source != "agent_plan" || preflight.Run.AgentPlanID != plan.ID || preflight.Run.AgentPlanRevision != plan.CurrentRevision ||
		preflight.Run.AgentPlanStepKey != step.Step.StepKey || preflight.Run.ConfirmationSource != "agent_plan" ||
		preflight.Revision.SkillVersionID != step.Step.SkillVersionID || preflight.Revision.SkillContentHash != step.Step.SkillContentHash {
		return AgentPlanContinueResult{}, safeMessageError{message: "Agent Plan Step Invocation 预检与冻结版本不一致"}
	}
	if preflight.Run.Status != model.InvocationStatusAwaitingConfirmation {
		current, reloadErr := GetAgentPlanDetail(userID, plan.ID)
		if reloadErr == nil && step.Step.Ordinal <= len(current.Steps) && current.Steps[step.Step.Ordinal-1].Step.InvocationID == preflight.Run.ID {
			invocation, invocationErr := GetInvocationDetail(userID, preflight.Run.ID)
			if invocationErr == nil {
				return agentPlanContinueWithInvocation(current, step.Step.Ordinal-1, invocationLifecycleFromDetail(invocation)), nil
			}
		}
		return AgentPlanContinueResult{}, safeMessageError{message: "Agent Plan Step Invocation 状态与 Plan 绑定不一致"}
	}
	if err := repository.BindAgentPlanStepInvocation(plan.ID, plan.CurrentRevision, step.Step.Ordinal, preflight.Run.ID, now()); err != nil {
		if errors.Is(err, repository.ErrAgentPlanTransitionConflict) {
			current, reloadErr := GetAgentPlanDetail(userID, plan.ID)
			if reloadErr == nil && step.Step.Ordinal <= len(current.Steps) && current.Steps[step.Step.Ordinal-1].Step.InvocationID != "" {
				invocation, invocationErr := GetInvocationDetail(userID, current.Steps[step.Step.Ordinal-1].Step.InvocationID)
				if invocationErr == nil {
					return agentPlanContinueWithInvocation(current, step.Step.Ordinal-1, invocationLifecycleFromDetail(invocation)), nil
				}
			}
		}
		return AgentPlanContinueResult{}, err
	}
	confirmed, err := ConfirmInvocationFromAgentPlan(userID, preflight.Run.ID, plan.ID, plan.CurrentRevision, step.Step.StepKey)
	if err != nil {
		return AgentPlanContinueResult{}, err
	}
	current, err := GetAgentPlanDetail(userID, plan.ID)
	if err != nil {
		return AgentPlanContinueResult{}, err
	}
	return agentPlanContinueWithInvocation(current, step.Step.Ordinal-1, SafeInvocationLifecycle(confirmed)), nil
}

func readyAgentPlanStep(detail AgentPlanDetail, index int) error {
	next := detail.Steps[index]
	bindings := make([]AgentStepInputBinding, 0, len(next.InputBindings))
	for _, binding := range next.InputBindings {
		var source *AgentPlanStepDetail
		for previousIndex := 0; previousIndex < index; previousIndex++ {
			if detail.Steps[previousIndex].Step.StepKey == binding.FromStepKey {
				source = &detail.Steps[previousIndex]
				break
			}
		}
		if source == nil || source.Step.Status != model.AgentPlanStepCompleted {
			return safeMessageError{message: "上游 Agent Plan Step 尚未完成"}
		}
		matched := 0
		for _, output := range source.OutputArtifactRefs {
			if output.BindingName == binding.FromOutputBinding {
				bindings = append(bindings, AgentStepInputBinding{BindingName: binding.BindingName, ArtifactID: output.ArtifactID, ContentHash: output.ContentHash})
				matched++
			}
		}
		if matched == 0 {
			return safeMessageError{message: "上游已批准 Step 缺少声明的输出绑定"}
		}
	}
	bindingsJSON, _ := json.Marshal(bindings)
	if err := repository.ReadyAgentPlanStep(detail.Plan.ID, detail.Plan.CurrentRevision, next.Step.Ordinal, string(bindingsJSON), now()); err != nil {
		return fmt.Errorf("ready Agent Plan step %d: %w", next.Step.Ordinal, err)
	}
	return nil
}

func agentPlanInvocationOutputRefs(invocation InvocationDetail) []ArtifactRefInput {
	refs := []ArtifactRefInput{}
	for _, ref := range invocation.AuthoritativeArtifactRefs {
		if ref.Direction == "output" {
			refs = append(refs, ArtifactRefInput{BindingName: ref.BindingName, ArtifactID: ref.ArtifactID, ContentHash: ref.ArtifactHash})
		}
	}
	sort.SliceStable(refs, func(i, j int) bool {
		if refs[i].BindingName != refs[j].BindingName {
			return refs[i].BindingName < refs[j].BindingName
		}
		return refs[i].ArtifactID < refs[j].ArtifactID
	})
	return refs
}

func invocationLifecycleFromDetail(detail InvocationDetail) InvocationLifecycleResponse {
	result := InvocationLifecycleResponse{Run: detail.Run, Revision: detail.Run.LatestRevision}
	for index := range detail.Attempts {
		if detail.Attempts[index].Attempt == detail.Run.LatestAttempt {
			attempt := detail.Attempts[index].InvocationAttemptSummary
			result.Attempt = &attempt
		}
	}
	return result
}

func agentPlanContinueWithInvocation(detail AgentPlanDetail, index int, invocation InvocationLifecycleResponse) AgentPlanContinueResult {
	result := AgentPlanContinueResult{AgentPlanDetail: detail, Invocation: &invocation}
	if index >= 0 && index < len(detail.Steps) {
		result.ActiveStep = &detail.Steps[index]
	}
	return result
}

func sameAgentPlanInvocationInputs(bindings []AgentStepInputBinding, refs []model.InvocationArtifactRef) bool {
	want := make([]string, 0, len(bindings))
	for _, binding := range bindings {
		want = append(want, binding.BindingName+"\x00"+binding.ArtifactID+"\x00"+binding.ContentHash)
	}
	got := make([]string, 0, len(refs))
	for _, ref := range refs {
		if ref.Direction == "input" && ref.Attempt == 0 {
			got = append(got, ref.BindingName+"\x00"+ref.ArtifactID+"\x00"+ref.ArtifactHash)
		}
	}
	sort.Strings(want)
	sort.Strings(got)
	return sameInvocationStrings(want, got)
}

func agentPlanRequirementsContain(confirmed, required []string) bool {
	set := map[string]bool{}
	for _, code := range normalizedStringSet(confirmed, true) {
		set[code] = true
	}
	for _, code := range normalizedStringSet(required, true) {
		if !set[code] {
			return false
		}
	}
	return true
}
