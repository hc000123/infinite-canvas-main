package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
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

	body, contentType, err := service.BuildArkVideoCreateRequest(source, "application/json")
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

func TestCloudVideoProxyIgnoresFrontendVolcengineKey(t *testing.T) {
	setupAIHandlerTestDB(t)
	allowCustomChannel := false
	upstreamCalled := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalled = true
		if !strings.HasSuffix(r.URL.Path, "/contents/generations/tasks") {
			t.Fatalf("unexpected upstream path: %s", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer backend-key" {
			t.Fatalf("authorization = %q, want backend key", auth)
		}
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "frontend-key") || strings.Contains(string(body), "_volcengine_api_key") {
			t.Fatalf("upstream body contains frontend supplier key: %s", string(body))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"task-cloud-boundary","status":"queued"}`))
	}))
	defer upstream.Close()
	saveAIHandlerSettings(t, allowCustomChannel, upstream.URL)

	body := []byte(`{
		"model": "ep-test",
		"prompt": "生成一个短视频",
		"content": [{"type":"text","text":"生成一个短视频"}],
		"_volcengine_api_key": "frontend-key",
		"_volcengine_base_url": "https://frontend.invalid/api/v3"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/videos", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(service.WithUser(req.Context(), model.AuthUser{ID: "user-cloud-boundary", Username: "cloud-boundary", Role: model.UserRoleUser}))
	rec := httptest.NewRecorder()

	proxyAIRequest(rec, req, "/videos")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	if !upstreamCalled {
		t.Fatal("upstream was not called")
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

	body, err := service.NormalizeArkVideoTaskResponse(source)
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

func TestUpstreamErrorMessageKeepsArkPrivacyError(t *testing.T) {
	body := []byte(`{"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image may contain real person."}}`)

	message := upstreamErrorMessage(body, "AI 接口请求失败")
	if message != "输入图片疑似包含真人或隐私信息，火山 Ark 已拒绝本次生成。请更换参考图，或先完成素材加白后再试。（InputImageSensitiveContentDetected.PrivacyInformation）" {
		t.Fatalf("message = %q", message)
	}
}

func TestUpstreamErrorMessageKeepsGenericErrorMessage(t *testing.T) {
	body := []byte(`{"error":{"code":"BadRequest","message":"invalid prompt"}}`)

	message := upstreamErrorMessage(body, "AI 接口请求失败")
	if message != "BadRequest：invalid prompt" {
		t.Fatalf("message = %q", message)
	}
}

func TestValidateProxyDownloadURLRejectsUnsafeTargets(t *testing.T) {
	tests := []string{
		"file:///etc/passwd",
		"http://127.0.0.1/video.mp4",
		"http://localhost/video.mp4",
		"http://10.0.0.1/video.mp4",
		"http://169.254.169.254/latest/meta-data/",
	}
	for _, rawURL := range tests {
		if err := validateProxyDownloadURL(context.Background(), rawURL); err == nil {
			t.Fatalf("validateProxyDownloadURL(%q) returned nil", rawURL)
		}
	}
}

func TestValidateProxyDownloadURLAllowsPublicIP(t *testing.T) {
	if err := validateProxyDownloadURL(context.Background(), "https://8.8.8.8/video.mp4"); err != nil {
		t.Fatalf("validateProxyDownloadURL returned error: %v", err)
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

func setupAIHandlerTestDB(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		repository.ResetForTest()
	})
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	repository.ResetForTest()
}

func saveAIHandlerSettings(t *testing.T, allowCustomChannel bool, upstreamURL string) {
	t.Helper()
	now := time.Now().Format(time.RFC3339)
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AllowCustomChannel: &allowCustomChannel,
				AvailableModels:    []string{"ep-test"},
				DefaultVideoModel:  "ep-test",
				ModelCosts:         []model.ModelCost{{Model: "ep-test", Credits: 0}},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Protocol: string(model.ModelProtocolVolcengineArk),
				Name:     "ark-backend",
				BaseURL:  upstreamURL,
				APIKey:   "backend-key",
				Models:   []string{"ep-test"},
				Weight:   1,
				Enabled:  true,
			}},
		},
	}, now)
	if err != nil {
		t.Fatalf("SaveSettings returned error: %v", err)
	}
}
