package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

const maxXinglianUploadBytes = 100 * 1024 * 1024

type XinglianUploadSignInput struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	Type        string `json:"type"`
}

type XinglianUploadSignResult struct {
	Method    string            `json:"method"`
	UploadURL string            `json:"uploadUrl"`
	PublicURL string            `json:"publicUrl"`
	Key       string            `json:"key"`
	ExpiresAt string            `json:"expiresAt"`
	Headers   map[string]string `json:"headers"`
}

type XinglianUploadCompleteInput struct {
	Key      string `json:"key"`
	Filename string `json:"filename,omitempty"`
	Type     string `json:"type,omitempty"`
}

type XinglianUploadCompleteResult struct {
	Recorded     bool   `json:"recorded"`
	RecordID     int64  `json:"recordId"`
	Key          string `json:"key"`
	URL          string `json:"url"`
	ThumbnailURL string `json:"thumbnailUrl,omitempty"`
}

func SignXinglianUpload(ctx context.Context, channel model.ModelChannel, input XinglianUploadSignInput) (XinglianUploadSignResult, error) {
	input.Filename = strings.TrimSpace(input.Filename)
	input.ContentType = strings.TrimSpace(input.ContentType)
	input.Type = strings.ToLower(strings.TrimSpace(input.Type))
	if input.Filename == "" || input.ContentType == "" || input.Size < 1 {
		return XinglianUploadSignResult{}, errors.New("星链云上传素材信息不完整")
	}
	if input.Size > maxXinglianUploadBytes {
		return XinglianUploadSignResult{}, errors.New("星链云上传素材不能超过 100 MB")
	}
	if input.Type != "image" && input.Type != "video" && input.Type != "audio" {
		return XinglianUploadSignResult{}, errors.New("星链云上传素材类型无效")
	}
	var upstream struct {
		Method    string            `json:"method"`
		UploadURL string            `json:"upload_url"`
		PublicURL string            `json:"public_url"`
		Key       string            `json:"key"`
		ExpiresAt string            `json:"expires_at"`
		Headers   map[string]string `json:"headers"`
	}
	if err := requestXinglianUploadJSON(ctx, channel, "/api/direct-upload/sign", input, &upstream); err != nil {
		return XinglianUploadSignResult{}, err
	}
	if upstream.Method == "" || upstream.UploadURL == "" || upstream.PublicURL == "" || upstream.Key == "" {
		return XinglianUploadSignResult{}, errors.New("星链云 OSS 签名响应不完整")
	}
	return XinglianUploadSignResult{Method: upstream.Method, UploadURL: upstream.UploadURL, PublicURL: upstream.PublicURL, Key: upstream.Key, ExpiresAt: upstream.ExpiresAt, Headers: upstream.Headers}, nil
}

func CompleteXinglianUpload(ctx context.Context, channel model.ModelChannel, input XinglianUploadCompleteInput) (XinglianUploadCompleteResult, error) {
	input.Key = strings.TrimSpace(input.Key)
	input.Filename = strings.TrimSpace(input.Filename)
	input.Type = strings.ToLower(strings.TrimSpace(input.Type))
	if input.Key == "" {
		return XinglianUploadCompleteResult{}, errors.New("缺少星链云 OSS Object Key")
	}
	var upstream struct {
		Recorded     bool   `json:"recorded"`
		RecordID     int64  `json:"record_id"`
		Key          string `json:"key"`
		URL          string `json:"url"`
		ThumbnailURL string `json:"thumbnail_url"`
	}
	if err := requestXinglianUploadJSON(ctx, channel, "/api/direct-upload/complete", input, &upstream); err != nil {
		return XinglianUploadCompleteResult{}, err
	}
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(upstream.URL)), "https://") {
		return XinglianUploadCompleteResult{}, errors.New("星链云 OSS 未返回 HTTPS 素材地址")
	}
	return XinglianUploadCompleteResult{Recorded: upstream.Recorded, RecordID: upstream.RecordID, Key: upstream.Key, URL: upstream.URL, ThumbnailURL: upstream.ThumbnailURL}, nil
}

func requestXinglianUploadJSON(ctx context.Context, channel model.ModelChannel, path string, input any, output any) error {
	baseURL, err := xinglianUploadBaseURL(channel.BaseURL)
	if err != nil {
		return err
	}
	body, err := json.Marshal(input)
	if err != nil {
		return err
	}
	attempts := 1
	if path == "/api/direct-upload/sign" {
		attempts = 3
	}
	var response *http.Response
	for attempt := 0; attempt < attempts; attempt++ {
		request, requestErr := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+path, bytes.NewReader(body))
		if requestErr != nil {
			return requestErr
		}
		request.Header.Set("Authorization", "Bearer "+channel.APIKey)
		request.Header.Set("Content-Type", "application/json")
		response, err = DoAIHTTPRequest(request)
		if err == nil {
			break
		}
	}
	if err != nil {
		return err
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return readAdminChannelError(responseBody, response.StatusCode, "星链云 OSS 请求失败")
	}
	if err := json.Unmarshal(responseBody, output); err != nil {
		return fmt.Errorf("星链云 OSS 响应无效: %w", err)
	}
	return nil
}

func xinglianUploadBaseURL(rawURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "", errors.New("星链云接口地址无效")
	}
	if host := strings.ToLower(parsed.Hostname()); host == "vjimeng.vip" || host == "www.vjimeng.vip" {
		return "https://oss.vjimeng.vip", nil
	}
	return parsed.Scheme + "://" + parsed.Host, nil
}
