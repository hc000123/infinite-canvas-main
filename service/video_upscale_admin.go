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

type tencentMPSConnectionChecker interface {
	Check(context.Context, model.TencentMPSVideoSetting) error
}

type tencentMPSTemplateFetcher interface {
	Fetch(context.Context, model.TencentMPSVideoSetting) ([]model.TencentMPSTemplateSetting, error)
}

var activeVideoUpscaleSpaceReader videoUpscaleConnectionChecker = realVideoUpscaleConnectionChecker{}
var activeTencentMPSConnectionChecker tencentMPSConnectionChecker = realTencentMPSConnectionChecker{}
var activeTencentMPSTemplateFetcher tencentMPSTemplateFetcher = realTencentMPSTemplateFetcher{}

type realVideoUpscaleConnectionChecker struct{}
type realTencentMPSConnectionChecker struct{}
type realTencentMPSTemplateFetcher struct{}

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

func AdminTestTencentMPSVideo(ctx context.Context, input model.TencentMPSVideoSetting) (VideoUpscaleConnectionResult, error) {
	saved, err := repository.GetSettings()
	if err != nil {
		return VideoUpscaleConnectionResult{}, err
	}
	settings := model.Settings{Private: model.PrivateSetting{TencentMPSVideo: input}}
	keepPrivateTencentMPSVideoSecrets(&settings, normalizeSettings(saved))
	setting := normalizeTencentMPSVideoSetting(settings.Private.TencentMPSVideo)
	if setting.SecretID == "" || setting.SecretKey == "" {
		return VideoUpscaleConnectionResult{}, safeMessageError{message: "请先填写腾讯云 SecretId 和 SecretKey"}
	}
	if setting.COSBucket == "" || strings.ContainsAny(setting.COSBucket, "/:") || !strings.HasPrefix(setting.COSRegion, "ap-") {
		return VideoUpscaleConnectionResult{}, safeMessageError{message: "请填写有效的腾讯 COS Bucket 和地域，例如 media-1300000000 / ap-beijing"}
	}
	if err := activeTencentMPSConnectionChecker.Check(ctx, setting); err != nil {
		return VideoUpscaleConnectionResult{}, safeMessageError{message: "腾讯 MPS 连接测试失败，请检查密钥、MPS 开通授权、COS Bucket 和地域"}
	}
	return VideoUpscaleConnectionResult{Provider: "tencent-mps", Message: "腾讯 MPS 与 COS 配置验证成功，未上传视频，也未创建增强任务"}, nil
}

func (realTencentMPSConnectionChecker) Check(ctx context.Context, setting model.TencentMPSVideoSetting) error {
	mpsAPI, err := newTencentCloudMPSAPI(setting)
	if err != nil {
		return err
	}
	cosAPI, err := newTencentCloudCOSAPI(setting)
	if err != nil {
		return err
	}
	return checkTencentMPSConnection(ctx, mpsAPI, cosAPI, setting.COSBucket)
}

func AdminSyncTencentMPSTemplates(ctx context.Context, input model.TencentMPSVideoSetting) ([]model.TencentMPSTemplateSetting, error) {
	saved, err := repository.GetSettings()
	if err != nil {
		return nil, err
	}
	settings := model.Settings{Private: model.PrivateSetting{TencentMPSVideo: input}}
	keepPrivateTencentMPSVideoSecrets(&settings, normalizeSettings(saved))
	setting := normalizeTencentMPSVideoSetting(settings.Private.TencentMPSVideo)
	if !setting.Enabled {
		return nil, safeMessageError{message: "请先启用腾讯 MPS 视频增强"}
	}
	if setting.SecretID == "" || setting.SecretKey == "" {
		return nil, safeMessageError{message: "请先填写腾讯云 SecretId 和 SecretKey"}
	}
	remote, err := activeTencentMPSTemplateFetcher.Fetch(ctx, setting)
	if err != nil {
		return nil, safeMessageError{message: "腾讯增强模板同步失败，请检查密钥、MPS 开通授权和地域"}
	}
	return mergeTencentMPSTemplates(setting.Templates, remote), nil
}

func (realTencentMPSTemplateFetcher) Fetch(ctx context.Context, setting model.TencentMPSVideoSetting) ([]model.TencentMPSTemplateSetting, error) {
	api, err := newTencentCloudMPSAPI(setting)
	if err != nil {
		return nil, err
	}
	return listTencentMPSEnhancementTemplates(ctx, api.client)
}
