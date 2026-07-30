package model

type LoginSessionStatus string

const (
	LoginSessionActive          LoginSessionStatus = "active"
	LoginSessionReplaced        LoginSessionStatus = "replaced"
	LoginSessionLoggedOut       LoginSessionStatus = "logged_out"
	LoginSessionAdminRevoked    LoginSessionStatus = "admin_revoked"
	LoginSessionIdleExpired     LoginSessionStatus = "idle_expired"
	LoginSessionAbsoluteExpired LoginSessionStatus = "absolute_expired"
	LoginSessionAccountChanged  LoginSessionStatus = "account_changed"
)

const (
	AuthCodeSessionInvalid     = 1001
	AuthCodeSessionReplaced    = 1002
	AuthCodeSessionRevoked     = 1003
	AuthCodeSessionIdleExpired = 1004
	AuthCodeSessionExpired     = 1005
)

type LoginSession struct {
	ID                string             `json:"id" gorm:"primaryKey"`
	UserID            string             `json:"userId" gorm:"index"`
	Status            LoginSessionStatus `json:"status" gorm:"index"`
	IPAddress         string             `json:"ipAddress"`
	UserAgent         string             `json:"userAgent"`
	DeviceName        string             `json:"deviceName"`
	CreatedAt         string             `json:"createdAt"`
	LastActiveAt      string             `json:"lastActiveAt" gorm:"index"`
	AbsoluteExpiresAt string             `json:"absoluteExpiresAt" gorm:"index"`
	RevokedAt         string             `json:"revokedAt"`
	RevokedBy         string             `json:"revokedBy"`
	RevokeReason      string             `json:"revokeReason"`
	UpdatedAt         string             `json:"updatedAt"`
}

type LoginSessionView struct {
	Online            bool               `json:"online"`
	Status            LoginSessionStatus `json:"status"`
	IPAddress         string             `json:"ipAddress"`
	DeviceName        string             `json:"deviceName"`
	CreatedAt         string             `json:"createdAt"`
	LastActiveAt      string             `json:"lastActiveAt"`
	AbsoluteExpiresAt string             `json:"absoluteExpiresAt"`
}
