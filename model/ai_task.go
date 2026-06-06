package model

type AITaskStatus string

const (
	AITaskStatusCreated   AITaskStatus = "created"
	AITaskStatusQueued    AITaskStatus = "queued"
	AITaskStatusRunning   AITaskStatus = "running"
	AITaskStatusSucceeded AITaskStatus = "succeeded"
	AITaskStatusFailed    AITaskStatus = "failed"
	AITaskStatusCancelled AITaskStatus = "cancelled"
)

// AITask 记录一次后端云端 AI 代理调用。
type AITask struct {
	ID                string                   `json:"id" gorm:"primaryKey"`
	UserID            string                   `json:"userId" gorm:"index"`
	Kind              string                   `json:"kind" gorm:"index"`
	TaskType          string                   `json:"taskType" gorm:"index"`
	ActionType        string                   `json:"actionType" gorm:"index"`
	Provider          string                   `json:"provider"`
	Protocol          string                   `json:"protocol"`
	Model             string                   `json:"model" gorm:"index"`
	Path              string                   `json:"path"`
	Status            AITaskStatus             `json:"status" gorm:"index"`
	Credits           int                      `json:"credits"`
	CreditsRefunded   int                      `json:"creditsRefunded"`
	UpstreamTaskID    string                   `json:"upstreamTaskId" gorm:"index"`
	RawStatus         string                   `json:"rawStatus"`
	VideoURL          string                   `json:"videoUrl" gorm:"type:text"`
	VideoURLExpiresAt int64                    `json:"videoUrlExpiresAt"`
	ErrorCode         string                   `json:"errorCode"`
	RequestJSON       string                   `json:"requestJson" gorm:"type:text"`
	ResponseJSON      string                   `json:"responseJson" gorm:"type:text"`
	ErrorMessage      string                   `json:"errorMessage" gorm:"type:text"`
	FinishedAt        string                   `json:"finishedAt"`
	RefundedAt        string                   `json:"refundedAt"`
	CreatedAt         string                   `json:"createdAt"`
	UpdatedAt         string                   `json:"updatedAt"`
	FrontendTrace     AITaskFrontendTrace      `json:"frontendTrace" gorm:"-"`
	FrontendArtifacts []AITaskFrontendArtifact `json:"frontendArtifacts" gorm:"-"`
}

type AITaskFrontendTrace struct {
	ProjectID         string   `json:"projectId"`
	CanvasID          string   `json:"canvasId"`
	NodeID            string   `json:"nodeId"`
	AssetID           string   `json:"assetId"`
	StoryboardGroupID string   `json:"storyboardGroupId"`
	StoryboardShotID  string   `json:"storyboardShotId"`
	ShotGroupID       string   `json:"shotGroupId"`
	ShotIDs           []string `json:"shotIds"`
	Source            string   `json:"source"`
}

type AITaskFrontendArtifact struct {
	AssetID           string   `json:"assetId"`
	CanvasID          string   `json:"canvasId"`
	NodeID            string   `json:"nodeId"`
	ProjectID         string   `json:"projectId"`
	StoryboardGroupID string   `json:"storyboardGroupId"`
	StoryboardShotID  string   `json:"storyboardShotId"`
	ShotGroupID       string   `json:"shotGroupId"`
	ShotIDs           []string `json:"shotIds"`
	Kind              string   `json:"kind"`
	CreatedAt         string   `json:"createdAt"`
}

type AITaskQuery struct {
	Keyword        string
	User           string
	Status         string
	Kind           string
	ActionType     string
	Model          string
	Provider       string
	UpstreamTaskID string
	StartAt        string
	EndAt          string
	Page           int
	PageSize       int
}

func (q *AITaskQuery) Normalize() {
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

func (q *AITaskQuery) Offset() int {
	return (q.Page - 1) * q.PageSize
}

type AITaskList struct {
	Items []AITask `json:"items"`
	Total int      `json:"total"`
}

type AITaskDetail struct {
	Task       AITask      `json:"task"`
	User       AuthUser    `json:"user"`
	CreditLogs []CreditLog `json:"creditLogs"`
}
