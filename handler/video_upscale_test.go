package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestVideoUpscaleCapabilitiesHidePrivateConfiguration(t *testing.T) {
	setupVideoUpscaleHandlerTestDB(t)
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{
		VolcengineAsset: model.VolcengineAssetSetting{AccessKey: "secret-ak", SecretKey: "secret-sk"},
		VideoUpscale:    model.VideoUpscaleSetting{Enabled: true, Provider: "volcengine", SpaceName: "private-space"},
	}}, "now")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/video-upscale/capabilities", nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-a", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()
	VideoUpscaleCapabilities(recorder, request)
	body := recorder.Body.String()
	if recorder.Code != http.StatusOK || !strings.Contains(body, `"cloudProcessing":true`) || strings.Contains(body, "secret-") || strings.Contains(body, "private-space") {
		t.Fatalf("body=%s", body)
	}
}

func TestVideoUpscaleJobResponseHidesPrivatePaths(t *testing.T) {
	setupVideoUpscaleHandlerTestDB(t)
	_, err := repository.SaveVideoUpscaleJob(model.VideoUpscaleJob{ID: "job-1", UserID: "user-a", InputPath: "/private/input.mp4", ResultSourceURL: "https://signed.example/result", VODSpaceName: "private-space", Status: model.VideoUpscaleJobStatusProcessing})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/video-upscale/jobs/job-1", nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-a", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()
	VideoUpscaleJob(recorder, request, "job-1")
	var payload map[string]interface{}
	_ = json.Unmarshal(recorder.Body.Bytes(), &payload)
	body := recorder.Body.String()
	if strings.Contains(body, "/private/input.mp4") || strings.Contains(body, "signed.example") || strings.Contains(body, "private-space") {
		t.Fatalf("private fields leaked: %s payload=%#v", body, payload)
	}
}

func setupVideoUpscaleHandlerTestDB(t *testing.T) {
	t.Helper()
	old := config.Cfg
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(t.TempDir(), "handler.db")
	repository.ResetForTest()
	t.Cleanup(func() { config.Cfg = old; repository.ResetForTest() })
}
