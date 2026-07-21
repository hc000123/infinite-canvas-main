package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWorkflowSkillAdminEndpointsRejectAnonymousUser(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/admin/workflow-skills", nil)
	recorder := httptest.NewRecorder()
	New().ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), "未登录或权限不足") || strings.Contains(recorder.Body.String(), "接口不存在") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}
