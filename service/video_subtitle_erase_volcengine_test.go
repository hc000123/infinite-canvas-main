package service

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type fakeVideoSubtitleEraseProvider struct {
	uploads, signs, starts, polls int
	tosURL, signedURL, runID      string
	pollResults                   []VideoSubtitleErasePollResult
}

func (provider *fakeVideoSubtitleEraseProvider) Upload(context.Context, model.VideoSubtitleEraseJob) (string, error) {
	provider.uploads++
	return provider.tosURL, nil
}

func (provider *fakeVideoSubtitleEraseProvider) SignedInputURL(context.Context, string) (string, error) {
	provider.signs++
	return provider.signedURL, nil
}

func (provider *fakeVideoSubtitleEraseProvider) Start(_ context.Context, _ model.VideoSubtitleEraseJob, inputURL string) (string, string, error) {
	provider.starts++
	if inputURL != provider.signedURL {
		return "", "", safeMessageError{message: "unexpected signed input"}
	}
	return provider.runID, "request-1", nil
}

func (provider *fakeVideoSubtitleEraseProvider) Poll(context.Context, model.VideoSubtitleEraseJob) (VideoSubtitleErasePollResult, error) {
	provider.polls++
	result := provider.pollResults[0]
	provider.pollResults = provider.pollResults[1:]
	return result, nil
}

func TestVolcengineLASSubtitleEraseSubmitPayloadUsesStableClientToken(t *testing.T) {
	payload := volcengineLASSubtitleEraseSubmitPayload(model.VideoSubtitleEraseJob{ID: "erase-1", ClientToken: "erase-1"}, "https://signed.example/input.mp4")
	data := payload["data"].(map[string]interface{})
	if payload["operator_id"] != "las_subtitle_erase" || payload["operator_version"] != "v1" || data["video_url"] != "https://signed.example/input.mp4" || data["client_token"] != "erase-1" {
		t.Fatalf("payload=%#v", payload)
	}
}

func TestRunVideoSubtitleEraseJobUsesSignedHTTPSAndPollsSameTask(t *testing.T) {
	setupVideoSubtitleEraseTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	job := model.VideoSubtitleEraseJob{ID: "erase-worker", UserID: "user-a", ClientToken: "erase-worker", Status: model.VideoSubtitleEraseJobStatusQueued, InputPath: filepath.Join(t.TempDir(), "input.mp4"), InputMIMEType: "video/mp4", CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoSubtitleEraseJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoSubtitleEraseProvider{
		tosURL: "tos://bucket/video-subtitle-erase/input/erase-worker.mp4", signedURL: "https://signed.example/input.mp4?secret=hidden", runID: "task-1",
		pollResults: []VideoSubtitleErasePollResult{{Status: "RUNNING"}, {Status: "COMPLETED", ResultURL: "https://example.com/output.mp4", DurationSeconds: 12.34}},
	}
	downloader := func(context.Context, string) ([]byte, string, error) { return []byte("result-video"), "video/mp4", nil }
	if err := runVideoSubtitleEraseJob(context.Background(), job.ID, provider, downloader, 0); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoSubtitleEraseJob(job.ID)
	if provider.uploads != 1 || provider.signs != 1 || provider.starts != 1 || provider.polls != 2 || stored.InputTOSURL != provider.tosURL || stored.RunID != "task-1" || stored.ProviderRequestID != "request-1" || stored.OutputDurationSeconds != 12.34 || stored.Status != model.VideoSubtitleEraseJobStatusSucceeded {
		t.Fatalf("provider=%#v stored=%#v", provider, stored)
	}
}

func TestProcessVideoSubtitleEraseJobResumesExistingTaskWithoutResubmit(t *testing.T) {
	setupVideoSubtitleEraseTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	job := model.VideoSubtitleEraseJob{ID: "erase-resume-task", UserID: "user-a", ClientToken: "erase-resume-task", InputTOSURL: "tos://bucket/input.mp4", RunID: "task-existing", Status: model.VideoSubtitleEraseJobStatusProcessing, ProcessingStage: "subtitle_processing", CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoSubtitleEraseJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoSubtitleEraseProvider{pollResults: []VideoSubtitleErasePollResult{{Status: "COMPLETED", ResultURL: "https://example.com/output.mp4"}}}
	if err := processVideoSubtitleEraseJob(context.Background(), job.ID, provider, func(context.Context, string) ([]byte, string, error) { return []byte("result-video"), "video/mp4", nil }); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoSubtitleEraseJob(job.ID)
	if provider.uploads != 0 || provider.signs != 0 || provider.starts != 0 || provider.polls != 1 || stored.RunID != "task-existing" || stored.Status != model.VideoSubtitleEraseJobStatusSucceeded {
		t.Fatalf("provider=%#v stored=%#v", provider, stored)
	}
}

func TestProcessVideoSubtitleEraseJobCanSafelyResubmitWithSameToken(t *testing.T) {
	setupVideoSubtitleEraseTest(t)
	job := model.VideoSubtitleEraseJob{ID: "erase-resubmit", UserID: "user-a", ClientToken: "erase-resubmit", InputTOSURL: "tos://bucket/input.mp4", Status: model.VideoSubtitleEraseJobStatusProcessing, ProcessingStage: "subtitle_submitting", CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoSubtitleEraseJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoSubtitleEraseProvider{signedURL: "https://signed.example/input.mp4", runID: "task-same", pollResults: []VideoSubtitleErasePollResult{{Status: "RUNNING"}}}
	if err := processVideoSubtitleEraseJob(context.Background(), job.ID, provider, nil); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoSubtitleEraseJob(job.ID)
	if provider.starts != 1 || stored.ClientToken != job.ClientToken || stored.RunID != "task-same" {
		t.Fatalf("provider=%#v stored=%#v", provider, stored)
	}
}
