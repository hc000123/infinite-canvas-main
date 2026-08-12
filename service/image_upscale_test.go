package service

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type fakeImageUpscaleProvider struct {
	result ImageUpscaleProviderResult
	err    error
}

func (provider fakeImageUpscaleProvider) Upscale(_ context.Context, _ io.Reader, _ ImageUpscaleProviderRequest) (ImageUpscaleProviderResult, error) {
	return provider.result, provider.err
}

func TestCreateImageUpscaleJobValidatesAndPersistsInput(t *testing.T) {
	setupImageUpscaleTest(t)
	originalStarter := imageUpscaleJobStarter
	imageUpscaleJobStarter = func(string) {}
	t.Cleanup(func() { imageUpscaleJobStarter = originalStarter })

	job, err := CreateImageUpscaleJob(context.Background(), "user-a", bytes.NewReader(testUpscalePNG(t, 8, 6)), ImageUpscaleCreateInput{
		Filename: "source.png", ContentType: "image/png", Scale: 2, ProjectID: "project-1", CanvasID: "canvas-1", SourceNodeID: "node-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if job.Status != model.ImageUpscaleJobStatusQueued || job.Progress != 5 || job.Attempt != 1 || job.InputWidth != 8 || job.InputHeight != 6 || job.Scale != 2 || !job.CloudProcessing {
		t.Fatalf("job=%#v", job)
	}
	if job.InputPath == "" {
		t.Fatal("input path was not persisted")
	}
	if _, err := os.Stat(job.InputPath); err != nil {
		t.Fatalf("input file: %v", err)
	}
	if _, ok, err := GetUserImageUpscaleJob("user-b", job.ID); err == nil || ok {
		t.Fatalf("foreign owner read job: ok=%v err=%v", ok, err)
	}
}

func TestCreateImageUpscaleJobUsesNormalizedConfiguredProvider(t *testing.T) {
	setupImageUpscaleTest(t)
	config.Cfg.ImageUpscaleProvider = "  ALIYUN  "
	originalStarter := imageUpscaleJobStarter
	imageUpscaleJobStarter = func(string) {}
	t.Cleanup(func() { imageUpscaleJobStarter = originalStarter })

	job, err := CreateImageUpscaleJob(context.Background(), "user-a", bytes.NewReader(testUpscalePNG(t, 8, 6)), ImageUpscaleCreateInput{Scale: 2})
	if err != nil {
		t.Fatal(err)
	}
	if job.Provider != "aliyun" {
		t.Fatalf("provider=%q", job.Provider)
	}
}

func TestCreateImageUpscaleJobRejectsInvalidInputsBeforeStart(t *testing.T) {
	setupImageUpscaleTest(t)
	started := 0
	originalStarter := imageUpscaleJobStarter
	imageUpscaleJobStarter = func(string) { started++ }
	t.Cleanup(func() { imageUpscaleJobStarter = originalStarter })

	cases := []struct {
		name  string
		data  []byte
		scale int
		want  string
	}{
		{name: "scale", data: testUpscalePNG(t, 8, 6), scale: 3, want: "只支持 2× 或 4×"},
		{name: "empty", data: nil, scale: 2, want: "图片不能为空"},
		{name: "not-image", data: []byte("not-image"), scale: 2, want: "仅支持"},
		{name: "dimensions", data: testUpscalePNG(t, 1921, 1), scale: 2, want: "尺寸"},
		{name: "bytes", data: make([]byte, maxImageUpscaleInputBytes+1), scale: 2, want: "5 MB"},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			_, err := CreateImageUpscaleJob(context.Background(), "user-a", bytes.NewReader(item.data), ImageUpscaleCreateInput{Filename: "source.png", Scale: item.scale})
			if err == nil || !strings.Contains(err.Error(), item.want) {
				t.Fatalf("error=%v want containing %q", err, item.want)
			}
		})
	}
	if started != 0 {
		t.Fatalf("invalid requests started %d jobs", started)
	}
}

func TestProcessImageUpscaleJobPersistsProviderResult(t *testing.T) {
	setupImageUpscaleTest(t)
	inputPath := filepath.Join(config.Cfg.ImageUpscaleWorkDir, "input.png")
	if err := os.WriteFile(inputPath, testUpscalePNG(t, 4, 3), 0600); err != nil {
		t.Fatal(err)
	}
	job := model.ImageUpscaleJob{ID: "upscale-process", UserID: "user-a", Provider: "aliyun", Scale: 2, Status: model.ImageUpscaleJobStatusQueued, Progress: 5, Attempt: 1, InputPath: inputPath, CreatedAt: now(), UpdatedAt: now(), CloudProcessing: true}
	if _, err := repository.SaveImageUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := fakeImageUpscaleProvider{result: ImageUpscaleProviderResult{Provider: "aliyun", RequestID: "request-1", ResultURL: "https://provider.example/result.png", Model: "MakeSuperResolutionImage", Strategy: "base"}}
	if err := processImageUpscaleJob(context.Background(), job.ID, provider, func(context.Context, string) ([]byte, error) { return testUpscalePNG(t, 8, 6), nil }); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetImageUpscaleJob(job.ID)
	if stored.Status != model.ImageUpscaleJobStatusSucceeded || stored.Progress != 100 || stored.ProviderRequestID != "request-1" || stored.OutputWidth != 8 || stored.OutputHeight != 6 || !strings.HasPrefix(stored.ResultURL, "/api/uploaded-assets/image-upscale/") {
		t.Fatalf("stored=%#v", stored)
	}
	if _, err := os.Stat(filepath.Join(config.Cfg.PublicAssetDir, strings.TrimPrefix(stored.ResultURL, "/api/uploaded-assets/"))); err != nil {
		t.Fatalf("result file: %v", err)
	}
}

func TestProcessImageUpscaleJobFailureAndRetry(t *testing.T) {
	setupImageUpscaleTest(t)
	inputPath := filepath.Join(config.Cfg.ImageUpscaleWorkDir, "input.png")
	if err := os.WriteFile(inputPath, testUpscalePNG(t, 4, 3), 0600); err != nil {
		t.Fatal(err)
	}
	job := model.ImageUpscaleJob{ID: "upscale-fail", UserID: "user-a", Provider: "aliyun", Scale: 4, Status: model.ImageUpscaleJobStatusQueued, Progress: 5, Attempt: 1, InputPath: inputPath, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveImageUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	if err := processImageUpscaleJob(context.Background(), job.ID, fakeImageUpscaleProvider{err: errors.New("secret upstream detail")}, nil); err == nil {
		t.Fatal("provider failure was accepted")
	}
	failed, _, _ := repository.GetImageUpscaleJob(job.ID)
	if failed.Status != model.ImageUpscaleJobStatusFailed || failed.ErrorCode != "provider_failed" || failed.ErrorMessage != "云端图片超分处理失败，请稍后重试" {
		t.Fatalf("failed=%#v", failed)
	}

	originalStarter := imageUpscaleJobStarter
	started := ""
	imageUpscaleJobStarter = func(id string) { started = id }
	t.Cleanup(func() { imageUpscaleJobStarter = originalStarter })
	retried, err := RetryImageUpscaleJob(context.Background(), "user-a", job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if retried.Status != model.ImageUpscaleJobStatusQueued || retried.Progress != 5 || retried.Attempt != 2 || retried.ErrorMessage != "" || started != job.ID {
		t.Fatalf("retried=%#v started=%q", retried, started)
	}
}

func TestRecoverInterruptedImageUpscaleJobsMarksThemRetryable(t *testing.T) {
	setupImageUpscaleTest(t)
	job := model.ImageUpscaleJob{ID: "upscale-interrupted", UserID: "user-a", Status: model.ImageUpscaleJobStatusDownloading, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveImageUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	if err := RecoverInterruptedImageUpscaleJobs(); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetImageUpscaleJob(job.ID)
	if stored.Status != model.ImageUpscaleJobStatusFailed || stored.ErrorCode != "interrupted" {
		t.Fatalf("stored=%#v", stored)
	}
}

func TestImageUpscaleResultValidationRejectsPrivateURLsAndUnsupportedContent(t *testing.T) {
	setupImageUpscaleTest(t)
	if _, err := downloadImageUpscaleResult(context.Background(), "http://127.0.0.1/result.png"); err == nil || !strings.Contains(err.Error(), "private network") {
		t.Fatalf("private URL error=%v", err)
	}
	if _, err := persistImageUpscaleResult("upscale-invalid", []byte("not-an-image")); err == nil {
		t.Fatal("unsupported result content was accepted")
	}
}

func setupImageUpscaleTest(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	old := config.Cfg
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	config.Cfg.PublicAssetDir = filepath.Join(tmp, "public")
	config.Cfg.ImageUpscaleWorkDir = filepath.Join(tmp, "work")
	config.Cfg.ImageUpscaleProvider = "aliyun"
	config.Cfg.AlibabaCloudAccessKeyID = "test-key"
	config.Cfg.AlibabaCloudAccessKeySecret = "test-secret"
	if err := os.MkdirAll(config.Cfg.ImageUpscaleWorkDir, 0700); err != nil {
		t.Fatal(err)
	}
	repository.ResetForTest()
	t.Cleanup(func() {
		config.Cfg = old
		repository.ResetForTest()
	})
}

func testUpscalePNG(t *testing.T, width, height int) []byte {
	t.Helper()
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	canvas.Set(0, 0, color.RGBA{R: 255, A: 255})
	var output bytes.Buffer
	if err := png.Encode(&output, canvas); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}
