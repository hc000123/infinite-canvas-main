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
	Filename               string
	ContentType            string
	Target                 string
	ProjectID              string
	CanvasID               string
	SourceNodeID           string
	SourceAssetID          string
	OutputQualityMode      string
	PreserveAudio          bool
	PreserveAudioSet       bool
	FrameInterpolationMode string
	InterpolationMode      string
}

type videoUpscaleSourceMetadata struct {
	Width           int
	Height          int
	DurationSeconds float64
	FrameRate       float64
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
	qualityMode := strings.ToLower(strings.TrimSpace(input.OutputQualityMode))
	if qualityMode == "" {
		qualityMode = setting.OutputQualityMode
	}
	if qualityMode != "compatible" && qualityMode != "balanced" && qualityMode != "master" {
		return model.VideoUpscaleJob{}, safeMessageError{message: "输出质量模式不受支持"}
	}
	frameInterpolationMode := strings.ToLower(strings.TrimSpace(input.FrameInterpolationMode))
	if frameInterpolationMode == "" {
		frameInterpolationMode = "keep"
	}
	if frameInterpolationMode != "keep" && frameInterpolationMode != "to25" && frameInterpolationMode != "to30" && frameInterpolationMode != "double" && frameInterpolationMode != "to60" {
		return model.VideoUpscaleJob{}, safeMessageError{message: "插帧帧率模式不受支持"}
	}
	interpolationMode := strings.ToLower(strings.TrimSpace(input.InterpolationMode))
	if frameInterpolationMode != "keep" {
		if interpolationMode == "" {
			interpolationMode = "fast"
		}
		if interpolationMode != "ultra-fast" && interpolationMode != "fast" && interpolationMode != "medium" {
			return model.VideoUpscaleJob{}, safeMessageError{message: "插帧模式不受支持"}
		}
	} else {
		interpolationMode = ""
	}
	preserveAudio := true
	if input.PreserveAudioSet {
		preserveAudio = input.PreserveAudio
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
		Provider: setting.Provider, OutputTOSPath: setting.OutputTOSPath, Target: target, OutputQualityMode: qualityMode, PreserveAudio: preserveAudio, FrameInterpolationMode: frameInterpolationMode, InterpolationMode: interpolationMode, ProcessingStage: "queued", PricingRuleVersion: videoUpscalePricingRuleVersion, InterpolationPricingRuleVersion: videoInterpolationPricingRuleVersion,
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
	if err != nil || metadata.Width < 1 || metadata.Height < 1 {
		return model.VideoUpscaleJob{}, safeMessageError{message: "视频文件无效、已损坏或无法读取规格"}
	}
	job.InputWidth, job.InputHeight, job.InputDurationSeconds, job.InputFrameRate = metadata.Width, metadata.Height, metadata.DurationSeconds, metadata.FrameRate
	job.OutputWidth, job.OutputHeight, err = videoUpscaleTargetDimensions(metadata.Width, metadata.Height, target)
	if err != nil {
		return model.VideoUpscaleJob{}, err
	}
	if estimate, ok := estimateVideoUpscaleCost(job.InputDurationSeconds, job.InputFrameRate, job.OutputWidth, job.OutputHeight); ok {
		job.EstimatedBillableMinutes = estimate.BillableMinutes
		job.EstimatedCostCNY = estimate.CostCNY
		job.CostEstimateAvailable = true
	}
	if frameInterpolationMode != "keep" {
		job.InterpolationTargetFrameRate, err = videoInterpolationTargetFPS(job.InputFrameRate, frameInterpolationMode)
		if err != nil {
			message := "无法可靠识别视频帧率，不能提交智能插帧"
			if target := fixedInterpolationTarget(frameInterpolationMode); target > 0 && job.InputFrameRate >= target {
				message = fmt.Sprintf("源视频已达到 %.0ffps，不能选择插帧至 %.0ffps", target, target)
			} else if job.InputFrameRate > 0 {
				message = "插帧目标帧率超出支持范围"
			}
			return model.VideoUpscaleJob{}, safeMessageError{message: message}
		}
		if estimate, ok := estimateVideoInterpolationCost(job.InputDurationSeconds, job.InputFrameRate, job.InterpolationTargetFrameRate, job.OutputWidth, job.OutputHeight, job.InterpolationMode); ok {
			job.EstimatedInterpolationBillableMinutes = estimate.BillableMinutes
			job.EstimatedInterpolationCostCNY = estimate.CostCNY
			job.InterpolationCostEstimateAvailable = true
		}
	}
	if job.CostEstimateAvailable && (frameInterpolationMode == "keep" || job.InterpolationCostEstimateAvailable) {
		job.EstimatedTotalCostCNY = job.EstimatedCostCNY + job.EstimatedInterpolationCostCNY
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
	if job.ErrorCode == "submission_uncertain" {
		return model.VideoUpscaleJob{}, safeMessageError{message: "无法确认上次付费提交结果，请重新创建任务并再次确认费用"}
	}
	if err := ctx.Err(); err != nil {
		return model.VideoUpscaleJob{}, err
	}
	if job.InputTOSURL == "" {
		if info, statErr := os.Stat(job.InputPath); statErr != nil || info.IsDir() {
			return model.VideoUpscaleJob{}, safeMessageError{message: "原始视频已不存在，请重新发起超分"}
		}
	}
	job.Status, job.Progress, job.ProcessingStage, job.Attempt = model.VideoUpscaleJobStatusQueued, 5, "queued", job.Attempt+1
	job.ErrorCode, job.ErrorMessage, job.CompletedAt, job.UpdatedAt = "", "", "", now()
	job, err = repository.SaveVideoUpscaleJob(job)
	if err != nil {
		return model.VideoUpscaleJob{}, err
	}
	videoUpscaleJobStarter(job.ID)
	return job, nil
}

func RecoverInterruptedVideoUpscaleJobs() error {
	jobs, err := repository.ListActiveVideoUpscaleJobs()
	if err != nil {
		return err
	}
	for _, job := range jobs {
		stage := strings.TrimSpace(job.ProcessingStage)
		if (stage == "upscale_processing" && strings.TrimSpace(job.RunID) != "") ||
			(stage == "upscale_succeeded" && strings.TrimSpace(job.UpscaleResultTOSURL) != "") ||
			(stage == "interpolation_processing" && strings.TrimSpace(job.InterpolationRunID) != "") ||
			(stage == "downloading" && strings.TrimSpace(job.ResultSourceURL) != "") ||
			(stage == "" && strings.TrimSpace(job.RunID) != "") {
			videoUpscaleJobStarter(job.ID)
			continue
		}
		job.Status = model.VideoUpscaleJobStatusFailed
		if stage == "upscale_submitting" || stage == "interpolation_submitting" {
			job.ErrorCode = "submission_uncertain"
			job.ErrorMessage = "无法确认火山付费任务是否已提交，请重新创建任务并再次确认费用"
		} else {
			job.ErrorCode = "server_restarted"
			job.ErrorMessage = "视频超分任务因服务重启中断，请重试"
		}
		job.CompletedAt = now()
		job.UpdatedAt = job.CompletedAt
		if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
			return err
		}
	}
	return nil
}

type VideoUpscaleCapabilitiesResult struct {
	Enabled                  bool                                     `json:"enabled"`
	Provider                 string                                   `json:"provider"`
	Targets                  []string                                 `json:"targets"`
	MaxInputBytes            int64                                    `json:"maxInputBytes"`
	CloudProcessing          bool                                     `json:"cloudProcessing"`
	Pricing                  VideoUpscalePricingRules                 `json:"pricing"`
	OutputQualityModes       []string                                 `json:"outputQualityModes"`
	DefaultOutputQualityMode string                                   `json:"defaultOutputQualityMode"`
	PreserveAudioSupported   bool                                     `json:"preserveAudioSupported"`
	FrameInterpolation       VideoUpscaleFrameInterpolationCapability `json:"frameInterpolation"`
}

type VideoUpscalePricingRules struct {
	UnitPriceCNY    float64                      `json:"unitPriceCny"`
	RuleVersion     string                       `json:"ruleVersion"`
	ResolutionTiers []VideoUpscaleResolutionTier `json:"resolutionTiers"`
	FrameRateTiers  []VideoUpscaleFrameRateTier  `json:"frameRateTiers"`
}

type VideoUpscaleResolutionTier struct {
	MaxShortEdge *int    `json:"maxShortEdge"`
	Factor       float64 `json:"factor"`
}

type VideoUpscaleFrameRateTier struct {
	MaxFrameRate float64 `json:"maxFrameRate"`
	Factor       float64 `json:"factor"`
}

type VideoUpscaleFrameInterpolationCapability struct {
	Status                string                         `json:"status"`
	Modes                 []string                       `json:"modes"`
	ProcessingModes       []string                       `json:"processingModes"`
	DefaultProcessingMode string                         `json:"defaultProcessingMode"`
	MaxTargetFrameRate    float64                        `json:"maxTargetFrameRate"`
	MaxSourceMultiplier   float64                        `json:"maxSourceMultiplier"`
	Pricing               VideoInterpolationPricingRules `json:"pricing"`
}

type VideoInterpolationPricingRules struct {
	UnitPriceCNY float64                       `json:"unitPriceCny"`
	RuleVersion  string                        `json:"ruleVersion"`
	PixelTiers   []VideoInterpolationPixelTier `json:"pixelTiers"`
}

type VideoInterpolationPixelTier struct {
	MaxPixels    *int64  `json:"maxPixels"`
	FastFactor   float64 `json:"fastFactor"`
	MediumFactor float64 `json:"mediumFactor"`
}

func VideoUpscaleCapabilities() VideoUpscaleCapabilitiesResult {
	setting, err := currentVideoUpscaleSetting()
	provider := "volcengine-las"
	if setting.Provider != "" {
		provider = setting.Provider
	}
	return VideoUpscaleCapabilitiesResult{
		Enabled: err == nil, Provider: provider, Targets: []string{"1080p", "2k"}, MaxInputBytes: videoUpscaleMaxInputBytes, CloudProcessing: true,
		Pricing: videoUpscalePricingRules(), OutputQualityModes: []string{"compatible", "balanced", "master"}, DefaultOutputQualityMode: firstNonEmpty(setting.OutputQualityMode, "compatible"), PreserveAudioSupported: true,
		FrameInterpolation: videoUpscaleFrameInterpolationCapability(),
	}
}

func videoUpscaleFrameInterpolationCapability() VideoUpscaleFrameInterpolationCapability {
	max720, max1080, max1440 := int64(927408), int64(2086876), int64(3709632)
	return VideoUpscaleFrameInterpolationCapability{
		Status: "available", Modes: []string{"keep", "to25", "to30", "double", "to60"}, ProcessingModes: []string{"ultra-fast", "fast", "medium"}, DefaultProcessingMode: "fast", MaxTargetFrameRate: videoInterpolationMaxTargetFPS, MaxSourceMultiplier: videoInterpolationMaxMultiplier,
		Pricing: VideoInterpolationPricingRules{UnitPriceCNY: videoInterpolationUnitPriceCNY, RuleVersion: videoInterpolationPricingRuleVersion, PixelTiers: []VideoInterpolationPixelTier{{MaxPixels: &max720, FastFactor: 1, MediumFactor: 4}, {MaxPixels: &max1080, FastFactor: 3, MediumFactor: 8}, {MaxPixels: &max1440, FastFactor: 4, MediumFactor: 14}, {FastFactor: 10, MediumFactor: 24}}},
	}
}

func fixedInterpolationTarget(mode string) float64 {
	switch mode {
	case "to25":
		return 25
	case "to30":
		return 30
	case "to60":
		return 60
	default:
		return 0
	}
}

func currentVideoUpscaleSetting() (model.VideoUpscaleSetting, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return model.VideoUpscaleSetting{}, err
	}
	normalized := normalizeSettings(settings)
	setting := normalized.Private.VideoUpscale
	if !setting.Enabled {
		return model.VideoUpscaleSetting{}, safeMessageError{message: "服务端尚未启用视频超分"}
	}
	credentials := normalized.Private.VolcengineAsset
	if setting.APIKey == "" || setting.OutputTOSPath == "" || credentials.AccessKey == "" || credentials.SecretKey == "" {
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
	output, err := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate:format=duration", "-of", "json", path).Output()
	if err != nil {
		return videoUpscaleSourceMetadata{}, err
	}
	var payload struct {
		Streams []struct {
			Width        int    `json:"width"`
			Height       int    `json:"height"`
			AvgFrameRate string `json:"avg_frame_rate"`
			RFrameRate   string `json:"r_frame_rate"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if err := json.Unmarshal(output, &payload); err != nil || len(payload.Streams) == 0 {
		return videoUpscaleSourceMetadata{}, errors.New("ffprobe returned invalid metadata")
	}
	duration, _ := strconv.ParseFloat(payload.Format.Duration, 64)
	if math.IsNaN(duration) || math.IsInf(duration, 0) || duration < 0 {
		duration = 0
	}
	stream := payload.Streams[0]
	return videoUpscaleSourceMetadata{Width: stream.Width, Height: stream.Height, DurationSeconds: duration, FrameRate: selectVideoUpscaleFrameRate(stream.AvgFrameRate, stream.RFrameRate)}, nil
}

func selectVideoUpscaleFrameRate(avg, nominal string) float64 {
	if value := parseVideoUpscaleFrameRate(avg); value > 0 {
		return value
	}
	return parseVideoUpscaleFrameRate(nominal)
}

func parseVideoUpscaleFrameRate(raw string) float64 {
	parts := strings.Split(strings.TrimSpace(raw), "/")
	numerator, err := strconv.ParseFloat(parts[0], 64)
	if err != nil {
		return 0
	}
	denominator := 1.0
	if len(parts) == 2 {
		denominator, err = strconv.ParseFloat(parts[1], 64)
	} else if len(parts) != 1 {
		return 0
	}
	value := numerator / denominator
	if err != nil || denominator == 0 || value <= 0 || value > 120 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return value
}

func firstVideoUpscaleError(err, fallback error) error {
	if err != nil {
		return err
	}
	return fallback
}
