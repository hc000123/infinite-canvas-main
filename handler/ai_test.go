package handler

import (
	"encoding/json"
	"testing"
)

func TestBuildArkVideoCreateRequestKeepsSeedanceControls(t *testing.T) {
	source := []byte(`{
		"model": "doubao-seedance-2-0-260128",
		"prompt": "小猫对着镜头打哈欠",
		"duration": 10,
		"ratio": "9:16",
		"resolution": "1080p",
		"generate_audio": true,
		"watermark": false,
		"seed": 42
	}`)

	body, contentType, err := buildArkVideoCreateRequest(source, "application/json")
	if err != nil {
		t.Fatalf("buildArkVideoCreateRequest returned error: %v", err)
	}
	if contentType != "application/json" {
		t.Fatalf("content type = %q, want application/json", contentType)
	}

	payload := readJSONMap(t, body)
	if payload["duration"] != float64(10) {
		t.Fatalf("duration = %#v, want 10", payload["duration"])
	}
	if payload["ratio"] != "9:16" {
		t.Fatalf("ratio = %#v, want 9:16", payload["ratio"])
	}
	if payload["resolution"] != "1080p" {
		t.Fatalf("resolution = %#v, want 1080p", payload["resolution"])
	}
	if payload["generate_audio"] != true {
		t.Fatalf("generate_audio = %#v, want true", payload["generate_audio"])
	}
	if payload["watermark"] != false {
		t.Fatalf("watermark = %#v, want false", payload["watermark"])
	}
	if payload["seed"] != float64(42) {
		t.Fatalf("seed = %#v, want 42", payload["seed"])
	}
}

func TestNormalizeArkVideoTaskResponseKeepsTaskDetails(t *testing.T) {
	source := []byte(`{
		"id": "cgt-2026-test",
		"status": "failed",
		"content": { "video_url": "https://example.com/video.mp4" },
		"error": { "code": "TaskFailed", "message": "生成失败原因" },
		"created_at": 1700000000,
		"updated_at": 1700000100,
		"execution_expires_after": 172800,
		"seed": 42,
		"resolution": "1080p",
		"ratio": "16:9",
		"duration": 5,
		"generate_audio": true,
		"watermark": false
	}`)

	body, err := normalizeArkVideoTaskResponse(source)
	if err != nil {
		t.Fatalf("normalizeArkVideoTaskResponse returned error: %v", err)
	}

	payload := readJSONMap(t, body)
	if payload["status"] != "failed" {
		t.Fatalf("status = %#v, want failed", payload["status"])
	}
	if payload["video_url"] != "https://example.com/video.mp4" {
		t.Fatalf("video_url = %#v", payload["video_url"])
	}
	if payload["created_at"] != float64(1700000000) || payload["updated_at"] != float64(1700000100) {
		t.Fatalf("timestamps = %#v/%#v", payload["created_at"], payload["updated_at"])
	}
	if payload["execution_expires_after"] != float64(172800) {
		t.Fatalf("execution_expires_after = %#v", payload["execution_expires_after"])
	}
	if payload["video_url_expires_at"] != float64(1700172900) {
		t.Fatalf("video_url_expires_at = %#v", payload["video_url_expires_at"])
	}
	if payload["seed"] != float64(42) || payload["resolution"] != "1080p" || payload["ratio"] != "16:9" || payload["duration"] != float64(5) {
		t.Fatalf("task params were not preserved: %#v", payload)
	}
	if payload["generate_audio"] != true || payload["watermark"] != false {
		t.Fatalf("boolean params were not preserved: %#v", payload)
	}

	taskError, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("error payload = %#v", payload["error"])
	}
	if taskError["code"] != "TaskFailed" || taskError["message"] != "生成失败原因" {
		t.Fatalf("error payload = %#v", taskError)
	}
}

func readJSONMap(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	return payload
}
