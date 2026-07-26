package service

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

var invocationApplyAdapters = map[string]InvocationApplyAdapter{
	"test_sink": invocationTestSinkAdapter{},
}

func ApplyInvocation(userID, invocationID string, input InvocationApplyInput) (model.InvocationApplyAttempt, error) {
	userID, invocationID = strings.TrimSpace(userID), strings.TrimSpace(invocationID)
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	input.ArtifactSetHash = strings.TrimSpace(input.ArtifactSetHash)
	input.Target = strings.ToLower(strings.TrimSpace(input.Target))
	input.TargetID = strings.TrimSpace(input.TargetID)
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
		Attempt         int    `json:"attempt"`
		ArtifactSetHash string `json:"artifactSetHash"`
		Target          string `json:"target"`
		TargetID        string `json:"targetId"`
	}{input.Attempt, input.ArtifactSetHash, input.Target, input.TargetID}
	canonical, err := marshalInvocationCanonical(requestBody)
	if err != nil {
		return model.InvocationApplyAttempt{}, err
	}
	stamp := now()
	apply := model.InvocationApplyAttempt{ID: newID("invocationapply"), UserID: userID, InvocationID: invocationID, IdempotencyKey: input.IdempotencyKey, RequestHash: invocationSHA256(canonical), ArtifactSetHash: input.ArtifactSetHash, Target: input.Target, TargetID: input.TargetID, Attempt: input.Attempt, CreatedAt: stamp, UpdatedAt: stamp}
	context := InvocationApplyContext{UserID: userID, InvocationID: invocationID, ApplyAttemptID: apply.ID, IdempotencyKey: input.IdempotencyKey, Attempt: input.Attempt, ArtifactSetHash: input.ArtifactSetHash, TargetID: input.TargetID, ArtifactRefs: setRefs, Artifacts: artifacts, CreatedAt: stamp}
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
