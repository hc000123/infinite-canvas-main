package service

import (
	"bytes"
	"context"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestCreateVideoUpscaleJobValidatesMetadataAndPersistsInput(t *testing.T) {
	setupVideoUpscaleTest(t)
	videoUpscaleMetadataProbe = func(context.Context, string) (videoUpscaleSourceMetadata, error) {
		return videoUpscaleSourceMetadata{Width: 1280, Height: 720, DurationSeconds: 10, FrameRate: 24}, nil
	}
	started := ""
	videoUpscaleJobStarter = func(id string) { started = id }

	job, err := CreateVideoUpscaleJob(context.Background(), "user-a", bytes.NewReader([]byte("video-content")), VideoUpscaleCreateInput{
		Filename: "source.mp4", ContentType: "video/mp4", Target: "1080p", ProjectID: "project-1", CanvasID: "canvas-1", SourceNodeID: "node-1",
		OutputQualityMode: "balanced", PreserveAudio: true, PreserveAudioSet: true, FrameInterpolationMode: "keep",
	})
	if err != nil {
		t.Fatal(err)
	}
	if job.Status != model.VideoUpscaleJobStatusQueued || job.InputWidth != 1280 || job.InputHeight != 720 || job.OutputWidth != 1920 || job.OutputHeight != 1080 || job.InputDurationSeconds != 10 || job.Target != "1080p" || started != job.ID {
		t.Fatalf("job=%#v started=%q", job, started)
	}
	if job.InputFrameRate != 24 || job.OutputQualityMode != "balanced" || !job.PreserveAudio || job.FrameInterpolationMode != "keep" || !job.CostEstimateAvailable || job.EstimatedBillableMinutes != .5 || job.EstimatedCostCNY != 1.1 || job.PricingRuleVersion != videoUpscalePricingRuleVersion {
		t.Fatalf("job snapshot=%#v", job)
	}
	stored, ok, err := repository.GetVideoUpscaleJob(job.ID)
	if err != nil || !ok || stored.InputFrameRate != 24 || stored.OutputQualityMode != "balanced" || !stored.PreserveAudio || stored.FrameInterpolationMode != "keep" || stored.EstimatedCostCNY != 1.1 {
		t.Fatalf("stored snapshot=%#v ok=%v err=%v", stored, ok, err)
	}
	if _, err := os.Stat(job.InputPath); err != nil {
		t.Fatalf("input file: %v", err)
	}
	if _, ok, err := GetUserVideoUpscaleJob("user-b", job.ID); err == nil || ok {
		t.Fatalf("foreign owner read job: ok=%v err=%v", ok, err)
	}
}

func TestTencentMPSTemplateID(t *testing.T) {
	cases := []struct {
		scene, target string
		want          int64
	}{
		{"comic", "1080p", 327004}, {"comic", "2k", 327006},
		{"live", "1080p", 327003}, {"live", "2k", 327005},
		{"restore", "1080p", 327022}, {"restore", "2k", 327023},
	}
	for _, item := range cases {
		got, err := tencentMPSTemplateID(item.scene, item.target)
		if err != nil || got != item.want {
			t.Fatalf("scene=%s target=%s got=%d err=%v want=%d", item.scene, item.target, got, err, item.want)
		}
	}
	for _, item := range [][2]string{{"unknown", "1080p"}, {"comic", "4k"}} {
		if _, err := tencentMPSTemplateID(item[0], item[1]); err == nil {
			t.Fatalf("scene=%s target=%s should fail", item[0], item[1])
		}
	}
}

func TestCreateTencentMPSVideoUpscaleJobFreezesProviderOptions(t *testing.T) {
	setupVideoUpscaleTest(t)
	settings, err := repository.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.Private.TencentMPSVideo = model.TencentMPSVideoSetting{
		Enabled: true, SecretID: "secret-id", SecretKey: "secret-key", COSBucket: "media-1300000000", COSRegion: "ap-shanghai", InputPrefix: "custom/input/", OutputPrefix: "custom/output/", DefaultScene: "comic",
	}
	if _, err = repository.SaveSettings(settings, now()); err != nil {
		t.Fatal(err)
	}
	videoUpscaleMetadataProbe = func(context.Context, string) (videoUpscaleSourceMetadata, error) {
		return videoUpscaleSourceMetadata{Width: 1280, Height: 720, DurationSeconds: 10, FrameRate: 24}, nil
	}
	job, err := CreateVideoUpscaleJob(context.Background(), "user-a", strings.NewReader("video"), VideoUpscaleCreateInput{
		Filename: "source.mp4", ContentType: "video/mp4", Provider: "tencent-mps", EnhancementScene: "comic", Target: "1080p",
		OutputQualityMode: "master", PreserveAudioSet: true, FrameInterpolationMode: "double", InterpolationMode: "medium",
	})
	if err != nil {
		t.Fatal(err)
	}
	if job.Provider != "tencent-mps" || job.EnhancementScene != "comic" || job.TencentTemplateID != 327004 || job.CloudBucket != "media-1300000000" || job.CloudRegion != "ap-shanghai" || job.CloudInputPrefix != "custom/input/" || job.CloudOutputPrefix != "custom/output/" {
		t.Fatalf("Tencent snapshot=%#v", job)
	}
	if job.OutputQualityMode != "" || job.FrameInterpolationMode != "keep" || job.InterpolationMode != "" || !job.PreserveAudio || job.CostEstimateAvailable || job.EstimatedTotalCostCNY != 0 {
		t.Fatalf("Tencent provider-specific options=%#v", job)
	}
}

func TestCreateVideoUpscaleJobRejectsUnknownProviderBeforePersisting(t *testing.T) {
	setupVideoUpscaleTest(t)
	started := 0
	videoUpscaleJobStarter = func(string) { started++ }
	_, err := CreateVideoUpscaleJob(context.Background(), "user-a", strings.NewReader("video"), VideoUpscaleCreateInput{
		Filename: "source.mp4", ContentType: "video/mp4", Provider: "unknown", Target: "1080p",
	})
	if err == nil || !strings.Contains(err.Error(), "渠道") || started != 0 {
		t.Fatalf("err=%v started=%d", err, started)
	}
}

func TestCreateVideoUpscaleJobAllowsUnknownDurationAndFrameRate(t *testing.T) {
	setupVideoUpscaleTest(t)
	videoUpscaleMetadataProbe = func(context.Context, string) (videoUpscaleSourceMetadata, error) {
		return videoUpscaleSourceMetadata{Width: 1280, Height: 720}, nil
	}
	job, err := CreateVideoUpscaleJob(context.Background(), "user-a", strings.NewReader("video"), VideoUpscaleCreateInput{Filename: "source.mp4", ContentType: "video/mp4", Target: "1080p"})
	if err != nil {
		t.Fatal(err)
	}
	if job.CostEstimateAvailable || job.EstimatedCostCNY != 0 || job.EstimatedBillableMinutes != 0 || job.PricingRuleVersion != videoUpscalePricingRuleVersion {
		t.Fatalf("unknown metadata must not create a cost estimate: %#v", job)
	}
}

func TestCreateVideoUpscaleJobPersistsInterpolationAndCostSnapshots(t *testing.T) {
	setupVideoUpscaleTest(t)
	videoUpscaleMetadataProbe = func(context.Context, string) (videoUpscaleSourceMetadata, error) {
		return videoUpscaleSourceMetadata{Width: 1280, Height: 720, DurationSeconds: 60, FrameRate: 24}, nil
	}
	job, err := CreateVideoUpscaleJob(context.Background(), "user-a", strings.NewReader("video"), VideoUpscaleCreateInput{
		Filename: "source.mp4", ContentType: "video/mp4", Target: "1080p", FrameInterpolationMode: "double", InterpolationMode: "fast",
	})
	if err != nil {
		t.Fatal(err)
	}
	if job.ProcessingStage != "queued" || job.FrameInterpolationMode != "double" || job.InterpolationMode != "fast" || job.InterpolationTargetFrameRate != 48 || !job.InterpolationCostEstimateAvailable || job.EstimatedInterpolationBillableMinutes != 3 || job.EstimatedInterpolationCostCNY != 1.5 || job.InterpolationPricingRuleVersion != videoInterpolationPricingRuleVersion || job.EstimatedTotalCostCNY != job.EstimatedCostCNY+job.EstimatedInterpolationCostCNY {
		t.Fatalf("job=%#v", job)
	}
	stored, ok, err := repository.GetVideoUpscaleJob(job.ID)
	if err != nil || !ok || stored.InterpolationMode != "fast" || stored.InterpolationTargetFrameRate != 48 || stored.EstimatedTotalCostCNY != job.EstimatedTotalCostCNY {
		t.Fatalf("stored=%#v ok=%v err=%v", stored, ok, err)
	}
}

func TestCreateVideoUpscaleJobValidatesInterpolationBeforeStarting(t *testing.T) {
	for _, item := range []struct {
		name           string
		frameRate      float64
		frameMode      string
		processingMode string
		want           string
	}{
		{name: "unknown frame rate", frameRate: 0, frameMode: "double", processingMode: "fast", want: "帧率"},
		{name: "to25 at 25", frameRate: 25, frameMode: "to25", processingMode: "fast", want: "25fps"},
		{name: "to30 at 30", frameRate: 30, frameMode: "to30", processingMode: "fast", want: "30fps"},
		{name: "to60 at 60", frameRate: 60, frameMode: "to60", processingMode: "fast", want: "60fps"},
		{name: "invalid frame mode", frameRate: 24, frameMode: "triple", processingMode: "fast", want: "帧率模式"},
		{name: "invalid processing mode", frameRate: 24, frameMode: "double", processingMode: "slow", want: "插帧模式"},
	} {
		t.Run(item.name, func(t *testing.T) {
			setupVideoUpscaleTest(t)
			videoUpscaleMetadataProbe = func(context.Context, string) (videoUpscaleSourceMetadata, error) {
				return videoUpscaleSourceMetadata{Width: 1280, Height: 720, DurationSeconds: 60, FrameRate: item.frameRate}, nil
			}
			started := 0
			videoUpscaleJobStarter = func(string) { started++ }
			_, err := CreateVideoUpscaleJob(context.Background(), "user-a", strings.NewReader("video"), VideoUpscaleCreateInput{
				Filename: "source.mp4", ContentType: "video/mp4", Target: "1080p", FrameInterpolationMode: item.frameMode, InterpolationMode: item.processingMode,
			})
			if err == nil || !strings.Contains(err.Error(), item.want) || started != 0 {
				t.Fatalf("err=%v started=%d want containing %q", err, started, item.want)
			}
		})
	}
}

func TestCreateVideoUpscaleJobKeepClearsInterpolationSnapshot(t *testing.T) {
	setupVideoUpscaleTest(t)
	videoUpscaleMetadataProbe = func(context.Context, string) (videoUpscaleSourceMetadata, error) {
		return videoUpscaleSourceMetadata{Width: 1280, Height: 720, DurationSeconds: 60, FrameRate: 24}, nil
	}
	job, err := CreateVideoUpscaleJob(context.Background(), "user-a", strings.NewReader("video"), VideoUpscaleCreateInput{
		Filename: "source.mp4", ContentType: "video/mp4", Target: "1080p", FrameInterpolationMode: "keep", InterpolationMode: "medium",
	})
	if err != nil {
		t.Fatal(err)
	}
	if job.InterpolationMode != "" || job.InterpolationTargetFrameRate != 0 || job.InterpolationCostEstimateAvailable || job.EstimatedInterpolationCostCNY != 0 || job.EstimatedTotalCostCNY != job.EstimatedCostCNY {
		t.Fatalf("keep snapshot=%#v", job)
	}
}

func TestCreateVideoUpscaleJobRejectsUnsupportedOutputOptions(t *testing.T) {
	setupVideoUpscaleTest(t)
	for _, item := range []struct {
		name  string
		input VideoUpscaleCreateInput
		want  string
	}{
		{name: "quality", input: VideoUpscaleCreateInput{Filename: "source.mp4", ContentType: "video/mp4", Target: "1080p", OutputQualityMode: "cinema"}, want: "输出质量"},
		{name: "interpolation", input: VideoUpscaleCreateInput{Filename: "source.mp4", ContentType: "video/mp4", Target: "1080p", FrameInterpolationMode: "2x"}, want: "插帧"},
	} {
		t.Run(item.name, func(t *testing.T) {
			_, err := CreateVideoUpscaleJob(context.Background(), "user-a", strings.NewReader("video"), item.input)
			if err == nil || !strings.Contains(err.Error(), item.want) {
				t.Fatalf("error=%v want containing %q", err, item.want)
			}
		})
	}
}

func TestVideoUpscaleFrameRatePrefersAverageAndFallsBackToNominal(t *testing.T) {
	for _, item := range []struct {
		avg, nominal string
		want         float64
	}{
		{"24000/1001", "30/1", 24000.0 / 1001},
		{"0/0", "30000/1001", 30000.0 / 1001},
		{"bad", "25", 25},
		{"121/1", "24/1", 24},
		{"0/0", "0/0", 0},
		{"240/1", "180/1", 0},
	} {
		if got := selectVideoUpscaleFrameRate(item.avg, item.nominal); math.Abs(got-item.want) > 1e-9 {
			t.Fatalf("avg=%q nominal=%q got=%g want=%g", item.avg, item.nominal, got, item.want)
		}
	}
}

func TestVideoUpscaleCapabilitiesExposePricingAndOutputOptions(t *testing.T) {
	setupVideoUpscaleTest(t)
	result := VideoUpscaleCapabilities()
	if result.Pricing.UnitPriceCNY != 2.2 || result.Pricing.RuleVersion == "" || len(result.Pricing.ResolutionTiers) != 4 || result.Pricing.ResolutionTiers[3].MaxShortEdge != nil || len(result.Pricing.FrameRateTiers) != 4 {
		t.Fatalf("pricing=%#v", result.Pricing)
	}
	if result.DefaultOutputQualityMode != "compatible" || len(result.OutputQualityModes) != 3 || !result.PreserveAudioSupported || result.FrameInterpolation.Status != "available" || len(result.FrameInterpolation.Modes) != 5 || result.FrameInterpolation.Modes[0] != "keep" || result.FrameInterpolation.Modes[1] != "to25" || result.FrameInterpolation.Modes[2] != "to30" || len(result.FrameInterpolation.ProcessingModes) != 3 || result.FrameInterpolation.DefaultProcessingMode != "fast" || result.FrameInterpolation.MaxTargetFrameRate != 480 || result.FrameInterpolation.MaxSourceMultiplier != 6 || result.FrameInterpolation.Pricing.UnitPriceCNY != .5 || result.FrameInterpolation.Pricing.RuleVersion != videoInterpolationPricingRuleVersion || len(result.FrameInterpolation.Pricing.PixelTiers) != 4 {
		t.Fatalf("capabilities=%#v", result)
	}
}

func TestVideoUpscaleTargetDimensionsPreserveAspectRatio(t *testing.T) {
	for _, item := range []struct {
		width, height int
		target        string
		wantWidth     int
		wantHeight    int
	}{
		{1280, 720, "1080p", 1920, 1080},
		{720, 1280, "1080p", 1080, 1920},
		{1920, 1080, "2k", 2560, 1440},
		{1080, 1920, "2k", 1440, 2560},
	} {
		width, height, err := videoUpscaleTargetDimensions(item.width, item.height, item.target)
		if err != nil || width != item.wantWidth || height != item.wantHeight {
			t.Fatalf("%dx%d %s => %dx%d err=%v", item.width, item.height, item.target, width, height, err)
		}
	}
}

func TestCreateVideoUpscaleJobRejectsUnsupportedInputAndTarget(t *testing.T) {
	setupVideoUpscaleTest(t)
	videoUpscaleMetadataProbe = func(context.Context, string) (videoUpscaleSourceMetadata, error) {
		return videoUpscaleSourceMetadata{Width: 1920, Height: 1080, DurationSeconds: 5}, nil
	}
	started := 0
	videoUpscaleJobStarter = func(string) { started++ }

	cases := []struct {
		name, filename, contentType, target string
		data                                io.Reader
		want                                string
	}{
		{name: "format", filename: "source.avi", contentType: "video/x-msvideo", target: "1080p", data: strings.NewReader("video"), want: "MP4、WebM 或 MOV"},
		{name: "target", filename: "source.mp4", contentType: "video/mp4", target: "1080p", data: strings.NewReader("video"), want: "请选择 2K"},
		{name: "unknown-target", filename: "source.mp4", contentType: "video/mp4", target: "4k", data: strings.NewReader("video"), want: "1080p 或 2K"},
		{name: "empty", filename: "source.mp4", contentType: "video/mp4", target: "2k", data: strings.NewReader(""), want: "视频不能为空"},
		{name: "bytes", filename: "source.mp4", contentType: "video/mp4", target: "2k", data: strings.NewReader("123456789"), want: "视频不能超过"},
	}
	videoUpscaleMaxInputBytes = 8
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			_, err := CreateVideoUpscaleJob(context.Background(), "user-a", item.data, VideoUpscaleCreateInput{Filename: item.filename, ContentType: item.contentType, Target: item.target})
			if err == nil || !strings.Contains(err.Error(), item.want) {
				t.Fatalf("error=%v want containing %q", err, item.want)
			}
		})
	}
	if started != 0 {
		t.Fatalf("invalid requests started %d jobs", started)
	}
}

func TestRecoverInterruptedVideoUpscaleJobsOnlyResumesSubmittedRuns(t *testing.T) {
	setupVideoUpscaleTest(t)
	jobs := []model.VideoUpscaleJob{
		{ID: "submitted", UserID: "user-a", Status: model.VideoUpscaleJobStatusProcessing, RunID: "run-1", CreatedAt: now(), UpdatedAt: now()},
		{ID: "not-submitted", UserID: "user-a", Status: model.VideoUpscaleJobStatusUploading, InputTOSURL: "tos://bucket/input.mp4", CreatedAt: now(), UpdatedAt: now()},
	}
	for _, job := range jobs {
		if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
			t.Fatal(err)
		}
	}
	var resumed []string
	videoUpscaleJobStarter = func(id string) { resumed = append(resumed, id) }
	if err := RecoverInterruptedVideoUpscaleJobs(); err != nil {
		t.Fatal(err)
	}
	if len(resumed) != 1 || resumed[0] != "submitted" {
		t.Fatalf("startup must only poll already submitted runs, resumed=%v", resumed)
	}
	interrupted, ok, err := repository.GetVideoUpscaleJob("not-submitted")
	if err != nil || !ok {
		t.Fatalf("load interrupted job: ok=%v err=%v", ok, err)
	}
	if interrupted.Status != model.VideoUpscaleJobStatusFailed || interrupted.ErrorCode != "server_restarted" || interrupted.InputTOSURL != "tos://bucket/input.mp4" {
		t.Fatalf("non-submitted job should become retryable without losing TOS input: %+v", interrupted)
	}
}

func TestRecoverInterruptedVideoUpscaleJobsUsesDurableStageAndTaskID(t *testing.T) {
	setupVideoUpscaleTest(t)
	jobs := []model.VideoUpscaleJob{
		{ID: "upscale", UserID: "user-a", Status: model.VideoUpscaleJobStatusProcessing, ProcessingStage: "upscale_processing", RunID: "run-1", CreatedAt: now(), UpdatedAt: now()},
		{ID: "interpolation", UserID: "user-a", Status: model.VideoUpscaleJobStatusProcessing, ProcessingStage: "interpolation_processing", RunID: "run-2", InterpolationRunID: "interpolation-1", CreatedAt: now(), UpdatedAt: now()},
		{ID: "uncertain", UserID: "user-a", Status: model.VideoUpscaleJobStatusProcessing, ProcessingStage: "interpolation_submitting", RunID: "run-3", CreatedAt: now(), UpdatedAt: now()},
	}
	for _, job := range jobs {
		if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
			t.Fatal(err)
		}
	}
	var resumed []string
	videoUpscaleJobStarter = func(id string) { resumed = append(resumed, id) }
	if err := RecoverInterruptedVideoUpscaleJobs(); err != nil {
		t.Fatal(err)
	}
	if strings.Join(resumed, ",") != "upscale,interpolation" {
		t.Fatalf("resumed=%v", resumed)
	}
	uncertain, _, _ := repository.GetVideoUpscaleJob("uncertain")
	if uncertain.Status != model.VideoUpscaleJobStatusFailed || uncertain.ErrorCode != "submission_uncertain" {
		t.Fatalf("uncertain=%#v", uncertain)
	}
}

func TestRecoverInterruptedVideoUpscaleJobsResumesUpscaleSucceededForInterpolation(t *testing.T) {
	setupVideoUpscaleTest(t)
	job := model.VideoUpscaleJob{ID: "upscale-succeeded", UserID: "user-a", Status: model.VideoUpscaleJobStatusProcessing, ProcessingStage: "upscale_succeeded", RunID: "upscale-run", UpscaleResultTOSURL: "tos://bucket/upscaled.mp4", FrameInterpolationMode: "double", CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	var resumed []string
	videoUpscaleJobStarter = func(id string) { resumed = append(resumed, id) }
	if err := RecoverInterruptedVideoUpscaleJobs(); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if len(resumed) != 1 || resumed[0] != job.ID || stored.Status != model.VideoUpscaleJobStatusProcessing || stored.ErrorCode != "" {
		t.Fatalf("resumed=%v stored=%#v", resumed, stored)
	}
}

func TestRecoverInterruptedVideoUpscaleJobsResumesDownloadingFinalResult(t *testing.T) {
	setupVideoUpscaleTest(t)
	job := model.VideoUpscaleJob{ID: "downloading", UserID: "user-a", Status: model.VideoUpscaleJobStatusDownloading, ProcessingStage: "downloading", RunID: "upscale-run", InterpolationRunID: "interpolation-run", ResultSourceURL: "https://example.com/final.mp4", CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	var resumed []string
	videoUpscaleJobStarter = func(id string) { resumed = append(resumed, id) }
	if err := RecoverInterruptedVideoUpscaleJobs(); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if len(resumed) != 1 || resumed[0] != job.ID || stored.Status != model.VideoUpscaleJobStatusDownloading || stored.ErrorCode != "" {
		t.Fatalf("resumed=%v stored=%#v", resumed, stored)
	}
}

func TestRetryVideoUpscaleJobRejectsSubmissionUncertain(t *testing.T) {
	setupVideoUpscaleTest(t)
	job := model.VideoUpscaleJob{ID: "uncertain", UserID: "user-a", Status: model.VideoUpscaleJobStatusFailed, ErrorCode: "submission_uncertain", InputTOSURL: "tos://bucket/input.mp4", CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	if _, err := RetryVideoUpscaleJob(context.Background(), "user-a", job.ID); err == nil || !strings.Contains(err.Error(), "重新创建") {
		t.Fatalf("err=%v", err)
	}
}

func setupVideoUpscaleTest(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	oldConfig := config.Cfg
	oldProbe, oldStarter, oldMax := videoUpscaleMetadataProbe, videoUpscaleJobStarter, videoUpscaleMaxInputBytes
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	config.Cfg.VideoUpscaleWorkDir = filepath.Join(tmp, "work")
	videoUpscaleMaxInputBytes = 1024
	repository.ResetForTest()
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{
		VolcengineAsset: model.VolcengineAssetSetting{AccessKey: "ak", SecretKey: "sk"},
		VideoUpscale:    model.VideoUpscaleSetting{Enabled: true, Provider: "volcengine-las", APIKey: "las-key", OutputTOSPath: "tos://bucket/output/"},
	}}, now())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		config.Cfg = oldConfig
		videoUpscaleMetadataProbe, videoUpscaleJobStarter, videoUpscaleMaxInputBytes = oldProbe, oldStarter, oldMax
		repository.ResetForTest()
	})
}
