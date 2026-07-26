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

type workflowInvocationProjection struct {
	Stage     model.WorkflowStageRun
	Artifacts []model.WorkflowArtifact
	Gates     []model.WorkflowQualityGateResult
	AgentRuns []model.AgentRun
}

func projectWorkflowInvocation(userID string, stage model.WorkflowStageRun) (workflowInvocationProjection, error) {
	result := workflowInvocationProjection{Stage: stage, Artifacts: []model.WorkflowArtifact{}, Gates: []model.WorkflowQualityGateResult{}, AgentRuns: []model.AgentRun{}}
	if strings.TrimSpace(stage.InvocationID) == "" {
		return result, nil
	}
	detail, err := GetInvocationDetail(userID, stage.InvocationID)
	if err != nil {
		return result, err
	}
	result.Stage.Status = workflowStageStatusFromInvocation(detail.Run.Status)
	result.Stage.Attempt = detail.Run.LatestAttempt
	result.Stage.ErrorMessage = ""
	if detail.Run.Status == model.InvocationStatusFailed || detail.Run.Status == model.InvocationStatusBlocked || detail.Run.Status == model.InvocationStatusPartial {
		run, _, _ := repository.GetUserInvocation(userID, stage.InvocationID)
		result.Stage.ErrorMessage = run.AggregateErrorSummary
	}
	attempts, err := repository.ListInvocationAttempts(userID, stage.InvocationID)
	if err != nil {
		return result, err
	}
	var current model.InvocationAttempt
	for _, attempt := range attempts {
		if attempt.Attempt == detail.Run.LatestAttempt {
			current = attempt
		}
	}
	if current.ID != "" {
		result.Stage.AgentRunID = current.AgentRunID
		result.Stage.EstimatedCredits = current.CreditsReserved
		result.Stage.StartedAt, result.Stage.FinishedAt = current.StartedAt, current.FinishedAt
		if agentRun, ok, err := repository.GetAgentRun(current.AgentRunID); err != nil {
			return result, err
		} else if ok {
			result.AgentRuns = append(result.AgentRuns, agentRun)
			if result.Stage.EstimatedCredits == 0 {
				result.Stage.EstimatedCredits = agentRun.EstimatedCredits
			}
		}
	}
	if detail.Run.LatestAttempt > 0 && len(detail.OutputArtifacts) > 0 && detail.ArtifactSetHash != "" {
		artifact, gate, err := workflowInvocationArtifactSet(userID, stage, detail)
		if err != nil {
			return result, err
		}
		result.Stage.OutputArtifactID = artifact.ID
		result.Stage.ProgressCurrent = 1
		result.Artifacts = append(result.Artifacts, artifact)
		result.Gates = append(result.Gates, gate)
	}
	for _, review := range detail.Reviews {
		if review.Attempt != detail.Run.ReviewedAttempt {
			continue
		}
		result.Stage.ReviewDecision = review.Decision
		result.Stage.ReviewedArtifactHash = review.ArtifactSetHash
		result.Stage.ReviewComment = review.Comment
		result.Stage.ReviewedAt = review.CreatedAt
	}
	if len(detail.ApplyAttempts) > 0 {
		latest := detail.ApplyAttempts[len(detail.ApplyAttempts)-1]
		receipt, _ := json.Marshal(latest)
		result.Stage.ApplyReceiptJSON = string(receipt)
		result.Stage.AppliedAt = latest.UpdatedAt
	}
	result.Stage.UpdatedAt = detail.Run.UpdatedAt
	return result, nil
}

func workflowInvocationArtifactSet(userID string, stage model.WorkflowStageRun, detail InvocationDetail) (model.WorkflowArtifact, model.WorkflowQualityGateResult, error) {
	content, err := workflowArtifactSetContent(userID, stage.StageID, detail)
	if err != nil {
		return model.WorkflowArtifact{}, model.WorkflowQualityGateResult{}, err
	}
	id := workflowArtifactSetID(stage.InvocationID, detail.Run.LatestAttempt)
	artifactIDs := make([]string, 0, len(detail.OutputArtifacts))
	for _, output := range detail.OutputArtifacts {
		artifactIDs = append(artifactIDs, output.Artifact.ID)
	}
	sort.Strings(artifactIDs)
	artifact := model.WorkflowArtifact{
		ID: id, UserID: stage.UserID, WorkflowRunID: stage.WorkflowRunID, StageRunID: stage.ID,
		AgentRunID: stage.AgentRunID, Kind: stage.StageID, Version: detail.Run.LatestAttempt,
		SchemaVersion: workflowArtifactSchemaVersion, TemplateVersion: VideoWorkflowVersion,
		ContentJSON: string(content), ContentHash: detail.ArtifactSetHash, ArtifactSetHash: detail.ArtifactSetHash,
		ArtifactIDs: artifactIDs, CreatedAt: stage.CreatedAt,
	}
	passed, issues, createdAt := true, []string{}, ""
	for _, attempt := range detail.Attempts {
		if attempt.Attempt != detail.Run.LatestAttempt {
			continue
		}
		for _, gate := range attempt.Gates {
			if !gate.Passed {
				passed = false
			}
			var gateIssues []string
			_ = json.Unmarshal([]byte(gate.IssuesJSON), &gateIssues)
			issues = append(issues, gateIssues...)
			if createdAt == "" || gate.CreatedAt > createdAt {
				createdAt = gate.CreatedAt
			}
		}
	}
	issuesJSON, _ := json.Marshal(issues)
	gate := model.WorkflowQualityGateResult{
		ID: deterministicInvocationID("workflowgateprojection", stage.InvocationID, detail.ArtifactSetHash), UserID: stage.UserID,
		WorkflowRunID: stage.WorkflowRunID, StageRunID: stage.ID, ArtifactID: id, ArtifactHash: detail.ArtifactSetHash,
		ValidatorVersion: "invocation-runtime-v1", Passed: passed, IssuesJSON: string(issuesJSON), CreatedAt: createdAt,
	}
	return artifact, gate, nil
}

func workflowArtifactSetID(invocationID string, attempt int) string {
	return deterministicInvocationID("workflowartifactset", invocationID, strconv.Itoa(attempt))
}

func workflowArtifactSetContent(userID, stageID string, detail InvocationDetail) (json.RawMessage, error) {
	if len(detail.OutputArtifacts) == 0 {
		return nil, errors.New("Invocation 没有可投影输出")
	}
	if stageID != WorkflowStageAssetImagePrompt {
		if len(detail.OutputArtifacts) == 1 {
			return json.Marshal(detail.OutputArtifacts[0].Payload)
		}
		items := make([]map[string]any, 0, len(detail.OutputArtifacts))
		for _, output := range detail.OutputArtifacts {
			items = append(items, output.Payload)
		}
		return json.Marshal(map[string]any{"items": items})
	}
	catalog := map[string]map[string]any{}
	for _, ref := range detail.AuthoritativeArtifactRefs {
		if ref.Direction != "input" || ref.ArtifactType != "asset_catalog" {
			continue
		}
		input, err := GetArtifact(userID, ref.ArtifactID)
		if err != nil {
			return nil, err
		}
		for _, item := range invocationObjectItems(input.Payload, "items") {
			catalog[invocationString(item, "assetId")] = item
		}
	}
	items := make([]map[string]any, 0, len(detail.OutputArtifacts))
	for _, output := range detail.OutputArtifacts {
		assetID := invocationString(output.Payload, "assetId")
		source := catalog[assetID]
		item := map[string]any{
			"logicalAssetId": assetID, "assetId": assetID, "kind": invocationString(source, "kind"),
			"name": invocationString(source, "name"), "sourceEvidence": source["sourceEvidence"], "coreFacts": source["coreFacts"],
			"imagePrompt": invocationString(output.Payload, "brief"), "brief": invocationString(output.Payload, "brief"),
			"format": invocationString(output.Payload, "format"), "status": "ready",
		}
		items = append(items, item)
	}
	return json.Marshal(map[string]any{"items": items})
}

func workflowStageStatusFromInvocation(status model.InvocationStatus) model.WorkflowStageRunStatus {
	switch status {
	case model.InvocationStatusQueued:
		return model.WorkflowStageRunStatusQueued
	case model.InvocationStatusRunning:
		return model.WorkflowStageRunStatusRunning
	case model.InvocationStatusCancelRequested:
		return model.WorkflowStageRunStatusCancelRequested
	case model.InvocationStatusNeedsReview:
		return model.WorkflowStageRunStatusNeedsReview
	case model.InvocationStatusApproved:
		return model.WorkflowStageRunStatusApproved
	case model.InvocationStatusRejected:
		return model.WorkflowStageRunStatusRejected
	case model.InvocationStatusApplied:
		return model.WorkflowStageRunStatusApplied
	case model.InvocationStatusCancelled:
		return model.WorkflowStageRunStatusCancelled
	case model.InvocationStatusFailed, model.InvocationStatusBlocked, model.InvocationStatusPartial:
		return model.WorkflowStageRunStatusFailed
	default:
		return model.WorkflowStageRunStatusReady
	}
}
