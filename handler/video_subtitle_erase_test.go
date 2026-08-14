package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestVideoSubtitleEraseCapabilitiesHidePrivateConfiguration(t *testing.T) {
	setupVideoUpscaleHandlerTestDB(t)
	_, err := repository.SaveSettings(model.Settings{Private: model.PrivateSetting{
		VolcengineAsset: model.VolcengineAssetSetting{AccessKey: "secret-ak", SecretKey: "secret-sk"},
		VideoUpscale:    model.VideoUpscaleSetting{Enabled: true, SubtitleEraseEnabled: true, Provider: "volcengine-las", APIKey: "secret-las-key", OutputTOSPath: "tos://private-bucket/output/"},
	}}, "now")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/video-subtitle-erase/capabilities", nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-a", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()
	VideoSubtitleEraseCapabilities(recorder, request)
	body := recorder.Body.String()
	if recorder.Code != http.StatusOK || !strings.Contains(body, `"cloudProcessing":true`) || !strings.Contains(body, `"unitPriceCny":0.4`) || strings.Contains(body, "secret-") || strings.Contains(body, "private-bucket") {
		t.Fatalf("body=%s", body)
	}
}

func TestVideoSubtitleEraseJobResponseHidesPrivatePathsAndToken(t *testing.T) {
	setupVideoUpscaleHandlerTestDB(t)
	_, err := repository.SaveVideoSubtitleEraseJob(model.VideoSubtitleEraseJob{ID: "erase-1", UserID: "user-a", InputPath: "/private/input.mp4", InputTOSURL: "tos://private-bucket/input.mp4", ResultSourceURL: "https://signed.example/result.mp4?secret=value", ClientToken: "private-token", Status: model.VideoSubtitleEraseJobStatusProcessing})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/video-subtitle-erase/jobs/erase-1", nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "user-a", Role: model.UserRoleUser}))
	recorder := httptest.NewRecorder()
	VideoSubtitleEraseJob(recorder, request, "erase-1")
	body := recorder.Body.String()
	for _, forbidden := range []string{"/private/input.mp4", "private-bucket", "signed.example", "private-token"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("private field %q leaked: %s", forbidden, body)
		}
	}
}

func TestVideoSubtitleEraseCreateInputReadsSourceCoordinates(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/video-subtitle-erase/jobs", strings.NewReader(""))
	request.Form = map[string][]string{"projectId": {"project-1"}, "canvasId": {"canvas-1"}, "sourceNodeId": {"node-1"}, "sourceAssetId": {"asset-1"}}
	input := videoSubtitleEraseCreateInputFromRequest(request)
	if input.ProjectID != "project-1" || input.CanvasID != "canvas-1" || input.SourceNodeID != "node-1" || input.SourceAssetID != "asset-1" {
		t.Fatalf("input=%#v", input)
	}
}
