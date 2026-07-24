package model

type AdminAccountQuery struct {
	Query
	Role   string
	Status string
}

type AdminAccountUpdate struct {
	Username    string     `json:"username"`
	DisplayName string     `json:"displayName"`
	Email       string     `json:"email"`
	Role        UserRole   `json:"role"`
	Status      UserStatus `json:"status"`
}

type AdminAccountPassword struct {
	Password string `json:"password"`
}
