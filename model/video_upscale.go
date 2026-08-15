package model

type VideoUpscaleJobStatus string

const (
	VideoUpscaleJobStatusQueued      VideoUpscaleJobStatus = "queued"
	VideoUpscaleJobStatusUploading   VideoUpscaleJobStatus = "uploading"
	VideoUpscaleJobStatusProcessing  VideoUpscaleJobStatus = "processing"
	VideoUpscaleJobStatusDownloading VideoUpscaleJobStatus = "downloading"
	VideoUpscaleJobStatusSucceeded   VideoUpscaleJobStatus = "succeeded"
	VideoUpscaleJobStatusFailed      VideoUpscaleJobStatus = "failed"
)

type VideoUpscaleJob struct {
	ID                                    string                `json:"id" gorm:"primaryKey"`
	UserID                                string                `json:"-" gorm:"index"`
	ProjectID                             string                `json:"projectId" gorm:"index"`
	CanvasID                              string                `json:"canvasId" gorm:"index"`
	SourceNodeID                          string                `json:"sourceNodeId"`
	SourceAssetID                         string                `json:"sourceAssetId"`
	Provider                              string                `json:"provider"`
	EnhancementScene                      string                `json:"enhancementScene"`
	TencentTemplateID                     int64                 `json:"tencentTemplateId"`
	TencentTemplateName                   string                `json:"tencentTemplateName"`
	CloudBucket                           string                `json:"-"`
	CloudRegion                           string                `json:"-"`
	CloudInputPrefix                      string                `json:"-"`
	CloudOutputPrefix                     string                `json:"-"`
	TencentOutputObject                   string                `json:"-" gorm:"type:text"`
	InputTOSURL                           string                `json:"-" gorm:"type:text"`
	OutputTOSPath                         string                `json:"-" gorm:"type:text"`
	RunID                                 string                `json:"runId" gorm:"index"`
	ProcessingStage                       string                `json:"processingStage"`
	InterpolationMode                     string                `json:"interpolationMode"`
	InterpolationTargetFrameRate          float64               `json:"interpolationTargetFrameRate"`
	InterpolationRunID                    string                `json:"interpolationRunId" gorm:"index"`
	UpscaleResultTOSURL                   string                `json:"-" gorm:"type:text"`
	InterpolationResultTOSURL             string                `json:"-" gorm:"type:text"`
	ProviderRequestID                     string                `json:"providerRequestId"`
	Target                                string                `json:"target"`
	Status                                VideoUpscaleJobStatus `json:"status" gorm:"index"`
	Progress                              int                   `json:"progress"`
	Attempt                               int                   `json:"attempt"`
	InputWidth                            int                   `json:"inputWidth"`
	InputHeight                           int                   `json:"inputHeight"`
	InputDurationSeconds                  float64               `json:"inputDurationSeconds"`
	InputFrameRate                        float64               `json:"inputFrameRate"`
	InputMIMEType                         string                `json:"inputMimeType"`
	InputBytes                            int64                 `json:"inputBytes"`
	InputPath                             string                `json:"-" gorm:"type:text"`
	OutputWidth                           int                   `json:"outputWidth"`
	OutputHeight                          int                   `json:"outputHeight"`
	OutputQualityMode                     string                `json:"outputQualityMode"`
	PreserveAudio                         bool                  `json:"preserveAudio"`
	FrameInterpolationMode                string                `json:"frameInterpolationMode"`
	EstimatedBillableMinutes              float64               `json:"estimatedBillableMinutes"`
	EstimatedCostCNY                      float64               `json:"estimatedCostCny"`
	PricingRuleVersion                    string                `json:"pricingRuleVersion"`
	CostEstimateAvailable                 bool                  `json:"costEstimateAvailable"`
	EstimatedInterpolationBillableMinutes float64               `json:"estimatedInterpolationBillableMinutes"`
	EstimatedInterpolationCostCNY         float64               `json:"estimatedInterpolationCostCny"`
	InterpolationCostEstimateAvailable    bool                  `json:"interpolationCostEstimateAvailable"`
	InterpolationPricingRuleVersion       string                `json:"interpolationPricingRuleVersion"`
	EstimatedTotalCostCNY                 float64               `json:"estimatedTotalCostCny"`
	ResultSourceURL                       string                `json:"-" gorm:"type:text"`
	ResultURL                             string                `json:"resultUrl" gorm:"type:text"`
	ResultMIMEType                        string                `json:"resultMimeType"`
	ResultBytes                           int64                 `json:"resultBytes"`
	ErrorCode                             string                `json:"errorCode"`
	ErrorMessage                          string                `json:"errorMessage" gorm:"type:text"`
	CloudProcessing                       bool                  `json:"cloudProcessing"`
	CreatedAt                             string                `json:"createdAt" gorm:"index"`
	StartedAt                             string                `json:"startedAt"`
	CompletedAt                           string                `json:"completedAt"`
	UpdatedAt                             string                `json:"updatedAt"`
}
