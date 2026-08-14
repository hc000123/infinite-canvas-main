package service

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/volcengine/ve-tos-golang-sdk/v2/tos"
	"github.com/volcengine/ve-tos-golang-sdk/v2/tos/enum"
)

type VideoSubtitleErasePollResult struct {
	Status          string
	ResultURL       string
	DurationSeconds float64
	ErrorCode       string
	RequestID       string
}

type VideoSubtitleEraseProvider interface {
	Upload(context.Context, model.VideoSubtitleEraseJob) (string, error)
	SignedInputURL(context.Context, string) (string, error)
	Start(context.Context, model.VideoSubtitleEraseJob, string) (runID string, requestID string, err error)
	Poll(context.Context, model.VideoSubtitleEraseJob) (VideoSubtitleErasePollResult, error)
}

type videoSubtitleEraseResultDownloader func(context.Context, string) ([]byte, string, error)

type volcengineVideoSubtitleEraseProvider struct {
	asset  model.VolcengineAssetSetting
	bucket string
	las    *lasClient
}

var videoSubtitleEraseRunning sync.Map
var videoSubtitleErasePollInterval = 3 * time.Second

func init() {
	videoSubtitleEraseJobStarter = func(jobID string) {
		go func() {
			provider, err := currentVolcengineVideoSubtitleEraseProvider()
			if err != nil {
				_ = failVideoSubtitleEraseJob(jobID, "provider_unavailable", "服务端字幕擦除配置不可用")
				return
			}
			_ = runVideoSubtitleEraseJob(context.Background(), jobID, provider, downloadVideoUpscaleResult, videoSubtitleErasePollInterval)
		}()
	}
}

func runVideoSubtitleEraseJob(ctx context.Context, jobID string, provider VideoSubtitleEraseProvider, downloader videoSubtitleEraseResultDownloader, pollInterval time.Duration) error {
	for {
		if err := processVideoSubtitleEraseJob(ctx, jobID, provider, downloader); err != nil {
			return err
		}
		job, ok, err := repository.GetVideoSubtitleEraseJob(jobID)
		if err != nil || !ok {
			return firstVideoUpscaleError(err, errors.New("video subtitle erase job not found"))
		}
		if job.Status != model.VideoSubtitleEraseJobStatusProcessing {
			return nil
		}
		if pollInterval <= 0 {
			continue
		}
		timer := time.NewTimer(pollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func currentVolcengineVideoSubtitleEraseProvider() (VideoSubtitleEraseProvider, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return nil, err
	}
	normalized := normalizeSettings(settings)
	setting, err := currentVideoSubtitleEraseSetting()
	if err != nil {
		return nil, err
	}
	bucket, _, err := parseVideoUpscaleTOSPath(setting.OutputTOSPath)
	if err != nil {
		return nil, err
	}
	return &volcengineVideoSubtitleEraseProvider{asset: normalized.Private.VolcengineAsset, bucket: bucket, las: newLASClient(setting.APIKey)}, nil
}

func processVideoSubtitleEraseJob(ctx context.Context, jobID string, provider VideoSubtitleEraseProvider, downloader videoSubtitleEraseResultDownloader) error {
	if _, loaded := videoSubtitleEraseRunning.LoadOrStore(jobID, true); loaded {
		return safeMessageError{message: "字幕擦除任务正在处理"}
	}
	defer videoSubtitleEraseRunning.Delete(jobID)
	job, ok, err := repository.GetVideoSubtitleEraseJob(jobID)
	if err != nil || !ok {
		return firstVideoUpscaleError(err, errors.New("video subtitle erase job not found"))
	}
	if provider == nil {
		return errors.New("video subtitle erase provider is unavailable")
	}
	if job.ResultSourceURL == "" && job.InputTOSURL == "" {
		job.Status, job.Progress, job.ProcessingStage, job.StartedAt, job.UpdatedAt = model.VideoSubtitleEraseJobStatusUploading, 15, "uploading", now(), now()
		if _, err = repository.SaveVideoSubtitleEraseJob(job); err != nil {
			return err
		}
		job.InputTOSURL, err = provider.Upload(ctx, job)
		if err != nil || strings.TrimSpace(job.InputTOSURL) == "" {
			_ = failVideoSubtitleEraseJob(job.ID, "upload_failed", "视频上传到火山 TOS 失败，请稍后重试")
			return firstVideoUpscaleError(err, errors.New("empty TOS input URL"))
		}
		job.InputTOSURL, job.Progress, job.UpdatedAt = strings.TrimSpace(job.InputTOSURL), 35, now()
		if _, err = repository.SaveVideoSubtitleEraseJob(job); err != nil {
			return err
		}
	}
	if job.ResultSourceURL == "" {
		if job.RunID == "" {
			job.Status, job.Progress, job.ProcessingStage, job.UpdatedAt = model.VideoSubtitleEraseJobStatusProcessing, 45, "subtitle_submitting", now()
			if _, err = repository.SaveVideoSubtitleEraseJob(job); err != nil {
				return err
			}
			signedURL, signErr := provider.SignedInputURL(ctx, job.InputTOSURL)
			if signErr != nil || !strings.HasPrefix(strings.TrimSpace(signedURL), "https://") {
				_ = failVideoSubtitleEraseJob(job.ID, "input_url_failed", "字幕擦除输入地址生成失败，请稍后重试")
				return firstVideoUpscaleError(signErr, errors.New("invalid signed HTTPS input URL"))
			}
			job.RunID, job.ProviderRequestID, err = provider.Start(ctx, job, strings.TrimSpace(signedURL))
			if err != nil || strings.TrimSpace(job.RunID) == "" {
				_ = failVideoSubtitleEraseJob(job.ID, "submit_failed", "火山字幕擦除任务提交失败；重试会复用同一幂等标识")
				return firstVideoUpscaleError(err, errors.New("empty LAS task ID"))
			}
			job.RunID, job.Progress, job.ProcessingStage, job.UpdatedAt = strings.TrimSpace(job.RunID), 55, "subtitle_processing", now()
			if _, err = repository.SaveVideoSubtitleEraseJob(job); err != nil {
				return err
			}
		}
		poll, pollErr := provider.Poll(ctx, job)
		if pollErr != nil {
			_ = failVideoSubtitleEraseJob(job.ID, "poll_failed", "火山字幕擦除状态查询失败，请稍后重试")
			return pollErr
		}
		job.ProviderRequestID = firstNonEmpty(strings.TrimSpace(poll.RequestID), job.ProviderRequestID)
		switch normalizeVideoUpscaleProviderStatus(poll.Status) {
		case "failed":
			_ = failVideoSubtitleEraseJob(job.ID, firstNonEmpty(strings.TrimSpace(poll.ErrorCode), "provider_failed"), "火山字幕擦除处理失败")
			return errors.New("video subtitle erase provider failed")
		case "processing":
			job.Status, job.Progress, job.ProcessingStage, job.UpdatedAt = model.VideoSubtitleEraseJobStatusProcessing, 70, "subtitle_processing", now()
			_, err = repository.SaveVideoSubtitleEraseJob(job)
			return err
		default:
			if strings.TrimSpace(poll.ResultURL) == "" {
				_ = failVideoSubtitleEraseJob(job.ID, "empty_result", "字幕擦除已完成但没有返回视频结果")
				return errors.New("video subtitle erase result URL is empty")
			}
			job.ResultSourceURL, job.OutputDurationSeconds = strings.TrimSpace(poll.ResultURL), poll.DurationSeconds
			if job.OutputDurationSeconds <= 0 {
				job.OutputDurationSeconds = job.InputDurationSeconds
			}
			job.Status, job.Progress, job.ProcessingStage, job.UpdatedAt = model.VideoSubtitleEraseJobStatusDownloading, 85, "downloading", now()
			if _, err = repository.SaveVideoSubtitleEraseJob(job); err != nil {
				return err
			}
		}
	}
	if downloader == nil {
		return nil
	}
	data, mimeType, err := downloader(ctx, job.ResultSourceURL)
	if err != nil {
		_ = failVideoSubtitleEraseJob(job.ID, "result_download_failed", "字幕擦除结果保存失败，请稍后重试")
		return err
	}
	job.ResultURL, job.ResultBytes, job.ResultMIMEType, err = persistVideoSubtitleEraseResult(job.ID, data, mimeType)
	if err != nil {
		_ = failVideoSubtitleEraseJob(job.ID, "result_save_failed", "字幕擦除结果保存失败，请稍后重试")
		return err
	}
	job.Status, job.Progress, job.ProcessingStage = model.VideoSubtitleEraseJobStatusSucceeded, 100, "succeeded"
	job.ErrorCode, job.ErrorMessage, job.CompletedAt, job.UpdatedAt = "", "", now(), now()
	_, err = repository.SaveVideoSubtitleEraseJob(job)
	return err
}

func (provider *volcengineVideoSubtitleEraseProvider) Upload(ctx context.Context, job model.VideoSubtitleEraseJob) (string, error) {
	ext := strings.ToLower(filepath.Ext(job.InputPath))
	key := "video-subtitle-erase/input/" + filepath.Base(job.ID) + ext
	client, err := newVideoUpscaleTOSClient(provider.asset)
	if err != nil {
		return "", err
	}
	file, err := os.Open(job.InputPath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	_, err = client.PutObjectV2(ctx, &tos.PutObjectV2Input{PutObjectBasicInput: tos.PutObjectBasicInput{Bucket: provider.bucket, Key: key, ContentType: job.InputMIMEType, ContentLength: job.InputBytes}, Content: file})
	if err != nil {
		return "", err
	}
	return "tos://" + provider.bucket + "/" + key, nil
}

func (provider *volcengineVideoSubtitleEraseProvider) SignedInputURL(_ context.Context, raw string) (string, error) {
	bucket, key, err := parseVideoUpscaleTOSPath(raw)
	if err != nil {
		return "", err
	}
	client, err := newVideoUpscaleTOSClient(provider.asset)
	if err != nil {
		return "", err
	}
	output, err := client.PreSignedURL(&tos.PreSignedURLInput{HTTPMethod: enum.HttpMethodGet, Bucket: bucket, Key: key, Expires: 3600})
	if err != nil {
		return "", err
	}
	return output.SignedUrl, nil
}

func (provider *volcengineVideoSubtitleEraseProvider) Start(ctx context.Context, job model.VideoSubtitleEraseJob, inputURL string) (string, string, error) {
	result, err := provider.las.Submit(ctx, volcengineLASSubtitleEraseSubmitPayload(job, inputURL))
	if err != nil {
		return "", "", err
	}
	return strings.TrimSpace(result.Metadata.TaskID), strings.TrimSpace(result.Metadata.RequestID), nil
}

func (provider *volcengineVideoSubtitleEraseProvider) Poll(ctx context.Context, job model.VideoSubtitleEraseJob) (VideoSubtitleErasePollResult, error) {
	result, err := provider.las.Poll(ctx, "las_subtitle_erase", job.RunID)
	if err != nil {
		return VideoSubtitleErasePollResult{}, err
	}
	return VideoSubtitleErasePollResult{Status: result.Metadata.TaskStatus, ResultURL: result.Data.VideoURL, DurationSeconds: result.Data.Duration, ErrorCode: result.Metadata.BusinessCode, RequestID: result.Metadata.RequestID}, nil
}

func volcengineLASSubtitleEraseSubmitPayload(job model.VideoSubtitleEraseJob, inputURL string) map[string]interface{} {
	return map[string]interface{}{
		"operator_id": "las_subtitle_erase", "operator_version": "v1",
		"data": map[string]interface{}{"video_url": strings.TrimSpace(inputURL), "client_token": job.ClientToken},
	}
}

func persistVideoSubtitleEraseResult(jobID string, data []byte, mimeType string) (string, int64, string, error) {
	if len(data) == 0 {
		return "", 0, "", errors.New("video subtitle erase result is empty")
	}
	if mimeType == "" {
		mimeType = http.DetectContentType(data)
	}
	if mimeType != "video/mp4" && mimeType != "application/octet-stream" {
		return "", 0, "", errors.New("video subtitle erase result is not MP4")
	}
	dir := filepath.Join(config.Cfg.PublicAssetDir, "video-subtitle-erase")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", 0, "", err
	}
	filename := filepath.Base(jobID) + ".mp4"
	if err := os.WriteFile(filepath.Join(dir, filename), data, 0644); err != nil {
		return "", 0, "", err
	}
	return "/api/uploaded-assets/video-subtitle-erase/" + filename, int64(len(data)), "video/mp4", nil
}

func failVideoSubtitleEraseJob(jobID, code, message string) error {
	job, ok, err := repository.GetVideoSubtitleEraseJob(jobID)
	if err != nil || !ok {
		return firstVideoUpscaleError(err, errors.New("video subtitle erase job not found"))
	}
	job.Status, job.ErrorCode, job.ErrorMessage, job.CompletedAt, job.UpdatedAt = model.VideoSubtitleEraseJobStatusFailed, code, message, now(), now()
	_, err = repository.SaveVideoSubtitleEraseJob(job)
	return err
}
