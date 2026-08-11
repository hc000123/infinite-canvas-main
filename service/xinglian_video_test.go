package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestXinglianVideoEndpointsNormalizeConfiguredV1URL(t *testing.T) {
	endpoints, err := ResolveXinglianVideoEndpoints("https://www.vjimeng.vip/v1/")
	if err != nil {
		t.Fatalf("ResolveXinglianVideoEndpoints returned error: %v", err)
	}
	if endpoints.Submit != "https://www.vjimeng.vip/v1/video/submit/generate" {
		t.Fatalf("submit = %q", endpoints.Submit)
	}
	if endpoints.Fetch("task-1") != "https://www.vjimeng.vip/v1/video/fetch/task-1" {
		t.Fatalf("fetch = %q", endpoints.Fetch("task-1"))
	}
}

func TestBuildXinglianVideoCreateRequestMapsExistingVideoFields(t *testing.T) {
	body, contentType, err := BuildXinglianVideoCreateRequest([]byte(`{
		"model":"sd2-720p-fast",
		"prompt":"一只猫在草地奔跑",
		"duration":6,
		"ratio":"9:16",
		"generate_audio":true,
		"images":["https://files.example.com/cat.png"],
		"audios":["https://files.example.com/voice.mp3"]
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildXinglianVideoCreateRequest returned error: %v", err)
	}
	if contentType != "application/json" {
		t.Fatalf("content type = %q", contentType)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["duration"] != float64(6) || payload["model"] != "sd2-720p-fast" {
		t.Fatalf("payload = %#v", payload)
	}
	metadata := payload["metadata"].(map[string]any)
	if metadata["ratio"] != "9:16" || metadata["enableSound"] != "on" {
		t.Fatalf("metadata = %#v", metadata)
	}
	if payload["images"].([]any)[0] != "https://files.example.com/cat.png" || payload["audios"].([]any)[0] != "https://files.example.com/voice.mp3" {
		t.Fatalf("references = %#v", payload)
	}
}

func TestBuildXinglianVideoCreateRequestAllowsSD25ThirtySeconds(t *testing.T) {
	body, _, err := BuildXinglianVideoCreateRequest([]byte(`{
		"model":"sd2.5-720p-ax2",
		"prompt":"城市夜景",
		"duration":30
	}`), "application/json")
	if err != nil {
		t.Fatalf("BuildXinglianVideoCreateRequest returned error: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["duration"] != float64(30) {
		t.Fatalf("duration = %#v, want 30", payload["duration"])
	}
}

func TestBuildXinglianVideoCreateRequestRejectsWrongFixedDuration(t *testing.T) {
	_, _, err := BuildXinglianVideoCreateRequest([]byte(`{
		"model":"sd2.5-480p-ax2-20s",
		"prompt":"城市夜景",
		"duration":4
	}`), "application/json")
	if err == nil || !strings.Contains(err.Error(), "固定 20 秒") {
		t.Fatalf("error = %v, want fixed 20 second message", err)
	}
}

func TestBuildXinglianVideoCreateRequestRejectsUnsupportedDSDuration(t *testing.T) {
	_, _, err := BuildXinglianVideoCreateRequest([]byte(`{
		"model":"sd2-720p-ds",
		"prompt":"城市夜景",
		"duration":12
	}`), "application/json")
	if err == nil || !strings.Contains(err.Error(), "仅支持 10 秒或 15 秒") {
		t.Fatalf("error = %v, want DS duration message", err)
	}
}

func TestNormalizeXinglianVideoTaskResponseMapsCompletedVideoURL(t *testing.T) {
	body, err := NormalizeXinglianVideoTaskResponse([]byte(`{
		"id":"task-1",
		"status":"completed",
		"progress":100,
		"created_at":1715760000,
		"metadata":{"url":"https://cdn.example.com/video.mp4"}
	}`))
	if err != nil {
		t.Fatalf("NormalizeXinglianVideoTaskResponse returned error: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["id"] != "task-1" || payload["status"] != "completed" || payload["video_url"] != "https://cdn.example.com/video.mp4" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestNormalizeXinglianVideoTaskResponseMapsTokenTaskWrapper(t *testing.T) {
	body, err := NormalizeXinglianVideoTaskResponse([]byte(`{
		"code":"success",
		"message":"",
		"data":{
			"task_id":"task-1",
			"status":"SUCCESS",
			"progress":"100%",
			"submit_time":1715760000,
			"finish_time":1715760120,
			"result_url":"http://cdn.example.com/video.mp4",
			"fail_reason":"",
			"data":{"status":"success","video_url":"http://cdn.example.com/video.mp4"}
		}
	}`))
	if err != nil {
		t.Fatalf("NormalizeXinglianVideoTaskResponse returned error: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["id"] != "task-1" || payload["status"] != "completed" || payload["video_url"] != "http://cdn.example.com/video.mp4" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestXinglianModelPreflightRejectsUnavailableModel(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/models":
			_, _ = w.Write([]byte(`{"data":[{"id":"sd2-720p-fast"}]}`))
		case "/api/user/balance":
			_, _ = w.Write([]byte(`{"success":true}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	_, err := testAdminChannelModel(model.ModelChannel{Protocol: string(model.ModelProtocolXinglianCloud), BaseURL: upstream.URL + "/v1", APIKey: "test-key"}, "sd2-720p-mini", "")
	if err == nil || !strings.Contains(err.Error(), "当前账户不可用") {
		t.Fatalf("error = %v, want unavailable model message", err)
	}
}
