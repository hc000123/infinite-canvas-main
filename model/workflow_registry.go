package model

type WorkflowOwnerType string
type WorkflowVersionStatus string
type WorkflowExecutionStatus string
type WorkflowNodeExecutionStatus string

const (
	WorkflowOwnerSystem  WorkflowOwnerType = "system"
	WorkflowOwnerProject WorkflowOwnerType = "project"

	WorkflowVersionDraft     WorkflowVersionStatus = "draft"
	WorkflowVersionPublished WorkflowVersionStatus = "published"
	WorkflowVersionRetired   WorkflowVersionStatus = "retired"

	WorkflowExecutionPreflight            WorkflowExecutionStatus = "preflight"
	WorkflowExecutionAwaitingConfirmation WorkflowExecutionStatus = "awaiting_confirmation"
	WorkflowExecutionRunning              WorkflowExecutionStatus = "running"
	WorkflowExecutionNeedsReview          WorkflowExecutionStatus = "needs_review"
	WorkflowExecutionCompleted            WorkflowExecutionStatus = "completed"
	WorkflowExecutionBlocked              WorkflowExecutionStatus = "blocked"
	WorkflowExecutionPartial              WorkflowExecutionStatus = "partial"
	WorkflowExecutionFailed               WorkflowExecutionStatus = "failed"
	WorkflowExecutionCancelled            WorkflowExecutionStatus = "cancelled"

	WorkflowNodeExecutionBlocked     WorkflowNodeExecutionStatus = "blocked"
	WorkflowNodeExecutionReady       WorkflowNodeExecutionStatus = "ready"
	WorkflowNodeExecutionQueued      WorkflowNodeExecutionStatus = "queued"
	WorkflowNodeExecutionRunning     WorkflowNodeExecutionStatus = "running"
	WorkflowNodeExecutionNeedsReview WorkflowNodeExecutionStatus = "needs_review"
	WorkflowNodeExecutionApproved    WorkflowNodeExecutionStatus = "approved"
	WorkflowNodeExecutionCompleted   WorkflowNodeExecutionStatus = "completed"
	WorkflowNodeExecutionSkipped     WorkflowNodeExecutionStatus = "skipped"
	WorkflowNodeExecutionFailed      WorkflowNodeExecutionStatus = "failed"
	WorkflowNodeExecutionCancelled   WorkflowNodeExecutionStatus = "cancelled"
)

type WorkflowDefinition struct {
	ID                   string            `json:"id" gorm:"primaryKey"`
	Name                 string            `json:"name" gorm:"index;uniqueIndex:idx_workflow_owner_name,priority:4"`
	Summary              string            `json:"summary" gorm:"type:text"`
	TagsJSON             string            `json:"-" gorm:"type:text"`
	OwnerType            WorkflowOwnerType `json:"ownerType" gorm:"index;uniqueIndex:idx_workflow_owner_name,priority:1"`
	OwnerUserID          string            `json:"ownerUserId" gorm:"index;uniqueIndex:idx_workflow_owner_name,priority:2"`
	OwnerProjectID       string            `json:"ownerProjectId" gorm:"index;uniqueIndex:idx_workflow_owner_name,priority:3"`
	Enabled              bool              `json:"enabled" gorm:"index"`
	RecommendedVersionID string            `json:"recommendedVersionId" gorm:"index"`
	CreatedAt            string            `json:"createdAt"`
	UpdatedAt            string            `json:"updatedAt"`
}

type WorkflowVersion struct {
	ID          string                `json:"id" gorm:"primaryKey"`
	WorkflowID  string                `json:"workflowId" gorm:"index;uniqueIndex:idx_workflow_version,priority:1"`
	Version     string                `json:"version" gorm:"uniqueIndex:idx_workflow_version,priority:2"`
	Status      WorkflowVersionStatus `json:"status" gorm:"index"`
	PackageJSON string                `json:"-" gorm:"type:text"`
	ContentHash string                `json:"contentHash" gorm:"index"`
	CreatedBy   string                `json:"createdBy" gorm:"index"`
	PublishedAt string                `json:"publishedAt"`
	CreatedAt   string                `json:"createdAt"`
	UpdatedAt   string                `json:"updatedAt"`
}

type WorkflowExecution struct {
	ID                      string                  `json:"id" gorm:"primaryKey"`
	UserID                  string                  `json:"userId" gorm:"index;uniqueIndex:idx_workflow_execution_idempotency,priority:1"`
	ProjectID               string                  `json:"projectId" gorm:"index"`
	EpisodeID               string                  `json:"episodeId" gorm:"index"`
	WorkflowID              string                  `json:"workflowId" gorm:"index"`
	WorkflowVersionID       string                  `json:"workflowVersionId" gorm:"index"`
	WorkflowContentHash     string                  `json:"workflowContentHash" gorm:"index"`
	Status                  WorkflowExecutionStatus `json:"status" gorm:"index"`
	Revision                int                     `json:"revision"`
	EstimatedCredits        int64                   `json:"estimatedCredits"`
	IdempotencyKey          *string                 `json:"-" gorm:"uniqueIndex:idx_workflow_execution_idempotency,priority:2"`
	RequestHash             string                  `json:"-" gorm:"index"`
	ConfirmationFingerprint string                  `json:"confirmationFingerprint" gorm:"index"`
	CreatedAt               string                  `json:"createdAt"`
	UpdatedAt               string                  `json:"updatedAt"`
}

type WorkflowExecutionRevision struct {
	ID                           string `json:"id" gorm:"primaryKey"`
	UserID                       string `json:"userId" gorm:"index"`
	WorkflowExecutionID          string `json:"workflowExecutionId" gorm:"index;uniqueIndex:idx_workflow_execution_revision,priority:1"`
	Revision                     int    `json:"revision" gorm:"uniqueIndex:idx_workflow_execution_revision,priority:2"`
	WorkflowVersionID            string `json:"workflowVersionId" gorm:"index"`
	WorkflowContentHash          string `json:"workflowContentHash" gorm:"index"`
	RoutePreviewJSON             string `json:"-" gorm:"type:text"`
	InputArtifactRefsJSON        string `json:"-" gorm:"type:text"`
	ManualSelectionsJSON         string `json:"-" gorm:"type:text"`
	EstimatedCredits             int64  `json:"estimatedCredits"`
	ConfirmationRequirementsJSON string `json:"-" gorm:"type:text"`
	ConfirmationFingerprint      string `json:"confirmationFingerprint" gorm:"index"`
	CreatedAt                    string `json:"createdAt"`
}

type WorkflowNodeExecution struct {
	ID                     string                      `json:"id" gorm:"primaryKey"`
	UserID                 string                      `json:"userId" gorm:"index"`
	WorkflowExecutionID    string                      `json:"workflowExecutionId" gorm:"index;uniqueIndex:idx_workflow_node_execution,priority:1"`
	Revision               int                         `json:"revision" gorm:"uniqueIndex:idx_workflow_node_execution,priority:2"`
	Ordinal                int                         `json:"ordinal"`
	NodeKey                string                      `json:"nodeKey" gorm:"index;uniqueIndex:idx_workflow_node_execution,priority:3"`
	ExecutorType           string                      `json:"executorType" gorm:"index"`
	InvocationID           string                      `json:"invocationId" gorm:"index"`
	AgentPlanID            string                      `json:"agentPlanId" gorm:"index"`
	Status                 WorkflowNodeExecutionStatus `json:"status" gorm:"index"`
	OutputArtifactRefsJSON string                      `json:"-" gorm:"type:text"`
	ErrorCode              string                      `json:"errorCode" gorm:"index"`
	ErrorMessage           string                      `json:"errorMessage" gorm:"type:text"`
	CreatedAt              string                      `json:"createdAt"`
	UpdatedAt              string                      `json:"updatedAt"`
}

type WorkflowExecutionConfirmation struct {
	ID                   string `json:"id" gorm:"primaryKey"`
	UserID               string `json:"userId" gorm:"index"`
	WorkflowExecutionID  string `json:"workflowExecutionId" gorm:"index;uniqueIndex:idx_workflow_execution_confirmation,priority:1"`
	Revision             int    `json:"revision" gorm:"uniqueIndex:idx_workflow_execution_confirmation,priority:2"`
	Fingerprint          string `json:"fingerprint" gorm:"index"`
	EstimatedCredits     int64  `json:"estimatedCredits"`
	RequirementCodesJSON string `json:"-" gorm:"type:text"`
	ConfirmedAt          string `json:"confirmedAt"`
}
