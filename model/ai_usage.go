package model

type AIUsagePeriod string

const (
	AIUsagePeriodDay   AIUsagePeriod = "day"
	AIUsagePeriodWeek  AIUsagePeriod = "week"
	AIUsagePeriodMonth AIUsagePeriod = "month"
)

type AIUsageQuery struct {
	Period   AIUsagePeriod
	Page     int
	PageSize int
}

func (q *AIUsageQuery) Normalize() {
	if q.Period != AIUsagePeriodDay && q.Period != AIUsagePeriodWeek && q.Period != AIUsagePeriodMonth {
		q.Period = AIUsagePeriodMonth
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 10
	}
	if q.PageSize > MaxPageSize {
		q.PageSize = MaxPageSize
	}
}

func (q AIUsageQuery) Offset() int {
	return (q.Page - 1) * q.PageSize
}

type AIUsageRow struct {
	UserID     string
	NetCredits int
}

type AIUsageSource string

const (
	AIUsageSourceAITask   AIUsageSource = "ai_task"
	AIUsageSourceAgentRun AIUsageSource = "agent_run"
	AIUsageSourceUnknown  AIUsageSource = "unknown"
)

type AIUsageLedgerRow struct {
	UserID          string
	UsageKey        string
	ConsumedAt      string
	ConsumedCredits int
	RefundedCredits int
}

type AIUsageRecordQuery struct {
	ExactUserID string
	User        string
	Period      AIUsagePeriod
	Kind        string
	Model       string
	Status      string
	StartAt     string
	EndAt       string
	Page        int
	PageSize    int
}

func (q *AIUsageRecordQuery) Normalize() {
	if q.Period != AIUsagePeriodDay && q.Period != AIUsagePeriodWeek && q.Period != AIUsagePeriodMonth {
		q.Period = AIUsagePeriodMonth
	}
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

func (q AIUsageRecordQuery) Offset() int {
	return (q.Page - 1) * q.PageSize
}

type AIUsageRecord struct {
	ID              string              `json:"id"`
	RelatedID       string              `json:"relatedId"`
	UserID          string              `json:"userId"`
	User            UserSummary         `json:"user"`
	SourceType      AIUsageSource       `json:"sourceType"`
	Kind            string              `json:"kind"`
	Model           string              `json:"model"`
	Status          string              `json:"status"`
	Credits         int                 `json:"credits"`
	CreditsRefunded int                 `json:"creditsRefunded"`
	NetCredits      int                 `json:"netCredits"`
	Provider        string              `json:"provider"`
	UpstreamTaskID  string              `json:"upstreamTaskId"`
	ErrorMessage    string              `json:"errorMessage"`
	CreatedAt       string              `json:"createdAt"`
	FrontendTrace   AITaskFrontendTrace `json:"frontendTrace"`
}

type AIUsageRecordList struct {
	Items    []AIUsageRecord `json:"items"`
	Total    int             `json:"total"`
	Page     int             `json:"page"`
	PageSize int             `json:"pageSize"`
}

type AIUsagePeriodSummary struct {
	Key        AIUsagePeriod `json:"key"`
	StartAt    string        `json:"startAt"`
	EndAt      string        `json:"endAt"`
	NetCredits int           `json:"netCredits"`
	UsageCount int           `json:"usageCount"`
	UserCount  int           `json:"userCount"`
}

type AIUsageUser struct {
	UserID     string      `json:"userId"`
	User       UserSummary `json:"user"`
	NetCredits int         `json:"netCredits"`
	UsageCount int         `json:"usageCount"`
	Ratio      float64     `json:"ratio"`
}

type AIUsageSummary struct {
	Periods        []AIUsagePeriodSummary `json:"periods"`
	SelectedPeriod AIUsagePeriod          `json:"selectedPeriod"`
	Users          []AIUsageUser          `json:"users"`
	UserTotal      int                    `json:"userTotal"`
	Page           int                    `json:"page"`
	PageSize       int                    `json:"pageSize"`
}
