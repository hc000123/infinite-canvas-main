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
