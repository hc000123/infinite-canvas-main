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
	outputs, coreSchemas, skillSchema, err := validateFrozenInvocationOutputs(revision, result.rawOutput)
	if err != nil {
		gates = append(gates, invocationGate(run, attempt, 2, "output_schema", "frozen-dual-schema", "1", false, err, stamp))
		return fail("output_schema", gates, err)
	}
	artifacts, refs, err := buildFrozenInvocationArtifacts(run, revision, attempt, inputRefs, outputs, coreSchemas, stamp)
	if err != nil {
		gates = append(gates, invocationGate(run, attempt, 2, "output_schema", "frozen-dual-schema", "1", false, err, stamp))
		return fail("output_schema", gates, err)
	}
	_ = skillSchema
	for _, artifact := range artifacts {
		gates = append(gates, invocationArtifactGate(run, attempt, artifact, 2, "output_schema", "frozen-dual-schema", "1", true, nil, stamp))
	}
	for index, artifact := range artifacts {
		validator, validatorErr := invocationBusinessValidatorFor(artifact.ArtifactType)
		if validatorErr == nil {
			validatorErr = validator.Check(outputs[index].payload)
		}
		if validatorErr != nil {
			gates = append(gates, invocationGate(run, attempt, 3, "business_gate", validator.ID, validator.Version, false, validatorErr, stamp))
			return fail("business_gate", gates, validatorErr)
		}
		gates = append(gates, invocationArtifactGate(run, attempt, artifact, 3, "business_gate", validator.ID, validator.Version, true, nil, stamp))
	}
	if err := validateInvocationPolicy(run, revision, attempt, agentRun); err != nil {
		gates = append(gates, invocationGate(run, attempt, 4, "policy_gate", "frozen-side-effect-policy", "1", false, err, stamp))
		return fail("policy_gate", gates, err)
	}
	for _, artifact := range artifacts {
		gates = append(gates, invocationArtifactGate(run, attempt, artifact, 4, "policy_gate", "frozen-side-effect-policy", "1", true, nil, stamp))
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
		key := fmt.Sprintf("%d\x00%s\x00%s", gate.ExecutionOrdinal, gate.Layer, gate.ValidatorID)
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
	bindingName string
	ordinal     int
	payload     map[string]any
	raw         json.RawMessage
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
	declared, err := parseInvocationDeclaredOutputs(raw, skill.Package.OutputContract.ArtifactOutputs)
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
		if err := ValidateArtifactPayload(schema, output.raw); err != nil {
			return nil, nil, skillSchema, err
		}
		if err := skillCompiled.Validate(output.payload); err != nil {
			return nil, nil, skillSchema, fmt.Errorf("输出不符合 frozen Skill schema: %w", err)
		}
	}
	return declared, coreSchemas, skillSchema, nil
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
			return nil, err
		}
		counts[item.BindingName]++
		if counts[item.BindingName] > spec.Max {
			return nil, errors.New("输出超过 binding 最大数量")
		}
		result = append(result, validatedInvocationOutput{bindingName: item.BindingName, ordinal: item.Ordinal, payload: payload.value, raw: payload.raw})
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

func buildFrozenInvocationArtifacts(run model.InvocationRun, revision model.InvocationPreflightRevision, attempt model.InvocationAttempt, inputRefs []model.InvocationArtifactRef, outputs []validatedInvocationOutput, schemas map[string]ResolvedArtifactSchema, stamp string) ([]model.Artifact, []model.InvocationArtifactRef, error) {
	parents := make([]ArtifactRefInput, 0, len(inputRefs))
	for _, ref := range inputRefs {
		parents = append(parents, ArtifactRefInput{BindingName: ref.BindingName, ArtifactID: ref.ArtifactID, ContentHash: ref.ArtifactHash})
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
		contentHash, hashErr := artifactEnvelopeContentHash(schema.ArtifactType, schema.Version, schema.ContentHash, run.ProjectID, run.EpisodeID, parentRefs, output.payload, map[string]any{})
		if hashErr != nil {
			return nil, nil, hashErr
		}
		producer := run.ID
		artifactID := deterministicInvocationID("artifact", run.ID, fmt.Sprint(attempt.Attempt), output.bindingName, fmt.Sprint(output.ordinal))
		artifact := model.Artifact{ID: artifactID, UserID: run.UserID, ArtifactType: schema.ArtifactType, SchemaID: schema.ID, SchemaVersion: schema.Version, SchemaContentHash: schema.ContentHash, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, ParentArtifactRefsJSON: string(parentJSON), ProducerInvocationID: &producer, ProducerAttempt: attempt.Attempt, PayloadJSON: string(output.raw), ExtensionsJSON: `{}`, ContentHash: contentHash, CreatedAt: stamp}
		artifacts = append(artifacts, artifact)
		refs = append(refs, model.InvocationArtifactRef{ID: deterministicInvocationID("invocationref", run.ID, fmt.Sprint(attempt.Attempt), output.bindingName, fmt.Sprint(output.ordinal)), UserID: run.UserID, InvocationID: run.ID, Direction: "output", BindingName: output.bindingName, ArtifactID: artifact.ID, ArtifactHash: artifact.ContentHash, ArtifactType: artifact.ArtifactType, SchemaVersion: artifact.SchemaVersion, SchemaContentHash: artifact.SchemaContentHash, Revision: attempt.Revision, Attempt: attempt.Attempt, Ordinal: output.ordinal, CreatedAt: stamp})
	}
	return artifacts, refs, nil
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
		if effect != "none" && effect != "read" {
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
	return model.InvocationGateResult{ID: deterministicInvocationID("invocationgate", run.ID, fmt.Sprint(attempt.Attempt), fmt.Sprint(ordinal), validatorID), UserID: run.UserID, InvocationID: run.ID, Attempt: attempt.Attempt, ExecutionOrdinal: ordinal, Layer: layer, ValidatorID: validatorID, ValidatorVersion: version, IssuesJSON: string(issuesJSON), Passed: passed, CreatedAt: stamp}
}

func invocationArtifactGate(run model.InvocationRun, attempt model.InvocationAttempt, artifact model.Artifact, ordinal int, layer, validatorID, version string, passed bool, issue error, stamp string) model.InvocationGateResult {
	gate := invocationGate(run, attempt, ordinal, layer, validatorID, version, passed, issue, stamp)
	gate.ID = deterministicInvocationID("invocationgate", run.ID, fmt.Sprint(attempt.Attempt), fmt.Sprint(ordinal), validatorID, artifact.ID)
	gate.ArtifactID, gate.ArtifactHash = artifact.ID, artifact.ContentHash
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
