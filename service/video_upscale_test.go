package service

import (
	"bytes"
	"context"
	"io"
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
		return videoUpscaleSourceMetadata{Width: 1280, Height: 720, DurationSeconds: 6.5}, nil
	}
	started := ""
	videoUpscaleJobStarter = func(id string) { started = id }

	job, err := CreateVideoUpscaleJob(context.Background(), "user-a", bytes.NewReader([]byte("video-content")), VideoUpscaleCreateInput{
		Filename: "source.mp4", ContentType: "video/mp4", Target: "1080p", ProjectID: "project-1", CanvasID: "canvas-1", SourceNodeID: "node-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if job.Status != model.VideoUpscaleJobStatusQueued || job.InputWidth != 1280 || job.InputHeight != 720 || job.OutputWidth != 1920 || job.OutputHeight != 1080 || job.InputDurationSeconds != 6.5 || job.Target != "1080p" || started != job.ID {
		t.Fatalf("job=%#v started=%q", job, started)
	}
	if _, err := os.Stat(job.InputPath); err != nil {
		t.Fatalf("input file: %v", err)
	}
	if _, ok, err := GetUserVideoUpscaleJob("user-b", job.ID); err == nil || ok {
		t.Fatalf("foreign owner read job: ok=%v err=%v", ok, err)
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
		{ID: "not-submitted", UserID: "user-a", Status: model.VideoUpscaleJobStatusUploading, VODVid: "vid-1", CreatedAt: now(), UpdatedAt: now()},
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
	if interrupted.Status != model.VideoUpscaleJobStatusFailed || interrupted.ErrorCode != "server_restarted" || interrupted.VODVid != "vid-1" {
		t.Fatalf("non-submitted job should become retryable without losing Vid: %+v", interrupted)
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
		VideoUpscale:    model.VideoUpscaleSetting{Enabled: true, Provider: "volcengine", SpaceName: "vod-space"},
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
