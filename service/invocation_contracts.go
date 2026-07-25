package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
)

// InvocationRequest contains caller-controlled business data only. Trusted
// instructions are resolved later from frozen Skill and schema snapshots.
type InvocationRequest struct {
	Source                     string                            `json:"source"`
	ProjectID                  string                            `json:"projectId"`
	EpisodeID                  string                            `json:"episodeId"`
	SkillID                    string                            `json:"skillId"`
	SkillVersionID             string                            `json:"skillVersionId"`
	SkillVersionConstraint     string                            `json:"skillVersionConstraint"`
	Capability                 string                            `json:"capability"`
	ExpectedOutputArtifactType string                            `json:"expectedOutputArtifactType"`
	InputArtifactRefs          []ArtifactRefInput                `json:"inputArtifactRefs"`
	ProjectTags                []string                          `json:"projectTags"`
	Parameters                 json.RawMessage                   `json:"parameters"`
	ExecutionPolicyOverride    InvocationExecutionPolicyOverride `json:"executionPolicyOverride"`
	IdempotencyKey             string                            `json:"idempotencyKey"`
}

type InvocationExecutionPolicyOverride struct {
	Model          string `json:"model"`
	ChannelID      string `json:"channelId"`
	TimeoutSeconds int    `json:"timeoutSeconds"`
	MaxAttempts    int    `json:"maxAttempts"`
}

type InvocationExecutionPolicy struct {
	ExecutorKind         string `json:"executorKind"`
	Model                string `json:"model"`
	ChannelID            string `json:"channelId"`
	FallbackAllowed      bool   `json:"fallbackAllowed"`
	RequiresConfirmation bool   `json:"requiresConfirmation"`
	EstimatedCredits     int    `json:"estimatedCredits"`
	TimeoutSeconds       int    `json:"timeoutSeconds"`
	MaxAttempts          int    `json:"maxAttempts"`
}

type InvocationRouteTrace struct {
	Capability          string                     `json:"capability"`
	Candidates          []InvocationRouteCandidate `json:"candidates"`
	FinalSkillVersionID string                     `json:"finalSkillVersionId"`
	SelectedModel       string                     `json:"selectedModel"`
	SelectedChannelID   string                     `json:"selectedChannelId"`
}

type InvocationRouteCandidate struct {
	SkillID        string   `json:"skillId"`
	SkillVersionID string   `json:"skillVersionId"`
	Accepted       bool     `json:"accepted"`
	Score          int      `json:"score"`
	Reasons        []string `json:"reasons"`
}

type InvocationConfirmationRequirement struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type InvocationBlockReason struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type InvocationToolTrace struct {
	Tool       string          `json:"tool"`
	Request    json.RawMessage `json:"request"`
	Response   json.RawMessage `json:"response"`
	StartedAt  string          `json:"startedAt"`
	FinishedAt string          `json:"finishedAt"`
	Error      string          `json:"error"`
}

type InvocationGateTrace struct {
	ExecutionOrdinal int                          `json:"executionOrdinal"`
	Results          []model.InvocationGateResult `json:"results"`
}

type InvocationPreflightSnapshot struct {
	Run                      model.InvocationRun               `json:"run"`
	Revision                 model.InvocationPreflightRevision `json:"revision"`
	InputArtifactRefs        []model.InvocationArtifactRef     `json:"inputArtifactRefs"`
	ExecutionPolicy          InvocationExecutionPolicy         `json:"executionPolicy"`
	RouteTrace               InvocationRouteTrace              `json:"routeTrace"`
	ConfirmationRequirements []string                          `json:"confirmationRequirements"`
	BlockReasons             []InvocationBlockReason           `json:"blockReasons"`
}

type InvocationResponse struct {
	Run      model.InvocationRun      `json:"run"`
	Revision int                      `json:"revision"`
	Attempt  *model.InvocationAttempt `json:"attempt,omitempty"`
}

type InvocationConfirmation struct {
	RequirementCodes []string `json:"requirementCodes"`
}

type InvocationCorrectionInput struct {
	Attempt               int             `json:"attempt"`
	ExpectedRawOutputHash string          `json:"expectedRawOutputHash"`
	Output                json.RawMessage `json:"output"`
}

type InvocationReviewInput struct {
	Decision        string `json:"decision"`
	Attempt         int    `json:"attempt"`
	ArtifactSetHash string `json:"artifactSetHash"`
	Comment         string `json:"comment"`
}

type InvocationApplyInput struct {
	IdempotencyKey  string `json:"idempotencyKey"`
	Attempt         int    `json:"attempt"`
	ArtifactSetHash string `json:"artifactSetHash"`
	Target          string `json:"target"`
	TargetID        string `json:"targetId"`
}

type InvocationAttemptDetail struct {
	model.InvocationAttempt
	ArtifactRefs    []model.InvocationArtifactRef `json:"artifactRefs"`
	OutputArtifacts []ArtifactEnvelope            `json:"outputArtifacts"`
	Gates           []model.InvocationGateResult  `json:"gates"`
}

type InvocationDetail struct {
	Run             model.InvocationRun                 `json:"run"`
	Revisions       []model.InvocationPreflightRevision `json:"revisions"`
	Attempts        []InvocationAttemptDetail           `json:"attempts"`
	ArtifactRefs    []model.InvocationArtifactRef       `json:"artifactRefs"`
	OutputArtifacts []ArtifactEnvelope                  `json:"outputArtifacts"`
	Reviews         []model.InvocationReview            `json:"reviews"`
	ApplyAttempts   []model.InvocationApplyAttempt      `json:"applyAttempts"`
	Events          []model.InvocationEvent             `json:"events"`
	ArtifactSetHash string                              `json:"artifactSetHash"`
}
