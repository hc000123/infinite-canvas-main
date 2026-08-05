package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func TestAdminSkillFolderImportAndSourcePreview(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{"ownerType": "system", "stageKey": "script", "folderName": "Seedance", "name": "确认后系统 Skill", "summary": "确认后系统用途", "version": "2.6.0"} {
		_ = writer.WriteField(key, value)
	}
	for path, content := range map[string]string{"Seedance/SKILL.md": "---\nname: frontmatter 原名\ndescription: frontmatter 原说明\nversion: 9.9.9\n---\n# Rules", "Seedance/rules/preserve.md": "保留全部台词"} {
		_ = writer.WriteField("paths", path)
		part, err := writer.CreateFormFile("files", path)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = part.Write([]byte(content))
	}
	_ = writer.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/skills/import-folder", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}))
	recorder := httptest.NewRecorder()
	AdminImportSkillFolder(recorder, request)
	if !strings.Contains(recorder.Body.String(), `"code":0`) || !strings.Contains(recorder.Body.String(), `"stageKey":"script"`) {
		t.Fatalf("body=%s", recorder.Body.String())
	}
	var response struct {
		Data struct {
			Skill   model.SkillDefinition `json:"skill"`
			Version model.SkillVersion    `json:"version"`
		} `json:"data"`
	}
	if json.Unmarshal(recorder.Body.Bytes(), &response) != nil || response.Data.Version.ID == "" || response.Data.Skill.Name != "确认后系统 Skill" || response.Data.Skill.Summary != "确认后系统用途" || response.Data.Version.Version != "2.6.0" {
		t.Fatalf("body=%s", recorder.Body.String())
	}
	indexRecorder := httptest.NewRecorder()
	AdminSkillSourceFiles(indexRecorder, request, response.Data.Version.ID)
	if !strings.Contains(indexRecorder.Body.String(), "rules/preserve.md") || strings.Contains(indexRecorder.Body.String(), "SourceArchiveBlob") {
		t.Fatalf("index=%s", indexRecorder.Body.String())
	}
	previewRequest := httptest.NewRequest(http.MethodGet, "/api/v1/admin/skill-versions/x/source-file?path=rules%2Fpreserve.md", nil)
	previewRequest = previewRequest.WithContext(request.Context())
	previewRecorder := httptest.NewRecorder()
	AdminSkillSourceFile(previewRecorder, previewRequest, response.Data.Version.ID)
	if !strings.Contains(previewRecorder.Body.String(), "保留全部台词") {
		t.Fatalf("preview=%s", previewRecorder.Body.String())
	}
}

func TestAdminSkillStageTemplates(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	recorder := httptest.NewRecorder()
	AdminSkillStageTemplates(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/admin/skill-stage-templates", nil))
	if !strings.Contains(recorder.Body.String(), `"key":"script"`) || !strings.Contains(recorder.Body.String(), `"fixedAdapter"`) {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}

func TestAdminStandaloneSkillTrialDoesNotRequireWorkflowRun(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	snapshot, _ := service.ParseSkillFolder("剧本优化", []service.SkillFolderFile{{Path: "SKILL.md", Data: []byte("# Rules")}})
	created, err := service.ImportManagedSkillFolder("admin-1", true, service.SkillFolderImportInput{OwnerType: model.SkillOwnerSystem, StageKey: "script", Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/skill-versions/"+created.Version.ID+"/trials", strings.NewReader(`{}`))
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}))
	recorder := httptest.NewRecorder()
	AdminTrialSkillVersion(recorder, request, created.Version.ID)
	if !strings.Contains(recorder.Body.String(), `"code":1`) || !strings.Contains(recorder.Body.String(), "输入") || strings.Contains(recorder.Body.String(), "workflowRunId") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}

func TestPublishedSkillVersionCannotBePatched(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	resolved, err := service.ResolveWorkflowStageSkill("admin-1", service.WorkflowSkillStageArt, "", "")
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
