package model

type ActivityCategory string
type ActivityAction string
type ActivityResult string

const (
	ActivityCategoryAccount              ActivityCategory = "account"
	ActivityCategorySecurity             ActivityCategory = "security"
	ActivityCategoryProject              ActivityCategory = "project"
	ActivityCategoryCanvas               ActivityCategory = "canvas"
	ActivityCategoryAsset                ActivityCategory = "asset"
	ActivityCategoryAI                   ActivityCategory = "ai"
	ActivityCategoryTransfer             ActivityCategory = "transfer"
	ActivityCategoryCredit               ActivityCategory = "credit"
	ActivityResultSuccess                ActivityResult   = "success"
	ActivityResultFailed                 ActivityResult   = "failed"
	ActivityResultRejected               ActivityResult   = "rejected"
	ActivityActionLoginSucceeded         ActivityAction   = "login.succeeded"
	ActivityActionLoginFailed            ActivityAction   = "login.failed"
	ActivityActionLogout                 ActivityAction   = "account.logout"
	ActivityActionProjectCreated         ActivityAction   = "project.created"
	ActivityActionProjectRenamed         ActivityAction   = "project.renamed"
	ActivityActionProjectDeleted         ActivityAction   = "project.deleted"
	ActivityActionCanvasCreated          ActivityAction   = "canvas.created"
	ActivityActionCanvasRenamed          ActivityAction   = "canvas.renamed"
	ActivityActionCanvasDeleted          ActivityAction   = "canvas.deleted"
	ActivityActionAssetUploaded          ActivityAction   = "asset.uploaded"
	ActivityActionAssetCreated           ActivityAction   = "asset.created"
	ActivityActionAssetRenamed           ActivityAction   = "asset.renamed"
	ActivityActionAssetDeleted           ActivityAction   = "asset.deleted"
	ActivityActionAISubmitted            ActivityAction   = "ai.submitted"
	ActivityActionAISucceeded            ActivityAction   = "ai.succeeded"
	ActivityActionAIFailed               ActivityAction   = "ai.failed"
	ActivityActionAICancelled            ActivityAction   = "ai.cancelled"
	ActivityActionImportDone             ActivityAction   = "transfer.import_completed"
	ActivityActionExportDone             ActivityAction   = "transfer.export_completed"
	ActivityActionDownloadDone           ActivityAction   = "transfer.download_completed"
	ActivityActionCreditConsumed         ActivityAction   = "credit.consumed"
	ActivityActionCreditRefunded         ActivityAction   = "credit.refunded"
	ActivityActionCreditAdjusted         ActivityAction   = "credit.adjusted"
	ActivityActionAdminCreated           ActivityAction   = "security.admin_created"
	ActivityActionAdminUpdated           ActivityAction   = "security.admin_updated"
	ActivityActionAdminRoleChanged       ActivityAction   = "security.admin_role_changed"
	ActivityActionAdminDeleted           ActivityAction   = "security.admin_deleted"
	ActivityActionApprovalCreated        ActivityAction   = "security.login_approval_created"
	ActivityActionApprovalApproved       ActivityAction   = "security.login_approval_approved"
	ActivityActionApprovalRejected       ActivityAction   = "security.login_approval_rejected"
	ActivityActionSessionReplaced        ActivityAction   = "security.session_replaced"
	ActivityActionSessionForceLogout     ActivityAction   = "security.session_force_logout"
	ActivityActionSessionIdleExpired     ActivityAction   = "security.session_idle_expired"
	ActivityActionSessionAbsoluteExpired ActivityAction   = "security.session_absolute_expired"
	ActivityActionSessionAccountChanged  ActivityAction   = "security.session_account_changed"
)

type UserActivityLog struct {
	ID              string           `json:"id" gorm:"primaryKey"`
	UserID          string           `json:"userId" gorm:"index;uniqueIndex:idx_activity_client_event,priority:1"`
	User            UserSummary      `json:"user" gorm:"-"`
	Category        ActivityCategory `json:"category" gorm:"index"`
	Action          ActivityAction   `json:"action" gorm:"index"`
	Result          ActivityResult   `json:"result"`
	TargetType      string           `json:"targetType"`
	TargetID        string           `json:"targetId" gorm:"index"`
	TargetName      string           `json:"targetName"`
	Summary         string           `json:"summary"`
	IPAddress       string           `json:"ipAddress" gorm:"index"`
	IPAllowed       bool             `json:"ipAllowed" gorm:"index"`
	SessionID       string           `json:"sessionId" gorm:"index"`
	LoginApprovalID string           `json:"loginApprovalId"`
	UserAgent       string           `json:"userAgent"`
	ClientEventID   string           `json:"clientEventId" gorm:"uniqueIndex:idx_activity_client_event,priority:2"`
	Metadata        string           `json:"metadata" gorm:"type:text"`
	CreatedAt       string           `json:"createdAt" gorm:"index"`
}

type UserActivityQuery struct {
	Query
	ExactUserID   string
	Category      string
	Action        string
	Result        string
	IPAddress     string
	OutsideIPOnly bool
	StartAt       string
	EndAt         string
}

type UserActivityList struct {
	Items []UserActivityLog `json:"items"`
	Total int               `json:"total"`
}
