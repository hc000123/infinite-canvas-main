package service

import (
	"context"
	"io"
	"strings"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type ImageUpscaleProviderRequest struct {
	Scale int
}

type ImageUpscaleProviderResult struct {
	Provider  string
	RequestID string
	ResultURL string
	Model     string
	Strategy  string
}

type ImageUpscaleProvider interface {
	Upscale(context.Context, io.Reader, ImageUpscaleProviderRequest) (ImageUpscaleProviderResult, error)
}

type ImageUpscaleProviderConfig struct {
	Provider        string
	AccessKeyID     string
	AccessKeySecret string
	SecurityToken   string
}

func currentImageUpscaleProviderConfig() ImageUpscaleProviderConfig {
	fallback := ImageUpscaleProviderConfig{
		Provider:        config.Cfg.ImageUpscaleProvider,
		AccessKeyID:     config.Cfg.AlibabaCloudAccessKeyID,
		AccessKeySecret: config.Cfg.AlibabaCloudAccessKeySecret,
		SecurityToken:   config.Cfg.AlibabaCloudSecurityToken,
	}
	settings, err := repository.GetSettings()
	if err != nil || !settings.Private.ImageUpscale.Managed {
		return fallback
	}
	setting := normalizeImageUpscaleSetting(settings.Private.ImageUpscale)
	if !setting.Enabled {
		return ImageUpscaleProviderConfig{Provider: setting.Provider}
	}
	return imageUpscaleProviderConfigFromSetting(setting)
}

func imageUpscaleProviderConfigFromSetting(setting model.ImageUpscaleSetting) ImageUpscaleProviderConfig {
	return ImageUpscaleProviderConfig{Provider: setting.Provider, AccessKeyID: setting.AccessKeyID, AccessKeySecret: setting.AccessKeySecret, SecurityToken: setting.SecurityToken}
}

func imageUpscaleProviderName(value string) string {
	provider := strings.ToLower(strings.TrimSpace(value))
	if provider == "" {
		return "aliyun"
	}
	return provider
}

func newImageUpscaleProvider(providerConfig ImageUpscaleProviderConfig) (ImageUpscaleProvider, error) {
	providerConfig.Provider = imageUpscaleProviderName(providerConfig.Provider)
	if providerConfig.Provider != "aliyun" {
		return nil, safeMessageError{message: "服务端图片超分服务商配置无效"}
	}
	if strings.TrimSpace(providerConfig.AccessKeyID) == "" || strings.TrimSpace(providerConfig.AccessKeySecret) == "" {
		return nil, safeMessageError{message: "服务端尚未配置图片超分"}
	}
	return newAliyunImageUpscaleProvider(providerConfig), nil
}

func ImageUpscaleConfigured() bool {
	_, err := newImageUpscaleProvider(currentImageUpscaleProviderConfig())
	return err == nil
}
