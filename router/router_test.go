package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
