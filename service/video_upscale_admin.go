package service

import (
	"context"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type VideoUpscaleConnectionResult struct {
	Provider string `json:"provider"`
	Message  string `json:"message"`
}

type videoUpscaleConnectionChecker interface {
	Check(context.Context, model.VideoUpscaleSetting) error
}

var activeVideoUpscaleSpaceReader videoUpscaleConnectionChecker = realVideoUpscaleConnectionChecker{}

type realVideoUpscaleConnectionChecker struct{}

func AdminTestVideoUpscale(ctx context.Context, input model.VideoUpscaleSetting) (VideoUpscaleConnectionResult, error) {
	saved, err := repository.GetSettings()
	if err != nil {
		return VideoUpscaleConnectionResult{}, err
	}
	settings := model.Settings{Private: model.PrivateSetting{VideoUpscale: input}}
	keepPrivateVideoUpscaleSecrets(&settings, normalizeSettings(saved))
	video := normalizeVideoUpscaleSetting(settings.Private.VideoUpscale)
	if video.APIKey == "" {
		return VideoUpscaleConnectionResult{}, safeMessageError{message: "请先填写 LAS API Key"}
	}
	if _, _, err := parseVideoUpscaleTOSPath(video.OutputTOSPath); err != nil {
		return VideoUpscaleConnectionResult{}, safeMessageError{message: "请填写北京地域的 TOS 输出目录，例如 tos://bucket/video-upscale/output/"}
	}
	if err := activeVideoUpscaleSpaceReader.Check(ctx, video); err != nil {
		return VideoUpscaleConnectionResult{}, safeMessageError{message: "LAS 连接测试失败，请检查 API Key、LAS 服务开通状态和北京地域"}
	}
	return VideoUpscaleConnectionResult{Provider: "volcengine-las", Message: "LAS API Key 验证成功，未上传视频，也未创建超分任务"}, nil
}

func (realVideoUpscaleConnectionChecker) Check(ctx context.Context, video model.VideoUpscaleSetting) error {
	// Polling a deliberately unknown task verifies bearer authentication without submitting billable work.
	result, err := newLASClient(video.APIKey).Poll(ctx, "connection-test-"+strings.ReplaceAll(newID("las"), "_", "-"))
	if err == nil && strings.EqualFold(result.Metadata.BusinessCode, "TaskId.Invalid") && strings.Contains(result.Metadata.ErrorMessage, "不存在") {
		return nil
	}
	if isLASAuthenticatedTaskNotFound(err) {
		return nil
	}
	return err
}
