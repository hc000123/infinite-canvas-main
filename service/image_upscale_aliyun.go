package service

import (
	"context"
	"errors"
	"io"
	"strings"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/utils"
	imageenhan "github.com/alibabacloud-go/imageenhan-20190930/v3/client"
	"github.com/alibabacloud-go/tea/dara"
)

type aliyunImageUpscaleCallInput struct {
	Image         io.Reader
	Scale         int
	Mode          string
	OutputFormat  string
	OutputQuality int
}

type aliyunImageUpscaleCallResult struct {
	RequestID string
	ResultURL string
}

type aliyunImageUpscaleCall func(context.Context, aliyunImageUpscaleCallInput) (aliyunImageUpscaleCallResult, error)

type aliyunImageUpscaleProvider struct {
	call aliyunImageUpscaleCall
}

func newAliyunImageUpscaleProvider(providerConfig ImageUpscaleProviderConfig) ImageUpscaleProvider {
	return aliyunImageUpscaleProvider{call: newAliyunImageUpscaleCall(providerConfig)}
}

func (provider aliyunImageUpscaleProvider) Upscale(ctx context.Context, image io.Reader, request ImageUpscaleProviderRequest) (ImageUpscaleProviderResult, error) {
	result, err := provider.call(ctx, aliyunImageUpscaleCallInput{Image: image, Scale: request.Scale, Mode: "base", OutputFormat: "png", OutputQuality: 95})
	if err != nil {
		return ImageUpscaleProviderResult{}, err
	}
	if strings.TrimSpace(result.ResultURL) == "" {
		return ImageUpscaleProviderResult{}, errors.New("aliyun image upscale returned an empty result URL")
	}
	return ImageUpscaleProviderResult{Provider: "aliyun", RequestID: result.RequestID, ResultURL: result.ResultURL, Model: "MakeSuperResolutionImage", Strategy: "base"}, nil
}

func newAliyunImageUpscaleCall(providerConfig ImageUpscaleProviderConfig) aliyunImageUpscaleCall {
	return func(ctx context.Context, input aliyunImageUpscaleCallInput) (aliyunImageUpscaleCallResult, error) {
		if err := ctx.Err(); err != nil {
			return aliyunImageUpscaleCallResult{}, err
		}
		credentialType := "access_key"
		if strings.TrimSpace(providerConfig.SecurityToken) != "" {
			credentialType = "sts"
		}
		client, err := imageenhan.NewClient(&openapi.Config{
			AccessKeyId:     dara.String(strings.TrimSpace(providerConfig.AccessKeyID)),
			AccessKeySecret: dara.String(strings.TrimSpace(providerConfig.AccessKeySecret)),
			SecurityToken:   dara.String(strings.TrimSpace(providerConfig.SecurityToken)),
			Type:            dara.String(credentialType),
			RegionId:        dara.String("cn-shanghai"),
			Endpoint:        dara.String("imageenhan.cn-shanghai.aliyuncs.com"),
		})
		if err != nil {
			return aliyunImageUpscaleCallResult{}, err
		}
		response, err := client.MakeSuperResolutionImageAdvance(
			(&imageenhan.MakeSuperResolutionImageAdvanceRequest{}).
				SetUrlObject(input.Image).
				SetMode(input.Mode).
				SetOutputFormat(input.OutputFormat).
				SetOutputQuality(int64(input.OutputQuality)).
				SetUpscaleFactor(int64(input.Scale)),
			&dara.RuntimeOptions{},
		)
		if err != nil {
			return aliyunImageUpscaleCallResult{}, err
		}
		if response == nil || response.Body == nil || response.Body.Data == nil {
			return aliyunImageUpscaleCallResult{}, errors.New("aliyun image upscale returned an empty response")
		}
		return aliyunImageUpscaleCallResult{RequestID: dara.StringValue(response.Body.RequestId), ResultURL: dara.StringValue(response.Body.Data.Url)}, nil
	}
}
