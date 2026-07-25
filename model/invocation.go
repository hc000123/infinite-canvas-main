package model

type InvocationStatus string

const (
	InvocationStatusPlanned              InvocationStatus = "planned"
	InvocationStatusPreflight            InvocationStatus = "preflight"
	InvocationStatusAwaitingConfirmation InvocationStatus = "awaiting_confirmation"
	InvocationStatusQueued               InvocationStatus = "queued"
	InvocationStatusRunning              InvocationStatus = "running"
	InvocationStatusNeedsReview          InvocationStatus = "needs_review"
	InvocationStatusApproved             InvocationStatus = "approved"
	InvocationStatusApplied              InvocationStatus = "applied"
	InvocationStatusBlocked              InvocationStatus = "blocked"
	InvocationStatusFailed               InvocationStatus = "failed"
	InvocationStatusPartial              InvocationStatus = "partial"
	InvocationStatusRejected             InvocationStatus = "rejected"
	InvocationStatusCancelled            InvocationStatus = "cancelled"
)

// InvocationRun is the mutable aggregate header. Frozen request and execution
// history live in revision and attempt rows.
type InvocationRun struct {
	ID                      string           `json:"id" gorm:"size:128;primaryKey"`
	UserID                  string           `json:"userId" gorm:"size:128;index;uniqueIndex:idx_invocation_run_idempotency,priority:1"`
	Source                  string           `json:"source" gorm:"size:32;index"`
	ProjectID               string           `json:"projectId" gorm:"size:128;index"`
	EpisodeID               string           `json:"episodeId" gorm:"size:128;index"`
	IdempotencyKey          *string          `json:"idempotencyKey,omitempty" gorm:"size:256;uniqueIndex:idx_invocation_run_idempotency,priority:2"`
	RequestHash             string           `json:"requestHash" gorm:"size:80;index"`
	Status                  InvocationStatus `json:"status" gorm:"index"`
	LatestRevision          int              `json:"latestRevision"`
	LatestAttempt           int              `json:"latestAttempt"`
	ReviewedAttempt         int              `json:"reviewedAttempt"`
	ReviewedArtifactSetHash string           `json:"reviewedArtifactSetHash" gorm:"size:80;index"`
	AggregateErrorSummary   string           `json:"aggregateErrorSummary" gorm:"type:text"`
	CreatedAt               string           `json:"createdAt"`
	UpdatedAt               string           `json:"updatedAt"`
}

type InvocationPreflightRevision struct {
	ID                           string `json:"id" gorm:"size:128;primaryKey"`
	UserID                       string `json:"userId" gorm:"size:128;index"`
	InvocationID                 string `json:"invocationId" gorm:"size:128;index;uniqueIndex:idx_invocation_revision,priority:1"`
	Revision                     int    `json:"revision" gorm:"uniqueIndex:idx_invocation_revision,priority:2"`
	RequestHash                  string `json:"requestHash" gorm:"size:80;index"`
	SkillID                      string `json:"skillId" gorm:"size:128;index"`
	SkillVersionID               string `json:"skillVersionId" gorm:"size:128;index"`
	SkillVersion                 string `json:"skillVersion" gorm:"size:64"`
	SkillContentHash             string `json:"skillContentHash" gorm:"size:80;index"`
	SkillSnapshotJSON            string `json:"-" gorm:"type:text"`
	CoreSchemaSnapshotJSON       string `json:"-" gorm:"type:text"`
	SkillSchemaSnapshotJSON      string `json:"-" gorm:"type:text"`
	InputSnapshotJSON            string `json:"-" gorm:"type:text"`
	ParametersJSON               string `json:"-" gorm:"type:text"`
	ExecutionPolicyJSON          string `json:"-" gorm:"type:text"`
	RouteTraceJSON               string `json:"-" gorm:"type:text"`
	ConfirmationRequirementsJSON string `json:"-" gorm:"type:text"`
	BlockReasonsJSON             string `json:"-" gorm:"type:text"`
	CreatedAt                    string `json:"createdAt"`
}

type InvocationAttempt struct {
	ID                   string `json:"id" gorm:"size:128;primaryKey"`
	UserID               string `json:"userId" gorm:"size:128;index"`
	InvocationID         string `json:"invocationId" gorm:"size:128;index;uniqueIndex:idx_invocation_attempt,priority:1"`
	AgentRunID           string `json:"agentRunId" gorm:"size:128;index"`
	Status               string `json:"status" gorm:"size:32;index"`
	Revision             int    `json:"revision"`
	Attempt              int    `json:"attempt" gorm:"uniqueIndex:idx_invocation_attempt,priority:2"`
	RawOutput            string `json:"-" gorm:"type:text"`
	StructuredOutputJSON string `json:"-" gorm:"type:text"`
	ErrorClass           string `json:"errorClass" gorm:"size:64;index"`
	ErrorMessage         string `json:"errorMessage" gorm:"type:text"`
	Model                string `json:"model" gorm:"size:128;index"`
	ChannelID            string `json:"channelId" gorm:"size:128;index"`
	ExecutorKind         string `json:"executorKind" gorm:"size:64;index"`
	ToolTraceJSON        string `json:"-" gorm:"type:text"`
	CreditsReserved      int    `json:"creditsReserved"`
	CreditsRefunded      int    `json:"creditsRefunded"`
	DurationMs           int64  `json:"durationMs"`
	StartedAt            string `json:"startedAt"`
	FinishedAt           string `json:"finishedAt"`
	CreatedAt            string `json:"createdAt"`
	UpdatedAt            string `json:"updatedAt"`
}

type InvocationEvent struct {
	ID           uint64 `json:"id" gorm:"primaryKey;autoIncrement"`
	UserID       string `json:"userId" gorm:"size:128;index"`
	InvocationID string `json:"invocationId" gorm:"size:128;index"`
	Type         string `json:"type" gorm:"size:80;index"`
	Level        string `json:"level" gorm:"size:16;index"`
	DataJSON     string `json:"-" gorm:"type:text"`
	Revision     int    `json:"revision"`
	Attempt      int    `json:"attempt"`
	CreatedAt    string `json:"createdAt" gorm:"size:40;index"`
}

type InvocationArtifactRef struct {
	ID                string `json:"id" gorm:"size:128;primaryKey"`
	UserID            string `json:"userId" gorm:"size:128;index"`
	InvocationID      string `json:"invocationId" gorm:"size:128;index;uniqueIndex:idx_invocation_artifact_ref,priority:1"`
	Direction         string `json:"direction" gorm:"size:16;index;uniqueIndex:idx_invocation_artifact_ref,priority:2"`
	BindingName       string `json:"bindingName" gorm:"size:128;uniqueIndex:idx_invocation_artifact_ref,priority:5"`
	ArtifactID        string `json:"artifactId" gorm:"size:128;index"`
	ArtifactHash      string `json:"artifactHash" gorm:"size:80;index"`
	ArtifactType      string `json:"artifactType" gorm:"size:80;index"`
	SchemaVersion     string `json:"schemaVersion" gorm:"size:64"`
	SchemaContentHash string `json:"schemaContentHash" gorm:"size:80;index"`
	Revision          int    `json:"revision" gorm:"uniqueIndex:idx_invocation_artifact_ref,priority:3"`
	Attempt           int    `json:"attempt" gorm:"uniqueIndex:idx_invocation_artifact_ref,priority:4"`
	Ordinal           int    `json:"ordinal" gorm:"uniqueIndex:idx_invocation_artifact_ref,priority:6"`
	CreatedAt         string `json:"createdAt"`
}

type InvocationGateResult struct {
	ID               string `json:"id" gorm:"size:128;primaryKey"`
	UserID           string `json:"userId" gorm:"size:128;index"`
	InvocationID     string `json:"invocationId" gorm:"size:128;index;uniqueIndex:idx_invocation_gate,priority:1"`
	ArtifactID       string `json:"artifactId" gorm:"size:128;index"`
	ArtifactHash     string `json:"artifactHash" gorm:"size:80;index;uniqueIndex:idx_invocation_gate,priority:6"`
	Layer            string `json:"layer" gorm:"size:32;index;uniqueIndex:idx_invocation_gate,priority:4"`
	ValidatorID      string `json:"validatorId" gorm:"size:128;index;uniqueIndex:idx_invocation_gate,priority:5"`
	ValidatorVersion string `json:"validatorVersion" gorm:"size:64"`
	IssuesJSON       string `json:"-" gorm:"type:text"`
	Attempt          int    `json:"attempt" gorm:"uniqueIndex:idx_invocation_gate,priority:2"`
	ExecutionOrdinal int    `json:"executionOrdinal" gorm:"uniqueIndex:idx_invocation_gate,priority:3"`
	Passed           bool   `json:"passed"`
	CreatedAt        string `json:"createdAt"`
}

type InvocationReview struct {
	ID              string `json:"id" gorm:"size:128;primaryKey"`
	UserID          string `json:"userId" gorm:"size:128;index"`
	InvocationID    string `json:"invocationId" gorm:"size:128;index;uniqueIndex:idx_invocation_review,priority:1"`
	Decision        string `json:"decision" gorm:"size:32;index;uniqueIndex:idx_invocation_review,priority:4"`
	ArtifactSetHash string `json:"artifactSetHash" gorm:"size:80;index;uniqueIndex:idx_invocation_review,priority:3"`
	Comment         string `json:"comment" gorm:"type:text"`
	ActorID         string `json:"actorId" gorm:"size:128;index"`
	Attempt         int    `json:"attempt" gorm:"uniqueIndex:idx_invocation_review,priority:2"`
	CreatedAt       string `json:"createdAt"`
}

type InvocationApplyAttempt struct {
	ID              string `json:"id" gorm:"size:128;primaryKey"`
	UserID          string `json:"userId" gorm:"size:128;index;uniqueIndex:idx_invocation_apply,priority:1"`
	InvocationID    string `json:"invocationId" gorm:"size:128;index;uniqueIndex:idx_invocation_apply,priority:2"`
	IdempotencyKey  string `json:"idempotencyKey" gorm:"size:256;uniqueIndex:idx_invocation_apply,priority:3"`
	RequestHash     string `json:"requestHash" gorm:"size:80;index"`
	ArtifactSetHash string `json:"artifactSetHash" gorm:"size:80;index"`
	Target          string `json:"target" gorm:"size:64;index"`
	TargetID        string `json:"targetId" gorm:"size:128;index"`
	Status          string `json:"status" gorm:"size:32;index"`
	ReceiptJSON     string `json:"-" gorm:"type:text"`
	ErrorMessage    string `json:"errorMessage" gorm:"type:text"`
	Attempt         int    `json:"attempt"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type InvocationQuery struct {
	ProjectID string
	EpisodeID string
	Source    string
	Status    string
	SkillID   string
	Page      int
	PageSize  int
}

func (q *InvocationQuery) Normalize() {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 20
	}
	if q.PageSize > MaxPageSize {
		q.PageSize = MaxPageSize
	}
}

func (q InvocationQuery) Offset() int { return (q.Page - 1) * q.PageSize }
