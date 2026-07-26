package service

import (
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func ConfirmInvocation(userID, invocationID string, confirmation InvocationConfirmation) (InvocationResponse, error) {
	userID, invocationID = strings.TrimSpace(userID), strings.TrimSpace(invocationID)
	run, ok, err := repository.GetUserInvocation(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	if !ok {
		return InvocationResponse{}, repository.ErrInvocationNotFound
	}
	provided := normalizedStringSet(confirmation.RequirementCodes, true)
	if run.Status != model.InvocationStatusAwaitingConfirmation {
		return confirmedInvocationReplay(run, provided)
	}
	snapshot, err := loadInvocationPreflightSnapshot(userID, run)
	if err != nil {
		return InvocationResponse{}, err
	}
	required := normalizedStringSet(snapshot.ConfirmationRequirements, true)
	if !sameInvocationStrings(provided, required) {
		return InvocationResponse{}, errors.New("确认要求与冻结预检不一致")
	}
	queued, attempt, agentRun, refs, event, err := buildInvocationAttemptQueue(run, snapshot.Revision, snapshot.InputArtifactRefs)
	if err != nil {
		return InvocationResponse{}, err
	}
	if err := repository.QueueInvocationAttemptTx(queued, attempt, agentRun, refs, event); err != nil {
		if errors.Is(err, repository.ErrInvocationTransitionConflict) {
			current, found, getErr := repository.GetUserInvocation(userID, invocationID)
			if getErr == nil && found {
				return confirmedInvocationReplay(current, provided)
			}
		}
		return InvocationResponse{}, err
	}
	return InvocationResponse{Run: queued, Revision: queued.LatestRevision, Attempt: &attempt}, nil
}

func CancelInvocation(userID, invocationID string) (InvocationResponse, error) {
	run, attempt, err := repository.CancelInvocationTx(strings.TrimSpace(userID), strings.TrimSpace(invocationID), now())
	if err != nil {
		return InvocationResponse{}, err
	}
	return InvocationResponse{Run: run, Revision: run.LatestRevision, Attempt: attempt}, nil
}

func RetryInvocation(userID, invocationID string) (InvocationResponse, error) {
	userID, invocationID = strings.TrimSpace(userID), strings.TrimSpace(invocationID)
	run, ok, err := repository.GetUserInvocation(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	if !ok {
		return InvocationResponse{}, repository.ErrInvocationNotFound
	}
	attempts, err := repository.ListInvocationAttempts(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	var previous model.InvocationAttempt
	for _, attempt := range attempts {
		if attempt.Attempt == run.LatestAttempt {
			previous = attempt
		}
	}
	if previous.ID == "" || (previous.Status != string(model.AgentRunStatusFailed) && previous.Status != string(model.AgentRunStatusCancelled) && previous.Status != string(model.AgentRunStatusRejected) && previous.Status != "partial") {
		return InvocationResponse{}, errors.New("只能重试 failed/cancelled/rejected/partial attempt")
	}
	if previous.ErrorClass == "execution_target_unavailable" {
		return InvocationResponse{}, errors.New("执行目标已失效，请重新预检")
	}
	snapshot, err := loadInvocationPreflightSnapshot(userID, run)
	if err != nil {
		return InvocationResponse{}, err
	}
	refs, err := repository.ListInvocationArtifactRefs(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	gates, err := repository.ListInvocationGates(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	plan, err := buildInvocationRetryPlan(snapshot.Revision, previous, refs, gates)
	if err != nil {
		return InvocationResponse{}, err
	}
	queued, attempt, agentRun, inputRefs, event, err := buildInvocationAttemptQueueWithRetry(run, snapshot.Revision, snapshot.InputArtifactRefs, plan)
	if err != nil {
		return InvocationResponse{}, err
	}
	if err := repository.QueueInvocationAttemptTx(queued, attempt, agentRun, inputRefs, event); err != nil {
		return InvocationResponse{}, err
	}
	return InvocationResponse{Run: queued, Revision: queued.LatestRevision, Attempt: &attempt}, nil
}

func ReviewInvocation(userID, invocationID string, input InvocationReviewInput) (InvocationResponse, error) {
	userID, invocationID = strings.TrimSpace(userID), strings.TrimSpace(invocationID)
	run, ok, err := repository.GetUserInvocation(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	if !ok {
		return InvocationResponse{}, repository.ErrInvocationNotFound
	}
	decision := strings.ToLower(strings.TrimSpace(input.Decision))
	input.ArtifactSetHash, input.Comment = strings.TrimSpace(input.ArtifactSetHash), strings.TrimSpace(input.Comment)
	if decision != "approved" && decision != "rejected" {
		return InvocationResponse{}, errors.New("审核 decision 只能是 approved/rejected")
	}
	if run.Status != model.InvocationStatusNeedsReview {
		return replayInvocationReview(run, decision, input)
	}
	if input.Attempt != run.LatestAttempt {
		return InvocationResponse{}, errors.New("审核 attempt 与当前输出不一致")
	}
	refs, err := repository.ListInvocationArtifactRefs(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	wantHash := invocationArtifactSetHash(refs, input.Attempt)
	if input.ArtifactSetHash != wantHash {
		return InvocationResponse{}, errors.New("Artifact-set hash 不一致")
	}
	if err := validateInvocationReviewSet(userID, run, refs); err != nil {
		return InvocationResponse{}, err
	}
	stamp := now()
	run.ReviewedAttempt, run.ReviewedArtifactSetHash, run.UpdatedAt = input.Attempt, wantHash, stamp
	if decision == "approved" {
		run.Status = model.InvocationStatusApproved
	} else {
		run.Status = model.InvocationStatusRejected
	}
	review := model.InvocationReview{ID: newID("invocationreview"), UserID: userID, InvocationID: run.ID, Decision: decision, ArtifactSetHash: wantHash, Comment: input.Comment, ActorID: userID, Attempt: input.Attempt, CreatedAt: stamp}
	event := model.InvocationEvent{UserID: userID, InvocationID: run.ID, Type: "review." + decision, Level: "info", DataJSON: `{}`, Revision: run.LatestRevision, Attempt: input.Attempt, CreatedAt: stamp}
	if err := repository.SaveInvocationReviewTx(run, review, event); err != nil {
		if errors.Is(err, repository.ErrInvocationTransitionConflict) {
			current, found, reloadErr := repository.GetUserInvocation(userID, invocationID)
			if reloadErr == nil && found {
				return replayInvocationReview(current, decision, input)
			}
		}
		return InvocationResponse{}, err
	}
	attempts, _ := repository.ListInvocationAttempts(userID, invocationID)
	for index := range attempts {
		if attempts[index].Attempt == run.LatestAttempt {
			return InvocationResponse{Run: run, Revision: run.LatestRevision, Attempt: &attempts[index]}, nil
		}
	}
	return InvocationResponse{Run: run, Revision: run.LatestRevision}, nil
}

func RevalidateInvocationOutput(userID, invocationID string, input InvocationCorrectionInput) (InvocationResponse, error) {
	userID, invocationID = strings.TrimSpace(userID), strings.TrimSpace(invocationID)
	run, ok, err := repository.GetUserInvocation(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	if !ok {
		return InvocationResponse{}, repository.ErrInvocationNotFound
	}
	if len(strings.TrimSpace(string(input.Output))) == 0 {
		return InvocationResponse{}, errors.New("corrected output 不能为空")
	}
	if run.Status != model.InvocationStatusFailed || input.Attempt != run.LatestAttempt {
		return InvocationResponse{}, repository.ErrInvocationTransitionConflict
	}
	attempts, err := repository.ListInvocationAttempts(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	var attempt model.InvocationAttempt
	for _, item := range attempts {
		if item.Attempt == input.Attempt {
			attempt = item
		}
	}
	if attempt.ID == "" || (attempt.ErrorClass != "output_schema" && attempt.ErrorClass != "business_gate") {
		return InvocationResponse{}, repository.ErrInvocationTransitionConflict
	}
	expectedAttempt := attempt
	if strings.TrimSpace(input.ExpectedRawOutputHash) != invocationSHA256([]byte(attempt.RawOutput)) {
		return InvocationResponse{}, errors.New("immutable raw output hash 不一致")
	}
	revisions, err := repository.ListInvocationPreflightRevisions(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	var revision model.InvocationPreflightRevision
	for _, item := range revisions {
		if item.Revision == attempt.Revision {
			revision = item
		}
	}
	allRefs, err := repository.ListInvocationArtifactRefs(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	inputRefs := []model.InvocationArtifactRef{}
	for _, ref := range allRefs {
		if ref.Direction == "input" && ref.Attempt == attempt.Attempt && ref.Revision == attempt.Revision {
			inputRefs = append(inputRefs, ref)
		}
	}
	gates, err := repository.ListInvocationGates(userID, invocationID)
	if err != nil {
		return InvocationResponse{}, err
	}
	baseOrdinal := 0
	for _, gate := range gates {
		if gate.Attempt == attempt.Attempt && gate.ExecutionOrdinal > baseOrdinal {
			baseOrdinal = gate.ExecutionOrdinal
		}
	}
	stamp := now()
	executionGroup := baseOrdinal + 1
	correctedRaw := strings.TrimSpace(string(input.Output))
	retryPlan := InvocationRetryPlan{}
	_ = json.Unmarshal([]byte(attempt.RetryPlanJSON), &retryPlan)
	outputs, schemas, _, validationErr := validateFrozenInvocationOutputItems(revision, correctedRaw, retryPlan)
	newGates := []model.InvocationGateResult{}
	fail := func(layer string, cause error) (InvocationResponse, error) {
		attempt.Status, attempt.ErrorClass, attempt.ErrorMessage = string(model.AgentRunStatusFailed), layer, cause.Error()
		attempt.StructuredOutputJSON, attempt.UpdatedAt = canonicalCorrectionJSON(input.Output), stamp
		attempt.CorrectionTraceJSON = appendInvocationCorrectionTrace(attempt.CorrectionTraceJSON, executionGroup, false, cause.Error())
		run.Status, run.AggregateErrorSummary, run.UpdatedAt = model.InvocationStatusFailed, cause.Error(), stamp
		event := model.InvocationEvent{UserID: userID, InvocationID: run.ID, Type: "correction.failed", Level: "warning", DataJSON: `{}`, Revision: attempt.Revision, Attempt: attempt.Attempt, CreatedAt: stamp}
		if len(newGates) == 0 {
			newGates = append(newGates, invocationGate(run, attempt, executionGroup, layer, "frozen-correction", "1", false, cause, stamp))
		}
		if err := repository.RevalidateInvocationAttemptCASTx(run, expectedAttempt, attempt, nil, nil, globalInvocationFailureGates(run, attempt, newGates), event); err != nil {
			return InvocationResponse{}, err
		}
		return InvocationResponse{Run: run, Revision: run.LatestRevision, Attempt: &attempt}, nil
	}
	if inputErr := validateFrozenInvocationInputs(userID, revision, inputRefs); inputErr != nil {
		newGates = append(newGates, invocationGate(run, attempt, executionGroup, "input_contract", "frozen-input-contract", "1", false, inputErr, stamp))
		return fail("input_contract", inputErr)
	}
	newGates = append(newGates, invocationGate(run, attempt, executionGroup, "input_contract", "frozen-input-contract", "1", true, nil, stamp))
	if validationErr != nil {
		return fail("output_schema", validationErr)
	}
	for _, output := range outputs {
		if output.validationError != nil {
			newGates = append(newGates, invocationCoordinateGate(run, attempt, executionGroup, "output_schema", "frozen-dual-schema", output, output.validationError, stamp))
			return fail("output_schema", output.validationError)
		}
		validator, validatorErr := invocationBusinessValidatorFor(schemas[output.bindingName].ArtifactType)
		if validatorErr == nil {
			validatorErr = validator.Check(output.payload)
		}
		if validatorErr != nil {
			newGates = append(newGates, invocationCoordinateGate(run, attempt, executionGroup, "output_schema", "frozen-dual-schema", output, nil, stamp), invocationCoordinateGate(run, attempt, executionGroup, "business_gate", validator.ID, output, validatorErr, stamp))
			return fail("business_gate", validatorErr)
		}
	}
	artifacts, outputRefs, err := buildFrozenInvocationArtifacts(run, revision, attempt, inputRefs, outputs, schemas, retryPlan, stamp)
	if err != nil {
		return fail("output_schema", err)
	}
	preservedArtifacts, preservedRefs, _, err := loadPreservedInvocationOutputs(run, revision, attempt, retryPlan, stamp)
	if err != nil {
		return fail("output_schema", err)
	}
	allArtifacts := append(append([]model.Artifact{}, preservedArtifacts...), artifacts...)
	completionRefs := append(append([]model.InvocationArtifactRef{}, preservedRefs...), outputRefs...)
	coordinates := map[string]model.InvocationArtifactRef{}
	for _, ref := range completionRefs {
		coordinates[ref.ArtifactID] = ref
	}
	for _, artifact := range allArtifacts {
		validator, _ := invocationBusinessValidatorFor(artifact.ArtifactType)
		for _, gate := range []model.InvocationGateResult{
			invocationArtifactGate(run, attempt, artifact, executionGroup, "output_schema", "frozen-dual-schema", "1", true, nil, stamp),
			invocationArtifactGate(run, attempt, artifact, executionGroup, "business_gate", validator.ID, validator.Version, true, nil, stamp),
		} {
			coordinate := coordinates[artifact.ID]
			gate.BindingName, gate.OutputOrdinal = coordinate.BindingName, coordinate.Ordinal
			newGates = append(newGates, gate)
		}
	}
	agent, found, err := repository.GetAgentRun(attempt.AgentRunID)
	if err != nil || !found {
		if err == nil {
			err = errors.New("AgentRun 不存在")
		}
		return InvocationResponse{}, err
	}
	if err := validateInvocationPolicy(run, revision, attempt, agent); err != nil {
		newGates = append(newGates, invocationGate(run, attempt, executionGroup, "policy_gate", "frozen-side-effect-policy", "1", false, err, stamp))
		return fail("policy_gate", err)
	}
	for _, artifact := range allArtifacts {
		gate := invocationArtifactGate(run, attempt, artifact, executionGroup, "policy_gate", "frozen-side-effect-policy", "1", true, nil, stamp)
		coordinate := coordinates[artifact.ID]
		gate.BindingName, gate.OutputOrdinal = coordinate.BindingName, coordinate.Ordinal
		newGates = append(newGates, gate)
	}
	attempt.Status, attempt.StructuredOutputJSON, attempt.ErrorClass, attempt.ErrorMessage, attempt.UpdatedAt = string(model.AgentRunStatusNeedsReview), canonicalCorrectionJSON(input.Output), "", "", stamp
	attempt.CorrectionTraceJSON = appendInvocationCorrectionTrace(attempt.CorrectionTraceJSON, executionGroup, true, "")
	run.Status, run.AggregateErrorSummary, run.UpdatedAt = model.InvocationStatusNeedsReview, "", stamp
	event := model.InvocationEvent{UserID: userID, InvocationID: run.ID, Type: "correction.needs_review", Level: "info", DataJSON: `{}`, Revision: attempt.Revision, Attempt: attempt.Attempt, CreatedAt: stamp}
	if err := repository.RevalidateInvocationAttemptCASTx(run, expectedAttempt, attempt, artifacts, completionRefs, newGates, event); err != nil {
		return InvocationResponse{}, err
	}
	return InvocationResponse{Run: run, Revision: run.LatestRevision, Attempt: &attempt}, nil
}

func canonicalCorrectionJSON(raw json.RawMessage) string {
	value, err := decodeCanonicalJSON(raw)
	if err != nil {
		return strings.TrimSpace(string(raw))
	}
	canonical, err := marshalInvocationCanonical(value)
	if err != nil {
		return strings.TrimSpace(string(raw))
	}
	return string(canonical)
}

func appendInvocationCorrectionTrace(raw string, ordinal int, passed bool, message string) string {
	var trace []map[string]any
	_ = json.Unmarshal([]byte(raw), &trace)
	trace = append(trace, map[string]any{"type": "correction.validation", "executionOrdinal": ordinal, "previousTraceHash": invocationSHA256([]byte(raw)), "passed": passed, "message": message})
	encoded, _ := json.Marshal(trace)
	return string(encoded)
}

func validateInvocationReviewSet(userID string, run model.InvocationRun, refs []model.InvocationArtifactRef) error {
	revisions, err := repository.ListInvocationPreflightRevisions(userID, run.ID)
	if err != nil {
		return err
	}
	var revision model.InvocationPreflightRevision
	for _, item := range revisions {
		if item.Revision == run.LatestRevision {
			revision = item
		}
	}
	skill, err := frozenInvocationSkill(revision)
	if err != nil {
		return err
	}
	outputs := []model.InvocationArtifactRef{}
	counts := map[string]int{}
	ordinals := map[string]map[int]bool{}
	declared := map[string]bool{}
	for _, spec := range skill.Package.OutputContract.ArtifactOutputs {
		declared[spec.BindingName] = true
	}
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == run.LatestAttempt {
			if !declared[ref.BindingName] {
				return errors.New("当前 attempt 包含未声明输出 binding")
			}
			outputs = append(outputs, ref)
			counts[ref.BindingName]++
			if ordinals[ref.BindingName] == nil {
				ordinals[ref.BindingName] = map[int]bool{}
			}
			if ref.Ordinal < 0 || ordinals[ref.BindingName][ref.Ordinal] {
				return errors.New("当前 attempt 输出 ordinal 无效")
			}
			ordinals[ref.BindingName][ref.Ordinal] = true
		}
	}
	for _, spec := range skill.Package.OutputContract.ArtifactOutputs {
		if counts[spec.BindingName] < spec.Min || counts[spec.BindingName] > spec.Max {
			return errors.New("当前 attempt 输出 cardinality 不完整")
		}
		for ordinal := 0; ordinal < counts[spec.BindingName]; ordinal++ {
			if !ordinals[spec.BindingName][ordinal] {
				return errors.New("当前 attempt 输出 ordinal 不连续")
			}
		}
	}
	artifacts, err := repository.GetUserArtifactsByIDs(userID, invocationRefIDs(outputs))
	if err != nil {
		return err
	}
	for _, ref := range outputs {
		artifact, ok := artifacts[ref.ArtifactID]
		if !ok || artifact.ContentHash != ref.ArtifactHash || artifact.ArtifactType != ref.ArtifactType || artifact.SchemaVersion != ref.SchemaVersion || artifact.SchemaContentHash != ref.SchemaContentHash || artifact.ProjectID != run.ProjectID || artifact.EpisodeID != run.EpisodeID {
			return errors.New("Artifact-set ref/hash/schema 不一致")
		}
	}
	gates, err := repository.ListInvocationGates(userID, run.ID)
	if err != nil {
		return err
	}
	passedInput := false
	latestGroup := 0
	attempts, _ := repository.ListInvocationAttempts(userID, run.ID)
	corrected := false
	for _, attempt := range attempts {
		if attempt.Attempt == run.LatestAttempt && strings.TrimSpace(attempt.CorrectionTraceJSON) != "" {
			corrected = true
		}
	}
	if corrected {
		for _, gate := range gates {
			if gate.Attempt == run.LatestAttempt && gate.ExecutionOrdinal > latestGroup {
				latestGroup = gate.ExecutionOrdinal
			}
		}
	}
	layers := map[string]map[string]bool{"output_schema": {}, "business_gate": {}, "policy_gate": {}}
	for _, gate := range gates {
		if gate.Attempt != run.LatestAttempt {
			continue
		}
		if corrected && gate.ExecutionOrdinal != latestGroup {
			continue
		}
		if !gate.Passed {
			continue
		}
		if gate.Layer == "input_contract" {
			passedInput = true
		}
		if _, ok := layers[gate.Layer]; ok && gate.ArtifactID != "" {
			layers[gate.Layer][gate.ArtifactID] = true
		}
	}
	if !passedInput {
		return errors.New("当前 attempt 缺少 input contract gate")
	}
	for _, ref := range outputs {
		for _, layer := range []string{"output_schema", "business_gate", "policy_gate"} {
			if !layers[layer][ref.ArtifactID] {
				return errors.New("当前 Artifact-set 缺少 frozen gate")
			}
		}
	}
	return nil
}

func replayInvocationReview(run model.InvocationRun, decision string, input InvocationReviewInput) (InvocationResponse, error) {
	reviews, err := repository.ListInvocationReviews(run.UserID, run.ID)
	if err != nil {
		return InvocationResponse{}, err
	}
	for _, review := range reviews {
		if review.Attempt != input.Attempt || review.ArtifactSetHash != input.ArtifactSetHash {
			continue
		}
		if review.Decision != decision || review.Comment != input.Comment || review.ActorID != run.UserID {
			return InvocationResponse{}, repository.ErrInvocationTransitionConflict
		}
		attempts, _ := repository.ListInvocationAttempts(run.UserID, run.ID)
		for index := range attempts {
			if attempts[index].Attempt == run.LatestAttempt {
				return InvocationResponse{Run: run, Revision: run.LatestRevision, Attempt: &attempts[index]}, nil
			}
		}
		return InvocationResponse{Run: run, Revision: run.LatestRevision}, nil
	}
	return InvocationResponse{}, repository.ErrInvocationTransitionConflict
}

func buildInvocationRetryPlan(revision model.InvocationPreflightRevision, previous model.InvocationAttempt, refs []model.InvocationArtifactRef, gates []model.InvocationGateResult) (InvocationRetryPlan, error) {
	skill, err := frozenInvocationSkill(revision)
	if err != nil {
		return InvocationRetryPlan{}, err
	}
	if previous.Status == string(model.AgentRunStatusFailed) || previous.Status == string(model.AgentRunStatusCancelled) {
		var inherited InvocationRetryPlan
		if strings.TrimSpace(previous.RetryPlanJSON) != "" && json.Unmarshal([]byte(previous.RetryPlanJSON), &inherited) != nil {
			return InvocationRetryPlan{}, errors.New("previous immutable RetryPlan 无效")
		}
		if len(inherited.PreservedOutputRefs) > 0 || len(inherited.RequestedOutputs) > 0 || len(inherited.RejectedParentArtifactIDs) > 0 {
			return normalizeInvocationRetryPlan(inherited), nil
		}
	}
	plan := InvocationRetryPlan{PreservedOutputRefs: []InvocationRetryOutputRef{}, RequestedOutputs: []InvocationOutputCoordinate{}, RejectedParentArtifactIDs: []string{}}
	preserved := map[string]bool{}
	previousRefs := []model.InvocationArtifactRef{}
	for _, ref := range refs {
		if ref.Direction != "output" || ref.Attempt != previous.Attempt {
			continue
		}
		previousRefs = append(previousRefs, ref)
		if previous.Status == "partial" {
			plan.PreservedOutputRefs = append(plan.PreservedOutputRefs, InvocationRetryOutputRef{BindingName: ref.BindingName, Ordinal: ref.Ordinal, ArtifactID: ref.ArtifactID, ArtifactHash: ref.ArtifactHash, ArtifactType: ref.ArtifactType, SchemaVersion: ref.SchemaVersion, SchemaContentHash: ref.SchemaContentHash})
			preserved[ref.BindingName+"\x00"+strconv.Itoa(ref.Ordinal)] = true
		}
		if previous.Status == string(model.AgentRunStatusRejected) {
			plan.RejectedParentArtifactIDs = append(plan.RejectedParentArtifactIDs, ref.ArtifactID)
		}
	}
	if previous.Status == "partial" {
		seen := map[string]bool{}
		for _, gate := range gates {
			if gate.Attempt != previous.Attempt || gate.Passed || gate.BindingName == "" || gate.OutputOrdinal < 0 {
				continue
			}
			key := gate.BindingName + "\x00" + strconv.Itoa(gate.OutputOrdinal)
			if !seen[key] {
				plan.RequestedOutputs = append(plan.RequestedOutputs, InvocationOutputCoordinate{BindingName: gate.BindingName, Ordinal: gate.OutputOrdinal})
				seen[key] = true
			}
		}
		if len(plan.RequestedOutputs) == 0 {
			return InvocationRetryPlan{}, errors.New("partial attempt 缺少失败输出坐标")
		}
		return normalizeInvocationRetryPlan(plan), nil
	}
	if previous.Status == string(model.AgentRunStatusRejected) {
		for _, ref := range previousRefs {
			plan.RequestedOutputs = append(plan.RequestedOutputs, InvocationOutputCoordinate{BindingName: ref.BindingName, Ordinal: ref.Ordinal})
		}
		return normalizeInvocationRetryPlan(plan), nil
	}
	for _, spec := range skill.Package.OutputContract.ArtifactOutputs {
		for ordinal := 0; ordinal < spec.Min; ordinal++ {
			if !preserved[spec.BindingName+"\x00"+strconv.Itoa(ordinal)] {
				plan.RequestedOutputs = append(plan.RequestedOutputs, InvocationOutputCoordinate{BindingName: spec.BindingName, Ordinal: ordinal})
			}
		}
	}
	return normalizeInvocationRetryPlan(plan), nil
}

func normalizeInvocationRetryPlan(plan InvocationRetryPlan) InvocationRetryPlan {
	sort.Slice(plan.PreservedOutputRefs, func(i, j int) bool {
		if plan.PreservedOutputRefs[i].BindingName != plan.PreservedOutputRefs[j].BindingName {
			return plan.PreservedOutputRefs[i].BindingName < plan.PreservedOutputRefs[j].BindingName
		}
		return plan.PreservedOutputRefs[i].Ordinal < plan.PreservedOutputRefs[j].Ordinal
	})
	sort.Slice(plan.RequestedOutputs, func(i, j int) bool {
		if plan.RequestedOutputs[i].BindingName != plan.RequestedOutputs[j].BindingName {
			return plan.RequestedOutputs[i].BindingName < plan.RequestedOutputs[j].BindingName
		}
		return plan.RequestedOutputs[i].Ordinal < plan.RequestedOutputs[j].Ordinal
	})
	plan.RejectedParentArtifactIDs = normalizedStringSet(plan.RejectedParentArtifactIDs, false)
	return plan
}

func confirmedInvocationReplay(run model.InvocationRun, provided []string) (InvocationResponse, error) {
	if run.LatestAttempt < 1 {
		return InvocationResponse{}, repository.ErrInvocationTransitionConflict
	}
	events, err := repository.ListInvocationEvents(run.UserID, run.ID, 0, model.MaxPageSize)
	if err != nil {
		return InvocationResponse{}, err
	}
	var recorded []string
	for _, event := range events {
		if event.Type != "attempt.queued" || event.Attempt != run.LatestAttempt || event.Revision != run.LatestRevision {
			continue
		}
		var data struct {
			ConfirmedRequirements []string `json:"confirmedRequirements"`
		}
		if json.Unmarshal([]byte(event.DataJSON), &data) == nil {
			recorded = normalizedStringSet(data.ConfirmedRequirements, true)
		}
	}
	if !sameInvocationStrings(recorded, provided) {
		return InvocationResponse{}, repository.ErrInvocationTransitionConflict
	}
	attempts, err := repository.ListInvocationAttempts(run.UserID, run.ID)
	if err != nil {
		return InvocationResponse{}, err
	}
	for index := range attempts {
		if attempts[index].Attempt == run.LatestAttempt {
			return InvocationResponse{Run: run, Revision: run.LatestRevision, Attempt: &attempts[index]}, nil
		}
	}
	return InvocationResponse{}, repository.ErrInvocationTransitionConflict
}

func sameInvocationStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
