package model

type ImageUpscaleJobStatus string

const (
	ImageUpscaleJobStatusQueued      ImageUpscaleJobStatus = "queued"
	ImageUpscaleJobStatusProcessing  ImageUpscaleJobStatus = "processing"
	ImageUpscaleJobStatusDownloading ImageUpscaleJobStatus = "downloading"
	ImageUpscaleJobStatusSucceeded   ImageUpscaleJobStatus = "succeeded"
	ImageUpscaleJobStatusFailed      ImageUpscaleJobStatus = "failed"
)

type ImageUpscaleJob struct {
	ID                string                `json:"id" gorm:"primaryKey"`
	UserID            string                `json:"-" gorm:"index"`
	ProjectID         string                `json:"projectId" gorm:"index"`
	CanvasID          string                `json:"canvasId" gorm:"index"`
	SourceNodeID      string                `json:"sourceNodeId"`
	SourceAssetID     string                `json:"sourceAssetId"`
	Provider          string                `json:"provider"`
	ProviderRequestID string                `json:"providerRequestId"`
	Model             string                `json:"model"`
	Strategy          string                `json:"strategy"`
	Scale             int                   `json:"scale"`
	Status            ImageUpscaleJobStatus `json:"status" gorm:"index"`
	Progress          int                   `json:"progress"`
	Attempt           int                   `json:"attempt"`
	InputWidth        int                   `json:"inputWidth"`
	InputHeight       int                   `json:"inputHeight"`
	InputMIMEType     string                `json:"inputMimeType"`
	InputBytes        int64                 `json:"inputBytes"`
	InputPath         string                `json:"-" gorm:"type:text"`
	ResultURL         string                `json:"resultUrl" gorm:"type:text"`
	ResultMIMEType    string                `json:"resultMimeType"`
	ResultBytes       int64                 `json:"resultBytes"`
	OutputWidth       int                   `json:"outputWidth"`
	OutputHeight      int                   `json:"outputHeight"`
	ErrorCode         string                `json:"errorCode"`
	ErrorMessage      string                `json:"errorMessage" gorm:"type:text"`
	CloudProcessing   bool                  `json:"cloudProcessing"`
	CreatedAt         string                `json:"createdAt" gorm:"index"`
	StartedAt         string                `json:"startedAt"`
	CompletedAt       string                `json:"completedAt"`
	UpdatedAt         string                `json:"updatedAt"`
}
