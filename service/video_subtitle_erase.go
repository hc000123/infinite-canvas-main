package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

var videoSubtitleEraseMaxInputBytes int64 = 500 * 1024 * 1024

type VideoSubtitleEraseCreateInput struct {
	Filename      string
	ContentType   string
	ProjectID     string
	CanvasID      string
	SourceNodeID  string
	SourceAssetID string
}

type VideoSubtitleErasePricingRules struct {
	UnitPriceCNY float64 `json:"unitPriceCny"`
	RuleVersion  string  `json:"ruleVersion"`
}

type VideoSubtitleEraseCapabilitiesResult struct {
	Enabled         bool                           `json:"enabled"`
	Provider        string                         `json:"provider"`
	MaxInputBytes   int64                          `json:"maxInputBytes"`
	MaxInputWidth   int                            `json:"maxInputWidth"`
	MaxInputHeight  int                            `json:"maxInputHeight"`
	MaxOutputWidth  int                            `json:"maxOutputWidth"`
	MaxOutputHeight int                            `json:"maxOutputHeight"`
	OutputFormat    string                         `json:"outputFormat"`
	CloudProcessing bool                           `json:"cloudProcessing"`
	Pricing         VideoSubtitleErasePricingRules `json:"pricing"`
}

var videoSubtitleEraseMetadataProbe = probeVideoUpscaleMetadata
var videoSubtitleEraseJobStarter = func(string) {}

func CreateVideoSubtitleEraseJob(ctx context.Context, userID string, reader io.Reader, input VideoSubtitleEraseCreateInput) (model.VideoSubtitleEraseJob, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return model.VideoSubtitleEraseJob{}, safeMessageError{message: "请先登录"}
	}
	setting, err := currentVideoSubtitleEraseSetting()
	if err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	ext, mimeType, err := videoSubtitleEraseInputFormat(input.Filename, input.ContentType)
	if err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	if reader == nil {
		return model.VideoSubtitleEraseJob{}, safeMessageError{message: "视频不能为空"}
	}
	if err := ctx.Err(); err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	stamp := now()
	job := model.VideoSubtitleEraseJob{
		ID: newID("video-subtitle-erase"), UserID: userID, ProjectID: strings.TrimSpace(input.ProjectID), CanvasID: strings.TrimSpace(input.CanvasID), SourceNodeID: strings.TrimSpace(input.SourceNodeID), SourceAssetID: strings.TrimSpace(input.SourceAssetID),
		Provider: setting.Provider, ProcessingStage: "queued", Status: model.VideoSubtitleEraseJobStatusQueued, Progress: 5, Attempt: 1, InputMIMEType: mimeType, PricingRuleVersion: videoSubtitleErasePricingRuleVersion, CloudProcessing: true, CreatedAt: stamp, UpdatedAt: stamp,
	}
	job.ClientToken = job.ID
	job.InputPath, job.InputBytes, err = persistVideoSubtitleEraseInput(job, reader, ext)
	if err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(filepath.Dir(job.InputPath))
		}
	}()
	metadata, err := videoSubtitleEraseMetadataProbe(ctx, job.InputPath)
	if err != nil || metadata.Width < 1 || metadata.Height < 1 {
		return model.VideoSubtitleEraseJob{}, safeMessageError{message: "视频文件无效、已损坏或无法读取规格"}
	}
	job.InputWidth, job.InputHeight, job.InputDurationSeconds = metadata.Width, metadata.Height, metadata.DurationSeconds
	job.OutputWidth, job.OutputHeight, err = videoSubtitleEraseOutputDimensions(metadata.Width, metadata.Height)
	if err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	if estimate, ok := estimateVideoSubtitleEraseCost(metadata.DurationSeconds); ok {
		job.EstimatedBillableMinutes, job.EstimatedCostCNY, job.CostEstimateAvailable = estimate.BillableMinutes, estimate.CostCNY, true
	}
	job, err = repository.SaveVideoSubtitleEraseJob(job)
	if err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	cleanup = false
	videoSubtitleEraseJobStarter(job.ID)
	return job, nil
}

func GetUserVideoSubtitleEraseJob(userID, jobID string) (model.VideoSubtitleEraseJob, bool, error) {
	job, ok, err := repository.GetUserVideoSubtitleEraseJob(strings.TrimSpace(userID), strings.TrimSpace(jobID))
	if err != nil {
		return model.VideoSubtitleEraseJob{}, false, err
	}
	if !ok {
		return model.VideoSubtitleEraseJob{}, false, safeMessageError{message: "字幕擦除任务不存在"}
	}
	return job, true, nil
}

func RetryVideoSubtitleEraseJob(ctx context.Context, userID, jobID string) (model.VideoSubtitleEraseJob, error) {
	if _, err := currentVideoSubtitleEraseSetting(); err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	job, _, err := GetUserVideoSubtitleEraseJob(userID, jobID)
	if err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	if job.Status != model.VideoSubtitleEraseJobStatusFailed {
		return model.VideoSubtitleEraseJob{}, safeMessageError{message: "当前字幕擦除任务不能重试"}
	}
	if err := ctx.Err(); err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	if job.InputTOSURL == "" && job.RunID == "" && job.ResultSourceURL == "" {
		if info, statErr := os.Stat(job.InputPath); statErr != nil || info.IsDir() {
			return model.VideoSubtitleEraseJob{}, safeMessageError{message: "原始视频已不存在，请重新发起字幕擦除"}
		}
	}
	job.Status, job.Progress, job.ProcessingStage, job.Attempt = model.VideoSubtitleEraseJobStatusQueued, 5, "queued", job.Attempt+1
	job.ErrorCode, job.ErrorMessage, job.CompletedAt, job.UpdatedAt = "", "", "", now()
	job, err = repository.SaveVideoSubtitleEraseJob(job)
	if err != nil {
		return model.VideoSubtitleEraseJob{}, err
	}
	videoSubtitleEraseJobStarter(job.ID)
	return job, nil
}

func RecoverInterruptedVideoSubtitleEraseJobs() error {
	jobs, err := repository.ListActiveVideoSubtitleEraseJobs()
	if err != nil {
		return err
	}
	for _, job := range jobs {
		canResume := job.InputTOSURL != "" || job.RunID != "" || job.ResultSourceURL != ""
		if !canResume && job.InputPath != "" {
			info, statErr := os.Stat(job.InputPath)
			canResume = statErr == nil && !info.IsDir()
		}
		if canResume {
			videoSubtitleEraseJobStarter(job.ID)
			continue
		}
		job.Status, job.ErrorCode, job.ErrorMessage = model.VideoSubtitleEraseJobStatusFailed, "server_restarted", "字幕擦除任务因服务重启中断，请重试"
		job.CompletedAt, job.UpdatedAt = now(), now()
		if _, err := repository.SaveVideoSubtitleEraseJob(job); err != nil {
			return err
		}
	}
	return nil
}

func VideoSubtitleEraseCapabilities() VideoSubtitleEraseCapabilitiesResult {
	setting, err := currentVideoSubtitleEraseSetting()
	provider := "volcengine-las"
	if setting.Provider != "" {
		provider = setting.Provider
	}
	return VideoSubtitleEraseCapabilitiesResult{
		Enabled: err == nil, Provider: provider, MaxInputBytes: videoSubtitleEraseMaxInputBytes, MaxInputWidth: 2560, MaxInputHeight: 2560, MaxOutputWidth: 1920, MaxOutputHeight: 1920, OutputFormat: "mp4", CloudProcessing: true,
		Pricing: VideoSubtitleErasePricingRules{UnitPriceCNY: videoSubtitleEraseUnitPriceCNY, RuleVersion: videoSubtitleErasePricingRuleVersion},
	}
}

func currentVideoSubtitleEraseSetting() (model.VideoUpscaleSetting, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return model.VideoUpscaleSetting{}, err
	}
	normalized := normalizeSettings(settings)
	setting := normalized.Private.VideoUpscale
	if !setting.Enabled || !setting.SubtitleEraseEnabled {
		return model.VideoUpscaleSetting{}, safeMessageError{message: "服务端尚未启用字幕擦除"}
	}
	credentials := normalized.Private.VolcengineAsset
	if setting.APIKey == "" || setting.OutputTOSPath == "" || credentials.AccessKey == "" || credentials.SecretKey == "" {
		return model.VideoUpscaleSetting{}, safeMessageError{message: "服务端字幕擦除配置不完整"}
	}
	return setting, nil
}

func videoSubtitleEraseInputFormat(filename, contentType string) (string, string, error) {
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(filename)))
	mime := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	allowed := map[string][]string{
		".mp4": {"video/mp4"}, ".flv": {"video/x-flv"}, ".ts": {"video/mp2t"}, ".avi": {"video/x-msvideo"},
		".mov": {"video/quicktime", "video/mp4"}, ".wmv": {"video/x-ms-wmv", "video/x-ms-asf"}, ".mkv": {"video/x-matroska"},
	}
	mimes, ok := allowed[ext]
	if !ok {
		return "", "", safeMessageError{message: "字幕擦除仅支持 MP4、FLV、TS、AVI、MOV、WMV 或 MKV 视频"}
	}
	if mime != "" && mime != "application/octet-stream" {
		matched := false
		for _, candidate := range mimes {
			matched = matched || mime == candidate
		}
		if !matched {
			return "", "", safeMessageError{message: "视频文件格式与扩展名不一致"}
		}
	}
	return ext, mimes[0], nil
}

func videoSubtitleEraseOutputDimensions(width, height int) (int, int, error) {
	if width < 1 || height < 1 {
		return 0, 0, errors.New("invalid video dimensions")
	}
	longEdge, shortEdge := width, height
	if longEdge < shortEdge {
		longEdge, shortEdge = shortEdge, longEdge
	}
	if longEdge > 2560 || shortEdge > 1440 {
		return 0, 0, safeMessageError{message: "字幕擦除输入最高支持 2K 分辨率"}
	}
	if longEdge <= 1920 && shortEdge <= 1080 {
		return width, height, nil
	}
	scale := math.Min(1920/float64(longEdge), 1080/float64(shortEdge))
	return evenVideoDimension(float64(width) * scale), evenVideoDimension(float64(height) * scale), nil
}

func persistVideoSubtitleEraseInput(job model.VideoSubtitleEraseJob, reader io.Reader, ext string) (string, int64, error) {
	dir := filepath.Join(config.Cfg.VideoUpscaleWorkDir, "subtitle-erase", "users", "user_"+stableSegmentHash(job.UserID), job.ID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", 0, err
	}
	path := filepath.Join(dir, "input"+ext)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", 0, err
	}
	written, copyErr := io.Copy(file, io.LimitReader(reader, videoSubtitleEraseMaxInputBytes+1))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(path)
		return "", 0, firstVideoUpscaleError(copyErr, closeErr)
	}
	if written == 0 {
		_ = os.Remove(path)
		return "", 0, safeMessageError{message: "视频不能为空"}
	}
	if written > videoSubtitleEraseMaxInputBytes {
		_ = os.Remove(path)
		return "", 0, safeMessageError{message: fmt.Sprintf("视频不能超过 %d MB", videoSubtitleEraseMaxInputBytes/(1024*1024))}
	}
	return path, written, nil
}
