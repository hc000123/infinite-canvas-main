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
	LogicalAssetID       string `json:"logicalAssetId"`
	LibraryAssetID       string `json:"libraryAssetId"`
	ParentLogicalAssetID string `json:"parentLogicalAssetId,omitempty"`
	VariantName          string `json:"variantName,omitempty"`
	Version              string `json:"version"`
	Usage                string `json:"usage"`
	Ref                  string `json:"ref"`
	Label                string `json:"label"`
	Kind                 string `json:"kind"`
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
