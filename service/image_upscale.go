package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
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
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"
)

const (
	maxImageUpscaleInputBytes  = 5 * 1024 * 1024
	maxImageUpscaleResultBytes = 80 * 1024 * 1024
)

type ImageUpscaleCreateInput struct {
	Filename      string
	ContentType   string
	Scale         int
	ProjectID     string
	CanvasID      string
	SourceNodeID  string
	SourceAssetID string
}

type ImageUpscaleCapabilitiesResult struct {
	Enabled         bool   `json:"enabled"`
	Provider        string `json:"provider"`
	Scales          []int  `json:"scales"`
	MaxInputBytes   int    `json:"maxInputBytes"`
	MaxLongEdge     int    `json:"maxLongEdge"`
	MaxShortEdge    int    `json:"maxShortEdge"`
	CloudProcessing bool   `json:"cloudProcessing"`
}

type imageUpscaleResultDownloader func(context.Context, string) ([]byte, error)

var imageUpscaleRunning sync.Map
var imageUpscaleJobStarter = func(jobID string) {
	go func() {
		provider, err := newImageUpscaleProvider(currentImageUpscaleProviderConfig())
		if err != nil {
			_ = failImageUpscaleJob(jobID, "provider_unavailable", "服务端尚未配置图片超分")
			return
		}
		_ = processImageUpscaleJob(context.Background(), jobID, provider, downloadImageUpscaleResult)
	}()
}

func ImageUpscaleCapabilities() ImageUpscaleCapabilitiesResult {
	provider := imageUpscaleProviderName(config.Cfg.ImageUpscaleProvider)
	return ImageUpscaleCapabilitiesResult{Enabled: ImageUpscaleConfigured(), Provider: provider, Scales: []int{2, 4}, MaxInputBytes: maxImageUpscaleInputBytes, MaxLongEdge: 1920, MaxShortEdge: 1080, CloudProcessing: true}
}

func CreateImageUpscaleJob(ctx context.Context, userID string, reader io.Reader, input ImageUpscaleCreateInput) (model.ImageUpscaleJob, error) {
	if strings.TrimSpace(userID) == "" {
		return model.ImageUpscaleJob{}, safeMessageError{message: "请先登录"}
	}
	if _, err := newImageUpscaleProvider(currentImageUpscaleProviderConfig()); err != nil {
		return model.ImageUpscaleJob{}, err
	}
	if input.Scale != 2 && input.Scale != 4 {
		return model.ImageUpscaleJob{}, safeMessageError{message: "图片超分只支持 2× 或 4×"}
	}
	if err := ctx.Err(); err != nil {
		return model.ImageUpscaleJob{}, err
	}
	data, imageInfo, err := readImageUpscaleInput(reader)
	if err != nil {
		return model.ImageUpscaleJob{}, err
	}
	stamp := now()
	job := model.ImageUpscaleJob{
		ID: newID("image-upscale"), UserID: strings.TrimSpace(userID), ProjectID: strings.TrimSpace(input.ProjectID), CanvasID: strings.TrimSpace(input.CanvasID),
		SourceNodeID: strings.TrimSpace(input.SourceNodeID), SourceAssetID: strings.TrimSpace(input.SourceAssetID), Provider: imageUpscaleProviderName(config.Cfg.ImageUpscaleProvider), Scale: input.Scale,
		Status: model.ImageUpscaleJobStatusQueued, Progress: 5, Attempt: 1, InputWidth: imageInfo.width, InputHeight: imageInfo.height,
		InputMIMEType: imageInfo.mimeType, InputBytes: int64(len(data)), CloudProcessing: true, CreatedAt: stamp, UpdatedAt: stamp,
	}
	job.InputPath, err = persistImageUpscaleInput(job, data, imageInfo.ext)
	if err != nil {
		return model.ImageUpscaleJob{}, err
	}
	job, err = repository.SaveImageUpscaleJob(job)
	if err != nil {
		_ = os.Remove(job.InputPath)
		return model.ImageUpscaleJob{}, err
	}
	imageUpscaleJobStarter(job.ID)
	return job, nil
}

func GetUserImageUpscaleJob(userID, jobID string) (model.ImageUpscaleJob, bool, error) {
	job, ok, err := repository.GetUserImageUpscaleJob(strings.TrimSpace(userID), strings.TrimSpace(jobID))
	if err != nil {
		return model.ImageUpscaleJob{}, false, err
	}
	if !ok {
		return model.ImageUpscaleJob{}, false, safeMessageError{message: "图片超分任务不存在"}
	}
	return job, true, nil
}

func RetryImageUpscaleJob(ctx context.Context, userID, jobID string) (model.ImageUpscaleJob, error) {
	if _, err := newImageUpscaleProvider(currentImageUpscaleProviderConfig()); err != nil {
		return model.ImageUpscaleJob{}, err
	}
	job, _, err := GetUserImageUpscaleJob(userID, jobID)
	if err != nil {
		return model.ImageUpscaleJob{}, err
	}
	if job.Status != model.ImageUpscaleJobStatusFailed {
		return model.ImageUpscaleJob{}, safeMessageError{message: "当前图片超分任务不能重试"}
	}
	if err := ctx.Err(); err != nil {
		return model.ImageUpscaleJob{}, err
	}
	if info, err := os.Stat(job.InputPath); err != nil || info.IsDir() {
		return model.ImageUpscaleJob{}, safeMessageError{message: "原始图片已不存在，请重新发起超分"}
	}
	job.Status = model.ImageUpscaleJobStatusQueued
	job.Progress = 5
	job.Attempt++
	job.ProviderRequestID = ""
	job.ErrorCode = ""
	job.ErrorMessage = ""
	job.StartedAt = ""
	job.CompletedAt = ""
	job.UpdatedAt = now()
	job, err = repository.SaveImageUpscaleJob(job)
	if err != nil {
		return model.ImageUpscaleJob{}, err
	}
	imageUpscaleJobStarter(job.ID)
	return job, nil
}

func RecoverInterruptedImageUpscaleJobs() error {
	jobs, err := repository.ListActiveImageUpscaleJobs()
	if err != nil {
		return err
	}
	for _, job := range jobs {
		job.Status = model.ImageUpscaleJobStatusFailed
		job.ErrorCode = "interrupted"
		job.ErrorMessage = "图片超分任务因服务重启中断，请重试"
		job.CompletedAt = now()
		job.UpdatedAt = job.CompletedAt
		if _, err := repository.SaveImageUpscaleJob(job); err != nil {
			return err
		}
	}
	return nil
}

func processImageUpscaleJob(ctx context.Context, jobID string, provider ImageUpscaleProvider, downloader imageUpscaleResultDownloader) error {
	if _, loaded := imageUpscaleRunning.LoadOrStore(jobID, true); loaded {
		return safeMessageError{message: "图片超分任务正在处理"}
	}
	defer imageUpscaleRunning.Delete(jobID)
	job, ok, err := repository.GetImageUpscaleJob(jobID)
	if err != nil || !ok {
		return firstImageUpscaleError(err, errors.New("image upscale job not found"))
	}
	file, err := os.Open(job.InputPath)
	if err != nil {
		_ = failImageUpscaleJob(job.ID, "input_missing", "原始图片已不存在，请重新发起超分")
		return err
	}
	defer file.Close()
	job.Status = model.ImageUpscaleJobStatusProcessing
	job.Progress = 25
	job.StartedAt = now()
	job.UpdatedAt = job.StartedAt
	if _, err = repository.SaveImageUpscaleJob(job); err != nil {
		return err
	}
	providerResult, err := provider.Upscale(ctx, file, ImageUpscaleProviderRequest{Scale: job.Scale})
	if err != nil {
		_ = failImageUpscaleJob(job.ID, "provider_failed", "云端图片超分处理失败，请稍后重试")
		return err
	}
	job.Provider = firstNonEmpty(strings.TrimSpace(providerResult.Provider), job.Provider)
	job.ProviderRequestID = strings.TrimSpace(providerResult.RequestID)
	job.Model = strings.TrimSpace(providerResult.Model)
	job.Strategy = strings.TrimSpace(providerResult.Strategy)
	job.Status = model.ImageUpscaleJobStatusDownloading
	job.Progress = 75
	job.UpdatedAt = now()
	if _, err = repository.SaveImageUpscaleJob(job); err != nil {
		return err
	}
	if downloader == nil {
		err = errors.New("image upscale result downloader is unavailable")
	} else {
		var data []byte
		data, err = downloader(ctx, providerResult.ResultURL)
		if err == nil {
			var result imageUpscalePersistedResult
			result, err = persistImageUpscaleResult(job.ID, data)
			if err == nil {
				job.ResultURL, job.ResultMIMEType, job.ResultBytes = result.url, result.mimeType, int64(len(data))
				job.OutputWidth, job.OutputHeight = result.width, result.height
			}
		}
	}
	if err != nil {
		_ = failImageUpscaleJob(job.ID, "result_download_failed", "超分结果保存失败，请稍后重试")
		return err
	}
	job.Status = model.ImageUpscaleJobStatusSucceeded
	job.Progress = 100
	job.ErrorCode = ""
	job.ErrorMessage = ""
	job.CompletedAt = now()
	job.UpdatedAt = job.CompletedAt
	_, err = repository.SaveImageUpscaleJob(job)
	return err
}

type imageUpscaleInputInfo struct {
	width    int
	height   int
	mimeType string
	ext      string
}

func readImageUpscaleInput(reader io.Reader) ([]byte, imageUpscaleInputInfo, error) {
	if reader == nil {
		return nil, imageUpscaleInputInfo{}, safeMessageError{message: "图片不能为空"}
	}
	data, err := io.ReadAll(io.LimitReader(reader, maxImageUpscaleInputBytes+1))
	if err != nil {
		return nil, imageUpscaleInputInfo{}, err
	}
	if len(data) == 0 {
		return nil, imageUpscaleInputInfo{}, safeMessageError{message: "图片不能为空"}
	}
	if len(data) > maxImageUpscaleInputBytes {
		return nil, imageUpscaleInputInfo{}, safeMessageError{message: "图片不能超过 5 MB"}
	}
	mimeType := http.DetectContentType(data)
	exts := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/bmp": ".bmp", "image/webp": ".webp"}
	ext, supported := exts[mimeType]
	if !supported {
		return nil, imageUpscaleInputInfo{}, safeMessageError{message: "仅支持 PNG、JPEG、BMP 或 WebP 图片"}
	}
	imageConfig, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || imageConfig.Width < 1 || imageConfig.Height < 1 {
		return nil, imageUpscaleInputInfo{}, safeMessageError{message: "图片文件无效或已损坏"}
	}
	longEdge, shortEdge := imageConfig.Width, imageConfig.Height
	if longEdge < shortEdge {
		longEdge, shortEdge = shortEdge, longEdge
	}
	if longEdge > 1920 || shortEdge > 1080 {
		return nil, imageUpscaleInputInfo{}, safeMessageError{message: "图片尺寸超过限制：长边不超过 1920，短边不超过 1080"}
	}
	return data, imageUpscaleInputInfo{width: imageConfig.Width, height: imageConfig.Height, mimeType: mimeType, ext: ext}, nil
}

func persistImageUpscaleInput(job model.ImageUpscaleJob, data []byte, ext string) (string, error) {
	dir := filepath.Join(config.Cfg.ImageUpscaleWorkDir, "users", "user_"+stableSegmentHash(job.UserID), job.ID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "input"+ext)
	if err := os.WriteFile(path, data, 0600); err != nil {
		return "", err
	}
	return path, nil
}

type imageUpscalePersistedResult struct {
	url      string
	mimeType string
	width    int
	height   int
}

func persistImageUpscaleResult(jobID string, data []byte) (imageUpscalePersistedResult, error) {
	if len(data) == 0 || len(data) > maxImageUpscaleResultBytes {
		return imageUpscalePersistedResult{}, errors.New("image upscale result size is invalid")
	}
	mimeType := http.DetectContentType(data)
	exts := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
	ext, ok := exts[mimeType]
	if !ok {
		return imageUpscalePersistedResult{}, errors.New("image upscale result is not a supported image")
	}
	decoded, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || decoded.Width < 1 || decoded.Height < 1 {
		return imageUpscalePersistedResult{}, errors.New("image upscale result is invalid")
	}
	dir := filepath.Join(config.Cfg.PublicAssetDir, "image-upscale")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return imageUpscalePersistedResult{}, err
	}
	filename := filepath.Base(jobID) + ext
	if err := os.WriteFile(filepath.Join(dir, filename), data, 0644); err != nil {
		return imageUpscalePersistedResult{}, err
	}
	return imageUpscalePersistedResult{url: "/api/uploaded-assets/image-upscale/" + filename, mimeType: mimeType, width: decoded.Width, height: decoded.Height}, nil
}

func downloadImageUpscaleResult(ctx context.Context, rawURL string) ([]byte, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return nil, errors.New("image upscale result URL is invalid")
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
			return nil, errors.New("image upscale result host resolution failed")
		}
		for _, address := range addresses {
			if runtimePublicIP(address.IP) {
				return (&net.Dialer{}).DialContext(dialCtx, network, net.JoinHostPort(address.IP.String(), port))
			}
		}
		return nil, errors.New("image upscale result URL cannot access a private network")
	}
	client := &http.Client{Transport: transport, Timeout: 5 * time.Minute, CheckRedirect: func(request *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return http.ErrUseLastResponse
		}
		if request.URL.Scheme != "http" && request.URL.Scheme != "https" {
			return errors.New("image upscale result redirect is invalid")
		}
		return nil
	}}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest || response.ContentLength > maxImageUpscaleResultBytes {
		return nil, fmt.Errorf("image upscale result download failed with status %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxImageUpscaleResultBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxImageUpscaleResultBytes || !strings.HasPrefix(http.DetectContentType(data), "image/") {
		return nil, errors.New("image upscale result content is invalid")
	}
	return data, nil
}

func failImageUpscaleJob(jobID, code, message string) error {
	job, ok, err := repository.GetImageUpscaleJob(jobID)
	if err != nil || !ok {
		return firstImageUpscaleError(err, errors.New("image upscale job not found"))
	}
	job.Status = model.ImageUpscaleJobStatusFailed
	job.ErrorCode = code
	job.ErrorMessage = message
	job.CompletedAt = now()
	job.UpdatedAt = job.CompletedAt
	_, err = repository.SaveImageUpscaleJob(job)
	return err
}

func firstImageUpscaleError(err, fallback error) error {
	if err != nil {
		return err
	}
	return fallback
}
