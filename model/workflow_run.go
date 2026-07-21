package model

type WorkflowRunStatus string

const (
	WorkflowRunStatusActive    WorkflowRunStatus = "active"
	WorkflowRunStatusCompleted WorkflowRunStatus = "completed"
	WorkflowRunStatusFailed    WorkflowRunStatus = "failed"
	WorkflowRunStatusCancelled WorkflowRunStatus = "cancelled"
)

type WorkflowStageRunStatus string

const (
	WorkflowStageRunStatusBlocked         WorkflowStageRunStatus = "blocked"
	WorkflowStageRunStatusReady           WorkflowStageRunStatus = "ready"
	WorkflowStageRunStatusQueued          WorkflowStageRunStatus = "queued"
	WorkflowStageRunStatusRunning         WorkflowStageRunStatus = "running"
	WorkflowStageRunStatusCancelRequested WorkflowStageRunStatus = "cancel_requested"
	WorkflowStageRunStatusNeedsReview     WorkflowStageRunStatus = "needs_review"
	WorkflowStageRunStatusApproved        WorkflowStageRunStatus = "approved"
	WorkflowStageRunStatusRejected        WorkflowStageRunStatus = "rejected"
	WorkflowStageRunStatusApplied         WorkflowStageRunStatus = "applied"
	WorkflowStageRunStatusFailed          WorkflowStageRunStatus = "failed"
	WorkflowStageRunStatusCancelled       WorkflowStageRunStatus = "cancelled"
)

// WorkflowRun is the durable project/episode workflow aggregate. ScriptSnapshot
// is immutable after creation so a running workflow never changes underneath a job.
type WorkflowRun struct {
	ID              string            `json:"id" gorm:"primaryKey"`
	UserID          string            `json:"userId" gorm:"index;uniqueIndex:idx_workflow_scope,priority:1"`
	ProjectID       string            `json:"projectId" gorm:"index;uniqueIndex:idx_workflow_scope,priority:2"`
	EpisodeID       string            `json:"episodeId" gorm:"index;uniqueIndex:idx_workflow_scope,priority:3"`
	WorkflowID      string            `json:"workflowId" gorm:"index;uniqueIndex:idx_workflow_scope,priority:4"`
	WorkflowVersion string            `json:"workflowVersion" gorm:"uniqueIndex:idx_workflow_scope,priority:5"`
	ScriptHash      string            `json:"scriptHash" gorm:"index;uniqueIndex:idx_workflow_scope,priority:6"`
	ScriptSnapshot  string            `json:"scriptSnapshot" gorm:"type:text"`
	CurrentStageID  string            `json:"currentStageId" gorm:"index"`
	Status          WorkflowRunStatus `json:"status" gorm:"index"`
	CreatedAt       string            `json:"createdAt"`
	UpdatedAt       string            `json:"updatedAt"`
}

type WorkflowStageRun struct {
	ID                   string                 `json:"id" gorm:"primaryKey"`
	UserID               string                 `json:"userId" gorm:"index"`
	WorkflowRunID        string                 `json:"workflowRunId" gorm:"index"`
	StageID              string                 `json:"stageId" gorm:"index"`
	ParentStageRunID     string                 `json:"parentStageRunId" gorm:"index"`
	AgentRunID           string                 `json:"agentRunId" gorm:"index"`
	Attempt              int                    `json:"attempt"`
	Status               WorkflowStageRunStatus `json:"status" gorm:"index"`
	InputArtifactID      string                 `json:"inputArtifactId" gorm:"index"`
	OutputArtifactID     string                 `json:"outputArtifactId" gorm:"index"`
	EstimatedCredits     int                    `json:"estimatedCredits"`
	ProgressCurrent      int                    `json:"progressCurrent"`
	ProgressTotal        int                    `json:"progressTotal"`
	ErrorMessage         string                 `json:"errorMessage" gorm:"type:text"`
	ReviewDecision       string                 `json:"reviewDecision"`
	ReviewedArtifactHash string                 `json:"reviewedArtifactHash" gorm:"index"`
	ReviewComment        string                 `json:"reviewComment" gorm:"type:text"`
	ApplyReceiptJSON     string                 `json:"applyReceiptJson" gorm:"type:text"`
	StartedAt            string                 `json:"startedAt"`
	FinishedAt           string                 `json:"finishedAt"`
	ReviewedAt           string                 `json:"reviewedAt"`
	AppliedAt            string                 `json:"appliedAt"`
	CreatedAt            string                 `json:"createdAt"`
	UpdatedAt            string                 `json:"updatedAt"`
}

type WorkflowArtifact struct {
	ID              string `json:"id" gorm:"primaryKey"`
	UserID          string `json:"userId" gorm:"index"`
	WorkflowRunID   string `json:"workflowRunId" gorm:"index"`
	StageRunID      string `json:"stageRunId" gorm:"index;uniqueIndex:idx_stage_artifact_version,priority:1"`
	AgentRunID      string `json:"agentRunId" gorm:"index"`
	Kind            string `json:"kind" gorm:"index"`
	Version         int    `json:"version" gorm:"uniqueIndex:idx_stage_artifact_version,priority:2"`
	SchemaVersion   string `json:"schemaVersion"`
	TemplateVersion string `json:"templateVersion"`
	ContentJSON     string `json:"contentJson" gorm:"type:text"`
	ContentHash     string `json:"contentHash" gorm:"index"`
	CreatedAt       string `json:"createdAt"`
}

type WorkflowQualityGateResult struct {
	ID               string `json:"id" gorm:"primaryKey"`
	UserID           string `json:"userId" gorm:"index"`
	WorkflowRunID    string `json:"workflowRunId" gorm:"index"`
	StageRunID       string `json:"stageRunId" gorm:"index"`
	ArtifactID       string `json:"artifactId" gorm:"index"`
	ArtifactHash     string `json:"artifactHash" gorm:"index"`
	ValidatorVersion string `json:"validatorVersion"`
	Passed           bool   `json:"passed" gorm:"index"`
	IssuesJSON       string `json:"issuesJson" gorm:"type:text"`
	CreatedAt        string `json:"createdAt"`
}

type WorkflowEvent struct {
	ID            uint64 `json:"cursor" gorm:"primaryKey;autoIncrement"`
	UserID        string `json:"userId" gorm:"index"`
	WorkflowRunID string `json:"workflowRunId" gorm:"index"`
	StageRunID    string `json:"stageRunId" gorm:"index"`
	AgentRunID    string `json:"agentRunId" gorm:"index"`
	Type          string `json:"type" gorm:"index"`
	Level         string `json:"level"`
	DataJSON      string `json:"dataJson" gorm:"type:text"`
	CreatedAt     string `json:"createdAt" gorm:"index"`
}
