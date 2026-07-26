package model

type AgentPlanStatus string
type AgentPlanStepStatus string

const (
	AgentPlanDraft                AgentPlanStatus = "draft"
	AgentPlanPreflight            AgentPlanStatus = "preflight"
	AgentPlanAwaitingConfirmation AgentPlanStatus = "awaiting_confirmation"
	AgentPlanRunning              AgentPlanStatus = "running"
	AgentPlanNeedsReview          AgentPlanStatus = "needs_review"
	AgentPlanCompleted            AgentPlanStatus = "completed"
	AgentPlanBlocked              AgentPlanStatus = "blocked"
	AgentPlanFailed               AgentPlanStatus = "failed"
	AgentPlanCancelled            AgentPlanStatus = "cancelled"

	AgentPlanStepPending     AgentPlanStepStatus = "pending"
	AgentPlanStepReady       AgentPlanStepStatus = "ready"
	AgentPlanStepQueued      AgentPlanStepStatus = "queued"
	AgentPlanStepRunning     AgentPlanStepStatus = "running"
	AgentPlanStepNeedsReview AgentPlanStepStatus = "needs_review"
	AgentPlanStepApproved    AgentPlanStepStatus = "approved"
	AgentPlanStepCompleted   AgentPlanStepStatus = "completed"
	AgentPlanStepFailed      AgentPlanStepStatus = "failed"
	AgentPlanStepCancelled   AgentPlanStepStatus = "cancelled"
)

type AgentPlan struct {
	ID                      string          `json:"id" gorm:"primaryKey"`
	UserID                  string          `json:"userId" gorm:"index;uniqueIndex:idx_agent_plan_idempotency,priority:1"`
	ProjectID               string          `json:"projectId" gorm:"index"`
	EpisodeID               string          `json:"episodeId" gorm:"index"`
	AgentID                 string          `json:"agentId" gorm:"index"`
	AgentVersionID          string          `json:"agentVersionId" gorm:"index"`
	Goal                    string          `json:"goal" gorm:"type:text"`
	Status                  AgentPlanStatus `json:"status" gorm:"index"`
	CurrentRevision         int             `json:"currentRevision"`
	EstimatedCredits        int64           `json:"estimatedCredits"`
	ConfirmationFingerprint string          `json:"confirmationFingerprint" gorm:"index"`
	IdempotencyKey          string          `json:"idempotencyKey" gorm:"uniqueIndex:idx_agent_plan_idempotency,priority:2"`
	RequestHash             string          `json:"requestHash" gorm:"index"`
	CreatedAt               string          `json:"createdAt"`
	UpdatedAt               string          `json:"updatedAt"`
}

type AgentPlanRevision struct {
	ID                      string `json:"id" gorm:"primaryKey"`
	UserID                  string `json:"userId" gorm:"index"`
	AgentPlanID             string `json:"agentPlanId" gorm:"index;uniqueIndex:idx_agent_plan_revision,priority:1"`
	Revision                int    `json:"revision" gorm:"uniqueIndex:idx_agent_plan_revision,priority:2"`
	AgentVersionID          string `json:"agentVersionId" gorm:"index"`
	AgentContentHash        string `json:"agentContentHash" gorm:"index"`
	Goal                    string `json:"goal" gorm:"type:text"`
	SourceArtifactRefsJSON  string `json:"-" gorm:"type:text"`
	PlanSnapshotJSON        string `json:"-" gorm:"type:text"`
	ConfirmationFingerprint string `json:"confirmationFingerprint" gorm:"index"`
	EstimatedCredits        int64  `json:"estimatedCredits"`
	CreatedAt               string `json:"createdAt"`
}

type AgentPlanStep struct {
	ID                     string              `json:"id" gorm:"primaryKey"`
	UserID                 string              `json:"userId" gorm:"index"`
	AgentPlanID            string              `json:"agentPlanId" gorm:"index;uniqueIndex:idx_agent_plan_step,priority:1"`
	Revision               int                 `json:"revision" gorm:"uniqueIndex:idx_agent_plan_step,priority:2"`
	Ordinal                int                 `json:"ordinal" gorm:"uniqueIndex:idx_agent_plan_step,priority:3"`
	StepKey                string              `json:"stepKey" gorm:"index"`
	Label                  string              `json:"label"`
	Capability             string              `json:"capability" gorm:"index"`
	SkillID                string              `json:"skillId" gorm:"index"`
	SkillVersionID         string              `json:"skillVersionId" gorm:"index"`
	SkillVersion           string              `json:"skillVersion"`
	SkillContentHash       string              `json:"skillContentHash" gorm:"index"`
	InputBindingsJSON      string              `json:"-" gorm:"type:text"`
	ParametersJSON         string              `json:"-" gorm:"type:text"`
	ExpectedOutputType     string              `json:"expectedOutputType" gorm:"index"`
	InvocationID           string              `json:"invocationId" gorm:"index"`
	Status                 AgentPlanStepStatus `json:"status" gorm:"index"`
	OutputArtifactRefsJSON string              `json:"-" gorm:"type:text"`
	ErrorCode              string              `json:"errorCode" gorm:"index"`
	ErrorMessage           string              `json:"errorMessage" gorm:"type:text"`
	CreatedAt              string              `json:"createdAt"`
	UpdatedAt              string              `json:"updatedAt"`
}

type AgentPlanConfirmation struct {
	ID                   string `json:"id" gorm:"primaryKey"`
	UserID               string `json:"userId" gorm:"index"`
	AgentPlanID          string `json:"agentPlanId" gorm:"index;uniqueIndex:idx_agent_plan_confirmation,priority:1"`
	Revision             int    `json:"revision" gorm:"uniqueIndex:idx_agent_plan_confirmation,priority:2"`
	Fingerprint          string `json:"fingerprint" gorm:"index"`
	EstimatedCredits     int64  `json:"estimatedCredits"`
	RequirementCodesJSON string `json:"-" gorm:"type:text"`
	ConfirmedAt          string `json:"confirmedAt"`
}
