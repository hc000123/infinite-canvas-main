package service

import (
	"bytes"
	"context"
	"testing"
)

func TestAliyunImageUpscaleProviderMapsRequest(t *testing.T) {
	var captured aliyunImageUpscaleCallInput
	provider := aliyunImageUpscaleProvider{call: func(_ context.Context, input aliyunImageUpscaleCallInput) (aliyunImageUpscaleCallResult, error) {
		captured = input
		return aliyunImageUpscaleCallResult{RequestID: "request-1", ResultURL: "https://example.com/result.png"}, nil
	}}
	result, err := provider.Upscale(context.Background(), bytes.NewBufferString("image"), ImageUpscaleProviderRequest{Scale: 4})
	if err != nil {
		t.Fatal(err)
	}
	if captured.Scale != 4 || captured.Mode != "base" || captured.OutputFormat != "png" || captured.OutputQuality != 95 || captured.Image == nil {
		t.Fatalf("captured request=%#v", captured)
	}
	if result.Provider != "aliyun" || result.RequestID != "request-1" || result.ResultURL == "" || result.Strategy != "base" {
		t.Fatalf("result=%#v", result)
	}
}

func TestNewImageUpscaleProviderRequiresServerCredentials(t *testing.T) {
	_, err := newImageUpscaleProvider(ImageUpscaleProviderConfig{Provider: "aliyun"})
	safe, ok := err.(interface{ SafeMessage() string })
	if err == nil || !ok || safe.SafeMessage() != "服务端尚未配置图片超分" {
		t.Fatalf("error=%v", err)
	}
}
