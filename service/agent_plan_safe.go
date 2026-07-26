package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
)

type AgentPlanSummary struct {
	ID                      string                `json:"id"`
	ProjectID               string                `json:"projectId"`
	EpisodeID               string                `json:"episodeId"`
	AgentID                 string                `json:"agentId"`
	AgentVersionID          string                `json:"agentVersionId"`
	Goal                    string                `json:"goal"`
	Status                  model.AgentPlanStatus `json:"status"`
	CurrentRevision         int                   `json:"currentRevision"`
	EstimatedCredits        int64                 `json:"estimatedCredits"`
	ConfirmationFingerprint string                `json:"confirmationFingerprint"`
	CreatedAt               string                `json:"createdAt"`
	UpdatedAt               string                `json:"updatedAt"`
}

type AgentPlanRevisionSummary struct {
	ID                      string `json:"id"`
	AgentPlanID             string `json:"agentPlanId"`
	Revision                int    `json:"revision"`
	AgentVersionID          string `json:"agentVersionId"`
	AgentContentHash        string `json:"agentContentHash"`
	Goal                    string `json:"goal"`
	ConfirmationFingerprint string `json:"confirmationFingerprint"`
	EstimatedCredits        int64  `json:"estimatedCredits"`
	CreatedAt               string `json:"createdAt"`
}

type AgentPlanStepSummary struct {
	ID                 string                    `json:"id"`
	AgentPlanID        string                    `json:"agentPlanId"`
	Revision           int                       `json:"revision"`
	Ordinal            int                       `json:"ordinal"`
	StepKey            string                    `json:"stepKey"`
	Label              string                    `json:"label"`
	Capability         string                    `json:"capability"`
	SkillID            string                    `json:"skillId"`
	SkillVersionID     string                    `json:"skillVersionId"`
	SkillVersion       string                    `json:"skillVersion"`
	SkillContentHash   string                    `json:"skillContentHash"`
	ExpectedOutputType string                    `json:"expectedOutputType"`
	InvocationID       string                    `json:"invocationId"`
	Status             model.AgentPlanStepStatus `json:"status"`
	ErrorCode          string                    `json:"errorCode"`
	ErrorMessage       string                    `json:"errorMessage"`
	CreatedAt          string                    `json:"createdAt"`
	UpdatedAt          string                    `json:"updatedAt"`
}

type AgentPlanConfirmationSummary struct {
	ID               string `json:"id"`
	AgentPlanID      string `json:"agentPlanId"`
	Revision         int    `json:"revision"`
	Fingerprint      string `json:"fingerprint"`
	EstimatedCredits int64  `json:"estimatedCredits"`
	ConfirmedAt      string `json:"confirmedAt"`
}

type AgentPlanStepResponse struct {
	Step               AgentPlanStepSummary    `json:"step"`
	InputBindings      []AgentStepInputBinding `json:"inputBindings"`
	Parameters         json.RawMessage         `json:"parameters"`
	OutputArtifactRefs []ArtifactRefInput      `json:"outputArtifactRefs"`
}

type AgentPlanResponse struct {
	Plan         AgentPlanSummary              `json:"plan"`
	Revision     AgentPlanRevisionSummary      `json:"revision"`
	Steps        []AgentPlanStepResponse       `json:"steps"`
	Confirmation *AgentPlanConfirmationSummary `json:"confirmation,omitempty"`
}

type AgentPlanPreflightResponse struct {
	AgentPlanResponse
	ConfirmationRequirements []InvocationConfirmationRequirement `json:"confirmationRequirements"`
}

type AgentPlanContinueResponse struct {
	AgentPlanResponse
	ActiveStep *AgentPlanStepResponse       `json:"activeStep,omitempty"`
	Invocation *InvocationLifecycleResponse `json:"invocation,omitempty"`
}

func SafeAgentPlanDetail(detail AgentPlanDetail) AgentPlanResponse {
	result := AgentPlanResponse{
		Plan: AgentPlanSummary{
			ID: detail.Plan.ID, ProjectID: detail.Plan.ProjectID, EpisodeID: detail.Plan.EpisodeID,
			AgentID: detail.Plan.AgentID, AgentVersionID: detail.Plan.AgentVersionID, Goal: detail.Plan.Goal,
			Status: detail.Plan.Status, CurrentRevision: detail.Plan.CurrentRevision, EstimatedCredits: detail.Plan.EstimatedCredits,
			ConfirmationFingerprint: detail.Plan.ConfirmationFingerprint, CreatedAt: detail.Plan.CreatedAt, UpdatedAt: detail.Plan.UpdatedAt,
		},
		Revision: AgentPlanRevisionSummary{
			ID: detail.Revision.ID, AgentPlanID: detail.Revision.AgentPlanID, Revision: detail.Revision.Revision,
			AgentVersionID: detail.Revision.AgentVersionID, AgentContentHash: detail.Revision.AgentContentHash, Goal: detail.Revision.Goal,
			ConfirmationFingerprint: detail.Revision.ConfirmationFingerprint, EstimatedCredits: detail.Revision.EstimatedCredits, CreatedAt: detail.Revision.CreatedAt,
		},
		Steps: make([]AgentPlanStepResponse, len(detail.Steps)),
	}
	for index := range detail.Steps {
		result.Steps[index] = safeAgentPlanStep(detail.Steps[index])
	}
	if detail.Confirmation != nil {
		result.Confirmation = &AgentPlanConfirmationSummary{
			ID: detail.Confirmation.ID, AgentPlanID: detail.Confirmation.AgentPlanID, Revision: detail.Confirmation.Revision,
			Fingerprint: detail.Confirmation.Fingerprint, EstimatedCredits: detail.Confirmation.EstimatedCredits, ConfirmedAt: detail.Confirmation.ConfirmedAt,
		}
	}
	return result
}

func SafeAgentPlanPreflight(detail AgentPlanPreflightResult) AgentPlanPreflightResponse {
	return AgentPlanPreflightResponse{AgentPlanResponse: SafeAgentPlanDetail(detail.AgentPlanDetail), ConfirmationRequirements: detail.ConfirmationRequirements}
}

func SafeAgentPlanContinue(detail AgentPlanContinueResult) AgentPlanContinueResponse {
	result := AgentPlanContinueResponse{AgentPlanResponse: SafeAgentPlanDetail(detail.AgentPlanDetail), Invocation: detail.Invocation}
	if detail.ActiveStep != nil {
		step := safeAgentPlanStep(*detail.ActiveStep)
		result.ActiveStep = &step
	}
	return result
}

func safeAgentPlanStep(detail AgentPlanStepDetail) AgentPlanStepResponse {
	step := detail.Step
	return AgentPlanStepResponse{
		Step: AgentPlanStepSummary{
			ID: step.ID, AgentPlanID: step.AgentPlanID, Revision: step.Revision, Ordinal: step.Ordinal,
			StepKey: step.StepKey, Label: step.Label, Capability: step.Capability, SkillID: step.SkillID,
			SkillVersionID: step.SkillVersionID, SkillVersion: step.SkillVersion, SkillContentHash: step.SkillContentHash,
			ExpectedOutputType: step.ExpectedOutputType, InvocationID: step.InvocationID, Status: step.Status,
			ErrorCode: step.ErrorCode, ErrorMessage: step.ErrorMessage, CreatedAt: step.CreatedAt, UpdatedAt: step.UpdatedAt,
		},
		InputBindings: detail.InputBindings, Parameters: detail.Parameters, OutputArtifactRefs: detail.OutputArtifactRefs,
	}
}
