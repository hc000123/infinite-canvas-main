package service

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type fakeVideoUpscaleProvider struct {
	uploads, starts, polls, interpolationStarts, interpolationPolls int
	vid, runID, interpolationRunID                                  string
	poll, interpolationPoll                                         VideoUpscalePollResult
	pollResults, interpolationPollResults                           []VideoUpscalePollResult
}

func (p *fakeVideoUpscaleProvider) Upload(context.Context, model.VideoUpscaleJob) (string, error) {
	p.uploads++
	return p.vid, nil
}
func (p *fakeVideoUpscaleProvider) Start(_ context.Context, job model.VideoUpscaleJob) (string, string, error) {
	p.starts++
	return p.runID, "request-1", nil
}
func (p *fakeVideoUpscaleProvider) Poll(context.Context, model.VideoUpscaleJob) (VideoUpscalePollResult, error) {
	p.polls++
	if len(p.pollResults) > 0 {
		result := p.pollResults[0]
		p.pollResults = p.pollResults[1:]
		return result, nil
	}
	return p.poll, nil
}
func (p *fakeVideoUpscaleProvider) StartUpscale(ctx context.Context, job model.VideoUpscaleJob) (string, string, error) {
	return p.Start(ctx, job)
}
func (p *fakeVideoUpscaleProvider) PollUpscale(ctx context.Context, job model.VideoUpscaleJob) (VideoUpscalePollResult, error) {
	return p.Poll(ctx, job)
}
func (p *fakeVideoUpscaleProvider) StartInterpolation(context.Context, model.VideoUpscaleJob) (string, string, error) {
	p.interpolationStarts++
	return p.interpolationRunID, "interpolation-request-1", nil
}
func (p *fakeVideoUpscaleProvider) PollInterpolation(context.Context, model.VideoUpscaleJob) (VideoUpscalePollResult, error) {
	p.interpolationPolls++
	if len(p.interpolationPollResults) > 0 {
		result := p.interpolationPollResults[0]
		p.interpolationPollResults = p.interpolationPollResults[1:]
		return result, nil
	}
	return p.interpolationPoll, nil
}

func TestVolcengineLASSubmitPayloadUsesDocumentedOperatorContract(t *testing.T) {
	payload := volcengineLASSubmitPayload(model.VideoUpscaleJob{InputTOSURL: "tos://bucket/input.mp4", OutputTOSPath: "tos://bucket/output/", OutputWidth: 1920, OutputHeight: 1080, ID: "job-1", PreserveAudio: false, OutputQualityMode: "master"})
	data := payload["data"].(map[string]interface{})
	if payload["operator_id"] != "las_video_super_resolution" || payload["operator_version"] != "v1" || data["video_url"] != "tos://bucket/input.mp4" || data["output_tos_path"] != "tos://bucket/output/" || data["target_width"] != 1920 || data["preserve_audio"] != false || data["output_quality_mode"] != "master" || data["output_basename"] != "job-1" {
		t.Fatalf("payload=%#v", payload)
	}
	if _, ok := data["target_height"]; ok {
		t.Fatalf("target_height must be omitted so LAS preserves aspect ratio: %#v", data)
	}
}

func TestNormalizeVideoUpscaleProviderStatusTreatsTimeoutAsFailed(t *testing.T) {
	if got := normalizeVideoUpscaleProviderStatus("TIMEOUT"); got != "failed" {
		t.Fatalf("got=%q", got)
	}
}

func TestVolcengineLASInterpolationSubmitPayloadUsesUpscaleTOSResult(t *testing.T) {
	payload := volcengineLASInterpolationSubmitPayload(model.VideoUpscaleJob{ID: "job-1", UpscaleResultTOSURL: "tos://bucket/upscaled.mp4", OutputTOSPath: "tos://bucket/output/", InterpolationTargetFrameRate: 60, InterpolationMode: "medium", PreserveAudio: true})
	data := payload["data"].(map[string]interface{})
	if payload["operator_id"] != "las_video_interpolation" || payload["operator_version"] != "v1" || data["video_url"] != "tos://bucket/upscaled.mp4" || data["output_tos_path"] != "tos://bucket/output/" || data["target_fps"] != 60.0 || data["mode"] != "medium" || data["preserve_audio"] != true || data["output_basename"] != "job-1-interpolation" {
		t.Fatalf("payload=%#v", payload)
	}
}

type captureLASRoundTripper struct{ body map[string]interface{} }

func (transport *captureLASRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	_ = json.NewDecoder(request.Body).Decode(&transport.body)
	return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(bytes.NewBufferString(`{"metadata":{"task_id":"task-1","task_status":"succeeded"},"data":{"output_video_url":"https://example.com/result.mp4","processed":false}}`))}, nil
}

func TestLASPollUsesOperatorAndParsesInterpolationResponse(t *testing.T) {
	transport := &captureLASRoundTripper{}
	client := &lasClient{apiKey: "key", client: &http.Client{Transport: transport}}
	result, err := client.Poll(context.Background(), "las_video_interpolation", "task-1")
	if err != nil || transport.body["operator_id"] != "las_video_interpolation" || transport.body["task_id"] != "task-1" || result.Data.OutputVideoURL != "https://example.com/result.mp4" || result.Data.Processed == nil || *result.Data.Processed {
		t.Fatalf("body=%#v result=%#v err=%v", transport.body, result, err)
	}
}

func TestProcessVideoUpscaleJobResumesDurableVidAndRunID(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	input := filepath.Join(t.TempDir(), "input.mp4")
	if err := os.WriteFile(input, []byte("source"), 0600); err != nil {
		t.Fatal(err)
	}
	job := model.VideoUpscaleJob{ID: "resume", UserID: "user-a", OutputTOSPath: "tos://bucket/output/", InputTOSURL: "tos://bucket/input.mp4", RunID: "run-existing", Status: model.VideoUpscaleJobStatusProcessing, InputPath: input, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{poll: VideoUpscalePollResult{Status: "succeeded", ResultURL: "https://example.com/result.mp4"}}
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, func(context.Context, string) ([]byte, string, error) { return []byte("result-video"), "video/mp4", nil }); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.uploads != 0 || provider.starts != 0 || provider.polls != 1 || stored.InputTOSURL != "tos://bucket/input.mp4" || stored.RunID != "run-existing" || stored.Status != model.VideoUpscaleJobStatusSucceeded {
		t.Fatalf("provider=%#v stored=%#v", provider, stored)
	}
}

func TestProcessVideoUpscaleJobPersistsCheckpoints(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	input := filepath.Join(t.TempDir(), "input.mp4")
	if err := os.WriteFile(input, []byte("source"), 0600); err != nil {
		t.Fatal(err)
	}
	job := model.VideoUpscaleJob{ID: "fresh", UserID: "user-a", OutputTOSPath: "tos://bucket/output/", Status: model.VideoUpscaleJobStatusQueued, InputPath: input, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{vid: "vid-new", runID: "run-new", poll: VideoUpscalePollResult{Status: "processing"}}
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, nil); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.uploads != 1 || provider.starts != 1 || stored.InputTOSURL != "vid-new" || stored.RunID != "run-new" || stored.Status != model.VideoUpscaleJobStatusProcessing {
		t.Fatalf("provider=%#v stored=%#v", provider, stored)
	}
}

func TestRunVideoUpscaleJobKeepsPollingTheSameRunUntilSuccess(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	job := model.VideoUpscaleJob{ID: "poll-loop", UserID: "user-a", OutputTOSPath: "tos://bucket/output/", InputTOSURL: "tos://bucket/input.mp4", RunID: "run-existing", Status: model.VideoUpscaleJobStatusProcessing, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{pollResults: []VideoUpscalePollResult{{Status: "processing"}, {Status: "succeeded", ResultURL: "https://example.com/result.mp4"}}}
	if err := runVideoUpscaleJob(context.Background(), job.ID, provider, func(context.Context, string) ([]byte, string, error) { return []byte("result-video"), "video/mp4", nil }, 0); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.uploads != 0 || provider.starts != 0 || provider.polls != 2 || stored.Status != model.VideoUpscaleJobStatusSucceeded {
		t.Fatalf("worker must reuse Vid/RunId and poll through completion: provider=%#v stored=%#v", provider, stored)
	}
}

func TestProcessVideoUpscaleJobChainsInterpolationWithoutDownloadingUpscaleResult(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	job := model.VideoUpscaleJob{ID: "interpolate", UserID: "user-a", OutputTOSPath: "tos://bucket/output/", InputTOSURL: "tos://bucket/input.mp4", RunID: "upscale-run", ProcessingStage: "upscale_processing", FrameInterpolationMode: "double", InterpolationMode: "fast", InterpolationTargetFrameRate: 48, Status: model.VideoUpscaleJobStatusProcessing, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{poll: VideoUpscalePollResult{Status: "succeeded", ResultURL: "tos://bucket/upscaled.mp4"}, interpolationRunID: "interpolation-run", interpolationPoll: VideoUpscalePollResult{Status: "succeeded", ResultURL: "https://example.com/interpolated.mp4", Processed: boolPointer(true)}}
	downloaded := ""
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, func(_ context.Context, raw string) ([]byte, string, error) {
		downloaded = raw
		return []byte("result-video"), "video/mp4", nil
	}); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.polls != 1 || provider.interpolationStarts != 1 || provider.interpolationPolls != 1 || stored.UpscaleResultTOSURL != "tos://bucket/upscaled.mp4" || stored.InterpolationRunID != "interpolation-run" || stored.InterpolationResultTOSURL != "https://example.com/interpolated.mp4" || downloaded != "https://example.com/interpolated.mp4" || stored.Status != model.VideoUpscaleJobStatusSucceeded {
		t.Fatalf("provider=%#v stored=%#v downloaded=%q", provider, stored, downloaded)
	}
}

func TestProcessVideoUpscaleJobResumesUpscaleSucceededWithoutPollingUpscale(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	job := model.VideoUpscaleJob{ID: "resume-upscale-succeeded", UserID: "user-a", InputTOSURL: "tos://bucket/input.mp4", RunID: "upscale-run", UpscaleResultTOSURL: "tos://bucket/upscaled.mp4", ProcessingStage: "upscale_succeeded", FrameInterpolationMode: "double", InterpolationMode: "fast", InterpolationTargetFrameRate: 48, Status: model.VideoUpscaleJobStatusProcessing, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{interpolationRunID: "interpolation-run", interpolationPoll: VideoUpscalePollResult{Status: "succeeded", ResultURL: "https://example.com/interpolated.mp4", Processed: boolPointer(true)}}
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, func(context.Context, string) ([]byte, string, error) { return []byte("result-video"), "video/mp4", nil }); err != nil {
		t.Fatal(err)
	}
	if provider.starts != 0 || provider.polls != 0 || provider.interpolationStarts != 1 || provider.interpolationPolls != 1 {
		t.Fatalf("provider=%#v", provider)
	}
}

func TestProcessVideoUpscaleJobReusesInterpolationRunID(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	job := model.VideoUpscaleJob{ID: "resume-interpolation", UserID: "user-a", OutputTOSPath: "tos://bucket/output/", InputTOSURL: "tos://bucket/input.mp4", RunID: "upscale-run", UpscaleResultTOSURL: "tos://bucket/upscaled.mp4", InterpolationRunID: "interpolation-existing", ProcessingStage: "interpolation_processing", FrameInterpolationMode: "double", InterpolationMode: "fast", Status: model.VideoUpscaleJobStatusProcessing, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{interpolationPoll: VideoUpscalePollResult{Status: "succeeded", ResultURL: "https://example.com/result.mp4", Processed: boolPointer(true)}}
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, func(context.Context, string) ([]byte, string, error) { return []byte("result-video"), "video/mp4", nil }); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.starts != 0 || provider.polls != 0 || provider.interpolationStarts != 0 || provider.interpolationPolls != 1 || stored.Status != model.VideoUpscaleJobStatusSucceeded {
		t.Fatalf("provider=%#v stored=%#v", provider, stored)
	}
}

func TestProcessVideoUpscaleJobReusesCompletedInterpolationResult(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	job := model.VideoUpscaleJob{ID: "resume-download", UserID: "user-a", InputTOSURL: "tos://bucket/input.mp4", RunID: "upscale-run", UpscaleResultTOSURL: "tos://bucket/upscaled.mp4", InterpolationRunID: "interpolation-run", InterpolationResultTOSURL: "https://example.com/interpolated.mp4", ProcessingStage: "downloading", FrameInterpolationMode: "double", Status: model.VideoUpscaleJobStatusDownloading, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{}
	downloaded := ""
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, func(_ context.Context, raw string) ([]byte, string, error) {
		downloaded = raw
		return []byte("result-video"), "video/mp4", nil
	}); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.starts != 0 || provider.polls != 0 || provider.interpolationStarts != 0 || provider.interpolationPolls != 0 || downloaded != job.InterpolationResultTOSURL || stored.Status != model.VideoUpscaleJobStatusSucceeded {
		t.Fatalf("provider=%#v stored=%#v downloaded=%q", provider, stored, downloaded)
	}
}

func TestProcessVideoUpscaleJobResumesDownloadingResultSourceWithoutLASCalls(t *testing.T) {
	setupVideoUpscaleTest(t)
	config.Cfg.PublicAssetDir = filepath.Join(t.TempDir(), "public")
	job := model.VideoUpscaleJob{ID: "resume-result-source", UserID: "user-a", ProcessingStage: "downloading", ResultSourceURL: "https://example.com/final.mp4", Status: model.VideoUpscaleJobStatusDownloading, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{}
	downloaded := ""
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, func(_ context.Context, raw string) ([]byte, string, error) {
		downloaded = raw
		return []byte("result-video"), "video/mp4", nil
	}); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if provider.uploads != 0 || provider.starts != 0 || provider.polls != 0 || provider.interpolationStarts != 0 || provider.interpolationPolls != 0 || downloaded != job.ResultSourceURL || stored.Status != model.VideoUpscaleJobStatusSucceeded {
		t.Fatalf("provider=%#v stored=%#v downloaded=%q", provider, stored, downloaded)
	}
}

func TestProcessVideoUpscaleJobRejectsInterpolationProcessedFalse(t *testing.T) {
	setupVideoUpscaleTest(t)
	job := model.VideoUpscaleJob{ID: "not-processed", UserID: "user-a", InputTOSURL: "tos://bucket/input.mp4", RunID: "upscale-run", UpscaleResultTOSURL: "tos://bucket/upscaled.mp4", InterpolationRunID: "interpolation-run", ProcessingStage: "interpolation_processing", FrameInterpolationMode: "double", Status: model.VideoUpscaleJobStatusProcessing, CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	provider := &fakeVideoUpscaleProvider{interpolationPoll: VideoUpscalePollResult{Status: "succeeded", ResultURL: "https://example.com/result.mp4", Processed: boolPointer(false)}}
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, nil); err == nil {
		t.Fatal("expected processed=false failure")
	}
	stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
	if stored.Status != model.VideoUpscaleJobStatusFailed || stored.ErrorCode != "interpolation_not_processed" {
		t.Fatalf("stored=%#v", stored)
	}
}

func TestProcessVideoUpscaleJobDoesNotResubmitUncertainSubmission(t *testing.T) {
	for _, item := range []struct{ id, stage string }{{"upscale-uncertain", "upscale_submitting"}, {"interpolation-uncertain", "interpolation_submitting"}} {
		t.Run(item.stage, func(t *testing.T) {
			setupVideoUpscaleTest(t)
			job := model.VideoUpscaleJob{ID: item.id, UserID: "user-a", InputTOSURL: "tos://bucket/input.mp4", UpscaleResultTOSURL: "tos://bucket/upscaled.mp4", ProcessingStage: item.stage, FrameInterpolationMode: "double", Status: model.VideoUpscaleJobStatusProcessing, CreatedAt: now(), UpdatedAt: now()}
			if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
				t.Fatal(err)
			}
			provider := &fakeVideoUpscaleProvider{runID: "must-not-submit", interpolationRunID: "must-not-submit"}
			if err := processVideoUpscaleJob(context.Background(), job.ID, provider, nil); err == nil {
				t.Fatal("expected uncertain submission failure")
			}
			stored, _, _ := repository.GetVideoUpscaleJob(job.ID)
			if provider.starts != 0 || provider.interpolationStarts != 0 || stored.ErrorCode != "submission_uncertain" {
				t.Fatalf("provider=%#v stored=%#v", provider, stored)
			}
		})
	}
}

func boolPointer(value bool) *bool { return &value }
