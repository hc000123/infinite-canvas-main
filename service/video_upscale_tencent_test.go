package service

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	mps "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/mps/v20190612"
)

type fakeTencentMPSAPI struct {
	submit        tencentMPSSubmitInput
	poll          tencentMPSPollInput
	submitTaskID  string
	submitRequest string
	submitErr     error
	pollResult    VideoUpscalePollResult
	pollErr       error
	submitCount   int
	pollCount     int
}

func (fake *fakeTencentMPSAPI) Submit(_ context.Context, input tencentMPSSubmitInput) (string, string, error) {
	fake.submit, fake.submitCount = input, fake.submitCount+1
	return firstNonEmpty(fake.submitTaskID, "task-1"), firstNonEmpty(fake.submitRequest, "request-1"), fake.submitErr
}

func (fake *fakeTencentMPSAPI) Poll(_ context.Context, input tencentMPSPollInput) (VideoUpscalePollResult, error) {
	fake.poll, fake.pollCount = input, fake.pollCount+1
	return fake.pollResult, fake.pollErr
}

type fakeTencentCOSAPI struct {
	uploadKey string
	uploaded  string
	signedKey string
	signedURL string
	err       error
}

func (fake *fakeTencentCOSAPI) Upload(_ context.Context, key string, reader io.Reader) error {
	fake.uploadKey = key
	data, _ := io.ReadAll(reader)
	fake.uploaded = string(data)
	return fake.err
}

func (fake *fakeTencentCOSAPI) SignedGetURL(_ context.Context, key string, _ time.Duration) (string, error) {
	fake.signedKey = key
	return firstNonEmpty(fake.signedURL, "https://signed.example/result.mp4"), fake.err
}

func (fake *fakeTencentCOSAPI) HeadBucket(context.Context) error { return fake.err }

func TestTencentMPSUploadUsesFrozenCOSPrefix(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.mp4")
	if err := os.WriteFile(input, []byte("video"), 0600); err != nil {
		t.Fatal(err)
	}
	cloud := &fakeTencentCOSAPI{}
	provider := &tencentMPSVideoUpscaleProvider{cos: cloud}
	uri, err := provider.Upload(context.Background(), model.VideoUpscaleJob{ID: "job-1", InputPath: input, CloudBucket: "media-1300", CloudInputPrefix: "video-upscale/input/"})
	if err != nil || uri != "cos://media-1300/video-upscale/input/job-1.mp4" || cloud.uploadKey != "video-upscale/input/job-1.mp4" || cloud.uploaded != "video" {
		t.Fatalf("uri=%q key=%q body=%q err=%v", uri, cloud.uploadKey, cloud.uploaded, err)
	}
}

func TestTencentMPSStartUsesFrozenTemplateAndCOSStorage(t *testing.T) {
	api := &fakeTencentMPSAPI{}
	provider := &tencentMPSVideoUpscaleProvider{mps: api, cos: &fakeTencentCOSAPI{}}
	job := model.VideoUpscaleJob{ID: "job-1", TencentTemplateID: 327004, InputTOSURL: "cos://media-1300/video-upscale/input/job-1.mp4", CloudBucket: "media-1300", CloudRegion: "ap-beijing", CloudOutputPrefix: "video-upscale/output/", TencentOutputObject: "job-1-enhanced.{format}"}
	runID, requestID, err := provider.StartUpscale(context.Background(), job)
	if err != nil || runID != "task-1" || requestID != "request-1" {
		t.Fatal(runID, requestID, err)
	}
	if api.submit.Definition != 327004 || api.submit.Bucket != "media-1300" || api.submit.Region != "ap-beijing" || api.submit.InputObject != "video-upscale/input/job-1.mp4" || api.submit.OutputDir != "/video-upscale/output/" || api.submit.OutputObject != "job-1-enhanced.{format}" || api.submit.SessionID != "job-1" {
		t.Fatalf("submit=%#v", api.submit)
	}
}

func TestTencentMPSPollAndResultDownloadURL(t *testing.T) {
	api := &fakeTencentMPSAPI{pollResult: VideoUpscalePollResult{Status: "SUCCESS", ResultURL: "cos://media-1300/video-upscale/output/job-1.mp4", RequestID: "request-2"}}
	cloud := &fakeTencentCOSAPI{signedURL: "https://signed.example/job-1.mp4"}
	provider := &tencentMPSVideoUpscaleProvider{mps: api, cos: cloud}
	job := model.VideoUpscaleJob{RunID: "task-1", TencentTemplateID: 327004, CloudBucket: "media-1300"}
	result, err := provider.PollUpscale(context.Background(), job)
	if err != nil || result.Status != "SUCCESS" || result.ResultURL == "" || api.poll.TaskID != "task-1" || api.poll.Definition != 327004 || api.poll.Bucket != "media-1300" {
		t.Fatalf("result=%#v poll=%#v err=%v", result, api.poll, err)
	}
	url, err := provider.ResultDownloadURL(result.ResultURL)
	if err != nil || url != cloud.signedURL || cloud.signedKey != "video-upscale/output/job-1.mp4" {
		t.Fatalf("url=%q key=%q err=%v", url, cloud.signedKey, err)
	}
	if _, err := provider.ResultDownloadURL("https://example.com/not-cos.mp4"); err == nil || !strings.Contains(err.Error(), "COS") {
		t.Fatalf("invalid result error=%v", err)
	}
}

func TestTencentMPSProcessRequestUsesDocumentedCOSContract(t *testing.T) {
	request := tencentMPSProcessRequest(tencentMPSSubmitInput{Bucket: "media-1300", Region: "ap-beijing", InputObject: "video-upscale/input/job-1.mp4", OutputDir: "/video-upscale/output/", OutputObject: "job-1-enhanced.{format}", Definition: 327004, SessionID: "job-1"})
	transcodes := request.MediaProcessTask.TranscodeTaskSet
	if pointerString(request.InputInfo.Type) != "COS" || pointerString(request.InputInfo.CosInputInfo.Bucket) != "media-1300" || pointerString(request.InputInfo.CosInputInfo.Object) != "/video-upscale/input/job-1.mp4" || pointerString(request.OutputDir) != "/video-upscale/output/" || len(transcodes) != 1 || int64(*transcodes[0].Definition) != 327004 || pointerString(transcodes[0].OutputObjectPath) != "job-1-enhanced.{format}" || pointerString(request.SessionId) != "job-1" {
		t.Fatalf("request=%s", request.ToJsonString())
	}
}

func TestTencentMPSPollResponseMapsMatchingTemplateResult(t *testing.T) {
	status, success, path, requestID := "FINISH", "SUCCESS", "/video-upscale/output/job-1.mp4", "request-2"
	definition := uint64(327004)
	response := &mps.DescribeTaskDetailResponse{Response: &mps.DescribeTaskDetailResponseParams{
		Status: &status, RequestId: &requestID, WorkflowTask: &mps.WorkflowTask{MediaProcessResultSet: []*mps.MediaProcessTaskResult{{TranscodeTask: &mps.MediaProcessTaskTranscodeResult{Status: &success, Input: &mps.TranscodeTaskInput{Definition: &definition}, Output: &mps.MediaTranscodeItem{Path: &path}}}}},
	}}
	result, err := tencentMPSPollResponse(response, tencentMPSPollInput{TaskID: "task-1", Definition: 327004, Bucket: "media-1300"})
	if err != nil || result.Status != "SUCCESS" || result.ResultURL != "cos://media-1300/video-upscale/output/job-1.mp4" || result.RequestID != requestID {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}

func TestCurrentVideoUpscaleProviderSelectsTencentFromFrozenJob(t *testing.T) {
	setupVideoUpscaleTest(t)
	settings, err := repository.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.Private.TencentMPSVideo = model.TencentMPSVideoSetting{Enabled: true, SecretID: "id", SecretKey: "key", COSBucket: "current-bucket", COSRegion: "ap-beijing"}
	if _, err = repository.SaveSettings(settings, now()); err != nil {
		t.Fatal(err)
	}
	provider, err := currentVideoUpscaleProvider(model.VideoUpscaleJob{Provider: "tencent-mps", CloudBucket: "frozen-bucket", CloudRegion: "ap-shanghai"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := provider.(*tencentMPSVideoUpscaleProvider); !ok {
		t.Fatalf("provider=%T", provider)
	}
}

func TestTencentMPSRecoveryPollsExistingTaskWithoutSubmit(t *testing.T) {
	setupVideoUpscaleTest(t)
	job := model.VideoUpscaleJob{ID: "recover-tencent", UserID: "user-a", Provider: "tencent-mps", RunID: "task-1", ProcessingStage: "upscale_processing", InputTOSURL: "cos://media-1300/input.mp4", Status: model.VideoUpscaleJobStatusProcessing, FrameInterpolationMode: "keep", TencentTemplateID: 327004, CloudBucket: "media-1300", CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	api := &fakeTencentMPSAPI{pollResult: VideoUpscalePollResult{Status: "PROCESSING"}}
	provider := &tencentMPSVideoUpscaleProvider{mps: api, cos: &fakeTencentCOSAPI{}}
	if err := processVideoUpscaleJob(context.Background(), job.ID, provider, nil); err != nil {
		t.Fatal(err)
	}
	if api.submitCount != 0 || api.pollCount != 1 {
		t.Fatalf("submit=%d poll=%d", api.submitCount, api.pollCount)
	}
}

func TestTencentMPSWorkerSignsCOSResultBeforeDownload(t *testing.T) {
	setupVideoUpscaleTest(t)
	job := model.VideoUpscaleJob{ID: "download-tencent", UserID: "user-a", Provider: "tencent-mps", RunID: "task-1", ProcessingStage: "upscale_processing", InputTOSURL: "cos://media-1300/input.mp4", Status: model.VideoUpscaleJobStatusProcessing, FrameInterpolationMode: "keep", TencentTemplateID: 327004, CloudBucket: "media-1300", CreatedAt: now(), UpdatedAt: now()}
	if _, err := repository.SaveVideoUpscaleJob(job); err != nil {
		t.Fatal(err)
	}
	api := &fakeTencentMPSAPI{pollResult: VideoUpscalePollResult{Status: "SUCCESS", ResultURL: "cos://media-1300/video-upscale/output/result.mp4"}}
	cloud := &fakeTencentCOSAPI{signedURL: "https://signed.example/result.mp4"}
	downloadedURL := ""
	downloader := func(_ context.Context, raw string) ([]byte, string, error) {
		downloadedURL = raw
		return []byte("video"), "video/mp4", nil
	}
	if err := processVideoUpscaleJob(context.Background(), job.ID, &tencentMPSVideoUpscaleProvider{mps: api, cos: cloud}, downloader); err != nil {
		t.Fatal(err)
	}
	if downloadedURL != cloud.signedURL || cloud.signedKey != "video-upscale/output/result.mp4" {
		t.Fatalf("downloaded=%q signedKey=%q", downloadedURL, cloud.signedKey)
	}
}

func TestTencentMPSConnectionCheckOnlyUsesReadOperations(t *testing.T) {
	mpsAPI := &fakeTencentMPSAPI{pollErr: tencentTaskNotFoundError{}}
	cosAPI := &fakeTencentCOSAPI{}
	if err := checkTencentMPSConnection(context.Background(), mpsAPI, cosAPI, "media-1300"); err != nil {
		t.Fatal(err)
	}
	if mpsAPI.submitCount != 0 || mpsAPI.pollCount != 1 {
		t.Fatalf("submit=%d poll=%d", mpsAPI.submitCount, mpsAPI.pollCount)
	}
}

type tencentTaskNotFoundError struct{}

func (tencentTaskNotFoundError) Error() string { return "task not found" }

func (tencentTaskNotFoundError) TencentTaskNotFound() bool { return true }
