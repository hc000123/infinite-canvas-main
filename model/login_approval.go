package model

type LoginApprovalStatus string
type LoginApprovalScope string

const (
	LoginApprovalPending        LoginApprovalStatus = "pending"
	LoginApprovalApproved       LoginApprovalStatus = "approved"
	LoginApprovalRejected       LoginApprovalStatus = "rejected"
	LoginApprovalConsumed       LoginApprovalStatus = "consumed"
	LoginApprovalExpired        LoginApprovalStatus = "expired"
	LoginApprovalScopeOnce      LoginApprovalScope  = "once"
	LoginApprovalScopeWhitelist LoginApprovalScope  = "whitelist"
)

type UserAllowedIP struct {
	ID        string `json:"id" gorm:"primaryKey"`
	UserID    string `json:"userId" gorm:"uniqueIndex:idx_user_allowed_ip,priority:1"`
	CIDR      string `json:"cidr" gorm:"uniqueIndex:idx_user_allowed_ip,priority:2"`
	CreatedBy string `json:"createdBy"`
	CreatedAt string `json:"createdAt"`
}
type LoginApproval struct {
	ID          string              `json:"id" gorm:"primaryKey"`
	UserID      string              `json:"userId" gorm:"index"`
	User        UserSummary         `json:"user" gorm:"-"`
	RequestedIP string              `json:"requestedIp" gorm:"index"`
	UserAgent   string              `json:"userAgent"`
	TokenHash   string              `json:"-" gorm:"uniqueIndex"`
	Status      LoginApprovalStatus `json:"status" gorm:"index"`
	Scope       LoginApprovalScope  `json:"scope"`
	DecidedBy   string              `json:"decidedBy"`
	DecidedAt   string              `json:"decidedAt"`
	ExpiresAt   string              `json:"expiresAt" gorm:"index"`
	ConsumedAt  string              `json:"consumedAt"`
	CreatedAt   string              `json:"createdAt" gorm:"index"`
}
type LoginApprovalQuery struct {
	Query
	Status      string
	ExactUserID string
}
type LoginApprovalList struct {
	Items []LoginApproval `json:"items"`
	Total int             `json:"total"`
}
