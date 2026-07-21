package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func TestPublishedWorkflowSkillCannotBePatched(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureWorkflowSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPatch, "/api/v1/admin/workflow-skill-versions/workflow-skill-version-art-1.0.0", strings.NewReader(`{"files":{"SKILL.md":"changed"},"contract":{}}`))
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}))
	recorder := httptest.NewRecorder()

	AdminUpdateWorkflowSkillVersion(recorder, request, "workflow-skill-version-art-1.0.0")

	if !strings.Contains(recorder.Body.String(), `"code":1`) || !strings.Contains(recorder.Body.String(), "已发布版本不可修改") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}
