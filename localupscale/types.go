package localupscale

import (
	"errors"
	"fmt"
)

const (
	ProtocolVersion             = "1"
	DefaultAddress              = "127.0.0.1:47821"
	ModelRealESRGANX4Plus       = "realesrgan-x4plus"
	MaxRequestBytes       int64 = 64 << 20
	MaxInputPixels        int64 = 40_000_000
	MaxOutputPixels       int64 = 160_000_000
)

type JobStatus string

const (
	JobQueued           JobStatus = "queued"
	JobPreparing        JobStatus = "preparing"
	JobDownloadingModel JobStatus = "downloading_model"
	JobProcessing       JobStatus = "processing"
	JobSaving           JobStatus = "saving"
	JobSucceeded        JobStatus = "succeeded"
	JobFailed           JobStatus = "failed"
	JobCancelled        JobStatus = "cancelled"
)

type CreateJobInput struct {
	ClientTaskID string `json:"clientTaskId"`
	ModelID      string `json:"modelId"`
	Scale        int    `json:"scale"`
	InputWidth   int    `json:"inputWidth"`
	InputHeight  int    `json:"inputHeight"`
}

type JobSnapshot struct {
	ID            string    `json:"id"`
	ClientTaskID  string    `json:"clientTaskId"`
	Status        JobStatus `json:"status"`
	Progress      *float64  `json:"progress,omitempty"`
	QueuePosition int       `json:"queuePosition,omitempty"`
	ModelID       string    `json:"modelId"`
	ModelVersion  string    `json:"modelVersion,omitempty"`
	Scale         int       `json:"scale"`
	InputWidth    int       `json:"inputWidth"`
	InputHeight   int       `json:"inputHeight"`
	OutputWidth   int       `json:"outputWidth,omitempty"`
	OutputHeight  int       `json:"outputHeight,omitempty"`
	Engine        string    `json:"engine"`
	EngineVersion string    `json:"engineVersion,omitempty"`
	StartedAt     string    `json:"startedAt"`
	CompletedAt   string    `json:"completedAt,omitempty"`
	DurationMS    int64     `json:"durationMs,omitempty"`
	ErrorCode     string    `json:"errorCode,omitempty"`
	ErrorMessage  string    `json:"errorMessage,omitempty"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func ValidateCreateJob(input CreateJobInput) error {
	if input.ClientTaskID == "" {
		return errors.New("缺少客户端任务 ID")
	}
	if input.ModelID != ModelRealESRGANX4Plus {
		return fmt.Errorf("不支持的模型：%s", input.ModelID)
	}
	if input.Scale != 2 && input.Scale != 4 {
		return errors.New("倍率只能为 2× 或 4×")
	}
	if input.InputWidth <= 0 || input.InputHeight <= 0 {
		return errors.New("图片尺寸无效")
	}
	width := int64(input.InputWidth)
	height := int64(input.InputHeight)
	if width > MaxInputPixels/height {
		return errors.New("图片尺寸超过本地超分限制")
	}
	inputPixels := width * height
	scaleSquared := int64(input.Scale * input.Scale)
	if inputPixels > MaxOutputPixels/scaleSquared {
		return errors.New("图片尺寸超过本地超分限制")
	}
	return nil
}
