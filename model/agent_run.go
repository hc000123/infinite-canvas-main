package model

type AgentRunStatus string

const (
	AgentRunStatusCreated     AgentRunStatus = "created"
	AgentRunStatusRunning     AgentRunStatus = "running"
	AgentRunStatusNeedsReview AgentRunStatus = "needs_review"
	AgentRunStatusApproved    AgentRunStatus = "approved"
	AgentRunStatusRejected    AgentRunStatus = "rejected"
	AgentRunStatusApplied     AgentRunStatus = "applied"
	AgentRunStatusFailed      AgentRunStatus = "failed"
)

type AgentConfigRecord struct {
	ID         string `json:"id" gorm:"primaryKey"`
	UserID     string `json:"userId" gorm:"index"`
	Scope      string `json:"scope" gorm:"index"`
	ProjectID  string `json:"projectId" gorm:"index"`
	EpisodeID  string `json:"episodeId" gorm:"index"`
	Kind       string `json:"kind" gorm:"index"`
	ConfigJSON string `json:"configJson" gorm:"type:text"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type AgentRun struct {
	ID                  string         `json:"id" gorm:"primaryKey"`
	UserID              string         `json:"userId" gorm:"index"`
	ProjectID           string         `json:"projectId" gorm:"index"`
	EpisodeID           string         `json:"episodeId" gorm:"index"`
	WorkflowRunID       string         `json:"workflowRunId" gorm:"index"`
	StageID             string         `json:"stageId" gorm:"index"`
	AgentKind           string         `json:"agentKind" gorm:"index"`
	Model               string         `json:"model" gorm:"index"`
	TargetModel         string         `json:"targetModel"`
	ChannelID           string         `json:"channelId" gorm:"index"`
	TargetChannelID     string         `json:"targetChannelId"`
	Provider            string         `json:"provider"`
	Protocol            string         `json:"protocol"`
	AllowFallback       bool           `json:"allowFallback"`
	FallbackUsed        bool           `json:"fallbackUsed"`
	FallbackReason      string         `json:"fallbackReason"`
	EstimatedCredits    int            `json:"estimatedCredits"`
	TimeoutSeconds      int            `json:"timeoutSeconds"`
	ConcurrencyLimit    int            `json:"concurrencyLimit"`
	AllowBatch          bool           `json:"allowBatch"`
	Status              AgentRunStatus `json:"status" gorm:"index"`
	WritePolicy         string         `json:"writePolicy"`
	RequiresConfirm     bool           `json:"requiresConfirm"`
	Credits             int            `json:"credits"`
	RequestJSON         string         `json:"requestJson" gorm:"type:text"`
	RawOutput           string         `json:"rawOutput" gorm:"type:text"`
	StructuredDraftJSON string         `json:"structuredDraftJson" gorm:"type:text"`
	ReviewJSON          string         `json:"reviewJson" gorm:"type:text"`
	MappingPreviewJSON  string         `json:"mappingPreviewJson" gorm:"type:text"`
	ErrorMessage        string         `json:"errorMessage" gorm:"type:text"`
	StartedAt           string         `json:"startedAt"`
	DurationMs          int64          `json:"durationMs"`
	ConfirmedAt         string         `json:"confirmedAt"`
	AppliedAt           string         `json:"appliedAt"`
	FinishedAt          string         `json:"finishedAt"`
	CreatedAt           string         `json:"createdAt"`
	UpdatedAt           string         `json:"updatedAt"`
}

type AgentRunQuery struct {
	ProjectID     string
	EpisodeID     string
	WorkflowRunID string
	StageID       string
	AgentKind     string
	Status        string
	Page          int
	PageSize      int
}

func (q *AgentRunQuery) Normalize() {
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

func (q *AgentRunQuery) Offset() int {
	return (q.Page - 1) * q.PageSize
}

type AgentRunList struct {
	Items []AgentRun `json:"items"`
	Total int        `json:"total"`
}
