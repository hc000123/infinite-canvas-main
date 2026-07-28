package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/repository"
)

const workflowAdapterExtensionKey = "workflow.adapter"

type WorkflowAdapterDefinition struct {
	ID             string                   `json:"adapterId"`
	Version        string                   `json:"adapterVersion"`
	ContentHash    string                   `json:"contentHash"`
	InputContracts []ArtifactInputSpec      `json:"inputContracts"`
	Output         ArtifactOutputSpec       `json:"output"`
	Rules          json.RawMessage          `json:"rules"`
	Transform      WorkflowAdapterTransform `json:"-"`
}

type WorkflowAdapterTransform func([]ResolvedArtifactBinding) (json.RawMessage, error)

type workflowAdapterSnapshot struct {
	AdapterID      string              `json:"adapterId"`
	AdapterVersion string              `json:"adapterVersion"`
	ContentHash    string              `json:"contentHash"`
	InputContracts []ArtifactInputSpec `json:"inputContracts"`
	Output         ArtifactOutputSpec  `json:"output"`
	Rules          json.RawMessage     `json:"rules"`
}

func registeredWorkflowAdapters() []WorkflowAdapterDefinition {
	definition, err := normalizeWorkflowAdapterDefinition(WorkflowAdapterDefinition{
		ID: "production-script-envelope", Version: "1.0.0",
		InputContracts: []ArtifactInputSpec{{BindingName: "production_script", ArtifactType: "production_script", Required: true, Min: 1, Max: 1, SchemaConstraint: ">=1.0 <2.0"}},
		Output:         ArtifactOutputSpec{BindingName: "production_script", ArtifactType: "production_script", Min: 1, Max: 1, SchemaVersion: "1.0.0"},
		Rules:          json.RawMessage(`{"mapping":{"productionScript":"$.productionScript"},"lossPolicy":"preserve_source"}`),
		Transform: func(bindings []ResolvedArtifactBinding) (json.RawMessage, error) {
			if len(bindings) != 1 {
				return nil, errors.New("Adapter 要求一个 production_script 输入")
			}
			value, ok := bindings[0].Artifact.Payload["productionScript"].(string)
			if !ok || strings.TrimSpace(value) == "" {
				return nil, errors.New("production_script 缺少 productionScript")
			}
			return json.Marshal(map[string]string{"productionScript": value})
		},
	})
	if err != nil {
		return nil
	}
	return []WorkflowAdapterDefinition{definition}
}

func ResolveWorkflowAdapter(ref WorkflowAdapterRef) (WorkflowAdapterDefinition, error) {
	id, version := strings.ToLower(strings.TrimSpace(ref.AdapterID)), strings.TrimSpace(ref.AdapterVersion)
	for _, definition := range registeredWorkflowAdapters() {
		if definition.ID != id || definition.Version != version {
			continue
		}
		if _, err := ResolveArtifactSchema(definition.Output.ArtifactType, definition.Output.SchemaVersion); err != nil {
			return WorkflowAdapterDefinition{}, safeMessageError{message: "Workflow Adapter 输出 Schema 不可用"}
		}
		return definition, nil
	}
	return WorkflowAdapterDefinition{}, safeMessageError{message: "Workflow Adapter 精确版本未注册"}
}

func normalizeWorkflowAdapterDefinition(value WorkflowAdapterDefinition) (WorkflowAdapterDefinition, error) {
	value.ID = strings.ToLower(strings.TrimSpace(value.ID))
	value.Version = strings.TrimSpace(value.Version)
	if !skillManifestTokenPattern.MatchString(value.ID) || !skillSemanticVersionRegexp.MatchString(value.Version) || value.Transform == nil {
		return value, errors.New("Workflow Adapter 定义无效")
	}
	inputs, err := normalizeArtifactInputSpecs(value.InputContracts)
	if err != nil || len(inputs) == 0 {
		return value, errors.New("Workflow Adapter 输入契约无效")
	}
	outputs, err := normalizeArtifactOutputSpecs([]ArtifactOutputSpec{value.Output})
	if err != nil || len(outputs) != 1 || outputs[0].Min != 1 || outputs[0].Max != 1 {
		return value, errors.New("Workflow Adapter 输出契约无效")
	}
	rules, _, err := canonicalRawObject(value.Rules)
	if err != nil {
		return value, errors.New("Workflow Adapter 规则无效")
	}
	value.InputContracts, value.Output, value.Rules = inputs, outputs[0], json.RawMessage(rules)
	withoutHash := workflowAdapterSnapshot{AdapterID: value.ID, AdapterVersion: value.Version, InputContracts: value.InputContracts, Output: value.Output, Rules: value.Rules}
	canonical, err := marshalInvocationCanonical(withoutHash)
	if err != nil {
		return value, err
	}
	value.ContentHash = invocationSHA256(canonical)
	return value, nil
}

func workflowAdapterSnapshotValue(value WorkflowAdapterDefinition) workflowAdapterSnapshot {
	return workflowAdapterSnapshot{AdapterID: value.ID, AdapterVersion: value.Version, ContentHash: value.ContentHash, InputContracts: value.InputContracts, Output: value.Output, Rules: value.Rules}
}

func workflowAdapterSnapshotJSON(value WorkflowAdapterDefinition) (json.RawMessage, error) {
	raw, err := marshalInvocationCanonical(workflowAdapterSnapshotValue(value))
	return json.RawMessage(raw), err
}

func resolveFrozenWorkflowAdapter(preview WorkflowNodeRoutePreview) (WorkflowAdapterDefinition, error) {
	definition, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: preview.AdapterID, AdapterVersion: preview.AdapterVersion})
	if err != nil || definition.ContentHash != preview.AdapterContentHash {
		return WorkflowAdapterDefinition{}, safeMessageError{message: "Workflow Adapter 冻结版本已失效"}
	}
	want, err := workflowAdapterSnapshotJSON(definition)
	if err != nil {
		return WorkflowAdapterDefinition{}, err
	}
	var frozen any
	if json.Unmarshal(preview.AdapterSnapshot, &frozen) != nil {
		return WorkflowAdapterDefinition{}, safeMessageError{message: "Workflow Adapter 快照损坏"}
	}
	got, err := marshalInvocationCanonical(frozen)
	if err != nil || !bytes.Equal(want, got) {
		return WorkflowAdapterDefinition{}, safeMessageError{message: "Workflow Adapter 快照哈希不一致"}
	}
	return definition, nil
}

func validateWorkflowAdapterBindings(definition WorkflowAdapterDefinition, bindings []ResolvedArtifactBinding) error {
	counts := map[string]int{}
	for _, binding := range bindings {
		counts[binding.BindingName]++
		matched := false
		for _, spec := range definition.InputContracts {
			if spec.BindingName != binding.BindingName {
				continue
			}
			matched = true
			artifact := binding.Artifact.Artifact
			if artifact.ArtifactType != spec.ArtifactType || !ArtifactSchemaVersionMatches(artifact.SchemaVersion, spec.SchemaConstraint) {
				return safeMessageError{message: "Workflow Adapter 输入 Artifact 契约不兼容"}
			}
			if spec.RequiresApproval && !binding.Approved {
				return safeMessageError{message: "Workflow Adapter 输入 Artifact 尚未批准"}
			}
		}
		if !matched {
			return safeMessageError{message: "Workflow Adapter 收到未声明的输入 binding"}
		}
	}
	for _, spec := range definition.InputContracts {
		count := counts[spec.BindingName]
		if count < spec.Min || count > spec.Max || (spec.Required && count == 0) {
			return safeMessageError{message: "Workflow Adapter 输入 binding 数量不兼容"}
		}
	}
	return nil
}

func validateWorkflowAdapterNodeContracts(definition WorkflowAdapterDefinition, node WorkflowNodeSpec) error {
	if node.OutputArtifactType != definition.Output.ArtifactType {
		return safeMessageError{message: "Workflow Adapter 输出 Artifact 类型与节点不兼容"}
	}
	counts := map[string]int{}
	for _, binding := range node.InputBindings {
		counts[binding.BindingName]++
		matched := false
		for _, spec := range definition.InputContracts {
			if spec.BindingName == binding.BindingName && spec.ArtifactType == binding.ArtifactType {
				matched = true
				break
			}
		}
		if !matched {
			return safeMessageError{message: "Workflow Adapter 节点输入契约不兼容"}
		}
	}
	for _, spec := range definition.InputContracts {
		count := counts[spec.BindingName]
		if count < spec.Min || count > spec.Max || (spec.Required && count == 0) {
			return safeMessageError{message: "Workflow Adapter 节点输入数量不兼容"}
		}
	}
	return nil
}

func ExecuteWorkflowAdapter(userID, projectID, episodeID string, definition WorkflowAdapterDefinition, refs []ArtifactRefInput) (ArtifactEnvelope, error) {
	normalized, err := normalizeWorkflowAdapterDefinition(definition)
	if err != nil || normalized.ContentHash != definition.ContentHash {
		return ArtifactEnvelope{}, safeMessageError{message: "Workflow Adapter 定义哈希不一致"}
	}
	envelopes, snapshots, err := ResolveArtifactRefs(userID, refs)
	if err != nil {
		return ArtifactEnvelope{}, err
	}
	bindings := make([]ResolvedArtifactBinding, len(envelopes))
	for index := range envelopes {
		approved, err := invocationArtifactApproved(userID, envelopes[index].Artifact)
		if err != nil {
			return ArtifactEnvelope{}, err
		}
		bindings[index] = ResolvedArtifactBinding{BindingName: snapshots[index].BindingName, Artifact: envelopes[index], Snapshot: snapshots[index], Approved: approved}
	}
	if err := validateWorkflowAdapterBindings(normalized, bindings); err != nil {
		return ArtifactEnvelope{}, err
	}
	payload, err := normalized.Transform(bindings)
	if err != nil {
		return ArtifactEnvelope{}, err
	}
	metadata, err := json.Marshal(workflowAdapterSnapshotValue(normalized))
	if err != nil {
		return ArtifactEnvelope{}, err
	}
	items, outputs, err := buildArtifacts(userID, []CreateArtifactInput{{
		ArtifactType: normalized.Output.ArtifactType, SchemaVersion: normalized.Output.SchemaVersion,
		ProjectID: projectID, EpisodeID: episodeID, ParentArtifactRefs: refs, Payload: payload,
		Extensions: map[string]json.RawMessage{workflowAdapterExtensionKey: metadata},
	}}, false)
	if err != nil {
		return ArtifactEnvelope{}, err
	}
	coordinate, _ := marshalInvocationCanonical(struct {
		UserID, ProjectID, EpisodeID, AdapterHash string
		Refs                                      []ArtifactRefInput
	}{strings.TrimSpace(userID), strings.TrimSpace(projectID), strings.TrimSpace(episodeID), normalized.ContentHash, refs})
	items[0].ID = deterministicInvocationID("artifact-adapter", string(coordinate))
	outputs[0].Artifact.ID = items[0].ID
	if _, err := repository.CreateArtifact(items[0]); err == nil {
		return outputs[0], nil
	}
	stored, ok, lookupErr := repository.GetUserArtifact(userID, items[0].ID)
	if lookupErr != nil || !ok || stored.ContentHash != items[0].ContentHash {
		if lookupErr != nil {
			return ArtifactEnvelope{}, lookupErr
		}
		return ArtifactEnvelope{}, errors.New("Workflow Adapter 派生 Artifact 冲突")
	}
	return artifactEnvelopeFromModel(stored)
}

func workflowAdapterArtifactApproved(userID string, artifactID string, extensionsJSON string) (bool, error) {
	var extensions map[string]json.RawMessage
	if json.Unmarshal([]byte(extensionsJSON), &extensions) != nil {
		return false, nil
	}
	var snapshot workflowAdapterSnapshot
	if json.Unmarshal(extensions[workflowAdapterExtensionKey], &snapshot) != nil {
		return false, nil
	}
	definition, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: snapshot.AdapterID, AdapterVersion: snapshot.AdapterVersion})
	if err != nil || definition.ContentHash != snapshot.ContentHash {
		return false, nil
	}
	want, _ := workflowAdapterSnapshotJSON(definition)
	got, _ := marshalInvocationCanonical(snapshot)
	if !bytes.Equal(want, got) {
		return false, nil
	}
	artifact, err := GetArtifact(userID, artifactID)
	if err != nil {
		return false, err
	}
	refs, err := decodeArtifactRefs([]byte(artifact.Artifact.ParentArtifactRefsJSON))
	if err != nil {
		return false, err
	}
	parents, snapshots, err := ResolveArtifactRefs(userID, refs)
	if err != nil {
		return false, err
	}
	bindings := make([]ResolvedArtifactBinding, len(parents))
	for index := range parents {
		approved, err := invocationArtifactApproved(userID, parents[index].Artifact)
		if err != nil || !approved {
			return false, err
		}
		bindings[index] = ResolvedArtifactBinding{BindingName: snapshots[index].BindingName, Artifact: parents[index], Snapshot: snapshots[index], Approved: true}
	}
	if err := validateWorkflowAdapterBindings(definition, bindings); err != nil {
		return false, nil
	}
	payload, err := definition.Transform(bindings)
	if err != nil {
		return false, nil
	}
	wantPayload, _, err := canonicalRawObject(payload)
	return err == nil && string(wantPayload) == artifact.Artifact.PayloadJSON, err
}
