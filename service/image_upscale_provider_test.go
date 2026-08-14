package service

import (
	"context"
	"errors"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestImageUpscaleProviderConfigUsesEnvironmentUntilManaged(t *testing.T) {
	setupAITaskTestDB(t)
	oldProvider, oldID, oldSecret, oldToken := config.Cfg.ImageUpscaleProvider, config.Cfg.AlibabaCloudAccessKeyID, config.Cfg.AlibabaCloudAccessKeySecret, config.Cfg.AlibabaCloudSecurityToken
	t.Cleanup(func() {
		config.Cfg.ImageUpscaleProvider, config.Cfg.AlibabaCloudAccessKeyID, config.Cfg.AlibabaCloudAccessKeySecret, config.Cfg.AlibabaCloudSecurityToken = oldProvider, oldID, oldSecret, oldToken
	})
	config.Cfg.ImageUpscaleProvider, config.Cfg.AlibabaCloudAccessKeyID, config.Cfg.AlibabaCloudAccessKeySecret, config.Cfg.AlibabaCloudSecurityToken = "aliyun", "env-id", "env-secret", "env-token"

	configValue := currentImageUpscaleProviderConfig()
	if configValue.AccessKeyID != "env-id" || configValue.AccessKeySecret != "env-secret" || configValue.SecurityToken != "env-token" {
		t.Fatalf("unmanaged config = %#v, want environment fallback", configValue)
	}
}

func TestImageUpscaleProviderConfigUsesManagedSettingsAndHonorsDisabled(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{ImageUpscale: model.ImageUpscaleSetting{
		Managed: true, Enabled: true, Provider: "aliyun", AccessKeyID: "db-id", AccessKeySecret: "db-secret", SecurityToken: "db-token",
	}}}, now())
	if err != nil {
		t.Fatal(err)
	}
	configValue := currentImageUpscaleProviderConfig()
	if configValue.AccessKeyID != "db-id" || configValue.AccessKeySecret != "db-secret" || configValue.SecurityToken != "db-token" {
		t.Fatalf("managed config = %#v", configValue)
	}

	_, err = repository.SaveSettings(model.Settings{Private: model.PrivateSetting{ImageUpscale: model.ImageUpscaleSetting{Managed: true, Enabled: false, Provider: "aliyun"}}}, now())
	if err != nil {
		t.Fatal(err)
	}
	if ImageUpscaleConfigured() {
		t.Fatal("disabled managed image upscale reported configured")
	}
}

func TestAdminTestImageUpscaleRestoresSavedSecretsWithoutCreatingJob(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{ImageUpscale: model.ImageUpscaleSetting{
		Managed: true, Enabled: true, Provider: "aliyun", AccessKeyID: "saved-id", AccessKeySecret: "saved-secret",
	}}}, now())
	if err != nil {
		t.Fatal(err)
	}
	oldTester := imageUpscaleCredentialTester
	t.Cleanup(func() { imageUpscaleCredentialTester = oldTester })
	called := false
	imageUpscaleCredentialTester = func(_ context.Context, providerConfig ImageUpscaleProviderConfig) error {
		called = true
		if providerConfig.AccessKeyID != "saved-id" || providerConfig.AccessKeySecret != "saved-secret" {
			t.Fatalf("restored config = %#v", providerConfig)
		}
		return nil
	}
	result, err := AdminTestImageUpscale(context.Background(), model.ImageUpscaleSetting{Provider: "aliyun"})
	if err != nil || !called || result.Provider != "aliyun" {
		t.Fatalf("result=%#v called=%v err=%v", result, called, err)
	}
	jobs, err := repository.ListActiveImageUpscaleJobs()
	if err != nil || len(jobs) != 0 {
		t.Fatalf("credential test created jobs: %#v err=%v", jobs, err)
	}
}

func TestAdminTestImageUpscaleReturnsSafeCredentialError(t *testing.T) {
	setupAITaskTestDB(t)
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{ImageUpscale: model.ImageUpscaleSetting{Managed: true, Provider: "aliyun", AccessKeyID: "saved-id", AccessKeySecret: "saved-secret"}}}, now())
	if err != nil {
		t.Fatal(err)
	}
	oldTester := imageUpscaleCredentialTester
	t.Cleanup(func() { imageUpscaleCredentialTester = oldTester })
	imageUpscaleCredentialTester = func(context.Context, ImageUpscaleProviderConfig) error { return errors.New("upstream leaked detail") }
	_, err = AdminTestImageUpscale(context.Background(), model.ImageUpscaleSetting{Provider: "aliyun"})
	if err == nil || err.Error() != "图片超分连接测试失败，请检查 AccessKey、权限或 STS Token" {
		t.Fatalf("error = %v", err)
	}
}
