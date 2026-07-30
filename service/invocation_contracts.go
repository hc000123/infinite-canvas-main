package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
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
	AgentPlanID                string                            `json:"-"`
	AgentPlanRevision          int                               `json:"-"`
	AgentPlanStepKey           string                            `json:"-"`
	ConfirmationSource         string                            `json:"-"`
}

type InvocationExecutionPolicyOverride struct {
	Model          string `json:"model"`
	ChannelID      string `json:"channelId"`
	TimeoutSeconds int    `json:"timeoutSeconds"`
	MaxAttempts    int    `json:"maxAttempts"`
}

type InvocationExecutionPolicy struct {
	ExecutorKind         string `json:"executorKind"`
	AgentExecutor        string `json:"agentExecutor"`
	Model                string `json:"model"`
	ChannelID            string `json:"channelId"`
	FallbackAllowed      bool   `json:"fallbackAllowed"`
	RequiresConfirmation bool   `json:"requiresConfirmation"`
	Credits              int    `json:"credits"`
	EstimatedCredits     int    `json:"estimatedCredits"`
	OutputCount          int    `json:"outputCount"`
	ImageRequestJSON     string `json:"imageRequestJson,omitempty"`
	TimeoutSeconds       int    `json:"timeoutSeconds"`
	ConcurrencyLimit     int    `json:"concurrencyLimit"`
	AllowBatch           bool   `json:"allowBatch"`
	MaxAttempts          int    `json:"maxAttempts"`
	WritePolicy          string `json:"writePolicy"`
	RequiresConfirm      bool   `json:"requiresConfirm"`
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

type InvocationOutputCoordinate struct {
	BindingName string `json:"bindingName"`
	Ordinal     int    `json:"ordinal"`
}

type InvocationRetryOutputRef struct {
	BindingName       string `json:"bindingName"`
	Ordinal           int    `json:"ordinal"`
	ArtifactID        string `json:"artifactId"`
	ArtifactHash      string `json:"artifactHash"`
	ArtifactType      string `json:"artifactType"`
	SchemaVersion     string `json:"schemaVersion"`
	SchemaContentHash string `json:"schemaContentHash"`
}

type InvocationRetryPlan struct {
	PreservedOutputRefs       []InvocationRetryOutputRef   `json:"preservedOutputRefs"`
	RequestedOutputs          []InvocationOutputCoordinate `json:"requestedOutputs"`
	RejectedParentArtifactIDs []string                     `json:"rejectedParentArtifactIds"`
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
	IdempotencyKey  string          `json:"idempotencyKey"`
	Attempt         int             `json:"attempt"`
	ArtifactSetHash string          `json:"artifactSetHash"`
	Target          string          `json:"target"`
	TargetID        string          `json:"targetId"`
	Payload         json.RawMessage `json:"payload,omitempty"`
}

type InvocationApplyContext struct {
	UserID          string                        `json:"userId"`
	InvocationID    string                        `json:"invocationId"`
	ApplyAttemptID  string                        `json:"applyAttemptId"`
	IdempotencyKey  string                        `json:"idempotencyKey"`
	Attempt         int                           `json:"attempt"`
	ArtifactSetHash string                        `json:"artifactSetHash"`
	TargetID        string                        `json:"targetId"`
	ArtifactRefs    []model.InvocationArtifactRef `json:"artifactRefs"`
	Artifacts       []model.Artifact              `json:"artifacts"`
	Payload         json.RawMessage               `json:"payload"`
	CreatedAt       string                        `json:"createdAt"`
}

type InvocationApplyAdapter interface {
	TargetName() string
	ApplyTx(*gorm.DB, InvocationApplyContext) (json.RawMessage, error)
}

type InvocationRunSummary struct {
	ID                      string                 `json:"id"`
	Source                  string                 `json:"source"`
	ProjectID               string                 `json:"projectId"`
	EpisodeID               string                 `json:"episodeId"`
	AgentPlanID             string                 `json:"agentPlanId,omitempty"`
	AgentPlanRevision       int                    `json:"agentPlanRevision,omitempty"`
	AgentPlanStepKey        string                 `json:"agentPlanStepKey,omitempty"`
	ConfirmationSource      string                 `json:"confirmationSource,omitempty"`
	Status                  model.InvocationStatus `json:"status"`
	LatestRevision          int                    `json:"latestRevision"`
	LatestAttempt           int                    `json:"latestAttempt"`
	ReviewedAttempt         int                    `json:"reviewedAttempt"`
	ReviewedArtifactSetHash string                 `json:"reviewedArtifactSetHash"`
	CreatedAt               string                 `json:"createdAt"`
	UpdatedAt               string                 `json:"updatedAt"`
}

type InvocationAttemptSummary struct {
	ID              string `json:"id"`
	Status          string `json:"status"`
	Revision        int    `json:"revision"`
	Attempt         int    `json:"attempt"`
	ErrorClass      string `json:"errorClass"`
	Model           string `json:"model"`
	CreditsReserved int    `json:"creditsReserved"`
	CreditsRefunded int    `json:"creditsRefunded"`
	DurationMs      int64  `json:"durationMs"`
	StartedAt       string `json:"startedAt"`
	FinishedAt      string `json:"finishedAt"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type InvocationAttemptDetail struct {
	InvocationAttemptSummary
	Gates []model.InvocationGateResult `json:"gates"`
}

type InvocationExecutionPolicySummary struct {
	ExecutorKind         string `json:"executorKind"`
	Model                string `json:"model"`
	FallbackAllowed      bool   `json:"fallbackAllowed"`
	RequiresConfirmation bool   `json:"requiresConfirmation"`
	EstimatedCredits     int    `json:"estimatedCredits"`
	OutputCount          int    `json:"outputCount"`
	TimeoutSeconds       int    `json:"timeoutSeconds"`
	MaxAttempts          int    `json:"maxAttempts"`
	WritePolicy          string `json:"writePolicy"`
	RequiresConfirm      bool   `json:"requiresConfirm"`
}

type InvocationRouteCandidateSummary struct {
	SkillID        string   `json:"skillId"`
	SkillVersionID string   `json:"skillVersionId"`
	Accepted       bool     `json:"accepted"`
	Reasons        []string `json:"reasons"`
}

type InvocationRouteTraceSummary struct {
	Capability          string                            `json:"capability"`
	Candidates          []InvocationRouteCandidateSummary `json:"candidates"`
	FinalSkillVersionID string                            `json:"finalSkillVersionId"`
	SelectedModel       string                            `json:"selectedModel"`
}

type InvocationRevisionSummary struct {
	ID               string `json:"id"`
	Revision         int    `json:"revision"`
	SkillID          string `json:"skillId"`
	SkillVersionID   string `json:"skillVersionId"`
	SkillVersion     string `json:"skillVersion"`
	SkillContentHash string `json:"skillContentHash"`
	CreatedAt        string `json:"createdAt"`
}

type InvocationRevisionDetail struct {
	InvocationRevisionSummary
	ExecutionPolicy          InvocationExecutionPolicySummary `json:"executionPolicy"`
	RouteTrace               InvocationRouteTraceSummary      `json:"routeTrace"`
	ConfirmationRequirements []string                         `json:"confirmationRequirements"`
	BlockReasons             []InvocationBlockReason          `json:"blockReasons"`
}

type InvocationPreflightResponse struct {
	Run                      InvocationRunSummary             `json:"run"`
	Revision                 InvocationRevisionSummary        `json:"revision"`
	InputArtifactRefs        []model.InvocationArtifactRef    `json:"inputArtifactRefs"`
	ExecutionPolicy          InvocationExecutionPolicySummary `json:"executionPolicy"`
	RouteTrace               InvocationRouteTraceSummary      `json:"routeTrace"`
	ConfirmationRequirements []string                         `json:"confirmationRequirements"`
	BlockReasons             []InvocationBlockReason          `json:"blockReasons"`
}

type InvocationLifecycleResponse struct {
	Run      InvocationRunSummary      `json:"run"`
	Revision int                       `json:"revision"`
	Attempt  *InvocationAttemptSummary `json:"attempt,omitempty"`
}

type InvocationApplyAttemptSummary struct {
	ID              string `json:"id"`
	ArtifactSetHash string `json:"artifactSetHash"`
	Target          string `json:"target"`
	TargetID        string `json:"targetId"`
	Status          string `json:"status"`
	Attempt         int    `json:"attempt"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type InvocationDetail struct {
	Run                       InvocationRunSummary            `json:"run"`
	Revisions                 []InvocationRevisionDetail      `json:"revisions"`
	Attempts                  []InvocationAttemptDetail       `json:"attempts"`
	ArtifactRefs              []model.InvocationArtifactRef   `json:"artifactRefs"`
	AuthoritativeArtifactRefs []model.InvocationArtifactRef   `json:"authoritativeArtifactRefs"`
	OutputArtifacts           []ArtifactEnvelope              `json:"outputArtifacts"`
	Reviews                   []model.InvocationReview        `json:"reviews"`
	ApplyAttempts             []InvocationApplyAttemptSummary `json:"applyAttempts"`
	Events                    []model.InvocationEvent         `json:"events"`
	EventsHasMore             bool                            `json:"eventsHasMore"`
	EventsNextAfter           uint64                          `json:"eventsNextAfter"`
	EventsLimit               int                             `json:"eventsLimit"`
	ArtifactSetHash           string                          `json:"artifactSetHash"`
}

type InvocationPoll struct {
	Run       InvocationRunSummary      `json:"run"`
	Attempt   *InvocationAttemptSummary `json:"attempt,omitempty"`
	Events    []model.InvocationEvent   `json:"events"`
	NextAfter uint64                    `json:"nextAfter"`
}

type InvocationList struct {
	Items    []InvocationRunSummary `json:"items"`
	Total    int64                  `json:"total"`
	Page     int                    `json:"page"`
	PageSize int                    `json:"pageSize"`
}
