package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type invocationCompletion struct {
	agentRun  model.AgentRun
	run       model.InvocationRun
	attempt   model.InvocationAttempt
	artifacts []model.Artifact
	refs      []model.InvocationArtifactRef
	gates     []model.InvocationGateResult
	event     model.InvocationEvent
}

var finalizeInvocationAttemptTx = repository.FinalizeInvocationAttemptTx

type invocationCoreSchemaSnapshot struct {
	Outputs []struct {
		Spec   ArtifactOutputSpec     `json:"spec"`
		Schema ResolvedArtifactSchema `json:"schema"`
	} `json:"outputs"`
	ImportedAdapter *workflowAdapterSnapshot `json:"importedAdapter,omitempty"`
}

type invocationSkillSchemaSnapshot struct {
	SchemaVersion string         `json:"schemaVersion"`
	Schema        map[string]any `json:"schema"`
	ContentHash   string         `json:"contentHash"`
}

type invocationDeclaredOutput struct {
	BindingName string          `json:"bindingName"`
	Ordinal     int             `json:"ordinal"`
	Payload     json.RawMessage `json:"payload"`
}

func finalizeInvocationAgentRun(agentRun model.AgentRun, result agentRunCallResult, stamp string) error {
	run, ok, err := repository.GetUserInvocation(agentRun.UserID, agentRun.InvocationID)
	if err != nil || !ok {
		if err == nil {
			err = repository.ErrInvocationNotFound
		}
		return err
	}
	revisions, err := repository.ListInvocationPreflightRevisions(agentRun.UserID, run.ID)
	if err != nil {
		return err
	}
	attempts, err := repository.ListInvocationAttempts(agentRun.UserID, run.ID)
	if err != nil {
		return err
	}
	allRefs, err := repository.ListInvocationArtifactRefs(agentRun.UserID, run.ID)
	if err != nil {
		return err
	}
	var revision model.InvocationPreflightRevision
	for _, item := range revisions {
		if item.Revision == agentRun.InvocationRevision {
			revision = item
		}
	}
	var attempt model.InvocationAttempt
	for _, item := range attempts {
		if item.AgentRunID == agentRun.ID && item.Attempt == agentRun.InvocationAttempt {
			attempt = item
		}
	}
	if revision.ID == "" || attempt.ID == "" {
		return repository.ErrInvocationTransitionConflict
	}
	inputRefs := []model.InvocationArtifactRef{}
	for _, ref := range allRefs {
		if ref.Direction == "input" && ref.Revision == attempt.Revision && ref.Attempt == attempt.Attempt {
			inputRefs = append(inputRefs, ref)
		}
	}
	completion := buildInvocationCompletion(agentRun, run, revision, attempt, inputRefs, result, stamp)
	err = finalizeInvocationAttemptTx(completion.agentRun, completion.run, completion.attempt, completion.artifacts, completion.refs, completion.gates, completion.event)
	if errors.Is(err, repository.ErrInvocationAttemptFinalized) {
		return nil
	}
	return err
}

func finalizeInvocationTerminal(agentRun model.AgentRun, agentStatus model.AgentRunStatus, runStatus model.InvocationStatus, errorClass, message, stamp string) error {
	run, ok, err := repository.GetUserInvocation(agentRun.UserID, agentRun.InvocationID)
	if err != nil || !ok {
		if err == nil {
			err = repository.ErrInvocationNotFound
		}
		return err
	}
	attempts, err := repository.ListInvocationAttempts(agentRun.UserID, run.ID)
	if err != nil {
		return err
	}
	var attempt model.InvocationAttempt
	for _, item := range attempts {
		if item.AgentRunID == agentRun.ID && item.Attempt == agentRun.InvocationAttempt {
			attempt = item
		}
	}
	if attempt.ID == "" {
		return repository.ErrInvocationTransitionConflict
	}
	agentRun.Status, agentRun.ErrorMessage, agentRun.FinishedAt, agentRun.UpdatedAt = agentStatus, message, stamp, stamp
	attempt.Status, attempt.ErrorClass, attempt.ErrorMessage = string(agentStatus), errorClass, message
	attempt.CreditsReserved, attempt.CreditsRefunded, attempt.DurationMs = agentRun.CreditsReserved, agentRun.CreditsRefunded, agentRun.DurationMs
	attempt.FinishedAt, attempt.UpdatedAt = stamp, stamp
	run.Status, run.AggregateErrorSummary, run.UpdatedAt = runStatus, message, stamp
	eventType := "attempt.failed"
	if runStatus == model.InvocationStatusCancelled {
		eventType = "attempt.cancelled"
	}
	event := model.InvocationEvent{UserID: run.UserID, InvocationID: run.ID, Type: eventType, Level: "info", DataJSON: `{}`, Revision: attempt.Revision, Attempt: attempt.Attempt, CreatedAt: stamp}
	err = finalizeInvocationAttemptTx(agentRun, run, attempt, nil, nil, nil, event)
	if errors.Is(err, repository.ErrInvocationAttemptFinalized) {
		return nil
	}
	return err
}

func buildInvocationCompletion(agentRun model.AgentRun, run model.InvocationRun, revision model.InvocationPreflightRevision, attempt model.InvocationAttempt, inputRefs []model.InvocationArtifactRef, result agentRunCallResult, stamp string) invocationCompletion {
	agentRun.RawOutput, agentRun.StructuredDraftJSON = result.rawOutput, result.structuredJSON
	attempt.RawOutput, attempt.StructuredOutputJSON, attempt.ToolTraceJSON = result.rawOutput, result.structuredJSON, result.toolTraceJSON
	attempt.CreditsReserved, attempt.CreditsRefunded = agentRun.CreditsReserved, agentRun.CreditsRefunded
	attempt.DurationMs, attempt.FinishedAt, attempt.UpdatedAt = agentRun.DurationMs, stamp, stamp
	run.UpdatedAt = stamp
	completion := invocationCompletion{agentRun: agentRun, run: run, attempt: attempt}
	fail := func(layer string, gates []model.InvocationGateResult, err error) invocationCompletion {
		message := err.Error()
		completion.agentRun.Status, completion.agentRun.ErrorMessage = model.AgentRunStatusFailed, message
		completion.attempt.Status, completion.attempt.ErrorClass, completion.attempt.ErrorMessage = string(model.AgentRunStatusFailed), layer, message
		completion.run.Status, completion.run.AggregateErrorSummary = model.InvocationStatusFailed, message
		completion.gates = globalInvocationFailureGates(run, attempt, gates)
		completion.finish(stamp, "attempt.failed")
		return completion
	}
	gates := []model.InvocationGateResult{}
	if err := validateFrozenInvocationInputs(run.UserID, revision, inputRefs); err != nil {
		gates = append(gates, invocationGate(run, attempt, 1, "input_contract", "frozen-input-contract", "1", false, err, stamp))
		return fail("input_contract", gates, err)
	}
	gates = append(gates, invocationGate(run, attempt, 1, "input_contract", "frozen-input-contract", "1", true, nil, stamp))
	retryPlan := InvocationRetryPlan{}
	if strings.TrimSpace(attempt.RetryPlanJSON) != "" && json.Unmarshal([]byte(attempt.RetryPlanJSON), &retryPlan) != nil {
		return fail("output_schema", append(gates, invocationGate(run, attempt, 2, "output_schema", "immutable-retry-plan", "1", false, errors.New("immutable RetryPlan 无效"), stamp)), errors.New("immutable RetryPlan 无效"))
	}
	outputs, coreSchemas, skillSchema, err := validateFrozenInvocationOutputItems(revision, result.rawOutput, retryPlan)
	if err != nil {
		gates = append(gates, invocationGate(run, attempt, 2, "output_schema", "frozen-dual-schema", "1", false, err, stamp))
		return fail("output_schema", gates, err)
	}
	outputs, err = appendMissingInvocationImageOutputs(revision, retryPlan, outputs)
	if err != nil {
		gates = append(gates, invocationGate(run, attempt, 2, "output_schema", "frozen-image-cardinality", "1", false, err, stamp))
		return fail("output_schema", gates, err)
	}
	imported := false
	if skill, frozenErr := frozenInvocationSkill(revision); frozenErr == nil && skill.Version.SourceKind == "folder_import" {
		imported = true
		outputs, err = convertFrozenImportedInvocationOutputs(revision, outputs, coreSchemas, skillSchema)
		if err != nil {
			layer := "fixed_adapter"
			for _, output := range outputs {
				if output.validationError != nil {
					if output.errorLayer != "" {
						layer = output.errorLayer
					}
					gates = append(gates, invocationCoordinateGate(run, attempt, 2, layer, "frozen-imported-adapter", output, output.validationError, stamp))
				}
			}
			return fail(layer, gates, err)
		}
	}
	validOutputs := make([]validatedInvocationOutput, 0, len(outputs))
	itemFailed := false
	itemFailureLayer := ""
	for _, output := range outputs {
		if output.validationError != nil {
			itemFailed = true
			itemFailureLayer = "output_schema"
			gates = append(gates, invocationCoordinateGate(run, attempt, 2, "output_schema", "frozen-dual-schema", output, output.validationError, stamp))
			continue
		}
		validator, validatorErr := invocationBusinessValidatorFor(coreSchemas[output.bindingName].ArtifactType)
		if validatorErr == nil {
			validatorErr = validateInvocationBusinessPayload(validator, output.payload, revision)
		}
		if validatorErr != nil {
			itemFailed = true
			if itemFailureLayer == "" {
				itemFailureLayer = "business_gate"
			}
			gates = append(gates, invocationCoordinateGate(run, attempt, 2, "output_schema", "frozen-dual-schema", output, nil, stamp))
			gates = append(gates, invocationCoordinateGate(run, attempt, 3, "business_gate", validator.ID, output, validatorErr, stamp))
			continue
		}
		validOutputs = append(validOutputs, output)
	}
	if imported && itemFailed {
		return fail(itemFailureLayer, gates, errors.New("导入 Skill 的多输出必须全部通过标准化验证"))
	}
	artifacts, refs, err := buildFrozenInvocationArtifacts(run, revision, attempt, inputRefs, validOutputs, coreSchemas, retryPlan, stamp)
	if err != nil {
		gates = append(gates, invocationGate(run, attempt, 2, "output_schema", "frozen-dual-schema", "1", false, err, stamp))
		return fail("output_schema", gates, err)
	}
	for index, artifact := range artifacts {
		output := validOutputs[index]
		schemaGate := invocationArtifactGate(run, attempt, artifact, 2, "output_schema", "frozen-dual-schema", "1", true, nil, stamp)
		validator, _ := invocationBusinessValidatorFor(artifact.ArtifactType)
		businessGate := invocationArtifactGate(run, attempt, artifact, 3, "business_gate", validator.ID, validator.Version, true, nil, stamp)
		schemaGate.BindingName, schemaGate.OutputOrdinal = output.bindingName, output.ordinal
		businessGate.BindingName, businessGate.OutputOrdinal = output.bindingName, output.ordinal
		gates = append(gates, schemaGate, businessGate)
	}
	preservedArtifacts, preservedRefs, preservedGates, preserveErr := loadPreservedInvocationOutputs(run, revision, attempt, retryPlan, stamp)
	if preserveErr != nil {
		gates = append(gates, invocationGate(run, attempt, 2, "output_schema", "immutable-retry-plan", "1", false, preserveErr, stamp))
		return fail("output_schema", gates, preserveErr)
	}
	refs = append(preservedRefs, refs...)
	gates = append(gates, preservedGates...)
	if err := validateInvocationPolicy(run, revision, attempt, agentRun); err != nil {
		gates = append(gates, invocationGate(run, attempt, 4, "policy_gate", "frozen-side-effect-policy", "1", false, err, stamp))
		return fail("policy_gate", gates, err)
	}
	for _, ref := range refs {
		for _, artifact := range append(preservedArtifacts, artifacts...) {
			if artifact.ID == ref.ArtifactID {
				gate := invocationArtifactGate(run, attempt, artifact, 4, "policy_gate", "frozen-side-effect-policy", "1", true, nil, stamp)
				gate.BindingName, gate.OutputOrdinal = ref.BindingName, ref.Ordinal
				gates = append(gates, gate)
			}
		}
	}
	if itemFailed {
		if len(refs) == 0 {
			return fail(itemFailureLayer, gates, errors.New("所有输出 ordinal 均未通过验证"))
		}
		completion.agentRun.Status, completion.agentRun.ErrorMessage = model.AgentRunStatusPartial, "部分输出未通过验证"
		completion.attempt.Status, completion.attempt.ErrorClass, completion.attempt.ErrorMessage = string(model.AgentRunStatusPartial), "business_gate", completion.agentRun.ErrorMessage
		completion.run.Status, completion.run.AggregateErrorSummary = model.InvocationStatusPartial, completion.agentRun.ErrorMessage
		completion.agentRun.CreditsRefunded = invocationImagePartialRefund(agentRun, outputs)
		completion.attempt.CreditsRefunded = completion.agentRun.CreditsRefunded
		completion.artifacts, completion.refs, completion.gates = artifacts, refs, gates
		completion.finish(stamp, "attempt.partial")
		return completion
	}
	completion.agentRun.Status, completion.agentRun.ErrorMessage = model.AgentRunStatusNeedsReview, ""
	completion.attempt.Status, completion.attempt.ErrorClass, completion.attempt.ErrorMessage = string(model.AgentRunStatusNeedsReview), "", ""
	completion.run.Status, completion.run.AggregateErrorSummary = model.InvocationStatusNeedsReview, ""
	completion.artifacts, completion.refs, completion.gates = artifacts, refs, gates
	completion.finish(stamp, "attempt.needs_review")
	return completion
}

func globalInvocationFailureGates(run model.InvocationRun, attempt model.InvocationAttempt, gates []model.InvocationGateResult) []model.InvocationGateResult {
	result := make([]model.InvocationGateResult, 0, len(gates))
	indexes := map[string]int{}
	for _, gate := range gates {
		key := fmt.Sprintf("%d\x00%s\x00%s\x00%s\x00%d", gate.ExecutionOrdinal, gate.Layer, gate.ValidatorID, gate.BindingName, gate.OutputOrdinal)
		gate.ID = deterministicInvocationID("invocationgate", run.ID, fmt.Sprint(attempt.Attempt), key)
		gate.ArtifactID, gate.ArtifactHash = "", ""
		if index, ok := indexes[key]; ok {
			if !gate.Passed {
				result[index] = gate
			}
			continue
		}
		indexes[key] = len(result)
		result = append(result, gate)
	}
	return result
}

func (completion *invocationCompletion) finish(stamp, eventType string) {
	completion.agentRun.FinishedAt, completion.agentRun.UpdatedAt = stamp, stamp
	completion.event = model.InvocationEvent{UserID: completion.run.UserID, InvocationID: completion.run.ID, Type: eventType, Level: "info", DataJSON: `{}`, Revision: completion.attempt.Revision, Attempt: completion.attempt.Attempt, CreatedAt: stamp}
}

type validatedInvocationOutput struct {
	bindingName     string
	ordinal         int
	payload         map[string]any
	raw             json.RawMessage
	rawPayload      json.RawMessage
	adapterTrace    *importedSkillAdapterArtifactExtension
	errorLayer      string
	validationError error
}

type importedSkillAdapterArtifactExtension struct {
	RawPayload           json.RawMessage `json:"rawPayload"`
	RawSchemaVersion     string          `json:"rawSchemaVersion"`
	RawSchemaContentHash string          `json:"rawSchemaContentHash"`
	AdapterID            string          `json:"adapterId"`
	AdapterVersion       string          `json:"adapterVersion"`
	AdapterContentHash   string          `json:"adapterContentHash"`
	TransformKind        string          `json:"transformKind"`
	Diff                 map[string]any  `json:"diff"`
}

func validateFrozenInvocationInputs(userID string, revision model.InvocationPreflightRevision, refs []model.InvocationArtifactRef) error {
	var snapshot invocationSkillSnapshot
	var bindings []ResolvedArtifactBinding
	var err error
	if snapshot, err = frozenInvocationSkill(revision); err != nil || json.Unmarshal([]byte(revision.InputSnapshotJSON), &bindings) != nil {
		return errors.New("frozen input snapshot/hash 无效")
	}
	if len(bindings) != len(refs) {
		return errors.New("frozen input 数量不一致")
	}
	stored, err := repository.GetUserArtifactsByIDs(userID, invocationRefIDs(refs))
	if err != nil {
		return err
	}
	refsByBinding := make(map[string]model.InvocationArtifactRef, len(refs))
	for _, ref := range refs {
		key := fmt.Sprintf("%s\x00%d", ref.BindingName, ref.Ordinal)
		if _, exists := refsByBinding[key]; exists {
			return errors.New("frozen input binding/ordinal 重复")
		}
		refsByBinding[key] = ref
	}
	counts := map[string]int{}
	for _, binding := range bindings {
		ordinal := counts[binding.BindingName]
		ref, found := refsByBinding[fmt.Sprintf("%s\x00%d", binding.BindingName, ordinal)]
		if !found {
			return errors.New("frozen input binding/ordinal 已变化")
		}
		artifact, ok := stored[ref.ArtifactID]
		if !ok || binding.BindingName != ref.BindingName || binding.Snapshot.ArtifactID != ref.ArtifactID || binding.Snapshot.ArtifactHash != ref.ArtifactHash || artifact.ContentHash != ref.ArtifactHash || artifact.ArtifactType != ref.ArtifactType || artifact.SchemaVersion != ref.SchemaVersion || artifact.SchemaContentHash != ref.SchemaContentHash {
			return errors.New("frozen input ID/hash/schema 已变化")
		}
		storedEnvelope, envelopeErr := artifactEnvelopeFromModel(artifact)
		frozenEnvelopeJSON, frozenErr := marshalInvocationCanonical(binding.Artifact)
		storedEnvelopeJSON, storedErr := marshalInvocationCanonical(storedEnvelope)
		if envelopeErr != nil || frozenErr != nil || storedErr != nil || string(frozenEnvelopeJSON) != string(storedEnvelopeJSON) {
			return errors.New("frozen input envelope 已变化")
		}
		actualHash, hashErr := frozenStoredArtifactHash(artifact)
		if hashErr != nil || actualHash != ref.ArtifactHash {
			return errors.New("frozen input payload/lineage hash 已变化")
		}
		frozenSchema := ResolvedArtifactSchema{ID: binding.Snapshot.SchemaID, ArtifactType: binding.Snapshot.ArtifactType, Version: binding.Snapshot.SchemaVersion, Schema: binding.Snapshot.Schema, ContentHash: binding.Snapshot.SchemaContentHash, Core: true}
		if err := ValidateArtifactPayload(frozenSchema, json.RawMessage(artifact.PayloadJSON)); err != nil {
			return errors.New("frozen input payload schema 已变化")
		}
		counts[binding.BindingName]++
	}
	for _, spec := range snapshot.Package.InputContract.ArtifactInputs {
		count := counts[spec.BindingName]
		if count < spec.Min || count > spec.Max {
			return errors.New("frozen input cardinality 不兼容")
		}
		for _, ref := range refs {
			if ref.BindingName == spec.BindingName && (ref.ArtifactType != spec.ArtifactType || !ArtifactSchemaVersionMatches(ref.SchemaVersion, spec.SchemaConstraint)) {
				return errors.New("frozen input schema 不兼容")
			}
		}
	}
	if len(invocationPackageBlocks(snapshot.Package, bindings)) > 0 {
		return errors.New("frozen input image policy 不满足")
	}
	return nil
}

func frozenStoredArtifactHash(artifact model.Artifact) (string, error) {
	parentRefs, err := decodeArtifactRefs([]byte(artifact.ParentArtifactRefsJSON))
	if err != nil {
		return "", err
	}
	_, payload, err := canonicalRawObject(json.RawMessage(artifact.PayloadJSON))
	if err != nil {
		return "", err
	}
	rawExtensions := map[string]json.RawMessage{}
	if strings.TrimSpace(artifact.ExtensionsJSON) != "" && json.Unmarshal([]byte(artifact.ExtensionsJSON), &rawExtensions) != nil {
		return "", errors.New("Artifact extensions 无效")
	}
	_, extensions, err := canonicalRawMap(rawExtensions)
	if err != nil {
		return "", err
	}
	return artifactEnvelopeContentHash(artifact.ArtifactType, artifact.SchemaVersion, artifact.SchemaContentHash, artifact.ProjectID, artifact.EpisodeID, parentRefs, payload, extensions)
}

func invocationRefIDs(refs []model.InvocationArtifactRef) []string {
	ids := make([]string, len(refs))
	for index := range refs {
		ids[index] = refs[index].ArtifactID
	}
	return ids
}

func validateFrozenInvocationOutputs(revision model.InvocationPreflightRevision, raw string) ([]validatedInvocationOutput, map[string]ResolvedArtifactSchema, invocationSkillSchemaSnapshot, error) {
	outputs, schemas, skillSchema, err := validateFrozenInvocationOutputItems(revision, raw, InvocationRetryPlan{})
	if err != nil {
		return nil, nil, skillSchema, err
	}
	for _, output := range outputs {
		if output.validationError != nil {
			return nil, nil, skillSchema, output.validationError
		}
	}
	return outputs, schemas, skillSchema, nil
}

func validateFrozenInvocationOutputItems(revision model.InvocationPreflightRevision, raw string, retryPlan InvocationRetryPlan) ([]validatedInvocationOutput, map[string]ResolvedArtifactSchema, invocationSkillSchemaSnapshot, error) {
	var skill invocationSkillSnapshot
	var core invocationCoreSchemaSnapshot
	var skillSchema invocationSkillSchemaSnapshot
	var err error
	if skill, err = frozenInvocationSkill(revision); err != nil || json.Unmarshal([]byte(revision.CoreSchemaSnapshotJSON), &core) != nil || json.Unmarshal([]byte(revision.SkillSchemaSnapshotJSON), &skillSchema) != nil {
		return nil, nil, skillSchema, errors.New("frozen output snapshot/hash 无效")
	}
	skillRaw, _, err := canonicalJSONObject(skillSchema.Schema)
	if err != nil || invocationSHA256(skillRaw) != skillSchema.ContentHash {
		return nil, nil, skillSchema, errors.New("frozen Skill output schema hash 无效")
	}
	skillCompiled, err := compileLocalJSONSchema("frozen-skill-output.json", skillRaw)
	if err != nil {
		return nil, nil, skillSchema, err
	}
	var policy InvocationExecutionPolicy
	_ = json.Unmarshal([]byte(revision.ExecutionPolicyJSON), &policy)
	var declared []validatedInvocationOutput
	if policy.ExecutorKind == "image_model" && len(retryPlan.RequestedOutputs) > 0 {
		declared, err = parseInvocationDeclaredImageOutputsForRetry(raw, retryPlan.RequestedOutputs)
	} else {
		declared, err = parseInvocationDeclaredOutputsForRetry(raw, skill.Package.OutputContract.ArtifactOutputs, retryPlan.RequestedOutputs)
	}
	if err != nil {
		return nil, nil, skillSchema, err
	}
	coreSchemas := map[string]ResolvedArtifactSchema{}
	for _, item := range core.Outputs {
		normalized, normalizeErr := NormalizeArtifactSchema(ArtifactSchemaInput{ID: item.Schema.ID, ArtifactType: item.Schema.ArtifactType, Version: item.Schema.Version, Schema: item.Schema.Schema, Core: item.Schema.Core})
		if normalizeErr != nil || normalized.ContentHash != item.Schema.ContentHash || item.Spec.ArtifactType != item.Schema.ArtifactType || item.Spec.SchemaVersion != item.Schema.Version {
			return nil, nil, skillSchema, errors.New("frozen Core schema hash 无效")
		}
		coreSchemas[item.Spec.BindingName] = item.Schema
	}
	for _, output := range declared {
		schema, ok := coreSchemas[output.bindingName]
		if !ok {
			return nil, nil, skillSchema, errors.New("输出 binding 缺少 frozen Core schema")
		}
		if err := skillCompiled.Validate(output.payload); err != nil {
			declared[invocationOutputIndex(declared, output.bindingName, output.ordinal)].validationError = fmt.Errorf("输出不符合 frozen Skill schema: %w", err)
			continue
		}
		if skill.Version.SourceKind != "folder_import" {
			if err := ValidateArtifactPayload(schema, output.raw); err != nil {
				declared[invocationOutputIndex(declared, output.bindingName, output.ordinal)].validationError = err
			}
		}
	}
	return declared, coreSchemas, skillSchema, nil
}

func convertFrozenImportedInvocationOutputs(revision model.InvocationPreflightRevision, outputs []validatedInvocationOutput, schemas map[string]ResolvedArtifactSchema, rawSchema invocationSkillSchemaSnapshot) ([]validatedInvocationOutput, error) {
	var core invocationCoreSchemaSnapshot
	if json.Unmarshal([]byte(revision.CoreSchemaSnapshotJSON), &core) != nil || core.ImportedAdapter == nil {
		return outputs, errors.New("frozen imported Adapter 快照缺失")
	}
	frozenRaw, err := marshalInvocationCanonical(*core.ImportedAdapter)
	if err != nil {
		return outputs, err
	}
	definition, err := ResolveWorkflowAdapter(WorkflowAdapterRef{AdapterID: core.ImportedAdapter.AdapterID, AdapterVersion: core.ImportedAdapter.AdapterVersion, TransformKind: core.ImportedAdapter.TransformKind, ContentHash: core.ImportedAdapter.ContentHash})
	if err != nil {
		return outputs, err
	}
	registeredRaw, _ := workflowAdapterSnapshotJSON(definition)
	if !json.Valid(frozenRaw) || string(frozenRaw) != string(registeredRaw) {
		return outputs, errors.New("frozen imported Adapter 快照/哈希无效")
	}
	failed := false
	for index := range outputs {
		output := &outputs[index]
		if output.validationError != nil {
			output.errorLayer = "output_schema"
			failed = true
			continue
		}
		before := append(json.RawMessage(nil), output.raw...)
		converted, convertErr := definition.Transform([]ResolvedArtifactBinding{{BindingName: output.bindingName, Artifact: ArtifactEnvelope{Payload: output.payload}}})
		if convertErr != nil {
			output.validationError, output.errorLayer, failed = convertErr, "fixed_adapter", true
			continue
		}
		schema, ok := schemas[output.bindingName]
		if !ok || schema.ArtifactType != definition.Output.ArtifactType || schema.Version != definition.Output.SchemaVersion || schema.ContentHash == "" {
			output.validationError, output.errorLayer, failed = errors.New("frozen standard Schema 与 Adapter 输出不匹配"), "output_schema", true
			continue
		}
		if schemaErr := ValidateArtifactPayload(schema, converted); schemaErr != nil {
			output.validationError, output.errorLayer, failed = schemaErr, "output_schema", true
			continue
		}
		diff, fidelityErr := workflowAdapterContentFidelity(definition.TransformKind, before, converted)
		if fidelityErr != nil {
			output.validationError, output.errorLayer, failed = fidelityErr, "content_fidelity", true
			continue
		}
		if changed, _ := diff["contentChanged"].(bool); changed {
			output.validationError = errors.New("Skill Adapter 内容保真校验失败：" + workflowAdapterContentFidelitySummary(diff))
			output.errorLayer, failed = "content_fidelity", true
			continue
		}
		canonical, payload, canonicalErr := canonicalRawObject(converted)
		if canonicalErr != nil {
			output.validationError, output.errorLayer, failed = canonicalErr, "output_schema", true
			continue
		}
		output.rawPayload, output.raw, output.payload = before, canonical, payload
		output.adapterTrace = &importedSkillAdapterArtifactExtension{
			RawPayload: before, RawSchemaVersion: rawSchema.SchemaVersion, RawSchemaContentHash: rawSchema.ContentHash,
			AdapterID: definition.ID, AdapterVersion: definition.Version, AdapterContentHash: definition.ContentHash, TransformKind: definition.TransformKind, Diff: diff,
		}
	}
	if failed {
		return outputs, errors.New("导入 Skill 输出标准化失败")
	}
	return outputs, nil
}

func parseInvocationDeclaredImageOutputsForRetry(raw string, requested []InvocationOutputCoordinate) ([]validatedInvocationOutput, error) {
	var envelope struct {
		Outputs []invocationDeclaredOutput `json:"outputs"`
	}
	if json.Unmarshal([]byte(raw), &envelope) != nil || len(envelope.Outputs) == 0 {
		return nil, errors.New("图片重试输出必须是 declared one-or-many envelope")
	}
	wanted, seen := map[string]bool{}, map[string]bool{}
	for _, coordinate := range requested {
		wanted[fmt.Sprintf("%s\x00%d", coordinate.BindingName, coordinate.Ordinal)] = true
	}
	result := make([]validatedInvocationOutput, 0, len(envelope.Outputs))
	for _, item := range envelope.Outputs {
		key := fmt.Sprintf("%s\x00%d", item.BindingName, item.Ordinal)
		if !wanted[key] || seen[key] {
			return nil, errors.New("图片重试输出 binding/ordinal 与 immutable RetryPlan 不一致")
		}
		payload, err := canonicalRawInvocationPayload(item.Payload)
		output := validatedInvocationOutput{bindingName: item.BindingName, ordinal: item.Ordinal, raw: item.Payload}
		if err != nil {
			output.validationError = err
		} else {
			output.payload, output.raw = payload.value, payload.raw
		}
		result, seen[key] = append(result, output), true
	}
	return result, nil
}

func appendMissingInvocationImageOutputs(revision model.InvocationPreflightRevision, retryPlan InvocationRetryPlan, outputs []validatedInvocationOutput) ([]validatedInvocationOutput, error) {
	var policy InvocationExecutionPolicy
	if json.Unmarshal([]byte(revision.ExecutionPolicyJSON), &policy) != nil || policy.ExecutorKind != "image_model" {
		return outputs, nil
	}
	skill, err := frozenInvocationSkill(revision)
	if err != nil || len(skill.Package.OutputContract.ArtifactOutputs) != 1 {
		return nil, errors.New("冻结图片输出合同无效")
	}
	expected := retryPlan.RequestedOutputs
	if len(expected) == 0 {
		expected = make([]InvocationOutputCoordinate, policy.OutputCount)
		for ordinal := 0; ordinal < policy.OutputCount; ordinal++ {
			expected[ordinal] = InvocationOutputCoordinate{BindingName: skill.Package.OutputContract.ArtifactOutputs[0].BindingName, Ordinal: ordinal}
		}
	}
	seen := map[string]bool{}
	for _, output := range outputs {
		seen[fmt.Sprintf("%s\x00%d", output.bindingName, output.ordinal)] = true
	}
	for _, coordinate := range expected {
		key := fmt.Sprintf("%s\x00%d", coordinate.BindingName, coordinate.Ordinal)
		if !seen[key] {
			outputs = append(outputs, validatedInvocationOutput{bindingName: coordinate.BindingName, ordinal: coordinate.Ordinal, validationError: errors.New("图片输出 ordinal 缺失")})
		}
	}
	sort.Slice(outputs, func(i, j int) bool {
		if outputs[i].bindingName != outputs[j].bindingName {
			return outputs[i].bindingName < outputs[j].bindingName
		}
		return outputs[i].ordinal < outputs[j].ordinal
	})
	return outputs, nil
}

func invocationImagePartialRefund(agentRun model.AgentRun, outputs []validatedInvocationOutput) int {
	if agentRun.ExecutionKind != "image_model" || len(outputs) == 0 || agentRun.Credits <= 0 {
		return 0
	}
	failed := 0
	for _, output := range outputs {
		if output.validationError != nil {
			failed++
		}
	}
	return agentRun.Credits / len(outputs) * failed
}

func invocationOutputIndex(outputs []validatedInvocationOutput, binding string, ordinal int) int {
	for index := range outputs {
		if outputs[index].bindingName == binding && outputs[index].ordinal == ordinal {
			return index
		}
	}
	return -1
}

func parseInvocationDeclaredOutputsForRetry(raw string, specs []ArtifactOutputSpec, requested []InvocationOutputCoordinate) ([]validatedInvocationOutput, error) {
	if len(requested) == 0 {
		return parseInvocationDeclaredOutputs(raw, specs)
	}
	var envelope struct {
		Outputs []invocationDeclaredOutput `json:"outputs"`
	}
	if json.Unmarshal([]byte(raw), &envelope) != nil || len(envelope.Outputs) == 0 {
		return nil, errors.New("重试输出必须是 declared one-or-many envelope")
	}
	wanted := map[string]bool{}
	for _, coordinate := range requested {
		wanted[fmt.Sprintf("%s\x00%d", coordinate.BindingName, coordinate.Ordinal)] = true
	}
	result := make([]validatedInvocationOutput, 0, len(envelope.Outputs))
	seen := map[string]bool{}
	for _, item := range envelope.Outputs {
		key := fmt.Sprintf("%s\x00%d", item.BindingName, item.Ordinal)
		if !wanted[key] || seen[key] {
			return nil, errors.New("重试输出 binding/ordinal 与 immutable RetryPlan 不一致")
		}
		payload, err := canonicalRawInvocationPayload(item.Payload)
		if err != nil {
			result = append(result, validatedInvocationOutput{bindingName: item.BindingName, ordinal: item.Ordinal, raw: item.Payload, validationError: err})
		} else {
			result = append(result, validatedInvocationOutput{bindingName: item.BindingName, ordinal: item.Ordinal, payload: payload.value, raw: payload.raw})
		}
		seen[key] = true
	}
	if len(seen) != len(wanted) {
		return nil, errors.New("重试输出缺少 immutable RetryPlan ordinal")
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].bindingName != result[j].bindingName {
			return result[i].bindingName < result[j].bindingName
		}
		return result[i].ordinal < result[j].ordinal
	})
	return result, nil
}

func parseInvocationDeclaredOutputs(raw string, specs []ArtifactOutputSpec) ([]validatedInvocationOutput, error) {
	if len(specs) == 1 && specs[0].Max == 1 {
		payload, err := canonicalRawInvocationPayload(json.RawMessage(raw))
		if err == nil {
			return []validatedInvocationOutput{{bindingName: specs[0].BindingName, ordinal: 0, payload: payload.value, raw: payload.raw}}, nil
		}
	}
	var envelope struct {
		Outputs []invocationDeclaredOutput `json:"outputs"`
	}
	if json.Unmarshal([]byte(raw), &envelope) != nil || len(envelope.Outputs) == 0 {
		return nil, errors.New("输出必须是 declared one-or-many envelope")
	}
	byBinding := map[string]ArtifactOutputSpec{}
	for _, spec := range specs {
		byBinding[spec.BindingName] = spec
	}
	counts := map[string]int{}
	result := make([]validatedInvocationOutput, 0, len(envelope.Outputs))
	for _, item := range envelope.Outputs {
		spec, ok := byBinding[item.BindingName]
		if !ok || item.Ordinal != counts[item.BindingName] {
			return nil, errors.New("输出 binding/ordinal 未声明或不连续")
		}
		payload, err := canonicalRawInvocationPayload(item.Payload)
		if err != nil {
			result = append(result, validatedInvocationOutput{bindingName: item.BindingName, ordinal: item.Ordinal, raw: item.Payload, validationError: err})
		} else {
			result = append(result, validatedInvocationOutput{bindingName: item.BindingName, ordinal: item.Ordinal, payload: payload.value, raw: payload.raw})
		}
		counts[item.BindingName]++
		if counts[item.BindingName] > spec.Max {
			return nil, errors.New("输出超过 binding 最大数量")
		}
	}
	for _, spec := range specs {
		if counts[spec.BindingName] < spec.Min || counts[spec.BindingName] > spec.Max {
			return nil, errors.New("输出 binding cardinality 不满足")
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].bindingName != result[j].bindingName {
			return result[i].bindingName < result[j].bindingName
		}
		return result[i].ordinal < result[j].ordinal
	})
	return result, nil
}

type canonicalInvocationPayload struct {
	raw   json.RawMessage
	value map[string]any
}

func canonicalRawInvocationPayload(raw json.RawMessage) (canonicalInvocationPayload, error) {
	canonical, value, err := canonicalRawObject(raw)
	return canonicalInvocationPayload{raw: json.RawMessage(canonical), value: value}, err
}

func buildFrozenInvocationArtifacts(run model.InvocationRun, revision model.InvocationPreflightRevision, attempt model.InvocationAttempt, inputRefs []model.InvocationArtifactRef, outputs []validatedInvocationOutput, schemas map[string]ResolvedArtifactSchema, retryPlan InvocationRetryPlan, stamp string) ([]model.Artifact, []model.InvocationArtifactRef, error) {
	parents := make([]ArtifactRefInput, 0, len(inputRefs))
	for _, ref := range inputRefs {
		parents = append(parents, ArtifactRefInput{BindingName: ref.BindingName, ArtifactID: ref.ArtifactID, ContentHash: ref.ArtifactHash})
	}
	if len(retryPlan.RejectedParentArtifactIDs) > 0 {
		rejected, err := repository.GetUserArtifactsByIDs(run.UserID, retryPlan.RejectedParentArtifactIDs)
		if err != nil {
			return nil, nil, err
		}
		for _, artifactID := range retryPlan.RejectedParentArtifactIDs {
			artifact, ok := rejected[artifactID]
			if !ok {
				return nil, nil, errors.New("rejected lineage Artifact 不存在")
			}
			parents = append(parents, ArtifactRefInput{BindingName: "rejected_output", ArtifactID: artifact.ID, ContentHash: artifact.ContentHash})
		}
	}
	parentRefs, _, err := validateParentArtifactRefs(run.UserID, run.ProjectID, run.EpisodeID, parents)
	if err != nil {
		return nil, nil, err
	}
	parentJSON, err := canonicalArtifactRefs(parentRefs)
	if err != nil {
		return nil, nil, err
	}
	artifacts := make([]model.Artifact, 0, len(outputs))
	refs := make([]model.InvocationArtifactRef, 0, len(outputs))
	for _, output := range outputs {
		schema := schemas[output.bindingName]
		extensions := map[string]any{}
		if output.adapterTrace != nil {
			extensions[revision.SkillID] = output.adapterTrace
		}
		extensionsJSON, _, extensionErr := canonicalJSONObject(extensions)
		if extensionErr != nil {
			return nil, nil, extensionErr
		}
		contentHash, hashErr := artifactEnvelopeContentHash(schema.ArtifactType, schema.Version, schema.ContentHash, run.ProjectID, run.EpisodeID, parentRefs, output.payload, extensions)
		if hashErr != nil {
			return nil, nil, hashErr
		}
		producer := run.ID
		artifactID := deterministicInvocationID("artifact", run.ID, fmt.Sprint(attempt.Attempt), output.bindingName, fmt.Sprint(output.ordinal))
		artifact := model.Artifact{ID: artifactID, UserID: run.UserID, ArtifactType: schema.ArtifactType, SchemaID: schema.ID, SchemaVersion: schema.Version, SchemaContentHash: schema.ContentHash, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, ParentArtifactRefsJSON: string(parentJSON), ProducerInvocationID: &producer, ProducerAttempt: attempt.Attempt, PayloadJSON: string(output.raw), ExtensionsJSON: string(extensionsJSON), ContentHash: contentHash, CreatedAt: stamp}
		artifacts = append(artifacts, artifact)
		refs = append(refs, model.InvocationArtifactRef{ID: deterministicInvocationID("invocationref", run.ID, fmt.Sprint(attempt.Attempt), output.bindingName, fmt.Sprint(output.ordinal)), UserID: run.UserID, InvocationID: run.ID, Direction: "output", BindingName: output.bindingName, ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, ArtifactType: artifact.ArtifactType, SchemaVersion: artifact.SchemaVersion, SchemaContentHash: artifact.SchemaContentHash, Revision: attempt.Revision, Attempt: attempt.Attempt, Ordinal: output.ordinal, CreatedAt: stamp})
	}
	return artifacts, refs, nil
}

func loadPreservedInvocationOutputs(run model.InvocationRun, revision model.InvocationPreflightRevision, attempt model.InvocationAttempt, plan InvocationRetryPlan, stamp string) ([]model.Artifact, []model.InvocationArtifactRef, []model.InvocationGateResult, error) {
	if len(plan.PreservedOutputRefs) == 0 {
		return nil, nil, nil, nil
	}
	var core invocationCoreSchemaSnapshot
	var skillSchema invocationSkillSchemaSnapshot
	if json.Unmarshal([]byte(revision.CoreSchemaSnapshotJSON), &core) != nil || json.Unmarshal([]byte(revision.SkillSchemaSnapshotJSON), &skillSchema) != nil {
		return nil, nil, nil, errors.New("frozen output snapshot 无效")
	}
	schemas := map[string]ResolvedArtifactSchema{}
	for _, output := range core.Outputs {
		schemas[output.Spec.BindingName] = output.Schema
	}
	skillRaw, _, err := canonicalJSONObject(skillSchema.Schema)
	if err != nil || invocationSHA256(skillRaw) != skillSchema.ContentHash {
		return nil, nil, nil, errors.New("frozen Skill output schema hash 无效")
	}
	compiled, err := compileLocalJSONSchema("frozen-skill-output.json", skillRaw)
	if err != nil {
		return nil, nil, nil, err
	}
	ids := make([]string, len(plan.PreservedOutputRefs))
	for index := range plan.PreservedOutputRefs {
		ids[index] = plan.PreservedOutputRefs[index].ArtifactID
	}
	stored, err := repository.GetUserArtifactsByIDs(run.UserID, ids)
	if err != nil {
		return nil, nil, nil, err
	}
	artifacts := make([]model.Artifact, 0, len(ids))
	refs := make([]model.InvocationArtifactRef, 0, len(ids))
	gates := make([]model.InvocationGateResult, 0, len(ids)*2)
	for _, frozen := range plan.PreservedOutputRefs {
		artifact, ok := stored[frozen.ArtifactID]
		schema, schemaOK := schemas[frozen.BindingName]
		actualHash, hashErr := frozenStoredArtifactHash(artifact)
		if !ok || !schemaOK || artifact.UserID != run.UserID || artifact.ProjectID != run.ProjectID || artifact.EpisodeID != run.EpisodeID || artifact.ID != frozen.ArtifactID || artifact.ContentHash != frozen.ArtifactHash || artifact.ArtifactType != frozen.ArtifactType || artifact.SchemaVersion != frozen.SchemaVersion || artifact.SchemaContentHash != frozen.SchemaContentHash || schema.ArtifactType != artifact.ArtifactType || schema.Version != artifact.SchemaVersion || schema.ContentHash != artifact.SchemaContentHash || hashErr != nil || actualHash != artifact.ContentHash {
			return nil, nil, nil, errors.New("preserved output ref/hash/schema 已变化")
		}
		payload, err := canonicalRawInvocationPayload(json.RawMessage(artifact.PayloadJSON))
		if err != nil || ValidateArtifactPayload(schema, payload.raw) != nil || compiled.Validate(payload.value) != nil {
			return nil, nil, nil, errors.New("preserved output 不再符合 frozen schema")
		}
		validator, err := invocationBusinessValidatorFor(artifact.ArtifactType)
		if err != nil || validateInvocationBusinessPayload(validator, payload.value, revision) != nil {
			return nil, nil, nil, errors.New("preserved output 不再符合 frozen business validator")
		}
		artifacts = append(artifacts, artifact)
		refs = append(refs, model.InvocationArtifactRef{ID: deterministicInvocationID("invocationref", run.ID, fmt.Sprint(attempt.Attempt), frozen.BindingName, fmt.Sprint(frozen.Ordinal)), UserID: run.UserID, InvocationID: run.ID, Direction: "output", BindingName: frozen.BindingName, ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, ArtifactType: artifact.ArtifactType, SchemaVersion: artifact.SchemaVersion, SchemaContentHash: artifact.SchemaContentHash, Revision: attempt.Revision, Attempt: attempt.Attempt, Ordinal: frozen.Ordinal, CreatedAt: stamp})
		schemaGate := invocationArtifactGate(run, attempt, artifact, 2, "output_schema", "frozen-dual-schema", "1", true, nil, stamp)
		businessGate := invocationArtifactGate(run, attempt, artifact, 3, "business_gate", validator.ID, validator.Version, true, nil, stamp)
		schemaGate.BindingName, schemaGate.OutputOrdinal = frozen.BindingName, frozen.Ordinal
		businessGate.BindingName, businessGate.OutputOrdinal = frozen.BindingName, frozen.Ordinal
		gates = append(gates, schemaGate, businessGate)
	}
	return artifacts, refs, gates, nil
}

func validateInvocationPolicy(run model.InvocationRun, revision model.InvocationPreflightRevision, attempt model.InvocationAttempt, agentRun model.AgentRun) error {
	skill, err := frozenInvocationSkill(revision)
	if err != nil {
		return errors.New("frozen policy snapshot 无效")
	}
	if len(skill.Package.Manifest.RequiredTools) > 0 {
		return errors.New("存在未声明可执行工具")
	}
	for _, effect := range skill.Package.Manifest.SideEffects {
		if effect != "none" && effect != "read" && !(agentRun.ExecutionKind == "image_model" && effect == "image_generation") {
			return errors.New("存在未声明副作用或写入")
		}
	}
	if strings.TrimSpace(attempt.ToolTraceJSON) != "" && strings.TrimSpace(attempt.ToolTraceJSON) != "[]" {
		return errors.New("检测到 undeclared tool trace")
	}
	if agentRun.WritePolicy != "preview_only" || !agentRun.RequiresConfirm {
		return errors.New("Invocation write/confirmation policy 无效")
	}
	var required []string
	if json.Unmarshal([]byte(revision.ConfirmationRequirementsJSON), &required) != nil {
		return errors.New("frozen confirmation requirements 无效")
	}
	if len(required) > 0 {
		events, err := repository.ListInvocationEvents(run.UserID, run.ID, 0, model.MaxPageSize)
		if err != nil {
			return err
		}
		recorded := []string{}
		for _, event := range events {
			if event.Type != "attempt.queued" || event.Attempt != attempt.Attempt || event.Revision != attempt.Revision {
				continue
			}
			var data struct {
				ConfirmedRequirements []string `json:"confirmedRequirements"`
			}
			if json.Unmarshal([]byte(event.DataJSON), &data) == nil {
				recorded = data.ConfirmedRequirements
			}
		}
		if strings.Join(normalizedStringSet(recorded, false), "\x00") != strings.Join(normalizedStringSet(required, false), "\x00") {
			return errors.New("queue 前未记录全部确认要求")
		}
	}
	return nil
}

func invocationGate(run model.InvocationRun, attempt model.InvocationAttempt, ordinal int, layer, validatorID, version string, passed bool, issue error, stamp string) model.InvocationGateResult {
	issues := []string{}
	if issue != nil {
		issues = append(issues, issue.Error())
	}
	issuesJSON, _ := json.Marshal(issues)
	return model.InvocationGateResult{ID: deterministicInvocationID("invocationgate", run.ID, fmt.Sprint(attempt.Attempt), fmt.Sprint(ordinal), validatorID), UserID: run.UserID, InvocationID: run.ID, Attempt: attempt.Attempt, ExecutionOrdinal: ordinal, OutputOrdinal: -1, Layer: layer, ValidatorID: validatorID, ValidatorVersion: version, IssuesJSON: string(issuesJSON), Passed: passed, CreatedAt: stamp}
}

func invocationArtifactGate(run model.InvocationRun, attempt model.InvocationAttempt, artifact model.Artifact, ordinal int, layer, validatorID, version string, passed bool, issue error, stamp string) model.InvocationGateResult {
	gate := invocationGate(run, attempt, ordinal, layer, validatorID, version, passed, issue, stamp)
	gate.ID = deterministicInvocationID("invocationgate", run.ID, fmt.Sprint(attempt.Attempt), fmt.Sprint(ordinal), validatorID, artifact.ID)
	gate.ArtifactID, gate.ArtifactHash = artifact.ID, artifact.ContentHash
	return gate
}

func invocationCoordinateGate(run model.InvocationRun, attempt model.InvocationAttempt, executionOrdinal int, layer, validatorID string, output validatedInvocationOutput, issue error, stamp string) model.InvocationGateResult {
	validatorID = fmt.Sprintf("%s:%s:%d", validatorID, output.bindingName, output.ordinal)
	gate := invocationGate(run, attempt, executionOrdinal, layer, validatorID, "1", issue == nil, issue, stamp)
	gate.BindingName, gate.OutputOrdinal = output.bindingName, output.ordinal
	return gate
}

func deterministicInvocationID(prefix string, values ...string) string {
	hash := sha256.Sum256([]byte(strings.Join(values, "\x00")))
	return prefix + "-" + hex.EncodeToString(hash[:16])
}

func invocationSHA256(raw []byte) string {
	hash := sha256.Sum256(raw)
	return "sha256:" + hex.EncodeToString(hash[:])
}
