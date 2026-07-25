package model

type AdminUserOverview struct {
	User              User `json:"user"`
	AITaskCount       int  `json:"aiTaskCount"`
	AICreditsConsumed int  `json:"aiCreditsConsumed"`
	CreditLogCount    int  `json:"creditLogCount"`
}
