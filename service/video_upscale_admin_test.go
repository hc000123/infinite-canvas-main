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
