package service

import (
	"context"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type recordingVideoUpscaleSpaceReader struct {
	asset model.VolcengineAssetSetting
	video model.VideoUpscaleSetting
	calls int
	err   error
}

func (reader *recordingVideoUpscaleSpaceReader) CheckSpace(_ context.Context, asset model.VolcengineAssetSetting, video model.VideoUpscaleSetting) error {
	reader.asset, reader.video, reader.calls = asset, video, reader.calls+1
	return reader.err
}

func TestAdminTestVideoUpscaleReusesSavedVolcengineCredentials(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{VolcengineAsset: model.VolcengineAssetSetting{
		AccessKey: "shared-ak", SecretKey: "shared-sk", Region: "cn-beijing",
	}}}, now())
	if err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	reader := &recordingVideoUpscaleSpaceReader{}
	previous := activeVideoUpscaleSpaceReader
	activeVideoUpscaleSpaceReader = reader
	t.Cleanup(func() { activeVideoUpscaleSpaceReader = previous })

	result, err := AdminTestVideoUpscale(context.Background(), model.VideoUpscaleSetting{SpaceName: " vod-space "})
	if err != nil {
		t.Fatalf("AdminTestVideoUpscale returned error: %v", err)
	}
	if reader.calls != 1 || reader.asset.AccessKey != "shared-ak" || reader.asset.SecretKey != "shared-sk" || reader.video.SpaceName != "vod-space" {
		t.Fatalf("space reader call = %#v", reader)
	}
	if result.Provider != "volcengine" || !strings.Contains(result.Message, "未上传视频") {
		t.Fatalf("result = %#v", result)
	}
}

func TestAdminTestVideoUpscaleRequiresSpaceAndSharedCredentials(t *testing.T) {
	setupAITaskTestDB(t)
	reader := &recordingVideoUpscaleSpaceReader{}
	previous := activeVideoUpscaleSpaceReader
	activeVideoUpscaleSpaceReader = reader
	t.Cleanup(func() { activeVideoUpscaleSpaceReader = previous })

	for _, input := range []model.VideoUpscaleSetting{{SpaceName: ""}, {SpaceName: "vod-space"}} {
		_, err := AdminTestVideoUpscale(context.Background(), input)
		if err == nil {
			t.Fatalf("AdminTestVideoUpscale(%#v) returned nil error", input)
		}
	}
	if reader.calls != 0 {
		t.Fatalf("space reader called %d times for invalid settings", reader.calls)
	}
}
