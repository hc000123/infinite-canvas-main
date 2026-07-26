package service

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const invocationDetailEventsLimit = 100

func PreflightDirectInvocation(userID string, input InvocationRequest) (InvocationPreflightSnapshot, error) {
	if strings.ToLower(strings.TrimSpace(input.Source)) != "direct" {
		return InvocationPreflightSnapshot{}, errors.New("HTTP Invocation 仅支持 direct source")
	}
	return PreflightInvocation(userID, input)
}

func RepreflightDirectInvocation(userID, invocationID string, input InvocationRequest) (InvocationPreflightSnapshot, error) {
	if strings.ToLower(strings.TrimSpace(input.Source)) != "direct" {
		return InvocationPreflightSnapshot{}, errors.New("HTTP Invocation 仅支持 direct source")
	}
	return RepreflightInvocation(userID, invocationID, input)
}

func ListInvocations(userID string, query model.InvocationQuery) (InvocationList, error) {
	query.Normalize()
	items, total, err := repository.ListUserInvocations(strings.TrimSpace(userID), query)
	if err != nil {
		return InvocationList{}, err
	}
	summaries := make([]InvocationRunSummary, 0, len(items))
	for _, item := range items {
		summaries = append(summaries, invocationRunSummary(item))
	}
	return InvocationList{Items: summaries, Total: total, Page: query.Page, PageSize: query.PageSize}, nil
}

func GetInvocationDetail(userID, invocationID string) (InvocationDetail, error) {
	userID, invocationID = strings.TrimSpace(userID), strings.TrimSpace(invocationID)
	run, found, err := repository.GetUserInvocation(userID, invocationID)
	if err != nil {
		return InvocationDetail{}, err
	}
	if !found {
		return InvocationDetail{}, repository.ErrInvocationNotFound
	}
	storedRevisions, err := repository.ListInvocationPreflightRevisions(userID, invocationID)
	if err != nil {
		return InvocationDetail{}, err
	}
	refs, err := repository.ListInvocationArtifactRefs(userID, invocationID)
	if err != nil {
		return InvocationDetail{}, err
	}
	attempts, err := repository.ListInvocationAttempts(userID, invocationID)
	if err != nil {
		return InvocationDetail{}, err
	}
	gates, err := repository.ListInvocationGates(userID, invocationID)
	if err != nil {
		return InvocationDetail{}, err
	}
	reviews, err := repository.ListInvocationReviews(userID, invocationID)
	if err != nil {
		return InvocationDetail{}, err
	}
	applies, err := repository.ListInvocationApplyAttempts(userID, invocationID)
	if err != nil {
		return InvocationDetail{}, err
	}
	events, err := repository.ListInvocationEvents(userID, invocationID, 0, invocationDetailEventsLimit+1)
	if err != nil {
		return InvocationDetail{}, err
	}
	eventsHasMore := len(events) > invocationDetailEventsLimit
	if eventsHasMore {
		events = events[:invocationDetailEventsLimit]
	}
	var eventsNextAfter uint64
	if eventsHasMore && len(events) > 0 {
		eventsNextAfter = events[len(events)-1].ID
	}
	var latestAttempt *model.InvocationAttempt
	for index := range attempts {
		if attempts[index].Attempt == run.LatestAttempt {
			latestAttempt = &attempts[index]
		}
	}
	inputAttempt, outputAttempt := 0, 0
	includeOutputs := latestAttempt != nil && latestAttempt.Revision == run.LatestRevision
	if includeOutputs {
		inputAttempt, outputAttempt = run.LatestAttempt, run.LatestAttempt
	}
	authoritativeRefs := make([]model.InvocationArtifactRef, 0)
	for _, ref := range refs {
		if ref.Revision != run.LatestRevision {
			continue
		}
		if (ref.Direction == "input" && ref.Attempt == inputAttempt) ||
			(includeOutputs && ref.Direction == "output" && ref.Attempt == outputAttempt) {
			authoritativeRefs = append(authoritativeRefs, ref)
		}
	}
	outputRefs := make([]model.InvocationArtifactRef, 0)
	outputIDs := make([]string, 0)
	for _, ref := range authoritativeRefs {
		if ref.Direction == "output" {
			outputRefs = append(outputRefs, ref)
			outputIDs = append(outputIDs, ref.ArtifactID)
		}
	}
	envelopes, err := invocationOutputEnvelopes(userID, outputIDs)
	if err != nil {
		return InvocationDetail{}, err
	}
	revisions := make([]InvocationRevisionDetail, 0, len(storedRevisions))
	for _, revision := range storedRevisions {
		var policy InvocationExecutionPolicy
		var trace InvocationRouteTrace
		detail := InvocationRevisionDetail{InvocationRevisionSummary: invocationRevisionSummary(revision)}
		_ = json.Unmarshal([]byte(revision.ExecutionPolicyJSON), &policy)
		_ = json.Unmarshal([]byte(revision.RouteTraceJSON), &trace)
		detail.ExecutionPolicy = invocationExecutionPolicySummary(policy)
		detail.RouteTrace = invocationRouteTraceSummary(trace)
		_ = json.Unmarshal([]byte(revision.ConfirmationRequirementsJSON), &detail.ConfirmationRequirements)
		_ = json.Unmarshal([]byte(revision.BlockReasonsJSON), &detail.BlockReasons)
		revisions = append(revisions, detail)
	}
	attemptDetails := make([]InvocationAttemptDetail, 0, len(attempts))
	for _, attempt := range attempts {
		detail := InvocationAttemptDetail{InvocationAttemptSummary: invocationAttemptSummary(attempt), Gates: []model.InvocationGateResult{}}
		for _, gate := range gates {
			if gate.Attempt == attempt.Attempt {
				detail.Gates = append(detail.Gates, gate)
			}
		}
		attemptDetails = append(attemptDetails, detail)
	}
	outputArtifacts := make([]ArtifactEnvelope, 0, len(envelopes))
	seen := map[string]bool{}
	for _, ref := range outputRefs {
		if !seen[ref.ArtifactID] {
			if envelope, ok := envelopes[ref.ArtifactID]; ok {
				outputArtifacts = append(outputArtifacts, envelope)
			}
			seen[ref.ArtifactID] = true
		}
	}
	applySummaries := make([]InvocationApplyAttemptSummary, 0, len(applies))
	for _, apply := range applies {
		applySummaries = append(applySummaries, SafeInvocationApplyAttempt(apply))
	}
	artifactSetHash := ""
	if len(outputRefs) > 0 {
		artifactSetHash = invocationArtifactSetHash(outputRefs, outputAttempt)
	}
	return InvocationDetail{
		Run: invocationRunSummary(run), Revisions: revisions, Attempts: attemptDetails, ArtifactRefs: authoritativeRefs, AuthoritativeArtifactRefs: authoritativeRefs, OutputArtifacts: outputArtifacts,
		Reviews: reviews, ApplyAttempts: applySummaries, Events: events, EventsHasMore: eventsHasMore,
		EventsNextAfter: eventsNextAfter, EventsLimit: invocationDetailEventsLimit, ArtifactSetHash: artifactSetHash,
	}, nil
}

func SafeInvocationPreflight(snapshot InvocationPreflightSnapshot) InvocationPreflightResponse {
	return InvocationPreflightResponse{
		Run: invocationRunSummary(snapshot.Run), Revision: invocationRevisionSummary(snapshot.Revision),
		InputArtifactRefs: append([]model.InvocationArtifactRef(nil), snapshot.InputArtifactRefs...),
		ExecutionPolicy:   invocationExecutionPolicySummary(snapshot.ExecutionPolicy), RouteTrace: invocationRouteTraceSummary(snapshot.RouteTrace),
		ConfirmationRequirements: append([]string(nil), snapshot.ConfirmationRequirements...),
		BlockReasons:             append([]InvocationBlockReason(nil), snapshot.BlockReasons...),
	}
}

func SafeInvocationLifecycle(response InvocationResponse) InvocationLifecycleResponse {
	result := InvocationLifecycleResponse{Run: invocationRunSummary(response.Run), Revision: response.Revision}
	if response.Attempt != nil {
		attempt := invocationAttemptSummary(*response.Attempt)
		result.Attempt = &attempt
	}
	return result
}

func SafeInvocationApplyAttempt(apply model.InvocationApplyAttempt) InvocationApplyAttemptSummary {
	return InvocationApplyAttemptSummary{
		ID: apply.ID, ArtifactSetHash: apply.ArtifactSetHash, Target: apply.Target, TargetID: apply.TargetID,
		Status: apply.Status, Attempt: apply.Attempt, CreatedAt: apply.CreatedAt, UpdatedAt: apply.UpdatedAt,
	}
}

func invocationRunSummary(run model.InvocationRun) InvocationRunSummary {
	return InvocationRunSummary{
		ID: run.ID, Source: run.Source, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, Status: run.Status,
		LatestRevision: run.LatestRevision, LatestAttempt: run.LatestAttempt, ReviewedAttempt: run.ReviewedAttempt,
		ReviewedArtifactSetHash: run.ReviewedArtifactSetHash, CreatedAt: run.CreatedAt, UpdatedAt: run.UpdatedAt,
	}
}

func invocationRevisionSummary(revision model.InvocationPreflightRevision) InvocationRevisionSummary {
	return InvocationRevisionSummary{
		ID: revision.ID, Revision: revision.Revision, SkillID: revision.SkillID, SkillVersionID: revision.SkillVersionID,
		SkillVersion: revision.SkillVersion, SkillContentHash: revision.SkillContentHash, CreatedAt: revision.CreatedAt,
	}
}

func invocationAttemptSummary(attempt model.InvocationAttempt) InvocationAttemptSummary {
	return InvocationAttemptSummary{
		ID: attempt.ID, Status: attempt.Status, Revision: attempt.Revision, Attempt: attempt.Attempt,
		ErrorClass: attempt.ErrorClass, Model: attempt.Model, CreditsReserved: attempt.CreditsReserved,
		CreditsRefunded: attempt.CreditsRefunded, DurationMs: attempt.DurationMs, StartedAt: attempt.StartedAt,
		FinishedAt: attempt.FinishedAt, CreatedAt: attempt.CreatedAt, UpdatedAt: attempt.UpdatedAt,
	}
}

func invocationExecutionPolicySummary(policy InvocationExecutionPolicy) InvocationExecutionPolicySummary {
	return InvocationExecutionPolicySummary{
		ExecutorKind: policy.ExecutorKind, Model: policy.Model, FallbackAllowed: policy.FallbackAllowed,
		RequiresConfirmation: policy.RequiresConfirmation, EstimatedCredits: policy.EstimatedCredits,
		TimeoutSeconds: policy.TimeoutSeconds, MaxAttempts: policy.MaxAttempts, WritePolicy: policy.WritePolicy,
		RequiresConfirm: policy.RequiresConfirm,
	}
}

func invocationRouteTraceSummary(trace InvocationRouteTrace) InvocationRouteTraceSummary {
	candidates := make([]InvocationRouteCandidateSummary, 0, len(trace.Candidates))
	for _, candidate := range trace.Candidates {
		candidates = append(candidates, InvocationRouteCandidateSummary{
			SkillID: candidate.SkillID, SkillVersionID: candidate.SkillVersionID,
			Accepted: candidate.Accepted, Reasons: append([]string(nil), candidate.Reasons...),
		})
	}
	return InvocationRouteTraceSummary{
		Capability: trace.Capability, Candidates: candidates, FinalSkillVersionID: trace.FinalSkillVersionID,
		SelectedModel: trace.SelectedModel,
	}
}

func ListInvocationEvents(userID, invocationID string, after uint64, limit int) ([]model.InvocationEvent, error) {
	userID, invocationID = strings.TrimSpace(userID), strings.TrimSpace(invocationID)
	if _, found, err := repository.GetUserInvocation(userID, invocationID); err != nil {
		return nil, err
	} else if !found {
		return nil, repository.ErrInvocationNotFound
	}
	return repository.ListInvocationEvents(userID, invocationID, after, limit)
}

func invocationOutputEnvelopes(userID string, ids []string) (map[string]ArtifactEnvelope, error) {
	stored, err := repository.GetUserArtifactsByIDs(userID, ids)
	if err != nil {
		return nil, err
	}
	if len(stored) != len(uniqueInvocationIDs(ids)) {
		return nil, errors.New("Invocation 输出 Artifact 不存在")
	}
	context := newArtifactReadContext(userID, artifactMapValues(stored))
	if err := context.preloadLineage(ids); err != nil {
		return nil, err
	}
	result := make(map[string]ArtifactEnvelope, len(stored))
	for id := range stored {
		envelope, err := context.envelope(id)
		if err != nil {
			return nil, err
		}
		result[id] = envelope
	}
	return result, nil
}

func uniqueInvocationIDs(ids []string) map[string]bool {
	result := map[string]bool{}
	for _, id := range ids {
		if id = strings.TrimSpace(id); id != "" {
			result[id] = true
		}
	}
	return result
}
