package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
)

const (
	VideoWorkflowID      = "seedance-2-multi-agent-storyboard-team"
	VideoWorkflowVersion = "2.0.0"

	WorkflowStageScriptAdaptation   = "script-adaptation"
	WorkflowStageAssetExtraction    = "asset-extraction"
	WorkflowStageAssetImagePrompt   = "asset-image-prompt"
	WorkflowStageShotBreakdown      = "shot-breakdown"
	WorkflowStageShotPrompt         = "shot-prompt"
	WorkflowStageArtDesign          = WorkflowStageAssetExtraction
	WorkflowStageAssetGeneration    = WorkflowStageAssetImagePrompt
	WorkflowStageSeedanceStoryboard = WorkflowStageShotBreakdown
	workflowArtifactSchemaVersion   = "video-workflow-v2"
	workflowGateValidatorVersion    = "video-workflow-gates-v2"
	maxWorkflowScriptBytes          = 600_000
	maxWorkflowArtifactBytes        = 4_000_000
	maxWorkflowStageContextBytes    = 256 << 10
)

type WorkflowStageStartInput struct {
	IdempotencyKey string          `json:"idempotencyKey"`
	MediaBatchID   string          `json:"mediaBatchId"`
	SkillVersionID string          `json:"skillVersionId"`
	Context        json.RawMessage `json:"context"`
}

type WorkflowShotPromptContext struct {
	ShotID              string                     `json:"shotId"`
	SourceScript        string                     `json:"sourceScript"`
	ShotDraft           map[string]any             `json:"shotDraft"`
	References          []WorkflowReferenceContext `json:"references"`
	PromptInputHash     string                     `json:"promptInputHash"`
	ContinuityReference map[string]any             `json:"continuityReference,omitempty"`
}

type WorkflowReferenceContext struct {
	Role                 string `json:"role"`
	Label                string `json:"label"`
	LogicalAssetID       string `json:"logicalAssetId"`
	LibraryAssetID       string `json:"libraryAssetId"`
	ParentLogicalAssetID string `json:"parentLogicalAssetId,omitempty"`
	VariantName          string `json:"variantName,omitempty"`
	Version              string `json:"version"`
	Usage                string `json:"usage"`
	Ref                  string `json:"ref"`
	Kind                 string `json:"kind"`
	SourceShotID         string `json:"sourceShotId,omitempty"`
}

type EnsureWorkflowRunInput struct {
	ProjectID       string `json:"projectId"`
	EpisodeID       string `json:"episodeId"`
	WorkflowID      string `json:"workflowId"`
	WorkflowVersion string `json:"workflowVersion"`
	ScriptSnapshot  string `json:"scriptSnapshot"`
	ScriptConfirmed bool   `json:"scriptConfirmed"`
}

type WorkflowRunDetail struct {
	Run       model.WorkflowRun                 `json:"run"`
	Stages    []model.WorkflowStageRun          `json:"stages"`
	Artifacts []model.WorkflowArtifact          `json:"artifacts"`
	Gates     []model.WorkflowQualityGateResult `json:"gates"`
	AgentRuns []model.AgentRun                  `json:"agentRuns"`
}

type WorkflowRunListQuery = model.WorkflowRunQuery
type WorkflowRunListStatus = model.WorkflowRunStatus

type WorkflowRunListItem struct {
	ID              string                     `json:"id"`
	ProjectID       string                     `json:"projectId"`
	EpisodeID       string                     `json:"episodeId"`
	WorkflowID      string                     `json:"workflowId"`
	WorkflowVersion string                     `json:"workflowVersion"`
	CurrentStageID  string                     `json:"currentStageId"`
	Status          model.WorkflowRunStatus    `json:"status"`
	Stages          []WorkflowStagePollSummary `json:"stages"`
	ReviewCount     int                        `json:"reviewCount"`
	WarningCount    int                        `json:"warningCount"`
	CreatedAt       string                     `json:"createdAt"`
	UpdatedAt       string                     `json:"updatedAt"`
}

type WorkflowRunList struct {
	Items    []WorkflowRunListItem `json:"items"`
	Total    int64                 `json:"total"`
	Page     int                   `json:"page"`
	PageSize int                   `json:"pageSize"`
}

type WorkflowStagePollSummary struct {
	ID           string                       `json:"id"`
	StageID      string                       `json:"stageId"`
	InvocationID string                       `json:"invocationId"`
	Status       model.WorkflowStageRunStatus `json:"status"`
	Attempt      int                          `json:"attempt"`
	ErrorMessage string                       `json:"errorMessage"`
	UpdatedAt    string                       `json:"updatedAt"`
}

type WorkflowRunPoll struct {
	RunID     string                     `json:"runId"`
	Status    model.WorkflowRunStatus    `json:"status"`
	UpdatedAt string                     `json:"updatedAt"`
	Stages    []WorkflowStagePollSummary `json:"stages"`
	Events    []model.WorkflowEvent      `json:"events"`
	NextAfter uint64                     `json:"nextAfter"`
	Worker    WorkflowWorkerHealth       `json:"worker"`
}

type WorkflowReviewInput struct {
	Decision     string `json:"decision"`
	ArtifactHash string `json:"artifactHash"`
	Comment      string `json:"comment"`
}

type WorkflowApplyInput struct {
	ArtifactHash string          `json:"artifactHash"`
	Target       string          `json:"target"`
	TargetIDs    []string        `json:"targetIds"`
	AppliedCount int             `json:"appliedCount"`
	SkippedCount int             `json:"skippedCount"`
	Version      string          `json:"version"`
	Errors       []string        `json:"errors"`
	Metadata     json.RawMessage `json:"metadata"`
}

type AgentAssetCategory string

const (
	AgentAssetCategoryCharacter AgentAssetCategory = "character"
	AgentAssetCategoryScene     AgentAssetCategory = "scene"
	AgentAssetCategoryProp      AgentAssetCategory = "prop"
	AgentAssetCategoryBlocking  AgentAssetCategory = "blocking"
)

type AgentAssetSlotStatus string

const (
	AgentAssetSlotPlaceholder AgentAssetSlotStatus = "placeholder"
	AgentAssetSlotCandidate   AgentAssetSlotStatus = "candidate"
	AgentAssetSlotBound       AgentAssetSlotStatus = "bound"
	AgentAssetSlotIgnored     AgentAssetSlotStatus = "ignored"
)

type AgentAssetSlot struct {
	SlotID         string               `json:"slotId"`
	Category       AgentAssetCategory   `json:"category"`
	Name           string               `json:"name"`
	Description    string               `json:"description"`
	Status         AgentAssetSlotStatus `json:"status"`
	SourceSceneIDs []string             `json:"sourceSceneIds"`
	SourceEvidence []string             `json:"sourceEvidence"`
	SubjectID      string               `json:"subjectId,omitempty"`
	VariantID      string               `json:"variantId,omitempty"`
	AssetID        string               `json:"assetId,omitempty"`
	CandidateID    string               `json:"candidateId,omitempty"`
}

type SaveWorkflowAssetSlotsInput struct {
	BaseArtifactHash string           `json:"baseArtifactHash"`
	Slots            []AgentAssetSlot `json:"slots"`
}

type WorkflowAssetSlotArtifact struct {
	Artifact ArtifactEnvelope `json:"artifact"`
	Version  int              `json:"version"`
	Slots    []AgentAssetSlot `json:"slots"`
}

type WorkflowGateIssue struct {
	Code     string `json:"code"`
	Message  string `json:"message"`
	ItemID   string `json:"itemId,omitempty"`
	Blocking bool   `json:"blocking"`
}

type WorkflowGateReport struct {
	Passed  bool                `json:"passed"`
	Version string              `json:"version"`
	Issues  []WorkflowGateIssue `json:"issues"`
}
