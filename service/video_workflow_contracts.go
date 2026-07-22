package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
)

const (
	VideoWorkflowID      = "seedance-2-multi-agent-storyboard-team"
	VideoWorkflowVersion = "1.1.0"

	WorkflowStageScriptAdaptation   = "script-adaptation"
	WorkflowStageArtDesign          = "art-design"
	WorkflowStageAssetGeneration    = "asset-generation"
	WorkflowStageSeedanceStoryboard = "seedance-storyboard"
	workflowArtifactSchemaVersion   = "video-workflow-v1"
	workflowGateValidatorVersion    = "video-workflow-gates-v1"
	maxWorkflowScriptBytes          = 600_000
	maxWorkflowArtifactBytes        = 4_000_000
)

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
