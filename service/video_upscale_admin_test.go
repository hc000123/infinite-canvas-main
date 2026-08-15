package service

import (
	"context"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type recordingVideoUpscaleSpaceReader struct {
	video model.VideoUpscaleSetting
	calls int
	err   error
}

type recordingTencentMPSConnectionChecker struct {
	setting model.TencentMPSVideoSetting
	calls   int
	err     error
}

type recordingTencentMPSTemplateFetcher struct {
	setting model.TencentMPSVideoSetting
	items   []model.TencentMPSTemplateSetting
	calls   int
	err     error
}

func (fetcher *recordingTencentMPSTemplateFetcher) Fetch(_ context.Context, setting model.TencentMPSVideoSetting) ([]model.TencentMPSTemplateSetting, error) {
	fetcher.setting, fetcher.calls = setting, fetcher.calls+1
	return fetcher.items, fetcher.err
}

func (checker *recordingTencentMPSConnectionChecker) Check(_ context.Context, setting model.TencentMPSVideoSetting) error {
	checker.setting, checker.calls = setting, checker.calls+1
	return checker.err
}

func (reader *recordingVideoUpscaleSpaceReader) Check(_ context.Context, video model.VideoUpscaleSetting) error {
	reader.video, reader.calls = video, reader.calls+1
	return reader.err
}

func TestAdminTestVideoUpscaleRestoresSavedLASAPIKey(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{VideoUpscale: model.VideoUpscaleSetting{
		APIKey: "saved-las-key", OutputTOSPath: "tos://bucket/output/",
	}}}, now())
	if err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	reader := &recordingVideoUpscaleSpaceReader{}
	previous := activeVideoUpscaleSpaceReader
	activeVideoUpscaleSpaceReader = reader
	t.Cleanup(func() { activeVideoUpscaleSpaceReader = previous })

	result, err := AdminTestVideoUpscale(context.Background(), model.VideoUpscaleSetting{APIKey: maskedAPIKey, OutputTOSPath: " tos://bucket/new-output/ "})
	if err != nil {
		t.Fatalf("AdminTestVideoUpscale returned error: %v", err)
	}
	if reader.calls != 1 || reader.video.APIKey != "saved-las-key" || reader.video.OutputTOSPath != "tos://bucket/new-output/" {
		t.Fatalf("space reader call = %#v", reader)
	}
	if result.Provider != "volcengine-las" || !strings.Contains(result.Message, "未创建超分任务") {
		t.Fatalf("result = %#v", result)
	}
}

func TestAdminTestVideoUpscaleRequiresLASKeyAndOutputTOSPath(t *testing.T) {
	setupAITaskTestDB(t)
	reader := &recordingVideoUpscaleSpaceReader{}
	previous := activeVideoUpscaleSpaceReader
	activeVideoUpscaleSpaceReader = reader
	t.Cleanup(func() { activeVideoUpscaleSpaceReader = previous })

	for _, input := range []model.VideoUpscaleSetting{{}, {APIKey: "las-key"}, {OutputTOSPath: "tos://bucket/output/"}} {
		_, err := AdminTestVideoUpscale(context.Background(), input)
		if err == nil {
			t.Fatalf("AdminTestVideoUpscale(%#v) returned nil error", input)
		}
	}
	if reader.calls != 0 {
		t.Fatalf("space reader called %d times for invalid settings", reader.calls)
	}
}

func TestAdminTestTencentMPSVideoRestoresSecretsWithoutPaidSubmit(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{TencentMPSVideo: model.TencentMPSVideoSetting{
		SecretID: "saved-id", SecretKey: "saved-key", COSBucket: "media-1300000000", COSRegion: "ap-beijing",
	}}}, now())
	if err != nil {
		t.Fatal(err)
	}
	checker := &recordingTencentMPSConnectionChecker{}
	previous := activeTencentMPSConnectionChecker
	activeTencentMPSConnectionChecker = checker
	t.Cleanup(func() { activeTencentMPSConnectionChecker = previous })
	result, err := AdminTestTencentMPSVideo(context.Background(), model.TencentMPSVideoSetting{
		SecretID: maskedAPIKey, SecretKey: maskedAPIKey, COSBucket: " media-1300000000 ", COSRegion: " ap-shanghai ", InputPrefix: " custom/input ", OutputPrefix: " custom/output ",
	})
	if err != nil {
		t.Fatal(err)
	}
	if checker.calls != 1 || checker.setting.SecretID != "saved-id" || checker.setting.SecretKey != "saved-key" || checker.setting.COSRegion != "ap-shanghai" || checker.setting.InputPrefix != "custom/input/" || checker.setting.OutputPrefix != "custom/output/" {
		t.Fatalf("checker=%#v", checker)
	}
	if result.Provider != "tencent-mps" || !strings.Contains(result.Message, "未创建") {
		t.Fatalf("result=%#v", result)
	}
}

func TestAdminSyncTencentMPSTemplatesRestoresSecretsWithoutPaidSubmit(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{TencentMPSVideo: model.TencentMPSVideoSetting{
		Enabled: true, SecretID: "saved-id", SecretKey: "saved-key", COSBucket: "media-1300000000", COSRegion: "ap-beijing",
	}}}, now())
	if err != nil {
		t.Fatal(err)
	}
	fetcher := &recordingTencentMPSTemplateFetcher{items: []model.TencentMPSTemplateSetting{{Definition: 400001, DisplayName: "清晰化", Target: "1080p", Supported: true}}}
	previous := activeTencentMPSTemplateFetcher
	activeTencentMPSTemplateFetcher = fetcher
	t.Cleanup(func() { activeTencentMPSTemplateFetcher = previous })
	result, err := AdminSyncTencentMPSTemplates(context.Background(), model.TencentMPSVideoSetting{
		Enabled: true, SecretID: maskedAPIKey, SecretKey: maskedAPIKey, COSBucket: "media-1300000000", COSRegion: "ap-guangzhou",
	})
	if err != nil || fetcher.calls != 1 || fetcher.setting.SecretID != "saved-id" || fetcher.setting.SecretKey != "saved-key" || len(result) != 1 {
		t.Fatalf("result=%#v fetcher=%#v err=%v", result, fetcher, err)
	}
	if result[0].Enabled {
		t.Fatalf("newly synchronized template should be disabled: %#v", result[0])
	}
}
