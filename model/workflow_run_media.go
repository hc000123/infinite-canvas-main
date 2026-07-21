package model

const (
	WorkflowMediaBatchOpen    = "open"
	WorkflowMediaBatchClaimed = "claimed"
)

type WorkflowMediaBatch struct {
	ID             string `json:"id" gorm:"primaryKey"`
	UserID         string `json:"userId" gorm:"index;uniqueIndex:idx_workflow_media_batch_scope,priority:1"`
	WorkflowRunID  string `json:"workflowRunId" gorm:"index;uniqueIndex:idx_workflow_media_batch_scope,priority:2"`
	StageID        string `json:"stageId" gorm:"index;uniqueIndex:idx_workflow_media_batch_scope,priority:3"`
	IdempotencyKey string `json:"idempotencyKey" gorm:"uniqueIndex:idx_workflow_media_batch_scope,priority:4"`
	Status         string `json:"status" gorm:"index"`
	AgentRunID     string `json:"agentRunId" gorm:"index"`
	ExpiresAt      string `json:"expiresAt" gorm:"index"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type WorkflowMediaItem struct {
	ID         string `json:"id" gorm:"primaryKey"`
	BatchID    string `json:"batchId" gorm:"index"`
	AssetID    string `json:"assetId" gorm:"index"`
	Label      string `json:"label"`
	Kind       string `json:"kind" gorm:"index"`
	Version    string `json:"version"`
	Position   int    `json:"order"`
	SHA256     string `json:"sha256" gorm:"index"`
	MIME       string `json:"mime"`
	Size       int64  `json:"size"`
	ServerPath string `json:"-" gorm:"type:text"`
	CreatedAt  string `json:"createdAt"`
}

type WorkflowMediaBatchDetail struct {
	Batch WorkflowMediaBatch  `json:"batch"`
	Items []WorkflowMediaItem `json:"items"`
}
