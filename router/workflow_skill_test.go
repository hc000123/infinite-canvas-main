package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSkillAdminEndpointsRejectAnonymousUser(t *testing.T) {
	for _, item := range []struct {
		method string
		path   string
	}{{http.MethodGet, "/api/v1/admin/skills"}, {http.MethodDelete, "/api/v1/admin/skills/system-skill"}} {
		request := httptest.NewRequest(item.method, item.path, nil)
		recorder := httptest.NewRecorder()
		New().ServeHTTP(recorder, request)
		if !strings.Contains(recorder.Body.String(), `"code":1001`) || strings.Contains(recorder.Body.String(), "接口不存在") {
			t.Fatalf("%s %s body=%s", item.method, item.path, recorder.Body.String())
		}
	}
}
