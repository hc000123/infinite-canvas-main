package service

import (
	"context"
	"strings"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	openapiutil "github.com/alibabacloud-go/darabonba-openapi/v2/utils"
	"github.com/alibabacloud-go/tea/dara"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type ImageUpscaleConnectionResult struct {
	Provider string `json:"provider"`
	Message  string `json:"message"`
}

var imageUpscaleCredentialTester = testAliyunImageUpscaleCredential

func AdminTestImageUpscale(ctx context.Context, input model.ImageUpscaleSetting) (ImageUpscaleConnectionResult, error) {
	saved, err := repository.GetSettings()
	if err != nil {
		return ImageUpscaleConnectionResult{}, err
	}
	settings := model.Settings{Private: model.PrivateSetting{ImageUpscale: input}}
	keepPrivateImageUpscaleSecrets(&settings, normalizeSettings(saved))
	setting := normalizeImageUpscaleSetting(settings.Private.ImageUpscale)
	providerConfig := imageUpscaleProviderConfigFromSetting(setting)
	if _, err := newImageUpscaleProvider(providerConfig); err != nil {
		return ImageUpscaleConnectionResult{}, err
	}
	if err := imageUpscaleCredentialTester(ctx, providerConfig); err != nil {
		return ImageUpscaleConnectionResult{}, safeMessageError{message: "图片超分连接测试失败，请检查 AccessKey、权限或 STS Token"}
	}
	return ImageUpscaleConnectionResult{Provider: "aliyun", Message: "阿里云身份验证成功，未上传图片或创建超分任务"}, nil
}

func testAliyunImageUpscaleCredential(ctx context.Context, providerConfig ImageUpscaleProviderConfig) error {
	credentialType := "access_key"
	if strings.TrimSpace(providerConfig.SecurityToken) != "" {
		credentialType = "sts"
	}
	client, err := openapi.NewClient(&openapiutil.Config{
		AccessKeyId: dara.String(strings.TrimSpace(providerConfig.AccessKeyID)), AccessKeySecret: dara.String(strings.TrimSpace(providerConfig.AccessKeySecret)),
		SecurityToken: dara.String(strings.TrimSpace(providerConfig.SecurityToken)), Type: dara.String(credentialType), RegionId: dara.String("cn-hangzhou"), Endpoint: dara.String("sts.aliyuncs.com"),
	})
	if err != nil {
		return err
	}
	_, err = client.DoRequestWithCtx(ctx, (&openapiutil.Params{}).SetAction("GetCallerIdentity").SetVersion("2015-04-01").SetProtocol("HTTPS").SetPathname("/").SetMethod("POST").SetAuthType("AK").SetStyle("RPC").SetReqBodyType("json").SetBodyType("json"), &openapiutil.OpenApiRequest{}, &dara.RuntimeOptions{})
	return err
}
