package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestArtifactInvocationRoutesRequireAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	routes := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/api/v1/artifacts"},
		{http.MethodGet, "/api/v1/artifacts"},
		{http.MethodGet, "/api/v1/artifacts/artifact-1"},
		{http.MethodPost, "/api/v1/invocations"},
		{http.MethodGet, "/api/v1/invocations"},
		{http.MethodGet, "/api/v1/invocations/invocation-1"},
		{http.MethodPost, "/api/v1/invocations/invocation-1/repreflight"},
		{http.MethodPost, "/api/v1/invocations/invocation-1/confirm"},
		{http.MethodPost, "/api/v1/invocations/invocation-1/cancel"},
		{http.MethodPost, "/api/v1/invocations/invocation-1/retry"},
		{http.MethodPost, "/api/v1/invocations/invocation-1/revalidate"},
		{http.MethodPost, "/api/v1/invocations/invocation-1/review"},
		{http.MethodPost, "/api/v1/invocations/invocation-1/apply"},
		{http.MethodGet, "/api/v1/invocations/invocation-1/events"},
	}
	for _, route := range routes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			app.ServeHTTP(recorder, httptest.NewRequest(route.method, route.path, nil))
			if recorder.Code == http.StatusNotFound || strings.Contains(recorder.Body.String(), "接口不存在") {
				t.Fatalf("route missing: status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if !strings.Contains(recorder.Body.String(), "未登录或权限不足") {
				t.Fatalf("route did not reach auth middleware: status=%d body=%s", recorder.Code, recorder.Body.String())
			}
		})
	}
}
