package model

type VideoSubtitleEraseJobStatus string

const (
	VideoSubtitleEraseJobStatusQueued      VideoSubtitleEraseJobStatus = "queued"
	VideoSubtitleEraseJobStatusUploading   VideoSubtitleEraseJobStatus = "uploading"
	VideoSubtitleEraseJobStatusProcessing  VideoSubtitleEraseJobStatus = "processing"
	VideoSubtitleEraseJobStatusDownloading VideoSubtitleEraseJobStatus = "downloading"
	VideoSubtitleEraseJobStatusSucceeded   VideoSubtitleEraseJobStatus = "succeeded"
	VideoSubtitleEraseJobStatusFailed      VideoSubtitleEraseJobStatus = "failed"
)

type VideoSubtitleEraseJob struct {
	ID                       string                      `json:"id" gorm:"primaryKey"`
	UserID                   string                      `json:"-" gorm:"index"`
	ProjectID                string                      `json:"projectId" gorm:"index"`
	CanvasID                 string                      `json:"canvasId" gorm:"index"`
	SourceNodeID             string                      `json:"sourceNodeId"`
	SourceAssetID            string                      `json:"sourceAssetId"`
	Provider                 string                      `json:"provider"`
	InputTOSURL              string                      `json:"-" gorm:"type:text"`
	RunID                    string                      `json:"runId" gorm:"index"`
	ClientToken              string                      `json:"-" gorm:"index"`
	ProviderRequestID        string                      `json:"providerRequestId"`
	ProcessingStage          string                      `json:"processingStage"`
	Status                   VideoSubtitleEraseJobStatus `json:"status" gorm:"index"`
	Progress                 int                         `json:"progress"`
	Attempt                  int                         `json:"attempt"`
	InputWidth               int                         `json:"inputWidth"`
	InputHeight              int                         `json:"inputHeight"`
	InputDurationSeconds     float64                     `json:"inputDurationSeconds"`
	InputMIMEType            string                      `json:"inputMimeType"`
	InputBytes               int64                       `json:"inputBytes"`
	InputPath                string                      `json:"-" gorm:"type:text"`
	OutputWidth              int                         `json:"outputWidth"`
	OutputHeight             int                         `json:"outputHeight"`
	OutputDurationSeconds    float64                     `json:"outputDurationSeconds"`
	EstimatedBillableMinutes float64                     `json:"estimatedBillableMinutes"`
	EstimatedCostCNY         float64                     `json:"estimatedCostCny"`
	PricingRuleVersion       string                      `json:"pricingRuleVersion"`
	CostEstimateAvailable    bool                        `json:"costEstimateAvailable"`
	ResultSourceURL          string                      `json:"-" gorm:"type:text"`
	ResultURL                string                      `json:"resultUrl" gorm:"type:text"`
	ResultMIMEType           string                      `json:"resultMimeType"`
	ResultBytes              int64                       `json:"resultBytes"`
	ErrorCode                string                      `json:"errorCode"`
	ErrorMessage             string                      `json:"errorMessage" gorm:"type:text"`
	CloudProcessing          bool                        `json:"cloudProcessing"`
	CreatedAt                string                      `json:"createdAt" gorm:"index"`
	StartedAt                string                      `json:"startedAt"`
	CompletedAt              string                      `json:"completedAt"`
	UpdatedAt                string                      `json:"updatedAt"`
}
