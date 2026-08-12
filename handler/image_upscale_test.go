package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func TestImageUpscaleCapabilitiesDoNotExposeCredentials(t *testing.T) {
	old := config.Cfg
	config.Cfg.ImageUpscaleProvider = "aliyun"
	config.Cfg.AlibabaCloudAccessKeyID = "secret-id"
	config.Cfg.AlibabaCloudAccessKeySecret = "secret-value"
	t.Cleanup(func() { config.Cfg = old })

	request := httptest.NewRequest(http.MethodGet, "/api/v1/image-upscale/capabilities", nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-a", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()
	ImageUpscaleCapabilities(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"cloudProcessing":true`) || strings.Contains(recorder.Body.String(), "secret-") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}

func TestCreateImageUpscaleJobParsesMultipartAndRejectsInvalidScale(t *testing.T) {
	old := config.Cfg
	config.Cfg.ImageUpscaleProvider = "aliyun"
	config.Cfg.AlibabaCloudAccessKeyID = "test-id"
	config.Cfg.AlibabaCloudAccessKeySecret = "test-secret"
	t.Cleanup(func() { config.Cfg = old })

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	file, _ := writer.CreateFormFile("file", "source.png")
	_, _ = file.Write([]byte("not-used-because-scale-is-invalid"))
	_ = writer.WriteField("scale", "3")
	_ = writer.WriteField("canvasId", "canvas-1")
	_ = writer.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/image-upscale/jobs", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-a", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()
	CreateImageUpscaleJob(recorder, request)
	var response response
	_ = json.Unmarshal(recorder.Body.Bytes(), &response)
	if response.Code == 0 || !strings.Contains(response.Msg, "2× 或 4×") {
		t.Fatalf("response=%#v body=%s", response, recorder.Body.String())
	}
}
