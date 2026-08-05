package handler_test

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
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

func TestProjectSkillFolderImportSourceAndStandaloneTrialRoutes(t *testing.T) {
	app := setupInvocationHTTPRouter(t)
	ownerToken := registerAndLoginInvocationHTTPUser(t, app, "project-folder-owner")
	strangerToken := registerAndLoginInvocationHTTPUser(t, app, "project-folder-stranger")
	templates := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/skill-stage-templates", ownerToken, nil)
	if templates.Code != 0 || !strings.Contains(templates.Raw, `"key":"script"`) {
		t.Fatalf("templates=%s", templates.Raw)
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{"projectId": "project-folder", "stageKey": "script", "folderName": "Script"} {
		_ = writer.WriteField(key, value)
	}
	_ = writer.WriteField("paths", "Script/SKILL.md")
	part, _ := writer.CreateFormFile("files", "SKILL.md")
	_, _ = part.Write([]byte("---\nname: 项目剧本 Skill\n---\n# Rules"))
	_ = writer.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/skills/import-folder", &body)
	request.Header.Set("Authorization", "Bearer "+ownerToken)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	recorder := httptest.NewRecorder()
	app.ServeHTTP(recorder, request)
	var response invocationHTTPResponse
	if json.Unmarshal(recorder.Body.Bytes(), &response) != nil || response.Code != 0 {
		t.Fatalf("import=%s", recorder.Body.String())
	}
	var created service.ResolvedSkill
	decodeInvocationHTTPData(t, response, &created)
	if created.Skill.OwnerType != model.SkillOwnerProject || created.Skill.OwnerProjectID != "project-folder" || created.Skill.StageKey != "script" {
		t.Fatalf("created=%+v", created)
	}
	source := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/skill-versions/"+created.Version.ID+"/source-files", ownerToken, nil)
	if source.Code != 0 || !strings.Contains(source.Raw, "SKILL.md") {
		t.Fatalf("source=%s", source.Raw)
	}
	foreign := invocationHTTPCall(t, app, http.MethodGet, "/api/v1/skill-versions/"+created.Version.ID+"/source-files", strangerToken, nil)
	if foreign.Code == 0 {
		t.Fatalf("stranger source=%s", foreign.Raw)
	}
	trial := invocationHTTPCall(t, app, http.MethodPost, "/api/v1/skill-versions/"+created.Version.ID+"/trials", ownerToken, map[string]any{})
	if trial.Code == 0 || !strings.Contains(trial.Raw, "输入") || strings.Contains(trial.Raw, "workflowRunId") {
		t.Fatalf("trial=%s", trial.Raw)
	}
}
