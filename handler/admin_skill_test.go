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

func TestPublishedSkillVersionCannotBePatched(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	resolved, err := service.ResolveWorkflowStageSkill(service.WorkflowSkillStageArt, "", "")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPatch, "/api/v1/admin/skill-versions/"+resolved.Version.ID, strings.NewReader(`{"version":"3.0.1","package":{}}`))
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}))
	recorder := httptest.NewRecorder()

	AdminUpdateSkillVersion(recorder, request, resolved.Version.ID)

	if !strings.Contains(recorder.Body.String(), `"code":1`) || !strings.Contains(recorder.Body.String(), "已发布版本不可修改") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}
