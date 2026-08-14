package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
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

type VideoUpscalePollResult struct {
	Status    string
	ResultURL string
	ErrorCode string
	RequestID string
	Processed *bool
}

type VideoUpscaleProvider interface {
	Upload(context.Context, model.VideoUpscaleJob) (string, error)
	StartUpscale(context.Context, model.VideoUpscaleJob) (runID string, requestID string, err error)
	PollUpscale(context.Context, model.VideoUpscaleJob) (VideoUpscalePollResult, error)
	StartInterpolation(context.Context, model.VideoUpscaleJob) (runID string, requestID string, err error)
	PollInterpolation(context.Context, model.VideoUpscaleJob) (VideoUpscalePollResult, error)
}

type videoUpscaleResultDownloader func(context.Context, string) ([]byte, string, error)

type volcengineVideoUpscaleProvider struct {
	asset model.VolcengineAssetSetting
	las   *lasClient
}

const lasVideoUpscaleBaseURL = "https://operator.las.cn-beijing.volces.com"

type lasClient struct {
	apiKey string
	client *http.Client
}

type lasTaskResponse struct {
	Metadata struct {
		TaskID       string `json:"task_id"`
		TaskStatus   string `json:"task_status"`
		BusinessCode string `json:"business_code"`
		ErrorMessage string `json:"error_msg"`
		RequestID    string `json:"request_id"`
	} `json:"metadata"`
	Data struct {
		OutputVideoTOSURL string  `json:"output_video_tos_url"`
		OutputVideoURL    string  `json:"output_video_url"`
		VideoURL          string  `json:"video_url"`
		Duration          float64 `json:"duration"`
		Processed         *bool   `json:"processed"`
	} `json:"data"`
}

type lasAPIError struct {
	StatusCode   int
	BusinessCode string
	Message      string
}

func (err lasAPIError) Error() string {
	return fmt.Sprintf("LAS request failed: status=%d code=%s", err.StatusCode, err.BusinessCode)
}

func newLASClient(apiKey string) *lasClient {
	return &lasClient{apiKey: strings.TrimSpace(apiKey), client: &http.Client{Timeout: 60 * time.Second}}
}

func (client *lasClient) Submit(ctx context.Context, payload map[string]interface{}) (lasTaskResponse, error) {
	return client.call(ctx, "/api/v1/submit", payload)
}

func (client *lasClient) Poll(ctx context.Context, values ...string) (lasTaskResponse, error) {
	operatorID, taskID := "las_video_super_resolution", ""
	if len(values) == 1 {
		taskID = values[0]
	} else if len(values) >= 2 {
		operatorID, taskID = values[0], values[1]
	}
	return client.call(ctx, "/api/v1/poll", map[string]interface{}{
		"operator_id": strings.TrimSpace(operatorID), "operator_version": "v1", "task_id": strings.TrimSpace(taskID),
	})
}

func (client *lasClient) call(ctx context.Context, path string, payload map[string]interface{}) (lasTaskResponse, error) {
	var result lasTaskResponse
	body, err := json.Marshal(payload)
	if err != nil {
		return result, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, lasVideoUpscaleBaseURL+path, bytes.NewReader(body))
	if err != nil {
		return result, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+client.apiKey)
	response, err := client.client.Do(request)
	if err != nil {
		return result, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return result, err
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return result, lasAPIError{StatusCode: response.StatusCode, Message: "invalid JSON response"}
	}
	if response.StatusCode >= http.StatusBadRequest || (result.Metadata.BusinessCode != "" && result.Metadata.BusinessCode != "0" && !strings.EqualFold(result.Metadata.BusinessCode, "TaskId.Invalid")) {
		return result, lasAPIError{StatusCode: response.StatusCode, BusinessCode: result.Metadata.BusinessCode, Message: result.Metadata.ErrorMessage}
	}
	return result, nil
}

func isLASAuthenticatedTaskNotFound(err error) bool {
	var apiErr lasAPIError
	if !errors.As(err, &apiErr) || apiErr.StatusCode == http.StatusUnauthorized || apiErr.StatusCode == http.StatusForbidden {
		return false
	}
	value := strings.ToLower(apiErr.BusinessCode + " " + apiErr.Message)
	return apiErr.StatusCode == http.StatusNotFound || strings.Contains(value, "not found") || strings.Contains(value, "not exist") || strings.Contains(value, "不存在")
}

var videoUpscaleRunning sync.Map
var videoUpscalePollInterval = 3 * time.Second

func init() {
	videoUpscaleJobStarter = func(jobID string) {
		go func() {
			provider, err := currentVolcengineVideoUpscaleProvider()
			if err != nil {
				_ = failVideoUpscaleJob(jobID, "provider_unavailable", "服务端视频超分配置不可用")
				return
			}
			_ = runVideoUpscaleJob(context.Background(), jobID, provider, downloadVideoUpscaleResult, videoUpscalePollInterval)
		}()
	}
}

func runVideoUpscaleJob(ctx context.Context, jobID string, provider VideoUpscaleProvider, downloader videoUpscaleResultDownloader, pollInterval time.Duration) error {
	for {
		if err := processVideoUpscaleJob(ctx, jobID, provider, downloader); err != nil {
			return err
		}
		job, ok, err := repository.GetVideoUpscaleJob(jobID)
		if err != nil || !ok {
			return firstVideoUpscaleError(err, errors.New("video upscale job not found"))
		}
		if job.Status != model.VideoUpscaleJobStatusProcessing {
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

func currentVolcengineVideoUpscaleProvider() (VideoUpscaleProvider, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return nil, err
	}
	normalized := normalizeSettings(settings)
	if _, err := currentVideoUpscaleSetting(); err != nil {
		return nil, err
	}
	return &volcengineVideoUpscaleProvider{asset: normalized.Private.VolcengineAsset, las: newLASClient(normalized.Private.VideoUpscale.APIKey)}, nil
}

func processVideoUpscaleJob(ctx context.Context, jobID string, provider VideoUpscaleProvider, downloader videoUpscaleResultDownloader) error {
	if _, loaded := videoUpscaleRunning.LoadOrStore(jobID, true); loaded {
		return safeMessageError{message: "视频超分任务正在处理"}
	}
	defer videoUpscaleRunning.Delete(jobID)
	job, ok, err := repository.GetVideoUpscaleJob(jobID)
	if err != nil || !ok {
		return firstVideoUpscaleError(err, errors.New("video upscale job not found"))
	}
	if provider == nil {
		return errors.New("video upscale provider is unavailable")
	}
	if (job.ProcessingStage == "upscale_submitting" && job.RunID == "") || (job.ProcessingStage == "interpolation_submitting" && job.InterpolationRunID == "") {
		_ = failVideoUpscaleJob(job.ID, "submission_uncertain", "无法确认火山付费任务是否已提交，请重新创建任务并再次确认费用")
		return errors.New("video upscale submission status is uncertain")
	}
	if job.ResultSourceURL == "" && job.InputTOSURL == "" {
		job.Status, job.Progress, job.ProcessingStage, job.StartedAt, job.UpdatedAt = model.VideoUpscaleJobStatusUploading, 15, "uploading", now(), now()
		if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
			return err
		}
		job.InputTOSURL, err = provider.Upload(ctx, job)
		if err != nil || strings.TrimSpace(job.InputTOSURL) == "" {
			_ = failVideoUpscaleJob(job.ID, "upload_failed", "视频上传到火山 TOS 失败，请稍后重试")
			return firstVideoUpscaleError(err, errors.New("empty TOS input URL"))
		}
		job.InputTOSURL, job.Progress, job.UpdatedAt = strings.TrimSpace(job.InputTOSURL), 35, now()
		if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
			return err
		}
	}
	if job.ResultSourceURL == "" && job.UpscaleResultTOSURL == "" {
		if job.RunID == "" {
			job.Status, job.Progress, job.ProcessingStage, job.UpdatedAt = model.VideoUpscaleJobStatusProcessing, 45, "upscale_submitting", now()
			if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
				return err
			}
			job.RunID, job.ProviderRequestID, err = provider.StartUpscale(ctx, job)
			if err != nil || strings.TrimSpace(job.RunID) == "" {
				_ = failVideoUpscaleJob(job.ID, "submission_uncertain", "无法确认火山超分任务是否已提交，请重新创建任务并再次确认费用")
				return firstVideoUpscaleError(err, errors.New("empty LAS task ID"))
			}
			job.RunID, job.Progress, job.ProcessingStage, job.UpdatedAt = strings.TrimSpace(job.RunID), 55, "upscale_processing", now()
			if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
				return err
			}
		}
		poll, pollErr := provider.PollUpscale(ctx, job)
		if pollErr != nil {
			_ = failVideoUpscaleJob(job.ID, "poll_failed", "火山视频增强状态查询失败，请稍后重试")
			return pollErr
		}
		job.ProviderRequestID = firstNonEmpty(strings.TrimSpace(poll.RequestID), job.ProviderRequestID)
		switch normalizeVideoUpscaleProviderStatus(poll.Status) {
		case "processing":
			job.Status, job.Progress, job.ProcessingStage, job.UpdatedAt = model.VideoUpscaleJobStatusProcessing, 65, "upscale_processing", now()
			_, err = repository.SaveVideoUpscaleJob(job)
			return err
		case "failed":
			job.ErrorCode = firstNonEmpty(strings.TrimSpace(poll.ErrorCode), "provider_failed")
			_ = failVideoUpscaleJob(job.ID, job.ErrorCode, "火山视频增强处理失败，请稍后重试")
			return errors.New("volcengine video upscale failed")
		case "succeeded":
			job.UpscaleResultTOSURL = strings.TrimSpace(poll.ResultURL)
			if job.UpscaleResultTOSURL == "" {
				_ = failVideoUpscaleJob(job.ID, "result_missing", "火山视频增强完成但未返回结果地址")
				return errors.New("video upscale result URL is empty")
			}
			job.ProcessingStage, job.Progress, job.UpdatedAt = "upscale_succeeded", 70, now()
			if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
				return err
			}
		}
	}
	if job.ResultSourceURL != "" {
		// A durable final source means both paid LAS stages already completed.
	} else if job.FrameInterpolationMode != "" && job.FrameInterpolationMode != "keep" {
		if job.InterpolationResultTOSURL == "" {
			if job.InterpolationRunID == "" {
				job.Status, job.Progress, job.ProcessingStage, job.UpdatedAt = model.VideoUpscaleJobStatusProcessing, 72, "interpolation_submitting", now()
				if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
					return err
				}
				job.InterpolationRunID, job.ProviderRequestID, err = provider.StartInterpolation(ctx, job)
				if err != nil || strings.TrimSpace(job.InterpolationRunID) == "" {
					_ = failVideoUpscaleJob(job.ID, "submission_uncertain", "无法确认火山插帧任务是否已提交，请重新创建任务并再次确认费用")
					return firstVideoUpscaleError(err, errors.New("empty LAS interpolation task ID"))
				}
				job.InterpolationRunID, job.Progress, job.ProcessingStage, job.UpdatedAt = strings.TrimSpace(job.InterpolationRunID), 75, "interpolation_processing", now()
				if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
					return err
				}
			}
			poll, pollErr := provider.PollInterpolation(ctx, job)
			if pollErr != nil {
				_ = failVideoUpscaleJob(job.ID, "interpolation_poll_failed", "火山智能插帧状态查询失败，请稍后重试")
				return pollErr
			}
			switch normalizeVideoUpscaleProviderStatus(poll.Status) {
			case "processing":
				job.Status, job.Progress, job.ProcessingStage, job.UpdatedAt = model.VideoUpscaleJobStatusProcessing, 78, "interpolation_processing", now()
				_, err = repository.SaveVideoUpscaleJob(job)
				return err
			case "failed":
				code := firstNonEmpty(strings.TrimSpace(poll.ErrorCode), "interpolation_failed")
				_ = failVideoUpscaleJob(job.ID, code, "火山智能插帧处理失败，请稍后重试")
				return errors.New("volcengine video interpolation failed")
			case "succeeded":
				if poll.Processed != nil && !*poll.Processed {
					_ = failVideoUpscaleJob(job.ID, "interpolation_not_processed", "火山智能插帧未处理当前参数")
					return errors.New("video interpolation was not processed")
				}
				job.InterpolationResultTOSURL = strings.TrimSpace(poll.ResultURL)
				if job.InterpolationResultTOSURL == "" {
					_ = failVideoUpscaleJob(job.ID, "interpolation_result_missing", "火山智能插帧完成但未返回结果地址")
					return errors.New("video interpolation result URL is empty")
				}
				job.ResultSourceURL = job.InterpolationResultTOSURL
			}
		}
		job.ResultSourceURL = job.InterpolationResultTOSURL
	} else {
		job.ResultSourceURL = job.UpscaleResultTOSURL
	}
	if job.ResultSourceURL == "" {
		return errors.New("video upscale final result URL is empty")
	}
	job.Status, job.Progress, job.ProcessingStage, job.UpdatedAt = model.VideoUpscaleJobStatusDownloading, 80, "downloading", now()
	if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
		return err
	}
	if strings.HasPrefix(job.ResultSourceURL, "tos://") {
		resolver, ok := provider.(interface{ ResultDownloadURL(string) (string, error) })
		if !ok {
			return errors.New("video upscale provider cannot resolve TOS result")
		}
		job.ResultSourceURL, err = resolver.ResultDownloadURL(job.ResultSourceURL)
		if err != nil {
			_ = failVideoUpscaleJob(job.ID, "result_url_failed", "视频超分结果地址生成失败，请稍后重试")
			return err
		}
	}
	if downloader == nil {
		return nil
	}
	data, mimeType, err := downloader(ctx, job.ResultSourceURL)
	if err != nil {
		_ = failVideoUpscaleJob(job.ID, "result_download_failed", "视频超分结果保存失败，请稍后重试")
		return err
	}
	job.ResultURL, job.ResultBytes, job.ResultMIMEType, err = persistVideoUpscaleResult(job.ID, data, mimeType)
	if err != nil {
		_ = failVideoUpscaleJob(job.ID, "result_save_failed", "视频超分结果保存失败，请稍后重试")
		return err
	}
	job.Status, job.Progress, job.ProcessingStage, job.ErrorCode, job.ErrorMessage = model.VideoUpscaleJobStatusSucceeded, 100, "succeeded", "", ""
	job.CompletedAt, job.UpdatedAt = now(), now()
	_, err = repository.SaveVideoUpscaleJob(job)
	return err
}

func (provider *volcengineVideoUpscaleProvider) Upload(ctx context.Context, job model.VideoUpscaleJob) (string, error) {
	bucket, _, err := parseVideoUpscaleTOSPath(job.OutputTOSPath)
	if err != nil {
		return "", err
	}
	ext := strings.ToLower(filepath.Ext(job.InputPath))
	key := "video-upscale/input/" + filepath.Base(job.ID) + ext
	client, err := newVideoUpscaleTOSClient(provider.asset)
	if err != nil {
		return "", err
	}
	file, err := os.Open(job.InputPath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	_, err = client.PutObjectV2(ctx, &tos.PutObjectV2Input{PutObjectBasicInput: tos.PutObjectBasicInput{
		Bucket: bucket, Key: key, ContentType: job.InputMIMEType, ContentLength: job.InputBytes,
	}, Content: file})
	if err != nil {
		return "", err
	}
	return "tos://" + bucket + "/" + key, nil
}

func (provider *volcengineVideoUpscaleProvider) StartUpscale(ctx context.Context, job model.VideoUpscaleJob) (string, string, error) {
	result, err := provider.las.Submit(ctx, volcengineLASSubmitPayload(job))
	if err != nil {
		return "", "", err
	}
	return strings.TrimSpace(result.Metadata.TaskID), "", nil
}

func (provider *volcengineVideoUpscaleProvider) PollUpscale(ctx context.Context, job model.VideoUpscaleJob) (VideoUpscalePollResult, error) {
	result, err := provider.las.Poll(ctx, "las_video_super_resolution", job.RunID)
	if err != nil {
		return VideoUpscalePollResult{}, err
	}
	return VideoUpscalePollResult{Status: result.Metadata.TaskStatus, ResultURL: firstNonEmpty(result.Data.OutputVideoTOSURL, result.Data.OutputVideoURL), ErrorCode: result.Metadata.BusinessCode, Processed: result.Data.Processed}, nil
}

func (provider *volcengineVideoUpscaleProvider) StartInterpolation(ctx context.Context, job model.VideoUpscaleJob) (string, string, error) {
	result, err := provider.las.Submit(ctx, volcengineLASInterpolationSubmitPayload(job))
	if err != nil {
		return "", "", err
	}
	return strings.TrimSpace(result.Metadata.TaskID), "", nil
}

func (provider *volcengineVideoUpscaleProvider) PollInterpolation(ctx context.Context, job model.VideoUpscaleJob) (VideoUpscalePollResult, error) {
	result, err := provider.las.Poll(ctx, "las_video_interpolation", job.InterpolationRunID)
	if err != nil {
		return VideoUpscalePollResult{}, err
	}
	return VideoUpscalePollResult{Status: result.Metadata.TaskStatus, ResultURL: firstNonEmpty(result.Data.OutputVideoTOSURL, result.Data.OutputVideoURL), ErrorCode: result.Metadata.BusinessCode, Processed: result.Data.Processed}, nil
}

func (provider *volcengineVideoUpscaleProvider) ResultDownloadURL(raw string) (string, error) {
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

func volcengineLASSubmitPayload(job model.VideoUpscaleJob) map[string]interface{} {
	return map[string]interface{}{
		"operator_id": "las_video_super_resolution", "operator_version": "v1",
		"data": map[string]interface{}{
			"video_url": job.InputTOSURL, "output_tos_path": job.OutputTOSPath, "target_width": job.OutputWidth,
			"preserve_audio": job.PreserveAudio, "output_basename": filepath.Base(job.ID), "output_quality_mode": job.OutputQualityMode,
		},
	}
}

func volcengineLASInterpolationSubmitPayload(job model.VideoUpscaleJob) map[string]interface{} {
	return map[string]interface{}{
		"operator_id": "las_video_interpolation", "operator_version": "v1",
		"data": map[string]interface{}{
			"video_url": job.UpscaleResultTOSURL, "output_tos_path": job.OutputTOSPath, "target_fps": job.InterpolationTargetFrameRate,
			"mode": job.InterpolationMode, "preserve_audio": job.PreserveAudio, "output_basename": filepath.Base(job.ID) + "-interpolation",
		},
	}
}

func normalizeVideoUpscaleProviderStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "success", "succeeded", "complete", "completed", "done", "finish", "finished":
		return "succeeded"
	case "fail", "failed", "error", "timeout", "canceled", "cancelled":
		return "failed"
	default:
		return "processing"
	}
}

func parseVideoUpscaleTOSPath(raw string) (string, string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "tos" || parsed.Host == "" {
		return "", "", errors.New("invalid TOS path")
	}
	key := strings.TrimPrefix(parsed.Path, "/")
	if key == "" {
		return "", "", errors.New("TOS output prefix is empty")
	}
	return parsed.Host, key, nil
}

func newVideoUpscaleTOSClient(asset model.VolcengineAssetSetting) (*tos.ClientV2, error) {
	return tos.NewClientV2("https://tos-cn-beijing.volces.com", tos.WithRegion("cn-beijing"), tos.WithCredentials(tos.NewStaticCredentials(asset.AccessKey, asset.SecretKey)), tos.WithMaxRetryCount(2), tos.WithRequestTimeout(AIVideoTaskTimeout))
}

func persistVideoUpscaleResult(jobID string, data []byte, mimeType string) (string, int64, string, error) {
	if len(data) == 0 {
		return "", 0, "", errors.New("video upscale result is empty")
	}
	if mimeType == "" {
		mimeType = http.DetectContentType(data)
	}
	if mimeType != "video/mp4" && mimeType != "application/octet-stream" {
		return "", 0, "", errors.New("video upscale result is not MP4")
	}
	dir := filepath.Join(config.Cfg.PublicAssetDir, "video-upscale")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", 0, "", err
	}
	filename := filepath.Base(jobID) + ".mp4"
	if err := os.WriteFile(filepath.Join(dir, filename), data, 0644); err != nil {
		return "", 0, "", err
	}
	return "/api/uploaded-assets/video-upscale/" + filename, int64(len(data)), "video/mp4", nil
}

func downloadVideoUpscaleResult(ctx context.Context, rawURL string) ([]byte, string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return nil, "", errors.New("video upscale result URL is invalid")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = func(dialCtx context.Context, network, address string) (net.Conn, error) {
		host, port, splitErr := net.SplitHostPort(address)
		if splitErr != nil {
			return nil, splitErr
		}
		addresses, lookupErr := net.DefaultResolver.LookupIPAddr(dialCtx, host)
		if lookupErr != nil || len(addresses) == 0 {
			return nil, errors.New("video upscale result host resolution failed")
		}
		for _, address := range addresses {
			if runtimePublicIP(address.IP) {
				return (&net.Dialer{}).DialContext(dialCtx, network, net.JoinHostPort(address.IP.String(), port))
			}
		}
		return nil, errors.New("video upscale result URL cannot access a private network")
	}
	client := &http.Client{Transport: transport, Timeout: 20 * time.Minute, CheckRedirect: func(request *http.Request, via []*http.Request) error {
		if len(via) >= 5 || (request.URL.Scheme != "http" && request.URL.Scheme != "https") {
			return http.ErrUseLastResponse
		}
		return nil
	}}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, "", err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	const maxResultBytes = int64(2 * 1024 * 1024 * 1024)
	if response.StatusCode >= http.StatusBadRequest || response.ContentLength > maxResultBytes {
		return nil, "", fmt.Errorf("video upscale result download failed with status %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxResultBytes+1))
	if err != nil || len(data) == 0 || int64(len(data)) > maxResultBytes {
		return nil, "", errors.New("video upscale result content is invalid")
	}
	mimeType := strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0])
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(data)
	}
	if mimeType != "video/mp4" && !looksLikeMP4(data) {
		return nil, "", errors.New("video upscale result is not MP4")
	}
	return data, "video/mp4", nil
}

func looksLikeMP4(data []byte) bool {
	return len(data) >= 12 && string(data[4:8]) == "ftyp"
}

func failVideoUpscaleJob(jobID, code, message string) error {
	job, ok, err := repository.GetVideoUpscaleJob(jobID)
	if err != nil || !ok {
		return firstVideoUpscaleError(err, errors.New("video upscale job not found"))
	}
	job.Status, job.ErrorCode, job.ErrorMessage, job.CompletedAt, job.UpdatedAt = model.VideoUpscaleJobStatusFailed, code, message, now(), now()
	_, err = repository.SaveVideoUpscaleJob(job)
	return err
}
