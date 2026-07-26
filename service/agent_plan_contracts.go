package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
)

type AgentPlanCreateInput struct {
	ProjectID          string             `json:"projectId"`
	EpisodeID          string             `json:"episodeId"`
	AgentID            string             `json:"agentId"`
	AgentVersionID     string             `json:"agentVersionId"`
	Goal               string             `json:"goal"`
	SourceArtifactRefs []ArtifactRefInput `json:"sourceArtifactRefs"`
	SkillOverrides     []AgentSkillRef    `json:"skillOverrides"`
	IdempotencyKey     string             `json:"idempotencyKey"`
}

type AgentPlanRevisionInput struct {
	AgentVersionID     string             `json:"agentVersionId"`
	Goal               string             `json:"goal"`
	SourceArtifactRefs []ArtifactRefInput `json:"sourceArtifactRefs"`
	SkillOverrides     []AgentSkillRef    `json:"skillOverrides"`
}

type AgentPlanConfirmInput struct {
	Revision         int      `json:"revision"`
	Fingerprint      string   `json:"fingerprint"`
	RequirementCodes []string `json:"requirementCodes"`
}

type AgentPlanStepDetail struct {
	Step               model.AgentPlanStep     `json:"step"`
	InputBindings      []AgentStepInputBinding `json:"inputBindings"`
	Parameters         json.RawMessage         `json:"parameters"`
	OutputArtifactRefs []ArtifactRefInput      `json:"outputArtifactRefs"`
}

type AgentPlanDetail struct {
	Plan         model.AgentPlan              `json:"plan"`
	Revision     model.AgentPlanRevision      `json:"revision"`
	Steps        []AgentPlanStepDetail        `json:"steps"`
	Confirmation *model.AgentPlanConfirmation `json:"confirmation,omitempty"`
}

type AgentPlanPreflightResult struct {
	AgentPlanDetail
	ConfirmationRequirements []InvocationConfirmationRequirement `json:"confirmationRequirements"`
}

type AgentPlanContinueResult struct {
	AgentPlanDetail
	ActiveStep *AgentPlanStepDetail         `json:"activeStep,omitempty"`
	Invocation *InvocationLifecycleResponse `json:"invocation,omitempty"`
}
