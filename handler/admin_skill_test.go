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
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
)

func TestAdminSkillFolderImportAndSourcePreview(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{"stageKey": "script", "folderName": "Seedance", "name": "确认后系统 Skill", "summary": "", "version": ""} {
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
	if json.Unmarshal(recorder.Body.Bytes(), &response) != nil || response.Data.Version.ID == "" || response.Data.Skill.Name != "确认后系统 Skill" || response.Data.Skill.Summary != "" || response.Data.Version.Version != "1.0.0" {
		t.Fatalf("body=%s", recorder.Body.String())
	}
	var versionBody bytes.Buffer
	versionWriter := multipart.NewWriter(&versionBody)
	_ = versionWriter.WriteField("folderName", "Seedance")
	_ = versionWriter.WriteField("version", "")
	_ = versionWriter.WriteField("paths", "Seedance/SKILL.md")
	versionPart, _ := versionWriter.CreateFormFile("files", "SKILL.md")
	_, _ = versionPart.Write([]byte("---\nversion: 8.8.8\n---\n# V2"))
	_ = versionWriter.Close()
	versionRequest := httptest.NewRequest(http.MethodPost, "/api/v1/admin/skills/"+response.Data.Skill.ID+"/import-version", &versionBody)
	versionRequest.Header.Set("Content-Type", versionWriter.FormDataContentType())
	versionRequest = versionRequest.WithContext(request.Context())
	versionRecorder := httptest.NewRecorder()
	AdminImportSkillFolderVersion(versionRecorder, versionRequest, response.Data.Skill.ID)
	var versionResponse struct {
		Data model.SkillVersion `json:"data"`
	}
	if json.Unmarshal(versionRecorder.Body.Bytes(), &versionResponse) != nil || versionResponse.Data.Version != "1.0.1" {
		t.Fatalf("version body=%s", versionRecorder.Body.String())
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
	if previewRecorder.Header().Get("X-Content-Type-Options") != "nosniff" || previewRecorder.Header().Get("Cache-Control") != "no-store" || previewRecorder.Header().Get("Content-Security-Policy") != "default-src 'none'" {
		t.Fatalf("unsafe preview headers=%v", previewRecorder.Header())
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
	created, err := service.ImportManagedSkillFolder("admin-1", true, service.SkillFolderImportInput{StageKey: "script", Snapshot: snapshot})
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

func TestAdminCanDeleteDraftAndArchivePublishedSkillVersions(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	snapshot, err := service.ParseSkillFolder("draft", []service.SkillFolderFile{{Path: "SKILL.md", Data: []byte("# Rules")}})
	if err != nil {
		t.Fatal(err)
	}
	created, err := service.ImportManagedSkillFolder("admin-1", true, service.SkillFolderImportInput{StageKey: "script", Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	adminContext := service.WithUser(context.Background(), model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin})
	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/skill-versions/"+created.Version.ID, nil).WithContext(adminContext)
	deleteRecorder := httptest.NewRecorder()
	AdminDeleteSkillVersion(deleteRecorder, deleteRequest, created.Version.ID)
	if !strings.Contains(deleteRecorder.Body.String(), `"code":0`) {
		t.Fatalf("delete body=%s", deleteRecorder.Body.String())
	}
	if _, ok, err := repository.GetSkillVersion(created.Version.ID); err != nil || ok {
		t.Fatalf("deleted version ok=%v err=%v", ok, err)
	}

	if err := service.EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	versionID := "skill-version-system-workflow-script-3.2.0"
	publishedDeleteRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/skill-versions/"+versionID, nil).WithContext(adminContext)
	publishedDeleteRecorder := httptest.NewRecorder()
	AdminDeleteSkillVersion(publishedDeleteRecorder, publishedDeleteRequest, versionID)
	if !strings.Contains(publishedDeleteRecorder.Body.String(), `"code":1`) || !strings.Contains(publishedDeleteRecorder.Body.String(), "只能删除未发布草稿版本") {
		t.Fatalf("published delete body=%s", publishedDeleteRecorder.Body.String())
	}
	archiveRequest := httptest.NewRequest(http.MethodPost, "/api/v1/admin/skill-versions/"+versionID+"/archive", nil).WithContext(adminContext)
	archiveRecorder := httptest.NewRecorder()
	AdminArchiveSkillVersion(archiveRecorder, archiveRequest, versionID)
	if !strings.Contains(archiveRecorder.Body.String(), `"code":0`) || !strings.Contains(archiveRecorder.Body.String(), `"status":"archived"`) {
		t.Fatalf("archive body=%s", archiveRecorder.Body.String())
	}
	version, ok, err := repository.GetSkillVersion(versionID)
	if err != nil || !ok || version.Status != model.SkillVersionArchived {
		t.Fatalf("archived version=%+v ok=%v err=%v", version, ok, err)
	}
}

func TestAdminCanDeleteUnpublishedSkillDefinition(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureCoreArtifactSchemas(); err != nil {
		t.Fatal(err)
	}
	snapshot, err := service.ParseSkillFolder("draft", []service.SkillFolderFile{{Path: "SKILL.md", Data: []byte("# Rules")}})
	if err != nil {
		t.Fatal(err)
	}
	created, err := service.ImportManagedSkillFolder("admin-1", true, service.SkillFolderImportInput{StageKey: "script", Snapshot: snapshot})
	if err != nil {
		t.Fatal(err)
	}
	adminContext := service.WithUser(context.Background(), model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin})
	request := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/skills/"+created.Skill.ID, nil).WithContext(adminContext)
	recorder := httptest.NewRecorder()

	AdminDeleteSkill(recorder, request, created.Skill.ID)

	if !strings.Contains(recorder.Body.String(), `"code":0`) || !strings.Contains(recorder.Body.String(), `"deleted":true`) {
		t.Fatalf("body=%s", recorder.Body.String())
	}
	if _, ok, err := repository.GetSkillDefinition(created.Skill.ID); err != nil || ok {
		t.Fatalf("definition ok=%v err=%v", ok, err)
	}
	if _, ok, err := repository.GetSkillVersion(created.Version.ID); err != nil || ok {
		t.Fatalf("version ok=%v err=%v", ok, err)
	}
}

func TestAdminSkillSensitiveReadsAndDeletesRequireAdminContext(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	contextValue := service.WithUser(context.Background(), model.AuthUser{ID: "user-1", Role: model.UserRoleUser})
	for _, item := range []struct {
		name string
		call func(http.ResponseWriter, *http.Request)
	}{
		{name: "delete definition", call: func(w http.ResponseWriter, r *http.Request) { AdminDeleteSkill(w, r, "skill-1") }},
		{name: "read evaluation", call: func(w http.ResponseWriter, r *http.Request) { AdminSkillEvaluation(w, r, "evaluation-1") }},
	} {
		t.Run(item.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/api/v1/admin/skills", nil).WithContext(contextValue)
			recorder := httptest.NewRecorder()
			item.call(recorder, request)
			if !strings.Contains(recorder.Body.String(), `"code":1`) || !strings.Contains(recorder.Body.String(), "未登录或权限不足") {
				t.Fatalf("body=%s", recorder.Body.String())
			}
		})
	}
}

func TestAdminCannotArchiveBoundSkillVersion(t *testing.T) {
	setupWorkflowHandlerTestDB(t)
	if err := service.EnsureSkillSeeds(); err != nil {
		t.Fatal(err)
	}
	skillID := "skill-system-workflow-script"
	beforeSkill, ok, err := repository.GetSkillDefinition(skillID)
	if err != nil || !ok || beforeSkill.RecommendedVersionID == "" {
		t.Fatalf("skill=%+v ok=%v err=%v", beforeSkill, ok, err)
	}
	versionID := beforeSkill.RecommendedVersionID
	if err := repository.UpsertWorkflowStageSkillBinding(model.WorkflowStageSkillBinding{
		ID: "bound-archive", StageKey: "script", Scope: model.WorkflowStageSkillScopeProject, ScopeID: "project-bound", SkillVersionID: versionID,
	}); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/skill-versions/"+versionID+"/archive", nil)
	request = request.WithContext(service.WithUser(context.Background(), model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}))
	recorder := httptest.NewRecorder()

	AdminArchiveSkillVersion(recorder, request, versionID)

	if !strings.Contains(recorder.Body.String(), `"code":1`) || !strings.Contains(recorder.Body.String(), "Skill 版本仍被已发布 Workflow、Agent 或工作流阶段绑定引用，不能归档") {
		t.Fatalf("body=%s", recorder.Body.String())
	}
	version, ok, err := repository.GetSkillVersion(versionID)
	if err != nil || !ok || version.Status != model.SkillVersionPublished {
		t.Fatalf("version=%+v ok=%v err=%v", version, ok, err)
	}
	afterSkill, ok, err := repository.GetSkillDefinition(skillID)
	if err != nil || !ok || afterSkill.RecommendedVersionID != beforeSkill.RecommendedVersionID {
		t.Fatalf("before=%+v after=%+v ok=%v err=%v", beforeSkill, afterSkill, ok, err)
	}
	binding, ok, err := repository.ResolveWorkflowStageSkillBinding("script", "project-bound")
	if err != nil || !ok || binding.SkillVersionID != versionID {
		t.Fatalf("binding=%+v ok=%v err=%v", binding, ok, err)
	}
}
