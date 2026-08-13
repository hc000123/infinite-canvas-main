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
	ID                   string                `json:"id" gorm:"primaryKey"`
	UserID               string                `json:"-" gorm:"index"`
	ProjectID            string                `json:"projectId" gorm:"index"`
	CanvasID             string                `json:"canvasId" gorm:"index"`
	SourceNodeID         string                `json:"sourceNodeId"`
	SourceAssetID        string                `json:"sourceAssetId"`
	Provider             string                `json:"provider"`
	VODSpaceName         string                `json:"-"`
	VODVid               string                `json:"vid" gorm:"index"`
	RunID                string                `json:"runId" gorm:"index"`
	ProviderRequestID    string                `json:"providerRequestId"`
	Target               string                `json:"target"`
	Scenario             string                `json:"scenario"`
	EnhanceLevel         string                `json:"enhanceLevel"`
	Status               VideoUpscaleJobStatus `json:"status" gorm:"index"`
	Progress             int                   `json:"progress"`
	Attempt              int                   `json:"attempt"`
	InputWidth           int                   `json:"inputWidth"`
	InputHeight          int                   `json:"inputHeight"`
	InputDurationSeconds float64               `json:"inputDurationSeconds"`
	InputMIMEType        string                `json:"inputMimeType"`
	InputBytes           int64                 `json:"inputBytes"`
	InputPath            string                `json:"-" gorm:"type:text"`
	OutputWidth          int                   `json:"outputWidth"`
	OutputHeight         int                   `json:"outputHeight"`
	ResultSourceURL      string                `json:"-" gorm:"type:text"`
	ResultURL            string                `json:"resultUrl" gorm:"type:text"`
	ResultMIMEType       string                `json:"resultMimeType"`
	ResultBytes          int64                 `json:"resultBytes"`
	ErrorCode            string                `json:"errorCode"`
	ErrorMessage         string                `json:"errorMessage" gorm:"type:text"`
	CloudProcessing      bool                  `json:"cloudProcessing"`
	CreatedAt            string                `json:"createdAt" gorm:"index"`
	StartedAt            string                `json:"startedAt"`
	CompletedAt          string                `json:"completedAt"`
	UpdatedAt            string                `json:"updatedAt"`
}
