package service

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func PreflightWorkflowExecution(userID string, input WorkflowExecutionPreflightInput) (WorkflowExecutionDetail, error) {
	userID, input.WorkflowVersionID = strings.TrimSpace(userID), strings.TrimSpace(input.WorkflowVersionID)
	input.ProjectID, input.EpisodeID, input.IdempotencyKey = strings.TrimSpace(input.ProjectID), strings.TrimSpace(input.EpisodeID), strings.TrimSpace(input.IdempotencyKey)
	if userID == "" || input.WorkflowVersionID == "" || input.ProjectID == "" || input.IdempotencyKey == "" {
		return WorkflowExecutionDetail{}, safeMessageError{message: "Workflow execution 缺少版本、项目或幂等键"}
	}
	parametersJSON, err := canonicalInvocationParameters(input.Parameters)
	if err != nil {
		return WorkflowExecutionDetail{}, err
	}
	input.Parameters = json.RawMessage(parametersJSON)
	previewInput := WorkflowPreviewInput{ProjectID: input.ProjectID, EpisodeID: input.EpisodeID, InputArtifactRefs: input.InputArtifactRefs, ManualSelections: input.ManualSelections, ProjectTags: input.ProjectTags, Parameters: input.Parameters}
	preview, err := PreviewWorkflowVersion(userID, input.WorkflowVersionID, previewInput)
	if err != nil {
		return WorkflowExecutionDetail{}, err
	}
	versionDetail, err := GetVisibleWorkflowVersion(userID, input.WorkflowVersionID)
	if err != nil {
		return WorkflowExecutionDetail{}, err
	}
	requestValue := input
	requestValue.IdempotencyKey = ""
	requestRaw, _ := marshalInvocationCanonical(requestValue)
	requestHash := invocationSHA256(requestRaw)
	stamp, executionID := now(), newID("workflowexecution")
	key := input.IdempotencyKey
	status := model.WorkflowExecutionAwaitingConfirmation
	if !preview.Executable {
		status = model.WorkflowExecutionBlocked
	}
	run := model.WorkflowExecution{ID: executionID, UserID: userID, ProjectID: input.ProjectID, EpisodeID: input.EpisodeID, WorkflowID: versionDetail.Workflow.ID, WorkflowVersionID: input.WorkflowVersionID, WorkflowContentHash: preview.ContentHash, Status: status, Revision: 1, EstimatedCredits: preview.EstimatedCredits, IdempotencyKey: &key, RequestHash: requestHash, CreatedAt: stamp, UpdatedAt: stamp}
	previewJSON, _ := json.Marshal(preview)
	refsJSON, _ := json.Marshal(input.InputArtifactRefs)
	manualJSON, _ := json.Marshal(input.ManualSelections)
	codes := normalizedStringSet(preview.ConfirmationRequirements, true)
	codesJSON, _ := json.Marshal(codes)
	fingerprintRaw, _ := marshalInvocationCanonical(struct {
		VersionID string `json:"workflowVersionId"`
		Hash      string `json:"workflowContentHash"`
		Request   string `json:"requestHash"`
		Preview   string `json:"routePreview"`
	}{input.WorkflowVersionID, preview.ContentHash, requestHash, string(previewJSON)})
	run.ConfirmationFingerprint = invocationSHA256(fingerprintRaw)
	revision := model.WorkflowExecutionRevision{ID: newID("workflowexecutionrevision"), UserID: userID, WorkflowExecutionID: run.ID, Revision: 1, WorkflowVersionID: input.WorkflowVersionID, WorkflowContentHash: preview.ContentHash, RoutePreviewJSON: string(previewJSON), InputArtifactRefsJSON: string(refsJSON), ManualSelectionsJSON: string(manualJSON), ParametersJSON: parametersJSON, EstimatedCredits: preview.EstimatedCredits, ConfirmationRequirementsJSON: string(codesJSON), ConfirmationFingerprint: run.ConfirmationFingerprint, CreatedAt: stamp}
	nodes := make([]model.WorkflowNodeExecution, len(preview.Nodes))
	byNode := map[string]WorkflowNodeSpec{}
	for _, node := range versionDetail.Package.Nodes {
		byNode[node.NodeKey] = node
	}
	for index, nodePreview := range preview.Nodes {
		nodeStatus := model.WorkflowNodeExecutionBlocked
		if nodePreview.BlockCode == "" && len(byNode[nodePreview.NodeKey].DependsOn) == 0 {
			nodeStatus = model.WorkflowNodeExecutionReady
		}
		nodes[index] = model.WorkflowNodeExecution{ID: newID("workflownodeexecution"), UserID: userID, WorkflowExecutionID: run.ID, Revision: 1, Ordinal: index, NodeKey: nodePreview.NodeKey, ExecutorType: nodePreview.ExecutorType, Status: nodeStatus, OutputArtifactRefsJSON: `[]`, ErrorCode: nodePreview.BlockCode, ErrorMessage: nodePreview.BlockMessage, CreatedAt: stamp, UpdatedAt: stamp}
	}
	stored, created, err := repository.CreateWorkflowExecutionAggregateIdempotently(run, revision, nodes)
	if err != nil {
		return WorkflowExecutionDetail{}, err
	}
	if !created {
		return GetWorkflowExecutionDetail(userID, stored.ID)
	}
	return GetWorkflowExecutionDetail(userID, run.ID)
}

func GetWorkflowExecutionDetail(userID, executionID string) (WorkflowExecutionDetail, error) {
	run, ok, err := repository.GetUserWorkflowExecution(strings.TrimSpace(userID), strings.TrimSpace(executionID))
	if err != nil || !ok {
		return WorkflowExecutionDetail{}, safeMessageError{message: "Workflow execution 不存在"}
	}
	revision, ok, err := repository.GetWorkflowExecutionRevision(run.UserID, run.ID, run.Revision)
	if err != nil || !ok {
		return WorkflowExecutionDetail{}, safeMessageError{message: "Workflow execution revision 不存在"}
	}
	nodes, err := repository.ListWorkflowNodeExecutions(run.UserID, run.ID, run.Revision)
	if err != nil {
		return WorkflowExecutionDetail{}, err
	}
	var preview WorkflowRoutePreview
	var codes []string
	if json.Unmarshal([]byte(revision.RoutePreviewJSON), &preview) != nil || json.Unmarshal([]byte(revision.ConfirmationRequirementsJSON), &codes) != nil {
		return WorkflowExecutionDetail{}, safeMessageError{message: "Workflow execution 快照损坏"}
	}
	confirmation, found, err := repository.GetWorkflowExecutionConfirmation(run.UserID, run.ID, run.Revision)
	if err != nil {
		return WorkflowExecutionDetail{}, err
	}
	detail := WorkflowExecutionDetail{Run: run, Revision: revision, Nodes: nodes, Preview: preview, ConfirmationRequirements: codes}
	if found {
		detail.Confirmation = &confirmation
	}
	return detail, nil
}

func ConfirmWorkflowExecution(userID, executionID string, input WorkflowExecutionConfirmationInput) (WorkflowExecutionDetail, error) {
	detail, err := GetWorkflowExecutionDetail(userID, executionID)
	if err != nil {
		return detail, err
	}
	provided, required := normalizedStringSet(input.RequirementCodes, true), normalizedStringSet(detail.ConfirmationRequirements, true)
	if input.Revision != detail.Run.Revision || input.Fingerprint != detail.Run.ConfirmationFingerprint || !sameInvocationStrings(provided, required) {
		return detail, safeMessageError{message: "Workflow execution 确认与冻结预检不一致"}
	}
	if detail.Run.Status != model.WorkflowExecutionAwaitingConfirmation {
		if detail.Confirmation != nil {
			return detail, nil
		}
		return detail, safeMessageError{message: "Workflow execution 当前状态不可确认"}
	}
	if detail.Confirmation == nil {
		codesJSON, _ := json.Marshal(required)
		confirmation := model.WorkflowExecutionConfirmation{ID: newID("workflowexecutionconfirmation"), UserID: detail.Run.UserID, WorkflowExecutionID: detail.Run.ID, Revision: detail.Run.Revision, Fingerprint: detail.Run.ConfirmationFingerprint, EstimatedCredits: detail.Run.EstimatedCredits, RequirementCodesJSON: string(codesJSON), ConfirmedAt: now()}
		if err := repository.CreateWorkflowExecutionConfirmation(confirmation); err != nil {
			return detail, err
		}
		detail.Confirmation = &confirmation
	}
	if err := advanceWorkflowExecutionNodes(&detail); err != nil {
		return detail, err
	}
	detail.Run.Status, detail.Run.UpdatedAt = workflowExecutionAggregateStatus(detail.Nodes), now()
	if err := repository.SaveWorkflowExecutionProjection(detail.Run, detail.Nodes); err != nil {
		return detail, err
	}
	return GetWorkflowExecutionDetail(userID, executionID)
}

func ContinueWorkflowExecution(userID, executionID string) (WorkflowExecutionDetail, error) {
	detail, err := GetWorkflowExecutionDetail(userID, executionID)
	if err != nil {
		return detail, err
	}
	if detail.Run.Status != model.WorkflowExecutionRunning && detail.Run.Status != model.WorkflowExecutionNeedsReview && detail.Run.Status != model.WorkflowExecutionPartial && detail.Run.Status != model.WorkflowExecutionFailed {
		return detail, safeMessageError{message: "Workflow execution 当前状态不可继续"}
	}
	if err := refreshWorkflowNodes(&detail); err != nil {
		return detail, err
	}
	if err := advanceWorkflowExecutionNodes(&detail); err != nil {
		return detail, err
	}
	detail.Run.Status = workflowExecutionAggregateStatus(detail.Nodes)
	detail.Run.UpdatedAt = now()
	if err := repository.SaveWorkflowExecutionProjection(detail.Run, detail.Nodes); err != nil {
		return detail, err
	}
	return GetWorkflowExecutionDetail(userID, executionID)
}

func CancelWorkflowExecution(userID, executionID string) (WorkflowExecutionDetail, error) {
	detail, err := GetWorkflowExecutionDetail(userID, executionID)
	if err != nil {
		return detail, err
	}
	for index := range detail.Nodes {
		node := &detail.Nodes[index]
		if node.InvocationID != "" && workflowNodeActive(node.Status) {
			if _, err := CancelInvocation(userID, node.InvocationID); err != nil && !errors.Is(err, repository.ErrInvocationTransitionConflict) {
				return detail, err
			}
			node.Status = model.WorkflowNodeExecutionCancelled
		}
		if node.AgentPlanID != "" && workflowNodeActive(node.Status) {
			if _, err := CancelAgentPlan(userID, node.AgentPlanID); err != nil {
				return detail, err
			}
			node.Status = model.WorkflowNodeExecutionCancelled
		}
		node.UpdatedAt = now()
	}
	detail.Run.Status, detail.Run.UpdatedAt = model.WorkflowExecutionCancelled, now()
	if err := repository.SaveWorkflowExecutionProjection(detail.Run, detail.Nodes); err != nil {
		return detail, err
	}
	return GetWorkflowExecutionDetail(userID, executionID)
}

func startReadyWorkflowNodes(detail *WorkflowExecutionDetail) error {
	version, err := GetVisibleWorkflowVersion(detail.Run.UserID, detail.Run.WorkflowVersionID)
	if err != nil {
		return err
	}
	var rootRefs []ArtifactRefInput
	if json.Unmarshal([]byte(detail.Revision.InputArtifactRefsJSON), &rootRefs) != nil {
		return safeMessageError{message: "Workflow execution 输入快照损坏"}
	}
	parameters := json.RawMessage(detail.Revision.ParametersJSON)
	if !json.Valid(parameters) {
		return safeMessageError{message: "Workflow execution 参数快照损坏"}
	}
	if string(parameters) == "null" {
		parameters = nil
	}
	previewByKey := map[string]WorkflowNodeRoutePreview{}
	for _, item := range detail.Preview.Nodes {
		previewByKey[item.NodeKey] = item
	}
	specByKey := map[string]WorkflowNodeSpec{}
	for _, item := range version.Package.Nodes {
		specByKey[item.NodeKey] = item
	}
	for index := range detail.Nodes {
		node := &detail.Nodes[index]
		if node.Status != model.WorkflowNodeExecutionReady {
			continue
		}
		spec, preview := specByKey[node.NodeKey], previewByKey[node.NodeKey]
		matches, err := workflowNodeConditionMatches(detail.Run.UserID, spec, detail.Revision.ParametersJSON, detail.Nodes)
		if err != nil {
			return err
		}
		if !matches {
			node.Status, node.UpdatedAt = model.WorkflowNodeExecutionSkipped, now()
			continue
		}
		refs, err := workflowExecutionNodeInputs(spec, rootRefs, detail.Nodes)
		if err != nil {
			return err
		}
		if node.ExecutorType == WorkflowExecutorAdapter {
			adapter, err := resolveFrozenWorkflowAdapter(preview)
			if err != nil {
				return err
			}
			outputs, err := ExecuteWorkflowAdapterOutputs(detail.Run.UserID, detail.Run.ProjectID, detail.Run.EpisodeID, adapter, refs)
			if err != nil {
				node.Status, node.ErrorCode, node.ErrorMessage = model.WorkflowNodeExecutionFailed, "adapter_execution_failed", err.Error()
			} else {
				outputRefs := make([]ArtifactRefInput, 0, len(outputs))
				for _, output := range outputs {
					outputRefs = append(outputRefs, ArtifactRefInput{BindingName: adapter.Output.BindingName, ArtifactID: output.Artifact.ID, ContentHash: output.Artifact.ContentHash})
				}
				raw, _ := json.Marshal(outputRefs)
				node.OutputArtifactRefsJSON, node.Status = string(raw), model.WorkflowNodeExecutionCompleted
			}
			node.UpdatedAt = now()
			continue
		}
		if node.ExecutorType == WorkflowExecutorAgent {
			plan, err := CreateAgentPlan(detail.Run.UserID, AgentPlanCreateInput{ProjectID: detail.Run.ProjectID, EpisodeID: detail.Run.EpisodeID, AgentVersionID: preview.AgentVersionID, Goal: spec.Name, SourceArtifactRefs: refs, IdempotencyKey: workflowExecutionNodeIdempotencyKey(detail.Run.ID, detail.Run.Revision, node.NodeKey)})
			if err != nil {
				return err
			}
			preflight, err := PreflightAgentPlan(detail.Run.UserID, plan.Plan.ID)
			if err != nil {
				return err
			}
			codes := make([]string, len(preflight.ConfirmationRequirements))
			for i, requirement := range preflight.ConfirmationRequirements {
				codes[i] = requirement.Code
			}
			confirmed, err := ConfirmAgentPlan(detail.Run.UserID, plan.Plan.ID, AgentPlanConfirmInput{Revision: preflight.Plan.CurrentRevision, Fingerprint: preflight.Plan.ConfirmationFingerprint, RequirementCodes: codes})
			if err != nil {
				return err
			}
			started, err := ContinueAgentPlan(detail.Run.UserID, confirmed.Plan.ID)
			if err != nil {
				return err
			}
			node.AgentPlanID = started.Plan.ID
			node.Status = workflowNodeStatusFromAgentPlan(started.Plan.Status)
		} else {
			snapshot, err := PreflightInvocation(detail.Run.UserID, InvocationRequest{Source: "workflow", ProjectID: detail.Run.ProjectID, EpisodeID: detail.Run.EpisodeID, SkillVersionID: preview.SkillVersionID, ExpectedOutputArtifactType: spec.OutputArtifactType, InputArtifactRefs: refs, Parameters: parameters, ExecutionPolicyOverride: InvocationExecutionPolicyOverride{MaxAttempts: spec.RetryPolicy.MaxAttempts}, IdempotencyKey: workflowExecutionNodeIdempotencyKey(detail.Run.ID, detail.Run.Revision, node.NodeKey)})
			if err != nil {
				return err
			}
			if len(snapshot.BlockReasons) > 0 {
				node.Status, node.ErrorCode, node.ErrorMessage = model.WorkflowNodeExecutionFailed, snapshot.BlockReasons[0].Code, snapshot.BlockReasons[0].Message
				continue
			}
			response, err := confirmInvocationRun(detail.Run.UserID, snapshot.Run, InvocationConfirmation{RequirementCodes: snapshot.ConfirmationRequirements})
			if err != nil {
				return err
			}
			node.InvocationID, node.Status = response.Run.ID, model.WorkflowNodeExecutionQueued
		}
		node.UpdatedAt = now()
	}
	return nil
}

func advanceWorkflowExecutionNodes(detail *WorkflowExecutionDetail) error {
	for guard := 0; guard <= len(detail.Nodes); guard++ {
		before := make([]model.WorkflowNodeExecutionStatus, len(detail.Nodes))
		for index := range detail.Nodes {
			before[index] = detail.Nodes[index].Status
		}
		if err := unlockWorkflowNodes(detail); err != nil {
			return err
		}
		if err := startReadyWorkflowNodes(detail); err != nil {
			return err
		}
		changed := false
		for index := range detail.Nodes {
			changed = changed || before[index] != detail.Nodes[index].Status
		}
		if !changed {
			return nil
		}
	}
	return safeMessageError{message: "Workflow 节点推进超过安全上限"}
}

func refreshWorkflowNodes(detail *WorkflowExecutionDetail) error {
	for index := range detail.Nodes {
		node := &detail.Nodes[index]
		if node.InvocationID != "" {
			invocation, err := GetInvocationDetail(detail.Run.UserID, node.InvocationID)
			if err != nil {
				return err
			}
			node.Status = workflowNodeStatusFromInvocation(invocation.Run.Status)
			if invocation.Run.Status == model.InvocationStatusApproved || invocation.Run.Status == model.InvocationStatusApplied {
				refs := make([]ArtifactRefInput, 0, len(invocation.AuthoritativeArtifactRefs))
				for _, ref := range invocation.AuthoritativeArtifactRefs {
					if ref.Direction != "output" {
						continue
					}
					refs = append(refs, ArtifactRefInput{BindingName: ref.BindingName, ArtifactID: ref.ArtifactID, ContentHash: ref.ArtifactHash})
				}
				raw, _ := json.Marshal(refs)
				node.OutputArtifactRefsJSON = string(raw)
			}
		}
		if node.AgentPlanID != "" {
			plan, err := GetAgentPlanDetail(detail.Run.UserID, node.AgentPlanID)
			if err != nil {
				return err
			}
			if plan.Plan.Status == model.AgentPlanRunning || plan.Plan.Status == model.AgentPlanNeedsReview {
				continued, continueErr := ContinueAgentPlan(detail.Run.UserID, node.AgentPlanID)
				if continueErr != nil {
					return continueErr
				}
				plan = continued.AgentPlanDetail
			}
			node.Status = workflowNodeStatusFromAgentPlan(plan.Plan.Status)
			if plan.Plan.Status == model.AgentPlanCompleted && len(plan.Steps) > 0 {
				raw, _ := json.Marshal(plan.Steps[len(plan.Steps)-1].OutputArtifactRefs)
				node.OutputArtifactRefsJSON = string(raw)
			}
		}
		node.UpdatedAt = now()
	}
	return nil
}

func unlockWorkflowNodes(detail *WorkflowExecutionDetail) error {
	version, err := GetVisibleWorkflowVersion(detail.Run.UserID, detail.Run.WorkflowVersionID)
	if err != nil {
		return err
	}
	states := map[string]model.WorkflowNodeExecutionStatus{}
	for _, node := range detail.Nodes {
		states[node.NodeKey] = node.Status
	}
	bySpec := map[string]WorkflowNodeSpec{}
	for _, spec := range version.Package.Nodes {
		bySpec[spec.NodeKey] = spec
	}
	for index := range detail.Nodes {
		node := &detail.Nodes[index]
		if node.Status != model.WorkflowNodeExecutionBlocked || node.ErrorCode != "" {
			continue
		}
		spec := bySpec[node.NodeKey]
		ready, skip := true, false
		for _, dependency := range spec.DependsOn {
			dependencyStatus := states[dependency]
			if dependencyStatus == model.WorkflowNodeExecutionSkipped {
				for _, binding := range spec.InputBindings {
					if binding.Source == WorkflowNodeSource && containsInvocationString(workflowBindingSourceKeys(binding), dependency) && binding.Required {
						skip = true
					}
				}
				continue
			}
			ready = ready && (dependencyStatus == model.WorkflowNodeExecutionApproved || dependencyStatus == model.WorkflowNodeExecutionCompleted)
		}
		if skip {
			node.Status, node.UpdatedAt = model.WorkflowNodeExecutionSkipped, now()
		} else if ready {
			node.Status, node.UpdatedAt = model.WorkflowNodeExecutionReady, now()
		}
	}
	return nil
}

func workflowExecutionNodeInputs(spec WorkflowNodeSpec, roots []ArtifactRefInput, nodes []model.WorkflowNodeExecution) ([]ArtifactRefInput, error) {
	rootByBinding := map[string]ArtifactRefInput{}
	for _, ref := range roots {
		rootByBinding[ref.BindingName] = ref
	}
	nodeByKey := map[string]model.WorkflowNodeExecution{}
	for _, node := range nodes {
		nodeByKey[node.NodeKey] = node
	}
	result := make([]ArtifactRefInput, 0, len(spec.InputBindings))
	for _, binding := range spec.InputBindings {
		if binding.Source == WorkflowInputSource {
			ref, ok := rootByBinding[binding.WorkflowInputName]
			if !ok {
				return nil, safeMessageError{message: "Workflow 根输入不存在"}
			}
			ref.BindingName = binding.BindingName
			result = append(result, ref)
			continue
		}
		matched := false
		for _, sourceKey := range workflowBindingSourceKeys(binding) {
			parent, ok := nodeByKey[sourceKey]
			if !ok {
				return nil, safeMessageError{message: "Workflow 上游节点不存在"}
			}
			var refs []ArtifactRefInput
			if json.Unmarshal([]byte(parent.OutputArtifactRefsJSON), &refs) != nil || len(refs) == 0 {
				return nil, safeMessageError{message: "Workflow 上游 Artifact 尚未批准"}
			}
			for _, ref := range refs {
				if binding.FromOutputBinding != "" && ref.BindingName != binding.FromOutputBinding && len(refs) > 1 {
					continue
				}
				ref.BindingName = binding.BindingName
				result, matched = append(result, ref), true
			}
		}
		if !matched {
			return nil, safeMessageError{message: "Workflow 上游输出 binding 不存在"}
		}
	}
	return result, nil
}

func workflowNodeStatusFromInvocation(status model.InvocationStatus) model.WorkflowNodeExecutionStatus {
	switch status {
	case model.InvocationStatusQueued:
		return model.WorkflowNodeExecutionQueued
	case model.InvocationStatusRunning, model.InvocationStatusCancelRequested:
		return model.WorkflowNodeExecutionRunning
	case model.InvocationStatusNeedsReview:
		return model.WorkflowNodeExecutionNeedsReview
	case model.InvocationStatusApproved, model.InvocationStatusApplied:
		return model.WorkflowNodeExecutionApproved
	case model.InvocationStatusCancelled:
		return model.WorkflowNodeExecutionCancelled
	case model.InvocationStatusFailed, model.InvocationStatusRejected, model.InvocationStatusBlocked, model.InvocationStatusPartial:
		return model.WorkflowNodeExecutionFailed
	default:
		return model.WorkflowNodeExecutionBlocked
	}
}

func workflowNodeStatusFromAgentPlan(status model.AgentPlanStatus) model.WorkflowNodeExecutionStatus {
	switch status {
	case model.AgentPlanRunning:
		return model.WorkflowNodeExecutionRunning
	case model.AgentPlanNeedsReview:
		return model.WorkflowNodeExecutionNeedsReview
	case model.AgentPlanCompleted:
		return model.WorkflowNodeExecutionCompleted
	case model.AgentPlanFailed, model.AgentPlanBlocked:
		return model.WorkflowNodeExecutionFailed
	case model.AgentPlanCancelled:
		return model.WorkflowNodeExecutionCancelled
	default:
		return model.WorkflowNodeExecutionQueued
	}
}

func workflowExecutionAggregateStatus(nodes []model.WorkflowNodeExecution) model.WorkflowExecutionStatus {
	allDone, hasReview, hasFailed, hasActive := true, false, false, false
	for _, node := range nodes {
		done := node.Status == model.WorkflowNodeExecutionApproved || node.Status == model.WorkflowNodeExecutionCompleted || node.Status == model.WorkflowNodeExecutionSkipped
		allDone = allDone && done
		hasReview = hasReview || node.Status == model.WorkflowNodeExecutionNeedsReview
		hasFailed = hasFailed || node.Status == model.WorkflowNodeExecutionFailed
		hasActive = hasActive || workflowNodeActive(node.Status) || node.Status == model.WorkflowNodeExecutionReady || node.Status == model.WorkflowNodeExecutionBlocked
	}
	if allDone {
		return model.WorkflowExecutionCompleted
	}
	if hasFailed && hasActive {
		return model.WorkflowExecutionPartial
	}
	if hasFailed {
		return model.WorkflowExecutionFailed
	}
	if hasReview {
		return model.WorkflowExecutionNeedsReview
	}
	return model.WorkflowExecutionRunning
}

func workflowNodeActive(status model.WorkflowNodeExecutionStatus) bool {
	return status == model.WorkflowNodeExecutionQueued || status == model.WorkflowNodeExecutionRunning || status == model.WorkflowNodeExecutionNeedsReview
}

func workflowNodeConditionMatches(userID string, spec WorkflowNodeSpec, parametersJSON string, nodes []model.WorkflowNodeExecution) (bool, error) {
	if spec.Condition == nil {
		return true, nil
	}
	var source any
	path := spec.Condition.Key
	switch spec.Condition.Source {
	case WorkflowInputSource:
		if json.Unmarshal([]byte(parametersJSON), &source) != nil {
			return false, safeMessageError{message: "Workflow execution 参数快照损坏"}
		}
	case WorkflowNodeSource:
		parentKey := ""
		parts := strings.Split(path, ".")
		for _, dependency := range spec.DependsOn {
			if parts[0] == dependency {
				parentKey = dependency
				path = strings.Join(parts[1:], ".")
				break
			}
		}
		if parentKey == "" && len(spec.DependsOn) == 1 {
			parentKey = spec.DependsOn[0]
		}
		if parentKey == "" {
			return false, safeMessageError{message: "Workflow node_output 条件必须指向一个明确上游节点"}
		}
		var refs []ArtifactRefInput
		for _, node := range nodes {
			if node.NodeKey == parentKey {
				if json.Unmarshal([]byte(node.OutputArtifactRefsJSON), &refs) != nil || len(refs) != 1 {
					return false, safeMessageError{message: "Workflow node_output 条件要求上游存在一个已批准 Artifact"}
				}
				break
			}
		}
		artifact, err := GetArtifact(userID, refs[0].ArtifactID)
		if err != nil || artifact.Artifact.ContentHash != refs[0].ContentHash {
			return false, safeMessageError{message: "Workflow node_output 条件 Artifact 已失效"}
		}
		if json.Unmarshal([]byte(artifact.Artifact.PayloadJSON), &source) != nil {
			return false, safeMessageError{message: "Workflow node_output 条件 Artifact 内容损坏"}
		}
	default:
		return false, safeMessageError{message: "Workflow 条件来源无效"}
	}
	actual, exists := workflowJSONPath(source, path)
	if spec.Condition.Operator == "exists" {
		return exists, nil
	}
	var expected any
	if json.Unmarshal(spec.Condition.Value, &expected) != nil {
		return false, safeMessageError{message: "Workflow 条件比较值无效"}
	}
	switch spec.Condition.Operator {
	case "equals":
		return workflowJSONEqual(actual, expected) && exists, nil
	case "not_equals":
		return !exists || !workflowJSONEqual(actual, expected), nil
	case "contains":
		return exists && workflowJSONContains(actual, expected), nil
	default:
		return false, safeMessageError{message: "Workflow 条件 operator 无效"}
	}
}

func workflowJSONPath(value any, path string) (any, bool) {
	if strings.TrimSpace(path) == "" {
		return value, true
	}
	current := value
	for _, segment := range strings.Split(path, ".") {
		switch typed := current.(type) {
		case map[string]any:
			var ok bool
			current, ok = typed[segment]
			if !ok {
				return nil, false
			}
		case []any:
			index, err := strconv.Atoi(segment)
			if err != nil || index < 0 || index >= len(typed) {
				return nil, false
			}
			current = typed[index]
		default:
			return nil, false
		}
	}
	return current, true
}

func workflowJSONEqual(left, right any) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && string(leftJSON) == string(rightJSON)
}

func workflowJSONContains(value, expected any) bool {
	switch typed := value.(type) {
	case string:
		needle, ok := expected.(string)
		return ok && strings.Contains(typed, needle)
	case []any:
		for _, item := range typed {
			if workflowJSONEqual(item, expected) {
				return true
			}
		}
	case map[string]any:
		key, ok := expected.(string)
		_, found := typed[key]
		return ok && found
	}
	return false
}

func workflowExecutionNodeIdempotencyKey(executionID string, revision int, nodeKey string) string {
	return "workflow-execution:" + executionID + ":revision:" + strconv.Itoa(revision) + ":node:" + nodeKey
}
