package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

var invocationApplyAdapters = map[string]InvocationApplyAdapter{
	"test_sink":              invocationTestSinkAdapter{},
	"workflow_local_receipt": workflowLocalReceiptAdapter{},
	"client_local_receipt":   clientLocalReceiptAdapter{},
}

type workflowLocalApplyPayload struct {
	WorkflowRunID string             `json:"workflowRunId"`
	StageRunID    string             `json:"stageRunId"`
	Receipt       WorkflowApplyInput `json:"receipt"`
}

type clientLocalApplyPayload struct {
	Surface     string   `json:"surface"`
	TargetKind  string   `json:"targetKind"`
	TargetID    string   `json:"targetId"`
	ArtifactIDs []string `json:"artifactIds"`
}

func ApplyInvocation(userID, invocationID string, input InvocationApplyInput) (model.InvocationApplyAttempt, error) {
	userID, invocationID = strings.TrimSpace(userID), strings.TrimSpace(invocationID)
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	input.ArtifactSetHash = strings.TrimSpace(input.ArtifactSetHash)
	input.Target = strings.ToLower(strings.TrimSpace(input.Target))
	input.TargetID = strings.TrimSpace(input.TargetID)
	if len(input.Payload) == 0 {
		input.Payload = json.RawMessage(`{}`)
	}
	if len(input.Payload) > maxWorkflowArtifactBytes || !json.Valid(input.Payload) {
		return model.InvocationApplyAttempt{}, errors.New("Apply payload 无效或过大")
	}
	var payloadValue any
	if json.Unmarshal(input.Payload, &payloadValue) != nil {
		return model.InvocationApplyAttempt{}, errors.New("Apply payload 无效")
	}
	canonicalPayload, err := marshalInvocationCanonical(payloadValue)
	if err != nil {
		return model.InvocationApplyAttempt{}, err
	}
	input.Payload = canonicalPayload
	if input.IdempotencyKey == "" || input.TargetID == "" {
		return model.InvocationApplyAttempt{}, errors.New("Apply idempotencyKey/targetID 不能为空")
	}
	adapter, ok := invocationApplyAdapters[input.Target]
	if !ok || adapter.TargetName() != input.Target {
		return model.InvocationApplyAttempt{}, errors.New("Apply target 未在 server adapter registry 注册")
	}
	run, found, err := repository.GetUserInvocation(userID, invocationID)
	if err != nil {
		return model.InvocationApplyAttempt{}, err
	}
	if !found {
		return model.InvocationApplyAttempt{}, repository.ErrInvocationNotFound
	}
	if (run.Status != model.InvocationStatusApproved && run.Status != model.InvocationStatusApplied) || input.Attempt != run.LatestAttempt || input.Attempt != run.ReviewedAttempt || input.ArtifactSetHash != run.ReviewedArtifactSetHash {
		return model.InvocationApplyAttempt{}, errors.New("只能 Apply 当前 approved Artifact-set")
	}
	refs, err := repository.ListInvocationArtifactRefs(userID, invocationID)
	if err != nil {
		return model.InvocationApplyAttempt{}, err
	}
	setRefs := make([]model.InvocationArtifactRef, 0)
	for _, ref := range refs {
		if ref.Direction == "output" && ref.Attempt == input.Attempt {
			setRefs = append(setRefs, ref)
		}
	}
	if invocationArtifactSetHash(setRefs, input.Attempt) != input.ArtifactSetHash {
		return model.InvocationApplyAttempt{}, errors.New("reviewed Artifact-set 已变化")
	}
	stored, err := repository.GetUserArtifactsByIDs(userID, invocationRefIDs(setRefs))
	if err != nil {
		return model.InvocationApplyAttempt{}, err
	}
	artifacts := make([]model.Artifact, 0, len(setRefs))
	for _, ref := range setRefs {
		artifact, ok := stored[ref.ArtifactID]
		if !ok || artifact.ContentHash != ref.ArtifactHash {
			return model.InvocationApplyAttempt{}, errors.New("reviewed Artifact-set ref/hash 已变化")
		}
		artifacts = append(artifacts, artifact)
	}
	requestBody := struct {
		Attempt         int             `json:"attempt"`
		ArtifactSetHash string          `json:"artifactSetHash"`
		Target          string          `json:"target"`
		TargetID        string          `json:"targetId"`
		Payload         json.RawMessage `json:"payload"`
	}{input.Attempt, input.ArtifactSetHash, input.Target, input.TargetID, input.Payload}
	canonical, err := marshalInvocationCanonical(requestBody)
	if err != nil {
		return model.InvocationApplyAttempt{}, err
	}
	stamp := now()
	apply := model.InvocationApplyAttempt{ID: newID("invocationapply"), UserID: userID, InvocationID: invocationID, IdempotencyKey: input.IdempotencyKey, RequestHash: invocationSHA256(canonical), ArtifactSetHash: input.ArtifactSetHash, Target: input.Target, TargetID: input.TargetID, Attempt: input.Attempt, CreatedAt: stamp, UpdatedAt: stamp}
	context := InvocationApplyContext{UserID: userID, InvocationID: invocationID, ApplyAttemptID: apply.ID, IdempotencyKey: input.IdempotencyKey, Attempt: input.Attempt, ArtifactSetHash: input.ArtifactSetHash, TargetID: input.TargetID, ArtifactRefs: setRefs, Artifacts: artifacts, Payload: input.Payload, CreatedAt: stamp}
	wantedRun := run
	wantedRun.Status, wantedRun.AggregateErrorSummary, wantedRun.UpdatedAt = model.InvocationStatusApplied, "", stamp
	event := model.InvocationEvent{UserID: userID, InvocationID: invocationID, Type: "apply.completed", Level: "info", DataJSON: `{}`, Revision: run.LatestRevision, Attempt: input.Attempt, CreatedAt: stamp}
	result, _, err := repository.ApplyInvocationTx(wantedRun, apply, event, func(tx *gorm.DB) (json.RawMessage, error) {
		return adapter.ApplyTx(tx, context)
	})
	return result, err
}

type invocationTestSinkAdapter struct{}

func (invocationTestSinkAdapter) TargetName() string { return "test_sink" }

func (invocationTestSinkAdapter) ApplyTx(tx *gorm.DB, context InvocationApplyContext) (json.RawMessage, error) {
	payload, err := marshalInvocationCanonical(map[string]any{"artifactSetHash": context.ArtifactSetHash, "artifactIds": invocationRefIDs(context.ArtifactRefs), "targetId": context.TargetID})
	if err != nil {
		return nil, err
	}
	receipt := model.InvocationTestSinkReceipt{ID: deterministicInvocationID("testsinkreceipt", context.ApplyAttemptID), UserID: context.UserID, InvocationID: context.InvocationID, ApplyAttemptID: context.ApplyAttemptID, TargetID: context.TargetID, ArtifactSetHash: context.ArtifactSetHash, PayloadJSON: string(payload), CreatedAt: context.CreatedAt}
	if err := tx.Create(&receipt).Error; err != nil {
		return nil, err
	}
	encoded, _ := json.Marshal(map[string]string{"receiptId": receipt.ID, "targetId": receipt.TargetID})
	return encoded, nil
}

type workflowLocalReceiptAdapter struct{}

func (workflowLocalReceiptAdapter) TargetName() string { return "workflow_local_receipt" }

func (workflowLocalReceiptAdapter) ApplyTx(tx *gorm.DB, context InvocationApplyContext) (json.RawMessage, error) {
	var payload workflowLocalApplyPayload
	if json.Unmarshal(context.Payload, &payload) != nil || strings.TrimSpace(payload.WorkflowRunID) == "" || strings.TrimSpace(payload.StageRunID) == "" {
		return nil, errors.New("Workflow Apply 回执坐标无效")
	}
	if payload.StageRunID != context.TargetID || len(payload.Receipt.TargetIDs) > 5000 || len(payload.Receipt.Errors) > 100 {
		return nil, errors.New("Workflow Apply 回执范围无效")
	}
	var stage model.WorkflowStageRun
	result := tx.Where("id = ? AND user_id = ? AND workflow_run_id = ? AND invocation_id = ?", payload.StageRunID, context.UserID, payload.WorkflowRunID, context.InvocationID).Limit(1).Find(&stage)
	if result.Error != nil || result.RowsAffected != 1 {
		return nil, errors.New("Workflow Apply 阶段不存在或 Invocation 不匹配")
	}
	targetIDs, _ := marshalInvocationCanonical(payload.Receipt.TargetIDs)
	errorsJSON, _ := marshalInvocationCanonical(payload.Receipt.Errors)
	metadata := payload.Receipt.Metadata
	if len(metadata) == 0 {
		metadata = json.RawMessage(`null`)
	}
	receipt := model.WorkflowLocalApplyReceipt{
		ID: deterministicInvocationID("workflowreceipt", context.ApplyAttemptID), UserID: context.UserID,
		InvocationID: context.InvocationID, ApplyAttemptID: context.ApplyAttemptID, WorkflowRunID: payload.WorkflowRunID,
		StageRunID: payload.StageRunID, Target: strings.TrimSpace(payload.Receipt.Target), TargetIDsJSON: string(targetIDs),
		AppliedCount: payload.Receipt.AppliedCount, SkippedCount: payload.Receipt.SkippedCount, Version: strings.TrimSpace(payload.Receipt.Version),
		ErrorsJSON: string(errorsJSON), MetadataJSON: string(metadata), PayloadJSON: string(context.Payload), CreatedAt: context.CreatedAt,
	}
	if err := tx.Create(&receipt).Error; err != nil {
		return nil, err
	}
	encoded, _ := json.Marshal(map[string]string{"receiptId": receipt.ID, "stageRunId": receipt.StageRunID})
	return encoded, nil
}

type clientLocalReceiptAdapter struct{}

func (clientLocalReceiptAdapter) TargetName() string { return "client_local_receipt" }

func (clientLocalReceiptAdapter) ApplyTx(_ *gorm.DB, context InvocationApplyContext) (json.RawMessage, error) {
	var payload clientLocalApplyPayload
	decoder := json.NewDecoder(bytes.NewReader(context.Payload))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&payload) != nil {
		return nil, errors.New("客户端 Apply 回执无效")
	}
	payload.Surface = strings.ToLower(strings.TrimSpace(payload.Surface))
	payload.TargetKind = strings.ToLower(strings.TrimSpace(payload.TargetKind))
	payload.TargetID = strings.TrimSpace(payload.TargetID)
	if (payload.Surface != "image" && payload.Surface != "canvas") ||
		(payload.TargetKind != "prompt" && payload.TargetKind != "node" && payload.TargetKind != "message" && payload.TargetKind != "asset") ||
		payload.TargetID != context.TargetID || len(payload.ArtifactIDs) == 0 || len(payload.ArtifactIDs) > 100 {
		return nil, errors.New("客户端 Apply 回执范围无效")
	}
	approved := make(map[string]bool, len(context.ArtifactRefs))
	for _, ref := range context.ArtifactRefs {
		approved[ref.ArtifactID] = true
	}
	seen := make(map[string]bool, len(payload.ArtifactIDs))
	for index, artifactID := range payload.ArtifactIDs {
		artifactID = strings.TrimSpace(artifactID)
		if artifactID == "" || !approved[artifactID] || seen[artifactID] {
			return nil, errors.New("客户端 Apply Artifact 不属于当前 approved Artifact-set")
		}
		payload.ArtifactIDs[index], seen[artifactID] = artifactID, true
	}
	return marshalInvocationCanonical(payload)
}
