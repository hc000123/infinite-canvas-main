package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

var videoUpscaleMaxInputBytes int64 = 500 * 1024 * 1024

type VideoUpscaleCreateInput struct {
	Filename      string
	ContentType   string
	Target        string
	ProjectID     string
	CanvasID      string
	SourceNodeID  string
	SourceAssetID string
}

type videoUpscaleSourceMetadata struct {
	Width           int
	Height          int
	DurationSeconds float64
}

var videoUpscaleMetadataProbe = probeVideoUpscaleMetadata
var videoUpscaleJobStarter = func(string) {}

func CreateVideoUpscaleJob(ctx context.Context, userID string, reader io.Reader, input VideoUpscaleCreateInput) (model.VideoUpscaleJob, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return model.VideoUpscaleJob{}, safeMessageError{message: "请先登录"}
	}
	setting, err := currentVideoUpscaleSetting()
	if err != nil {
		return model.VideoUpscaleJob{}, err
	}
	ext, mimeType, err := videoUpscaleInputFormat(input.Filename, input.ContentType)
	if err != nil {
		return model.VideoUpscaleJob{}, err
	}
	target := strings.ToLower(strings.TrimSpace(input.Target))
	if target != "1080p" && target != "2k" {
		return model.VideoUpscaleJob{}, safeMessageError{message: "视频超分只支持 1080p 或 2K"}
	}
	if reader == nil {
		return model.VideoUpscaleJob{}, safeMessageError{message: "视频不能为空"}
	}
	if err := ctx.Err(); err != nil {
		return model.VideoUpscaleJob{}, err
	}
	stamp := now()
	job := model.VideoUpscaleJob{
		ID: newID("video-upscale"), UserID: userID, ProjectID: strings.TrimSpace(input.ProjectID), CanvasID: strings.TrimSpace(input.CanvasID), SourceNodeID: strings.TrimSpace(input.SourceNodeID), SourceAssetID: strings.TrimSpace(input.SourceAssetID),
		Provider: setting.Provider, VODSpaceName: setting.SpaceName, Target: target, Scenario: setting.Scenario, EnhanceLevel: setting.EnhanceLevel,
		Status: model.VideoUpscaleJobStatusQueued, Progress: 5, Attempt: 1, InputMIMEType: mimeType, CloudProcessing: true, CreatedAt: stamp, UpdatedAt: stamp,
	}
	job.InputPath, job.InputBytes, err = persistVideoUpscaleInput(job, reader, ext)
	if err != nil {
		return model.VideoUpscaleJob{}, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(filepath.Dir(job.InputPath))
		}
	}()
	metadata, err := videoUpscaleMetadataProbe(ctx, job.InputPath)
	if err != nil || metadata.Width < 1 || metadata.Height < 1 || metadata.DurationSeconds <= 0 {
		return model.VideoUpscaleJob{}, safeMessageError{message: "视频文件无效、已损坏或无法读取规格"}
	}
	job.InputWidth, job.InputHeight, job.InputDurationSeconds = metadata.Width, metadata.Height, metadata.DurationSeconds
	job.OutputWidth, job.OutputHeight, err = videoUpscaleTargetDimensions(metadata.Width, metadata.Height, target)
	if err != nil {
		return model.VideoUpscaleJob{}, err
	}
	job, err = repository.SaveVideoUpscaleJob(job)
	if err != nil {
		return model.VideoUpscaleJob{}, err
	}
	cleanup = false
	videoUpscaleJobStarter(job.ID)
	return job, nil
}

func GetUserVideoUpscaleJob(userID, jobID string) (model.VideoUpscaleJob, bool, error) {
	job, ok, err := repository.GetUserVideoUpscaleJob(strings.TrimSpace(userID), strings.TrimSpace(jobID))
	if err != nil {
		return model.VideoUpscaleJob{}, false, err
	}
	if !ok {
		return model.VideoUpscaleJob{}, false, safeMessageError{message: "视频超分任务不存在"}
	}
	return job, true, nil
}

func RetryVideoUpscaleJob(ctx context.Context, userID, jobID string) (model.VideoUpscaleJob, error) {
	if _, err := currentVideoUpscaleSetting(); err != nil {
		return model.VideoUpscaleJob{}, err
	}
	job, _, err := GetUserVideoUpscaleJob(userID, jobID)
	if err != nil {
		return model.VideoUpscaleJob{}, err
	}
	if job.Status != model.VideoUpscaleJobStatusFailed {
		return model.VideoUpscaleJob{}, safeMessageError{message: "当前视频超分任务不能重试"}
	}
	if err := ctx.Err(); err != nil {
		return model.VideoUpscaleJob{}, err
	}
	if job.VODVid == "" {
		if info, statErr := os.Stat(job.InputPath); statErr != nil || info.IsDir() {
			return model.VideoUpscaleJob{}, safeMessageError{message: "原始视频已不存在，请重新发起超分"}
		}
	}
	job.Status, job.Progress, job.Attempt = model.VideoUpscaleJobStatusQueued, 5, job.Attempt+1
	job.ErrorCode, job.ErrorMessage, job.CompletedAt, job.UpdatedAt = "", "", "", now()
	job, err = repository.SaveVideoUpscaleJob(job)
	if err != nil {
		return model.VideoUpscaleJob{}, err
	}
	videoUpscaleJobStarter(job.ID)
	return job, nil
}

type VideoUpscaleCapabilitiesResult struct {
	Enabled         bool     `json:"enabled"`
	Provider        string   `json:"provider"`
	Targets         []string `json:"targets"`
	MaxInputBytes   int64    `json:"maxInputBytes"`
	CloudProcessing bool     `json:"cloudProcessing"`
}

func VideoUpscaleCapabilities() VideoUpscaleCapabilitiesResult {
	setting, err := currentVideoUpscaleSetting()
	provider := "volcengine"
	if setting.Provider != "" {
		provider = setting.Provider
	}
	return VideoUpscaleCapabilitiesResult{Enabled: err == nil, Provider: provider, Targets: []string{"1080p", "2k"}, MaxInputBytes: videoUpscaleMaxInputBytes, CloudProcessing: true}
}

func currentVideoUpscaleSetting() (model.VideoUpscaleSetting, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return model.VideoUpscaleSetting{}, err
	}
	normalized := normalizeSettings(settings)
	setting := normalized.Private.VideoUpscale
	credentials := normalized.Private.VolcengineAsset
	if !setting.Enabled {
		return model.VideoUpscaleSetting{}, safeMessageError{message: "服务端尚未启用视频超分"}
	}
	if setting.SpaceName == "" || credentials.AccessKey == "" || credentials.SecretKey == "" {
		return model.VideoUpscaleSetting{}, safeMessageError{message: "服务端视频超分配置不完整"}
	}
	return setting, nil
}

func videoUpscaleInputFormat(filename, contentType string) (string, string, error) {
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(filename)))
	mime := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	allowed := map[string]string{".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime"}
	wantMIME, ok := allowed[ext]
	if !ok || (mime != "" && mime != wantMIME && !(ext == ".mov" && mime == "video/mp4")) {
		return "", "", safeMessageError{message: "仅支持 MP4、WebM 或 MOV 视频"}
	}
	return ext, wantMIME, nil
}

func persistVideoUpscaleInput(job model.VideoUpscaleJob, reader io.Reader, ext string) (string, int64, error) {
	dir := filepath.Join(config.Cfg.VideoUpscaleWorkDir, "users", "user_"+stableSegmentHash(job.UserID), job.ID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", 0, err
	}
	path := filepath.Join(dir, "input"+ext)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", 0, err
	}
	written, copyErr := io.Copy(file, io.LimitReader(reader, videoUpscaleMaxInputBytes+1))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(path)
		return "", 0, firstVideoUpscaleError(copyErr, closeErr)
	}
	if written == 0 {
		_ = os.Remove(path)
		return "", 0, safeMessageError{message: "视频不能为空"}
	}
	if written > videoUpscaleMaxInputBytes {
		_ = os.Remove(path)
		return "", 0, safeMessageError{message: fmt.Sprintf("视频不能超过 %d MB", videoUpscaleMaxInputBytes/(1024*1024))}
	}
	return path, written, nil
}

func videoUpscaleTargetDimensions(width, height int, target string) (int, int, error) {
	if width < 1 || height < 1 {
		return 0, 0, errors.New("invalid video dimensions")
	}
	shortEdge := width
	if height < shortEdge {
		shortEdge = height
	}
	targetShort := 0
	switch strings.ToLower(strings.TrimSpace(target)) {
	case "1080p":
		targetShort = 1080
		if shortEdge >= targetShort {
			return 0, 0, safeMessageError{message: "当前视频已达到 1080p，请选择 2K"}
		}
	case "2k":
		targetShort = 1440
		if shortEdge < 1080 {
			return 0, 0, safeMessageError{message: "当前视频请先选择 1080p"}
		}
		if shortEdge >= targetShort {
			return 0, 0, safeMessageError{message: "当前视频已达到 2K，无需继续超分"}
		}
	default:
		return 0, 0, safeMessageError{message: "视频超分只支持 1080p 或 2K"}
	}
	scale := float64(targetShort) / float64(shortEdge)
	return evenVideoDimension(float64(width) * scale), evenVideoDimension(float64(height) * scale), nil
}

func evenVideoDimension(value float64) int {
	result := int(math.Round(value))
	if result%2 != 0 {
		result++
	}
	return result
}

func probeVideoUpscaleMetadata(ctx context.Context, path string) (videoUpscaleSourceMetadata, error) {
	output, err := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", path).Output()
	if err != nil {
		return videoUpscaleSourceMetadata{}, err
	}
	var payload struct {
		Streams []struct {
			Width  int `json:"width"`
			Height int `json:"height"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if err := json.Unmarshal(output, &payload); err != nil || len(payload.Streams) == 0 {
		return videoUpscaleSourceMetadata{}, errors.New("ffprobe returned invalid metadata")
	}
	duration, err := strconv.ParseFloat(payload.Format.Duration, 64)
	if err != nil {
		return videoUpscaleSourceMetadata{}, err
	}
	return videoUpscaleSourceMetadata{Width: payload.Streams[0].Width, Height: payload.Streams[0].Height, DurationSeconds: duration}, nil
}

func firstVideoUpscaleError(err, fallback error) error {
	if err != nil {
		return err
	}
	return fallback
}
