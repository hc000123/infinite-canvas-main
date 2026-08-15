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
		VideoUpscale:    model.VideoUpscaleSetting{Enabled: true, Provider: "volcengine-las", APIKey: "secret-las-key", OutputTOSPath: "tos://private-bucket/output/"},
	}}, "now")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/video-upscale/capabilities", nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-a", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()
	VideoUpscaleCapabilities(recorder, request)
	body := recorder.Body.String()
	if recorder.Code != http.StatusOK || !strings.Contains(body, `"cloudProcessing":true`) || !strings.Contains(body, `"unitPriceCny":2.2`) || !strings.Contains(body, `"defaultOutputQualityMode":"compatible"`) || !strings.Contains(body, `"status":"available"`) || !strings.Contains(body, `"defaultProcessingMode":"fast"`) || !strings.Contains(body, `"unitPriceCny":0.5`) || strings.Contains(body, "secret-") || strings.Contains(body, "private-bucket") {
		t.Fatalf("body=%s", body)
	}
}

func TestVideoUpscaleCreateInputUsesInterpolationModeFormField(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/video-upscale/jobs", strings.NewReader(""))
	request.Form = map[string][]string{"interpolationMode": {"medium"}, "provider": {"tencent-mps"}, "enhancementScene": {"comic"}, "tencentTemplateId": {"400001"}}
	input := videoUpscaleCreateInputFromRequest(request)
	if input.InterpolationMode != "medium" || input.Provider != "tencent-mps" || input.EnhancementScene != "comic" || input.TencentTemplateID != 400001 {
		t.Fatalf("input=%#v", input)
	}
}

func TestVideoUpscalePreserveAudioFormValue(t *testing.T) {
	for _, item := range []struct {
		raw     string
		want    bool
		wantErr bool
	}{
		{"", true, false},
		{"true", true, false},
		{"false", false, false},
		{"yes", false, true},
	} {
		got, err := videoUpscalePreserveAudio(item.raw)
		if got != item.want || (err != nil) != item.wantErr {
			t.Fatalf("raw=%q got=%v err=%v", item.raw, got, err)
		}
	}
}

func TestVideoUpscaleJobResponseHidesPrivatePaths(t *testing.T) {
	setupVideoUpscaleHandlerTestDB(t)
	_, err := repository.SaveVideoUpscaleJob(model.VideoUpscaleJob{ID: "job-1", UserID: "user-a", InputPath: "/private/input.mp4", InputTOSURL: "tos://private-bucket/input.mp4", OutputTOSPath: "tos://private-bucket/output/", ResultSourceURL: "tos://private-bucket/output/result.mp4", Status: model.VideoUpscaleJobStatusProcessing})
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
	if strings.Contains(body, "/private/input.mp4") || strings.Contains(body, "private-bucket") {
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
