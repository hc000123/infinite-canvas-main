package handler_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func TestProjectSkillHTTPIsolatesOwnersAndCopiesSystemSkill(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	ownerToken := registerAndLoginInvocationHTTPUser(t, app, "project-skill-owner")
	strangerToken := registerAndLoginInvocationHTTPUser(t, app, "project-skill-stranger")

	seeded := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/skills?projectId=project-http", ownerToken, nil)
	if seeded.Code != 0 || !strings.Contains(seeded.Raw, "skill-system-workflow-script") {
		t.Fatalf("seeded response=%s", seeded.Raw)
	}
	copiedResponse := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/skills/skill-system-workflow-script/copy", ownerToken, map[string]any{"projectId": "project-http", "name": "项目剧本副本", "version": "1.0.0"})
	if copiedResponse.Code != 0 {
		t.Fatalf("copy response=%s", copiedResponse.Raw)
	}
	var copied service.ResolvedSkill
	decodeInvocationHTTPData(t, copiedResponse, &copied)
	if copied.Skill.OwnerType != model.SkillOwnerProject || copied.Skill.OwnerProjectID != "project-http" || copied.Version.Status != model.SkillVersionDraft {
		t.Fatalf("copied=%+v", copied)
	}
	foreign := invocationHTTPCall(t, app, http.MethodPatch, "/api/v1/skills/"+copied.Skill.ID, strangerToken, map[string]any{"name": "越权改名"})
	if foreign.Code == 0 {
		t.Fatalf("stranger update succeeded: %s", foreign.Raw)
	}
	ownerList := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/skills?projectId=project-http", ownerToken, nil)
	if ownerList.Code != 0 || !strings.Contains(ownerList.Raw, copied.Skill.ID) {
		t.Fatalf("owner list=%s", ownerList.Raw)
	}
	deletedVersion := invocationHTTPCall(t, app, http.MethodDelete, "/api/v1/skill-versions/"+copied.Version.ID, ownerToken, nil)
	if deletedVersion.Code != 0 {
		t.Fatalf("delete version=%s", deletedVersion.Raw)
	}
	deletedSkill := invocationHTTPCall(t, app, http.MethodDelete, "/api/v1/skills/"+copied.Skill.ID, ownerToken, nil)
	if deletedSkill.Code != 0 {
		t.Fatalf("delete skill=%s", deletedSkill.Raw)
	}
}
