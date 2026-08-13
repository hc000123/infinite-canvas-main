package service

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/volcengine/volcengine-go-sdk/volcengine"
	"github.com/volcengine/volcengine-go-sdk/volcengine/credentials"
	"github.com/volcengine/volcengine-go-sdk/volcengine/session"
	"github.com/volcengine/volcengine-go-sdk/volcengine/universal"
)

type VideoUpscaleConnectionResult struct {
	Provider string `json:"provider"`
	Message  string `json:"message"`
}

type videoUpscaleSpaceReader interface {
	CheckSpace(context.Context, model.VolcengineAssetSetting, model.VideoUpscaleSetting) error
}

var activeVideoUpscaleSpaceReader videoUpscaleSpaceReader = realVideoUpscaleSpaceReader{}

type realVideoUpscaleSpaceReader struct{}

func AdminTestVideoUpscale(ctx context.Context, input model.VideoUpscaleSetting) (VideoUpscaleConnectionResult, error) {
	video := normalizeVideoUpscaleSetting(input)
	if video.SpaceName == "" {
		return VideoUpscaleConnectionResult{}, safeMessageError{message: "请先填写火山 VOD 空间名称"}
	}
	saved, err := repository.GetSettings()
	if err != nil {
		return VideoUpscaleConnectionResult{}, err
	}
	asset := normalizeSettings(saved).Private.VolcengineAsset
	if asset.AccessKey == "" || asset.SecretKey == "" {
		return VideoUpscaleConnectionResult{}, safeMessageError{message: "请先在火山素材审核配置共享 AK/SK"}
	}
	if err := activeVideoUpscaleSpaceReader.CheckSpace(ctx, asset, video); err != nil {
		return VideoUpscaleConnectionResult{}, safeMessageError{message: "视频超分连接测试失败，请检查共享 AK/SK、VOD 空间名称和点播权限"}
	}
	return VideoUpscaleConnectionResult{Provider: "volcengine", Message: "火山 VOD 空间访问成功，未上传视频或创建增强任务"}, nil
}

func (realVideoUpscaleSpaceReader) CheckSpace(ctx context.Context, asset model.VolcengineAssetSetting, video model.VideoUpscaleSetting) error {
	if ctx == nil {
		ctx = context.Background()
	}
	cfg := volcengine.NewConfig().
		WithCredentials(credentials.NewStaticCredentials(strings.TrimSpace(asset.AccessKey), strings.TrimSpace(asset.SecretKey), "")).
		WithRegion("cn-north-1").
		WithHTTPClient(&http.Client{Timeout: 15 * time.Second})
	sess, err := session.NewSession(cfg)
	if err != nil {
		return err
	}
	input := map[string]interface{}{"SpaceName": video.SpaceName, "Offset": "0", "PageSize": "1"}
	output, err := universal.New(sess).DoCall(universal.RequestUniversal{
		ServiceName: "vod", Action: "GetMediaList", Version: "2020-08-01", HttpMethod: universal.GET,
	}, &input)
	if err != nil {
		return err
	}
	if _, err := normalizeVolcengineResponse("GetMediaList", output); err != nil {
		return fmt.Errorf("volcengine VOD GetMediaList failed: %w", err)
	}
	return ctx.Err()
}
