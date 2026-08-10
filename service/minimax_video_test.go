package service

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestResolveMiniMaxVideoEndpoints(t *testing.T) {
	endpoints, err := ResolveMiniMaxVideoEndpoints("https://api.minimaxi.com/")
	if err != nil {
		t.Fatal(err)
	}
	if endpoints.Create != "https://api.minimaxi.com/v2/video_generation" {
		t.Fatalf("create = %q", endpoints.Create)
	}
	if got := endpoints.Query("task/1"); got != "https://api.minimaxi.com/v2/query/video_generation/task%2F1" {
		t.Fatalf("query = %q", got)
	}
}

func TestBuildMiniMaxVideoCreateRequestKeepsOnlySupportedFields(t *testing.T) {
	body, contentType, err := BuildMiniMaxVideoCreateRequest([]byte(`{
		"model":"MiniMax-H3",
		"content":[{"type":"text","text":"生成视频"}],
		"resolution":"2K","duration":6,"ratio":"16:9",
		"aigc_watermark":true,"seed":123,"callback_url":"https://example.com/callback"
	}`), "application/json")
	if err != nil {
		t.Fatal(err)
	}
	if contentType != "application/json" {
		t.Fatalf("content type = %q", contentType)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if _, exists := payload["seed"]; exists {
		t.Fatalf("unsupported seed remained: %#v", payload)
	}
	if _, exists := payload["callback_url"]; exists {
		t.Fatalf("unsupported callback remained: %#v", payload)
	}
	if payload["model"] != "MiniMax-H3" || payload["resolution"] != "2K" || payload["duration"] != float64(6) || payload["aigc_watermark"] != true {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestBuildMiniMaxVideoCreateRequestValidatesContentAndControls(t *testing.T) {
	valid := `{"model":"MiniMax-H3","content":[{"type":"text","text":"生成视频"}],"resolution":"768P","duration":4,"ratio":"21:9"}`
	tests := []struct {
		name        string
		body        string
		contentType string
		want        string
	}{
		{name: "content type", body: valid, contentType: "multipart/form-data", want: "JSON"},
		{name: "prompt", body: `{"model":"MiniMax-H3","content":[],"resolution":"2K","duration":6,"ratio":"16:9"}`, contentType: "application/json", want: "提示词"},
		{name: "resolution", body: strings.Replace(valid, `"768P"`, `"1080P"`, 1), contentType: "application/json", want: "分辨率"},
		{name: "duration", body: strings.Replace(valid, `"duration":4`, `"duration":3`, 1), contentType: "application/json", want: "时长"},
		{name: "ratio", body: strings.Replace(valid, `"21:9"`, `"2:3"`, 1), contentType: "application/json", want: "比例"},
		{name: "mixed roles", body: `{"model":"MiniMax-H3","content":[{"type":"text","text":"x"},{"type":"image_url","image_url":{"url":"https://example.com/a.png"},"role":"first_frame"},{"type":"audio_url","audio_url":{"url":"https://example.com/a.mp3"},"role":"reference_audio"}],"resolution":"2K","duration":6,"ratio":"adaptive"}`, contentType: "application/json", want: "不能混用"},
		{name: "duplicate frame", body: `{"model":"MiniMax-H3","content":[{"type":"text","text":"x"},{"type":"image_url","image_url":{"url":"https://example.com/a.png"},"role":"first_frame"},{"type":"image_url","image_url":{"url":"https://example.com/b.png"},"role":"first_frame"}],"resolution":"2K","duration":6,"ratio":"adaptive"}`, contentType: "application/json", want: "首帧不能重复"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, _, err := BuildMiniMaxVideoCreateRequest([]byte(test.body), test.contentType)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestBuildMiniMaxVideoCreateRequestRejectsOversizedBody(t *testing.T) {
	body := bytes.Repeat([]byte(" "), miniMaxMaxRequestBytes+1)
	if _, _, err := BuildMiniMaxVideoCreateRequest(body, "application/json"); err == nil || !strings.Contains(err.Error(), "64 MB") {
		t.Fatalf("error = %v", err)
	}
}

func TestNormalizeMiniMaxVideoCreateResponse(t *testing.T) {
	body, err := NormalizeMiniMaxVideoCreateResponse([]byte(`{"task_id":"task-1"}`))
	if err != nil {
		t.Fatal(err)
	}
	var task map[string]any
	if err := json.Unmarshal(body, &task); err != nil {
		t.Fatal(err)
	}
	if task["id"] != "task-1" || task["status"] != "queued" {
		t.Fatalf("task = %#v", task)
	}
}

func TestNormalizeMiniMaxVideoTaskResponseMapsStatuses(t *testing.T) {
	for _, status := range []string{"queued", "running", "succeeded", "failed", "cancelled"} {
		t.Run(status, func(t *testing.T) {
			body, err := NormalizeMiniMaxVideoTaskResponse([]byte(`{"task":{"id":"task-1","model":"MiniMax-H3","status":"` + status + `","created_at":10,"updated_at":20,"content":{"url":"https://example.com/video.mp4"},"resolution":"2K","duration":6,"ratio":"16:9"}}`))
			if err != nil {
				t.Fatal(err)
			}
			var task map[string]any
			if err := json.Unmarshal(body, &task); err != nil {
				t.Fatal(err)
			}
			if task["status"] != status || task["raw_status"] != status || task["video_url"] != "https://example.com/video.mp4" {
				t.Fatalf("task = %#v", task)
			}
		})
	}
}

func TestNormalizeMiniMaxVideoTaskResponseMapsErrorAndResultURL(t *testing.T) {
	body := []byte(`{"task":{"id":"task-1","status":"failed","error":{"code":"1026","message":"sensitive content"}}}`)
	normalized, err := NormalizeMiniMaxVideoTaskResponse(body)
	if err != nil {
		t.Fatal(err)
	}
	var task struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(normalized, &task); err != nil {
		t.Fatal(err)
	}
	if task.Error.Code != "1026" || task.Error.Message != "sensitive content" {
		t.Fatalf("error = %#v", task.Error)
	}
	if got := MiniMaxTaskVideoURL([]byte(`{"task":{"id":"task-2","status":"succeeded","content":{"url":"https://example.com/result.mp4"}}}`)); got != "https://example.com/result.mp4" {
		t.Fatalf("video url = %q", got)
	}
}
