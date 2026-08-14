package service

import (
	"context"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestCreateVideoSubtitleEraseJobPersistsInputAndCost(t *testing.T) {
	setupVideoSubtitleEraseTest(t)
	videoSubtitleEraseMetadataProbe = func(context.Context, string) (videoUpscaleSourceMetadata, error) {
		return videoUpscaleSourceMetadata{Width: 1080, Height: 1920, DurationSeconds: 90}, nil
	}
	started := ""
	videoSubtitleEraseJobStarter = func(id string) { started = id }

	job, err := CreateVideoSubtitleEraseJob(context.Background(), "user-a", strings.NewReader("video"), VideoSubtitleEraseCreateInput{
		Filename: "source.mp4", ContentType: "video/mp4", ProjectID: "project-1", CanvasID: "canvas-1", SourceNodeID: "node-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if job.Status != model.VideoSubtitleEraseJobStatusQueued || job.ClientToken != job.ID || job.InputWidth != 1080 || job.InputHeight != 1920 || job.OutputWidth != 1080 || job.OutputHeight != 1920 || job.EstimatedBillableMinutes != 1.5 || math.Abs(job.EstimatedCostCNY-0.6) > 1e-9 || !job.CostEstimateAvailable || job.PricingRuleVersion != videoSubtitleErasePricingRuleVersion || started != job.ID {
		t.Fatalf("job=%#v started=%q", job, started)
	}
	if _, err := os.Stat(job.InputPath); err != nil {
		t.Fatalf("input file: %v", err)
	}
	if _, ok, err := GetUserVideoSubtitleEraseJob("user-b", job.ID); err == nil || ok {
		t.Fatalf("foreign owner read job: ok=%v err=%v", ok, err)
	}
}

func TestCreateVideoSubtitleEraseJobRejectsOversizeBeforeStarting(t *testing.T) {
	setupVideoSubtitleEraseTest(t)
	videoSubtitleEraseMetadataProbe = func(context.Context, string) (videoUpscaleSourceMetadata, error) {
		return videoUpscaleSourceMetadata{Width: 1600, Height: 3000, DurationSeconds: 10}, nil
	}
	started := 0
	videoSubtitleEraseJobStarter = func(string) { started++ }
	_, err := CreateVideoSubtitleEraseJob(context.Background(), "user-a", strings.NewReader("video"), VideoSubtitleEraseCreateInput{Filename: "source.mp4", ContentType: "video/mp4"})
	if err == nil || !strings.Contains(err.Error(), "2K") || started != 0 {
		t.Fatalf("err=%v started=%d", err, started)
	}
}

func TestRecoverInterruptedVideoSubtitleEraseJobsReusesStableClientToken(t *testing.T) {
	setupVideoSubtitleEraseTest(t)
	job := model.VideoSubtitleEraseJob{ID: "erase-resume", UserID: "user-a", ClientToken: "erase-resume", Status: model.VideoSubtitleEraseJobStatusProcessing, ProcessingStage: "subtitle_submitting", InputTOSURL: "tos://bucket/input.mp4", CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoSubtitleEraseJob(job); err != nil {
		t.Fatal(err)
	}
	var resumed []string
	videoSubtitleEraseJobStarter = func(id string) { resumed = append(resumed, id) }
	if err := RecoverInterruptedVideoSubtitleEraseJobs(); err != nil {
		t.Fatal(err)
	}
	if len(resumed) != 1 || resumed[0] != job.ID {
		t.Fatalf("resumed=%v", resumed)
	}
}

func TestRetryVideoSubtitleEraseJobKeepsClientToken(t *testing.T) {
	setupVideoSubtitleEraseTest(t)
	job := model.VideoSubtitleEraseJob{ID: "erase-retry", UserID: "user-a", ClientToken: "erase-retry", Status: model.VideoSubtitleEraseJobStatusFailed, InputTOSURL: "tos://bucket/input.mp4", Attempt: 1, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoSubtitleEraseJob(job); err != nil {
		t.Fatal(err)
	}
	started := ""
	videoSubtitleEraseJobStarter = func(id string) { started = id }
	retried, err := RetryVideoSubtitleEraseJob(context.Background(), "user-a", job.ID)
	if err != nil || retried.ClientToken != "erase-retry" || retried.Attempt != 2 || started != job.ID {
		t.Fatalf("retried=%#v started=%q err=%v", retried, started, err)
	}
}

func setupVideoSubtitleEraseTest(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	oldConfig := config.Cfg
	oldProbe, oldStarter, oldMax := videoSubtitleEraseMetadataProbe, videoSubtitleEraseJobStarter, videoSubtitleEraseMaxInputBytes
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	config.Cfg.VideoUpscaleWorkDir = filepath.Join(tmp, "work")
	videoSubtitleEraseMaxInputBytes = 1024
	repository.ResetForTest()
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{
		VolcengineAsset: model.VolcengineAssetSetting{AccessKey: "ak", SecretKey: "sk"},
		VideoUpscale:    model.VideoUpscaleSetting{Enabled: true, SubtitleEraseEnabled: true, Provider: "volcengine-las", APIKey: "las-key", OutputTOSPath: "tos://bucket/output/"},
	}}, now())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		config.Cfg = oldConfig
		videoSubtitleEraseMetadataProbe, videoSubtitleEraseJobStarter, videoSubtitleEraseMaxInputBytes = oldProbe, oldStarter, oldMax
		repository.ResetForTest()
	})
}
