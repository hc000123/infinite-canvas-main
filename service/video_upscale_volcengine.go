package service

import (
	"context"
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
	volcvod "github.com/volcengine/volc-sdk-golang/service/vod"
	vodrequest "github.com/volcengine/volc-sdk-golang/service/vod/models/request"
	"github.com/volcengine/volcengine-go-sdk/volcengine"
	"github.com/volcengine/volcengine-go-sdk/volcengine/credentials"
	"github.com/volcengine/volcengine-go-sdk/volcengine/session"
	"github.com/volcengine/volcengine-go-sdk/volcengine/universal"
)

type VideoUpscalePollResult struct {
	Status    string
	ResultURL string
	ErrorCode string
	RequestID string
}

type VideoUpscaleProvider interface {
	Upload(context.Context, model.VideoUpscaleJob) (string, error)
	Start(context.Context, model.VideoUpscaleJob) (runID string, requestID string, err error)
	Poll(context.Context, model.VideoUpscaleJob) (VideoUpscalePollResult, error)
}

type videoUpscaleResultDownloader func(context.Context, string) ([]byte, string, error)

type volcengineVideoUpscaleProvider struct {
	asset model.VolcengineAssetSetting
}

var videoUpscaleRunning sync.Map

func init() {
	videoUpscaleJobStarter = func(jobID string) {
		go func() {
			provider, err := currentVolcengineVideoUpscaleProvider()
			if err != nil {
				_ = failVideoUpscaleJob(jobID, "provider_unavailable", "服务端视频超分配置不可用")
				return
			}
			_ = processVideoUpscaleJob(context.Background(), jobID, provider, downloadVideoUpscaleResult)
		}()
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
	return &volcengineVideoUpscaleProvider{asset: normalized.Private.VolcengineAsset}, nil
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
	if job.VODVid == "" {
		job.Status, job.Progress, job.StartedAt, job.UpdatedAt = model.VideoUpscaleJobStatusUploading, 15, now(), now()
		if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
			return err
		}
		job.VODVid, err = provider.Upload(ctx, job)
		if err != nil || strings.TrimSpace(job.VODVid) == "" {
			_ = failVideoUpscaleJob(job.ID, "upload_failed", "视频上传到火山 VOD 失败，请稍后重试")
			return firstVideoUpscaleError(err, errors.New("empty VOD Vid"))
		}
		job.VODVid, job.Progress, job.UpdatedAt = strings.TrimSpace(job.VODVid), 35, now()
		if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
			return err
		}
	}
	if job.RunID == "" {
		job.Status, job.Progress, job.UpdatedAt = model.VideoUpscaleJobStatusProcessing, 45, now()
		if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
			return err
		}
		job.RunID, job.ProviderRequestID, err = provider.Start(ctx, job)
		if err != nil || strings.TrimSpace(job.RunID) == "" {
			_ = failVideoUpscaleJob(job.ID, "submit_failed", "火山视频增强任务提交失败，请稍后重试")
			return firstVideoUpscaleError(err, errors.New("empty VOD RunId"))
		}
		job.RunID, job.Progress, job.UpdatedAt = strings.TrimSpace(job.RunID), 55, now()
		if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
			return err
		}
	}
	if job.ResultSourceURL == "" {
		poll, pollErr := provider.Poll(ctx, job)
		if pollErr != nil {
			_ = failVideoUpscaleJob(job.ID, "poll_failed", "火山视频增强状态查询失败，请稍后重试")
			return pollErr
		}
		job.ProviderRequestID = firstNonEmpty(strings.TrimSpace(poll.RequestID), job.ProviderRequestID)
		switch normalizeVideoUpscaleProviderStatus(poll.Status) {
		case "processing":
			job.Status, job.Progress, job.UpdatedAt = model.VideoUpscaleJobStatusProcessing, 65, now()
			_, err = repository.SaveVideoUpscaleJob(job)
			return err
		case "failed":
			job.ErrorCode = firstNonEmpty(strings.TrimSpace(poll.ErrorCode), "provider_failed")
			_ = failVideoUpscaleJob(job.ID, job.ErrorCode, "火山视频增强处理失败，请稍后重试")
			return errors.New("volcengine video upscale failed")
		case "succeeded":
			job.ResultSourceURL = strings.TrimSpace(poll.ResultURL)
			if job.ResultSourceURL == "" {
				_ = failVideoUpscaleJob(job.ID, "result_missing", "火山视频增强完成但未返回结果地址")
				return errors.New("video upscale result URL is empty")
			}
			job.Status, job.Progress, job.UpdatedAt = model.VideoUpscaleJobStatusDownloading, 80, now()
			if _, err = repository.SaveVideoUpscaleJob(job); err != nil {
				return err
			}
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
	job.Status, job.Progress, job.ErrorCode, job.ErrorMessage = model.VideoUpscaleJobStatusSucceeded, 100, "", ""
	job.CompletedAt, job.UpdatedAt = now(), now()
	_, err = repository.SaveVideoUpscaleJob(job)
	return err
}

func (provider *volcengineVideoUpscaleProvider) Upload(_ context.Context, job model.VideoUpscaleJob) (string, error) {
	client := volcvod.NewInstance()
	client.SetAccessKey(provider.asset.AccessKey)
	client.SetSecretKey(provider.asset.SecretKey)
	result, _, err := client.UploadMediaWithCallback(job.InputPath, job.VODSpaceName, "")
	if err != nil || result == nil || result.GetResult() == nil || result.GetResult().GetData() == nil {
		return "", firstVideoUpscaleError(err, errors.New("VOD upload returned no data"))
	}
	return strings.TrimSpace(result.GetResult().GetData().GetVid()), nil
}

func (provider *volcengineVideoUpscaleProvider) Start(ctx context.Context, job model.VideoUpscaleJob) (string, string, error) {
	data, err := provider.call(ctx, "StartExecution", universal.POST, volcengineVideoUpscaleStartPayload(job))
	if err != nil {
		return "", "", err
	}
	return firstNonEmpty(stringFromMap(data, "RunId"), stringFromMap(data, "RunID")), volcengineRequestID(data), nil
}

func (provider *volcengineVideoUpscaleProvider) Poll(ctx context.Context, job model.VideoUpscaleJob) (VideoUpscalePollResult, error) {
	data, err := provider.call(ctx, "GetExecution", universal.GET, map[string]interface{}{"RunId": job.RunID})
	if err != nil {
		return VideoUpscalePollResult{}, err
	}
	result := VideoUpscalePollResult{Status: stringFromMap(data, "Status"), ResultURL: videoUpscaleResultURL(data), ErrorCode: stringFromMap(data, "Code"), RequestID: volcengineRequestID(data)}
	if normalizeVideoUpscaleProviderStatus(result.Status) == "succeeded" && !strings.HasPrefix(result.ResultURL, "http") {
		result.ResultURL, err = provider.resolveResultPlayURL(job, videoUpscaleResultFileID(data))
	}
	return result, err
}

func (provider *volcengineVideoUpscaleProvider) resolveResultPlayURL(job model.VideoUpscaleJob, fileID string) (string, error) {
	client := volcvod.NewInstance()
	client.SetAccessKey(provider.asset.AccessKey)
	client.SetSecretKey(provider.asset.SecretKey)
	response, _, err := client.GetPlayInfo(&vodrequest.VodGetPlayInfoRequest{Vid: job.VODVid, Ssl: "1"})
	if err != nil || response == nil || response.GetResult() == nil {
		return "", firstVideoUpscaleError(err, errors.New("VOD play info returned no data"))
	}
	for _, item := range response.GetResult().GetPlayInfoList() {
		if item == nil || (fileID != "" && item.GetFileId() != fileID) {
			continue
		}
		if rawURL := firstNonEmpty(item.GetMainPlayUrl(), item.GetBackupPlayUrl()); rawURL != "" {
			return rawURL, nil
		}
	}
	return "", errors.New("VOD enhanced result play URL was not found")
}

func (provider *volcengineVideoUpscaleProvider) call(ctx context.Context, action string, method universal.HttpMethod, payload map[string]interface{}) (map[string]interface{}, error) {
	cfg := volcengine.NewConfig().WithCredentials(credentials.NewStaticCredentials(provider.asset.AccessKey, provider.asset.SecretKey, "")).WithRegion("cn-north-1").WithHTTPClient(&http.Client{Timeout: 60 * time.Second})
	sess, err := session.NewSession(cfg)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	output, err := universal.New(sess).DoCall(universal.RequestUniversal{ServiceName: "vod", Action: action, Version: "2025-01-01", HttpMethod: method, ContentType: universal.ApplicationJSON}, &payload)
	if err != nil {
		return nil, err
	}
	return normalizeVolcengineResponse(action, output)
}

func volcengineVideoUpscaleStartPayload(job model.VideoUpscaleJob) map[string]interface{} {
	return map[string]interface{}{
		"SpaceName": job.VODSpaceName,
		"Input":     map[string]interface{}{"Type": "Vid", "Vid": job.VODVid},
		"Operation": map[string]interface{}{"Type": "Task", "Task": map[string]interface{}{"Type": "Enhance", "Enhance": map[string]interface{}{"Type": "Moe", "MoeEnhance": map[string]interface{}{
			"Config": firstNonEmpty(job.Scenario, "aigc"), "Target": map[string]interface{}{"Res": strings.ToLower(job.Target), "BitDepth": 8}, "VideoStrategy": map[string]interface{}{"RepairStrength": 0, "EnhanceLevel": firstNonEmpty(job.EnhanceLevel, "Standard")},
		}}}},
	}
}

func normalizeVideoUpscaleProviderStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "success", "succeeded", "complete", "completed", "done", "finish", "finished":
		return "succeeded"
	case "fail", "failed", "error", "canceled", "cancelled":
		return "failed"
	default:
		return "processing"
	}
}

func videoUpscaleResultURL(data map[string]interface{}) string {
	output := mapFromMap(data, "Output")
	task := mapFromMap(output, "Task")
	enhance := mapFromMap(task, "Enhance")
	return firstNonEmpty(stringFromMap(enhance, "Url"), stringFromMap(enhance, "URL"), stringFromMap(enhance, "StoreUri"), stringFromMap(data, "ResultUrl"), stringFromMap(data, "ResultURL"))
}

func videoUpscaleResultFileID(data map[string]interface{}) string {
	return stringFromMap(mapFromMap(mapFromMap(mapFromMap(data, "Output"), "Task"), "Enhance"), "FileId")
}

func volcengineRequestID(data map[string]interface{}) string {
	return firstNonEmpty(stringFromMap(data, "RequestId"), stringFromMap(data, "RequestID"), stringFromMap(mapFromMap(data, "ResponseMetadata"), "RequestId"), stringFromMap(mapFromMap(data, "ResponseMetadata"), "RequestID"))
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
