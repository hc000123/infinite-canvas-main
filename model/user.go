package model

type UserRole string

const (
	UserRoleGuest      UserRole = "guest"
	UserRoleUser       UserRole = "user"
	UserRoleAdmin      UserRole = "admin"
	UserRoleSuperAdmin UserRole = "superadmin"
)

func IsAdminRole(role UserRole) bool {
	return role == UserRoleAdmin || role == UserRoleSuperAdmin
}

func IsSuperAdminRole(role UserRole) bool {
	return role == UserRoleSuperAdmin
}

type UserStatus string

const (
	UserStatusActive UserStatus = "active"
	UserStatusBan    UserStatus = "ban"
)

// User 系统用户。
type User struct {
	ID                string     `json:"id" gorm:"primaryKey"`
	Username          string     `json:"username" gorm:"uniqueIndex"`
	Password          string     `json:"password,omitempty"`
	Email             string     `json:"email"`
	DisplayName       string     `json:"displayName"`
	AvatarURL         string     `json:"avatarUrl"`
	Role              UserRole   `json:"role"`
	Credits           int        `json:"credits"`
	AffCode           string     `json:"affCode" gorm:"uniqueIndex"`
	AffCount          int        `json:"affCount"`
	InviterID         string     `json:"inviterId"`
	GithubID          string     `json:"githubId"`
	LinuxDoID         string     `json:"linuxDoId" gorm:"index"`
	WechatID          string     `json:"wechatId"`
	Status            UserStatus `json:"status"`
	LastLoginAt       string     `json:"lastLoginAt"`
	Extra             string     `json:"extra" gorm:"type:text"`
	CreatedAt         string     `json:"createdAt"`
	UpdatedAt         string     `json:"updatedAt"`
	IPApprovalEnabled bool       `json:"ipApprovalEnabled"`
}

// UserList 用户分页结果。
type UserList struct {
	Items []User `json:"items"`
	Total int    `json:"total"`
}

type UserSummary struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

func SummaryUser(user User) UserSummary {
	return UserSummary{ID: user.ID, Username: user.Username, DisplayName: user.DisplayName}
}

// AuthUser 用户公开信息。
type AuthUser struct {
	ID          string   `json:"id"`
	Username    string   `json:"username"`
	DisplayName string   `json:"displayName"`
	AvatarURL   string   `json:"avatarUrl"`
	Role        UserRole `json:"role"`
	Credits     int      `json:"credits"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
}

// AuthSession 登录会话信息。
type AuthSession struct {
	Token string   `json:"token"`
	User  AuthUser `json:"user"`
}

type LoginApprovalClient struct {
	ID        string `json:"id"`
	Token     string `json:"token,omitempty"`
	Status    string `json:"status"`
	ExpiresAt string `json:"expiresAt"`
	IPAddress string `json:"ipAddress"`
}
type LoginResult struct {
	Status   string              `json:"status"`
	Session  AuthSession         `json:"session,omitempty"`
	Approval LoginApprovalClient `json:"approval,omitempty"`
}

func PublicUser(user User) AuthUser {
	return AuthUser{
		ID:          user.ID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		AvatarURL:   user.AvatarURL,
		Role:        user.Role,
		Credits:     user.Credits,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
	}
}

type CreditLogType string

const (
	CreditLogTypeAdminAdjust CreditLogType = "admin_adjust"
	CreditLogTypeAIConsume   CreditLogType = "ai_consume"
	CreditLogTypeAIRefund    CreditLogType = "ai_refund"
)

// CreditLog 用户算力点变更流水。
type CreditLog struct {
	ID        string        `json:"id" gorm:"primaryKey"`
	UserID    string        `json:"userId" gorm:"index"`
	Type      CreditLogType `json:"type"`
	Amount    int           `json:"amount"`
	Balance   int           `json:"balance"`
	RelatedID string        `json:"relatedId"`
	Remark    string        `json:"remark"`
	Extra     string        `json:"extra" gorm:"type:text"`
	CreatedAt string        `json:"createdAt"`
	User      UserSummary   `json:"user" gorm:"-"`
}

type CreditLogList struct {
	Items []CreditLog `json:"items"`
	Total int         `json:"total"`
}
