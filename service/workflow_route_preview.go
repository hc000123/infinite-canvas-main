package service

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type workflowPreviewArtifact struct {
	binding ResolvedArtifactBinding
}

func PreviewWorkflowVersion(userID, versionID string, input WorkflowPreviewInput) (WorkflowRoutePreview, error) {
	detail, err := GetVisibleWorkflowVersion(userID, versionID)
	if err != nil {
		return WorkflowRoutePreview{}, err
	}
	if detail.Version.Status != model.WorkflowVersionPublished {
		return WorkflowRoutePreview{}, safeMessageError{message: "只能预览已发布 Workflow 版本"}
	}
	input.ProjectID, input.EpisodeID = strings.TrimSpace(input.ProjectID), strings.TrimSpace(input.EpisodeID)
	if input.ProjectID == "" || (detail.Workflow.OwnerType == model.WorkflowOwnerProject && input.ProjectID != detail.Workflow.OwnerProjectID) {
		return WorkflowRoutePreview{}, safeMessageError{message: "Workflow 项目坐标不匹配"}
	}
	envelopes, snapshots, err := ResolveArtifactRefs(userID, input.InputArtifactRefs)
	if err != nil {
		return WorkflowRoutePreview{}, err
	}
	workflowInputs := map[string]workflowPreviewArtifact{}
	for index := range envelopes {
		approved, err := invocationArtifactApproved(userID, envelopes[index].Artifact)
		if err != nil {
			return WorkflowRoutePreview{}, err
		}
		workflowInputs[snapshots[index].BindingName] = workflowPreviewArtifact{binding: ResolvedArtifactBinding{BindingName: snapshots[index].BindingName, Artifact: envelopes[index], Snapshot: snapshots[index], Approved: approved}}
	}
	preview := WorkflowRoutePreview{WorkflowVersionID: detail.Version.ID, ContentHash: detail.Package.ContentHash, Executable: true, Nodes: []WorkflowNodeRoutePreview{}}
	produced := map[string]workflowPreviewArtifact{}
	requirements := map[string]bool{}
	for _, node := range workflowTopologicalOrder(detail.Package.Nodes) {
		bindings, bindingErr := workflowPreviewBindings(node, workflowInputs, produced)
		nodePreview := WorkflowNodeRoutePreview{NodeKey: node.NodeKey, Name: node.Name, ExecutorType: node.ExecutorType, RouteTrace: InvocationRouteTrace{Candidates: []InvocationRouteCandidate{}}}
		if bindingErr != nil {
			nodePreview.BlockCode, nodePreview.BlockMessage = "input_binding_unavailable", bindingErr.Error()
		} else if node.ExecutorType == WorkflowExecutorAdapter {
			nodePreview = previewWorkflowAdapterNode(node, bindings, nodePreview)
		} else if node.ExecutorType == WorkflowExecutorAgent {
			nodePreview = previewWorkflowAgentNode(userID, input.ProjectID, node, nodePreview)
		} else {
			nodePreview = previewWorkflowSkillNode(userID, input, node, bindings, nodePreview)
		}
		if nodePreview.BlockCode != "" {
			preview.Executable = false
		} else {
			var resolved workflowPreviewArtifact
			var err error
			if node.ExecutorType == WorkflowExecutorAdapter {
				adapter, adapterErr := ResolveWorkflowAdapter(*node.AdapterRef)
				if adapterErr != nil {
					err = adapterErr
				} else {
					resolved, err = previewOutputArtifact(userID, input, node, adapter.Output)
				}
			} else if node.ExecutorType == WorkflowExecutorAgent {
				resolved, err = resolvePreviewAgentOutput(userID, input, node)
			} else {
				resolved, err = resolvePreviewOutput(userID, input, node, bindings, nodePreview.SkillVersionID)
			}
			if err != nil {
				nodePreview.BlockCode, nodePreview.BlockMessage, preview.Executable = "output_contract_unavailable", err.Error(), false
			} else {
				produced[node.NodeKey] = resolved
			}
		}
		preview.EstimatedCredits += int64(nodePreview.EstimatedCredits)
		for _, code := range nodePreview.ConfirmationCodes {
			requirements[code] = true
		}
		preview.Nodes = append(preview.Nodes, nodePreview)
	}
	for code := range requirements {
		preview.ConfirmationRequirements = append(preview.ConfirmationRequirements, code)
	}
	sort.Strings(preview.ConfirmationRequirements)
	return preview, nil
}

func previewWorkflowAdapterNode(node WorkflowNodeSpec, bindings []ResolvedArtifactBinding, result WorkflowNodeRoutePreview) WorkflowNodeRoutePreview {
	adapter, err := ResolveWorkflowAdapter(*node.AdapterRef)
	if err != nil {
		result.BlockCode, result.BlockMessage = "adapter_unavailable", err.Error()
		return result
	}
	if err := validateWorkflowAdapterNodeContracts(adapter, node); err != nil {
		result.BlockCode, result.BlockMessage = "adapter_contract_incompatible", err.Error()
		return result
	}
	if err := validateWorkflowAdapterBindings(adapter, bindings); err != nil {
		result.BlockCode, result.BlockMessage = "adapter_input_incompatible", err.Error()
		return result
	}
	snapshot, err := workflowAdapterSnapshotJSON(adapter)
	if err != nil {
		result.BlockCode, result.BlockMessage = "adapter_snapshot_invalid", err.Error()
		return result
	}
	result.AdapterID, result.AdapterVersion = adapter.ID, adapter.Version
	result.AdapterContentHash, result.AdapterSnapshot = adapter.ContentHash, snapshot
	return result
}

func resolvePreviewAgentOutput(userID string, input WorkflowPreviewInput, node WorkflowNodeSpec) (workflowPreviewArtifact, error) {
	definition, version, err := resolveWorkflowAgentReference(userID, input.ProjectID, *node.AgentRef)
	if err != nil {
		return workflowPreviewArtifact{}, err
	}
	packageValue, err := DecodeAgentPackage(version)
	if err != nil || len(packageValue.DefaultSkillRefs) == 0 {
		return workflowPreviewArtifact{}, safeMessageError{message: "Agent 没有可用的最终输出"}
	}
	finalSkill, err := resolveAgentSkillReference(userID, definition.OwnerProjectID, packageValue.DefaultSkillRefs[len(packageValue.DefaultSkillRefs)-1])
	if err != nil {
		return workflowPreviewArtifact{}, err
	}
	for _, spec := range finalSkill.Package.OutputContract.ArtifactOutputs {
		if spec.ArtifactType == node.OutputArtifactType {
			return previewOutputArtifact(userID, input, node, spec)
		}
	}
	return workflowPreviewArtifact{}, safeMessageError{message: "Agent 最终输出与 Workflow 节点不兼容"}
}

func previewWorkflowSkillNode(userID string, input WorkflowPreviewInput, node WorkflowNodeSpec, bindings []ResolvedArtifactBinding, result WorkflowNodeRoutePreview) WorkflowNodeRoutePreview {
	ref := *node.SkillBinding
	routingTags := workflowRoutingTags(input.ProjectTags, input.Parameters)
	resolutionInput := InvocationResolutionInput{ProjectID: input.ProjectID, EpisodeID: input.EpisodeID, Inputs: bindings, ProjectTags: normalizedStringSet(append(routingTags, ref.ProjectTags...), true), ExpectedOutputArtifactType: node.OutputArtifactType}
	switch ref.Mode {
	case WorkflowSkillBindingFixed:
		resolutionInput.SkillVersionID = ref.SkillVersionID
	case WorkflowSkillBindingTagRoute:
		resolutionInput.Capability = ref.Capability
	case WorkflowSkillBindingManualBeforeRun:
		resolutionInput.Capability = ref.Capability
		selected := strings.TrimSpace(input.ManualSelections[node.NodeKey])
		if selected == "" {
			resolved, _ := ResolveInvocationSkill(userID, resolutionInput)
			result.RouteTrace = restrictWorkflowRouteTrace(resolved.Trace, ref.CandidateSkillIDs)
			result.BlockCode, result.BlockMessage = "manual_selection_required", "请选择兼容的精确 Skill 版本"
			return result
		}
		if len(ref.CandidateSkillIDs) > 0 && !workflowSkillVersionInScope(selected, ref.CandidateSkillIDs) {
			resolved, _ := ResolveInvocationSkill(userID, resolutionInput)
			result.RouteTrace = restrictWorkflowRouteTrace(resolved.Trace, ref.CandidateSkillIDs)
			result.BlockCode, result.BlockMessage = "manual_selection_incompatible", "所选 Skill 不在节点候选范围内"
			return result
		}
		resolutionInput.Capability, resolutionInput.SkillVersionID = "", selected
	}
	resolved, err := ResolveInvocationSkill(userID, resolutionInput)
	if err != nil {
		result.BlockCode, result.BlockMessage = "route_error", err.Error()
		return result
	}
	if ref.Mode == WorkflowSkillBindingTagRoute && len(ref.CandidateSkillIDs) > 0 {
		resolved = resolveScopedWorkflowRoute(userID, resolutionInput, ref.CandidateSkillIDs, resolved)
	}
	result.RouteTrace = resolved.Trace
	if resolved.Trace.FinalSkillVersionID == "" {
		blocks := invocationResolutionBlocks(resolved.Trace)
		result.BlockCode, result.BlockMessage = blocks[0].Code, blocks[0].Message
		return result
	}
	result.SkillVersionID, result.SkillContentHash = resolved.Resolved.Version.ID, resolved.Resolved.Version.ContentHash
	result.ConfirmationCodes = invocationConfirmationCodes(resolved.Resolved.Package.Manifest, resolved.Resolved.Package.OutputContract.ArtifactOutputs, bindings)
	policy, err := resolveInvocationExecutionPolicy(InvocationRequest{ProjectID: input.ProjectID, EpisodeID: input.EpisodeID, Parameters: input.Parameters}, resolved.Resolved.Package, bindings, len(result.ConfirmationCodes) > 0)
	if err != nil {
		result.BlockCode, result.BlockMessage = "execution_target_unavailable", err.Error()
		return result
	}
	result.EstimatedCredits = policy.EstimatedCredits
	return result
}

func workflowRoutingTags(projectTags []string, parameters json.RawMessage) []string {
	tags := append([]string(nil), projectTags...)
	var values map[string]any
	if len(parameters) == 0 || json.Unmarshal(parameters, &values) != nil {
		return normalizedStringSet(tags, true)
	}
	format := strings.ToLower(strings.TrimSpace(invocationString(values, "format")))
	switch format {
	case "9:16", "3:4", "4:5", "vertical", "portrait":
		tags = append(tags, "vertical")
	case "16:9", "21:9", "4:3", "horizontal", "landscape":
		tags = append(tags, "horizontal")
	}
	if seriesType := strings.ToLower(strings.TrimSpace(invocationString(values, "seriesType"))); skillManifestTokenPattern.MatchString(seriesType) {
		tags = append(tags, seriesType)
	}
	if values, ok := values["routingTags"].([]any); ok {
		for _, value := range values {
			if tag, ok := value.(string); ok {
				tags = append(tags, tag)
			}
		}
	}
	return normalizedStringSet(tags, true)
}

func previewWorkflowAgentNode(userID, projectID string, node WorkflowNodeSpec, result WorkflowNodeRoutePreview) WorkflowNodeRoutePreview {
	definition, version, err := resolveWorkflowAgentReference(userID, projectID, *node.AgentRef)
	if err != nil {
		result.BlockCode, result.BlockMessage = "agent_unavailable", err.Error()
		return result
	}
	result.AgentVersionID = version.ID
	pkg, err := DecodeAgentPackage(version)
	if err != nil {
		result.BlockCode, result.BlockMessage = "agent_package_invalid", err.Error()
		return result
	}
	requirements := map[string]bool{}
	for _, ref := range pkg.DefaultSkillRefs {
		resolved, err := resolveAgentSkillReference(userID, definition.OwnerProjectID, ref)
		if err != nil {
			result.BlockCode, result.BlockMessage = "agent_skill_unavailable", err.Error()
			return result
		}
		codes := invocationConfirmationCodes(resolved.Package.Manifest, resolved.Package.OutputContract.ArtifactOutputs, nil)
		policy, err := resolveInvocationExecutionPolicy(InvocationRequest{ProjectID: projectID, ExecutionPolicyOverride: InvocationExecutionPolicyOverride{Model: pkg.ModelPolicy.PreferredModel}}, resolved.Package, nil, len(codes) > 0)
		if err != nil {
			result.BlockCode, result.BlockMessage = "execution_target_unavailable", err.Error()
			return result
		}
		result.EstimatedCredits += policy.EstimatedCredits
		for _, code := range codes {
			requirements[code] = true
		}
	}
	for code := range requirements {
		result.ConfirmationCodes = append(result.ConfirmationCodes, code)
	}
	sort.Strings(result.ConfirmationCodes)
	return result
}

func workflowPreviewBindings(node WorkflowNodeSpec, roots, produced map[string]workflowPreviewArtifact) ([]ResolvedArtifactBinding, error) {
	result := make([]ResolvedArtifactBinding, 0, len(node.InputBindings))
	for _, spec := range node.InputBindings {
		if spec.Source == WorkflowInputSource {
			item, ok := roots[spec.WorkflowInputName]
			if !ok {
				return nil, safeMessageError{message: "Workflow 节点缺少输入 " + spec.BindingName}
			}
			binding := item.binding
			binding.BindingName, binding.Snapshot.BindingName = spec.BindingName, spec.BindingName
			result = append(result, binding)
			continue
		}
		for _, sourceKey := range workflowBindingSourceKeys(spec) {
			item, ok := produced[sourceKey]
			if !ok {
				return nil, safeMessageError{message: "Workflow 节点缺少输入 " + spec.BindingName}
			}
			binding := item.binding
			binding.BindingName, binding.Snapshot.BindingName = spec.BindingName, spec.BindingName
			result = append(result, binding)
		}
	}
	return result, nil
}

func resolvePreviewOutput(userID string, input WorkflowPreviewInput, node WorkflowNodeSpec, bindings []ResolvedArtifactBinding, versionID string) (workflowPreviewArtifact, error) {
	resolved, err := ResolveInvocationSkill(userID, InvocationResolutionInput{ProjectID: input.ProjectID, EpisodeID: input.EpisodeID, SkillVersionID: versionID, Inputs: bindings, ExpectedOutputArtifactType: node.OutputArtifactType})
	if err != nil || resolved.Trace.FinalSkillVersionID == "" {
		return workflowPreviewArtifact{}, safeMessageError{message: "无法解析节点输出契约"}
	}
	for _, spec := range resolved.Resolved.Package.OutputContract.ArtifactOutputs {
		if spec.ArtifactType != node.OutputArtifactType {
			continue
		}
		return previewOutputArtifact(userID, input, node, spec)
	}
	return workflowPreviewArtifact{}, safeMessageError{message: "节点没有声明输出 Artifact"}
}

func previewOutputArtifact(userID string, input WorkflowPreviewInput, node WorkflowNodeSpec, spec ArtifactOutputSpec) (workflowPreviewArtifact, error) {
	schema, err := ResolveArtifactSchema(spec.ArtifactType, spec.SchemaVersion)
	if err != nil {
		return workflowPreviewArtifact{}, err
	}
	artifact := model.Artifact{ID: "preview:" + node.NodeKey, UserID: userID, ArtifactType: spec.ArtifactType, SchemaID: schema.ID, SchemaVersion: schema.Version, SchemaContentHash: schema.ContentHash, ProjectID: input.ProjectID, EpisodeID: input.EpisodeID, ContentHash: "preview:" + node.NodeKey}
	snapshot := ArtifactRefSnapshot{BindingName: spec.BindingName, ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, ArtifactType: artifact.ArtifactType, SchemaID: schema.ID, SchemaVersion: schema.Version, SchemaContentHash: schema.ContentHash, Schema: schema.Schema, ProjectID: input.ProjectID, EpisodeID: input.EpisodeID}
	return workflowPreviewArtifact{binding: ResolvedArtifactBinding{BindingName: spec.BindingName, Artifact: ArtifactEnvelope{Artifact: artifact}, Snapshot: snapshot, Approved: true}}, nil
}

func workflowTopologicalOrder(nodes []WorkflowNodeSpec) []WorkflowNodeSpec {
	result := make([]WorkflowNodeSpec, 0, len(nodes))
	remaining := append([]WorkflowNodeSpec(nil), nodes...)
	done := map[string]bool{}
	for len(remaining) > 0 {
		progress := false
		for index := 0; index < len(remaining); {
			ready := true
			for _, dependency := range remaining[index].DependsOn {
				ready = ready && done[dependency]
			}
			if !ready {
				index++
				continue
			}
			result, done[remaining[index].NodeKey] = append(result, remaining[index]), true
			remaining = append(remaining[:index], remaining[index+1:]...)
			progress = true
		}
		if !progress {
			return nodes
		}
	}
	return result
}

func workflowSkillVersionInScope(versionID string, skillIDs []string) bool {
	definition, _, ok, err := repository.GetSkillWithVersion(versionID)
	return err == nil && ok && containsInvocationString(skillIDs, definition.ID)
}

func restrictWorkflowRouteTrace(trace InvocationRouteTrace, skillIDs []string) InvocationRouteTrace {
	if len(skillIDs) == 0 {
		return trace
	}
	trace.FinalSkillVersionID = ""
	for index := range trace.Candidates {
		if !containsInvocationString(skillIDs, trace.Candidates[index].SkillID) {
			trace.Candidates[index].Accepted = false
			trace.Candidates[index].Score = 0
			trace.Candidates[index].Reasons = append(trace.Candidates[index].Reasons, "candidate_scope")
		} else if trace.FinalSkillVersionID == "" && trace.Candidates[index].Accepted {
			trace.FinalSkillVersionID = trace.Candidates[index].SkillVersionID
		}
	}
	return trace
}

func resolveScopedWorkflowRoute(userID string, input InvocationResolutionInput, skillIDs []string, initial InvocationResolutionResult) InvocationResolutionResult {
	trace := restrictWorkflowRouteTrace(initial.Trace, skillIDs)
	if trace.FinalSkillVersionID == "" || trace.FinalSkillVersionID == initial.Trace.FinalSkillVersionID {
		initial.Trace = trace
		return initial
	}
	input.Capability, input.SkillVersionID = "", trace.FinalSkillVersionID
	resolved, err := ResolveInvocationSkill(userID, input)
	if err != nil {
		initial.Trace = trace
		return initial
	}
	resolved.Trace = trace
	return resolved
}
