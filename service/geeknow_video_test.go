package service

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestIsGeekNowVideoChannelUsesStablePresetID(t *testing.T) {
	if !IsGeekNowVideoChannel(model.ModelChannel{ID: "geeknow-video", Protocol: "openai"}) {
		t.Fatal("geeknow-video should use the GeekNow adapter")
	}
	if IsGeekNowVideoChannel(model.ModelChannel{ID: "custom-video", Protocol: "openai"}) {
		t.Fatal("custom OpenAI video channel must remain generic")
	}
}

func TestBuildGeekNowVideoCreateRequestMapsModelFamilies(t *testing.T) {
	tests := []struct {
		model string
		want  map[string]any
	}{
		{model: "grok-imagine-video", want: map[string]any{"seconds": "6", "aspect_ratio": "16:9", "resolution": "720P"}},
		{model: "grok-imagine-video-1.5-preview", want: map[string]any{"seconds": "6", "aspect_ratio": "16:9", "resolution": "720P"}},
		{model: "sora-2", want: map[string]any{"seconds": "6", "size": "1280x720"}},
		{model: "veo_3_1", want: map[string]any{"duration": float64(6), "size": "1280x720"}},
		{model: "veo_3_1-fast", want: map[string]any{"duration": float64(6), "size": "1280x720"}},
		{model: "doubao-seedance-2-0-260128", want: map[string]any{"duration": float64(6), "aspect_ratio": "16:9", "resolution": "720P"}},
		{model: "doubao-seedance-2-0-fast-260128", want: map[string]any{"duration": float64(6), "aspect_ratio": "16:9", "resolution": "720P"}},
		{model: "minimax-h3-768p", want: map[string]any{"duration": float64(6), "ratio": "16:9", "resolution": "768P"}},
		{model: "minimax-h3-2k", want: map[string]any{"duration": float64(6), "ratio": "16:9", "resolution": "2K"}},
		{model: "minimax-h3-pro-768p", want: map[string]any{"duration": float64(6), "ratio": "16:9", "resolution": "768P"}},
		{model: "minimax-h3-pro-2k", want: map[string]any{"duration": float64(6), "ratio": "16:9", "resolution": "2K"}},
		{model: "manxue-2.5", want: map[string]any{"duration": float64(6), "ratio": "16:9", "resolution": "720p"}},
		{model: "omni-fast", want: map[string]any{"seconds": "6", "aspect_ratio": "16:9", "resolution": "720p"}},
		{model: "omni-fast-v2v", want: map[string]any{"seconds": "6", "aspect_ratio": "16:9", "resolution": "720p"}},
	}
	for _, tt := range tests {
		t.Run(tt.model, func(t *testing.T) {
			body, contentType, err := BuildGeekNowVideoCreateRequest([]byte(`{"model":"`+tt.model+`","prompt":"hi","seconds":"6","duration":"6","ratio":"16:9","size":"1280x720","resolution":"720"}`), "application/json")
			if err != nil {
				t.Fatal(err)
			}
			if contentType != "application/json" {
				t.Fatalf("contentType = %q", contentType)
			}
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatal(err)
			}
			if payload["model"] != tt.model || payload["prompt"] != "hi" {
				t.Fatalf("identity payload = %#v", payload)
			}
			for key, want := range tt.want {
				if payload[key] != want {
					t.Fatalf("%s = %#v, want %#v; payload = %#v", key, payload[key], want, payload)
				}
			}
		})
	}
}

func TestBuildGeekNowVideoCreateRequestMapsMultipartImageRoles(t *testing.T) {
	body, contentType := geekNowMultipartBody(t, "minimax-h3-2k", []string{"first_frame", "last_frame"})
	normalized, normalizedContentType, err := BuildGeekNowVideoCreateRequest(body, contentType)
	if err != nil {
		t.Fatal(err)
	}
	if normalizedContentType != "application/json" {
		t.Fatalf("contentType = %q", normalizedContentType)
	}
	var payload map[string]any
	if err := json.Unmarshal(normalized, &payload); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"first_image", "last_image"} {
		value, _ := payload[key].(string)
		if !strings.HasPrefix(value, "data:") || !strings.Contains(value, ";base64,") {
			t.Fatalf("%s = %q, want image data URI", key, value)
		}
	}
}

func TestBuildGeekNowVideoCreateRequestRejectsMissingRequiredFields(t *testing.T) {
	for name, body := range map[string]string{
		"model":  `{"prompt":"hi"}`,
		"prompt": `{"model":"grok-imagine-video"}`,
	} {
		t.Run(name, func(t *testing.T) {
			_, _, err := BuildGeekNowVideoCreateRequest([]byte(body), "application/json")
			if err == nil || !strings.Contains(err.Error(), "缺少") {
				t.Fatalf("error = %v, want missing-field error", err)
			}
		})
	}
}

func TestNormalizeGeekNowVideoTaskResponse(t *testing.T) {
	normalized, err := NormalizeGeekNowVideoTaskResponse([]byte(`{"task_id":"task-1","status":"completed","output":{"file_infos":[{"file_url":"https://cdn.example/video.mp4"}]}}`))
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(normalized, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["id"] != "task-1" || payload["status"] != "succeeded" || payload["video_url"] != "https://cdn.example/video.mp4" {
		t.Fatalf("payload = %#v", payload)
	}
	content, _ := payload["content"].(map[string]any)
	if content["video_url"] != "https://cdn.example/video.mp4" {
		t.Fatalf("content = %#v", content)
	}
}

func TestNormalizeGeekNowVideoTaskResponseKeepsFailureAndDirectURL(t *testing.T) {
	normalized, err := NormalizeGeekNowVideoTaskResponse([]byte(`{"id":"task-2","status":"failed","video_url":"https://cdn.example/fallback.mp4","error":{"code":"upstream_failed","message":"bad input"}}`))
	if err != nil {
		t.Fatal(err)
	}
	var payload struct {
		Status   string `json:"status"`
		VideoURL string `json:"video_url"`
		Error    struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(normalized, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Status != "failed" || payload.VideoURL != "https://cdn.example/fallback.mp4" || payload.Error.Code != "upstream_failed" || payload.Error.Message != "bad input" {
		t.Fatalf("payload = %#v", payload)
	}
	if got := GeekNowTaskVideoURL(normalized); got != "https://cdn.example/fallback.mp4" {
		t.Fatalf("GeekNowTaskVideoURL = %q", got)
	}
}

func geekNowMultipartBody(t *testing.T, modelName string, roles []string) ([]byte, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{"model": modelName, "prompt": "hi", "duration": "6", "ratio": "16:9", "resolution": "720"} {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	for index, role := range roles {
		part, err := writer.CreateFormFile("input_reference[]", "reference.png")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, byte(index)}); err != nil {
			t.Fatal(err)
		}
		if err := writer.WriteField("input_reference_role[]", role); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body.Bytes(), writer.FormDataContentType()
}
