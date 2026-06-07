package router

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/gin-gonic/gin"
)

func TestVolcengineVideoReviewRouteExists(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/volcengine/assets/video-review", nil)
	app.ServeHTTP(recorder, request)

	if recorder.Code == http.StatusNotFound {
		t.Fatalf("video review route returned 404: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "未登录或权限不足") {
		t.Fatalf("video review route did not reach auth middleware: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestUploadedAssetsUseNoSniffHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	config.Cfg.PublicAssetDir = t.TempDir()
	t.Cleanup(func() {
		config.Cfg.PublicAssetDir = oldPublicAssetDir
	})
	if err := os.WriteFile(filepath.Join(config.Cfg.PublicAssetDir, "asset.txt"), []byte("asset"), 0644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}
	app := New()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/uploaded-assets/asset.txt", nil)
	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", recorder.Code, recorder.Body.String())
	}
	if header := recorder.Header().Get("X-Content-Type-Options"); header != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", header)
	}
}
