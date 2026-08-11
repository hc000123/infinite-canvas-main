package handler

import (
	"io"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

const skillFolderRequestMaxBytes = 34 << 20

type skillCreateInput struct {
	Name    string               `json:"name"`
	Summary string               `json:"summary"`
	Version string               `json:"version"`
	Package service.SkillPackage `json:"package"`
}

type skillUpdateInput struct {
	Name    string `json:"name"`
	Summary string `json:"summary"`
	Enabled *bool  `json:"enabled"`
}

func AdminSkills(w http.ResponseWriter, _ *http.Request) {
	items, err := service.ListSkillAdminItems()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func AdminCreateSkill(w http.ResponseWriter, r *http.Request) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input skillCreateInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.CreateManagedSystemSkill(admin.ID, true, input.Name, input.Summary, service.SkillDraftInput{Version: input.Version, Package: input.Package})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSkillStageTemplates(w http.ResponseWriter, _ *http.Request) {
	OK(w, service.ListSkillStageTemplates())
}

func AdminImportSkillFolder(w http.ResponseWriter, r *http.Request) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	snapshot, values, ok := decodeSkillFolderMultipart(w, r)
	if !ok {
		return
	}
	result, err := service.ImportManagedSkillFolder(admin.ID, true, service.SkillFolderImportInput{
		StageKey: values.Get("stageKey"),
		Name: values.Get("name"), Summary: values.Get("summary"), SummaryProvided: values.Has("summary"),
		Version: values.Get("version"), VersionProvided: values.Has("version"), Snapshot: snapshot,
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminImportSkillFolderVersion(w http.ResponseWriter, r *http.Request, skillID string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	snapshot, values, ok := decodeSkillFolderMultipart(w, r)
	if !ok {
		return
	}
	result, err := service.ImportOwnedSkillFolderVersion(admin.ID, true, skillID, values.Get("version"), values.Has("version"), snapshot)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSkillSourceFiles(w http.ResponseWriter, r *http.Request, versionID string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetManagedSkillSourceFiles(admin.ID, versionID, true)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSkillSourceFile(w http.ResponseWriter, r *http.Request, versionID string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	filePath := strings.TrimSpace(r.URL.Query().Get("path"))
	result, err := service.GetManagedSkillSourceText(admin.ID, versionID, filePath, true)
	if err != nil {
		FailError(w, err)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'")
	OK(w, map[string]string{"path": filePath, "content": result})
}

func decodeSkillFolderMultipart(w http.ResponseWriter, r *http.Request) (service.SkillFolderSnapshot, mapValues, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, skillFolderRequestMaxBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		Fail(w, "Skill 文件夹上传失败或超过大小限制")
		return service.SkillFolderSnapshot{}, nil, false
	}
	defer r.MultipartForm.RemoveAll()
	paths, headers := r.MultipartForm.Value["paths"], r.MultipartForm.File["files"]
	if len(paths) == 0 || len(paths) != len(headers) {
		Fail(w, "Skill 文件清单与路径不一致")
		return service.SkillFolderSnapshot{}, nil, false
	}
	files := make([]service.SkillFolderFile, 0, len(headers))
	for index, header := range headers {
		opened, err := header.Open()
		if err != nil {
			Fail(w, "读取 Skill 文件失败")
			return service.SkillFolderSnapshot{}, nil, false
		}
		content, readErr := io.ReadAll(opened)
		_ = opened.Close()
		if readErr != nil {
			Fail(w, "读取 Skill 文件失败")
			return service.SkillFolderSnapshot{}, nil, false
		}
		files = append(files, service.SkillFolderFile{Path: paths[index], Data: content})
	}
	snapshot, err := service.ParseSkillFolder(r.FormValue("folderName"), files)
	if err != nil {
		FailError(w, err)
		return service.SkillFolderSnapshot{}, nil, false
	}
	return snapshot, mapValues(r.MultipartForm.Value), true
}

type mapValues map[string][]string

func (values mapValues) Get(key string) string {
	if len(values[key]) == 0 {
		return ""
	}
	return values[key][0]
}

func (values mapValues) Has(key string) bool {
	_, ok := values[key]
	return ok
}

func AdminUpdateSkill(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input skillUpdateInput
	if !decodeWorkflowBody(w, r, &input, 64<<10) {
		return
	}
	result, err := service.UpdateOwnedSkillDefinition(admin.ID, true, id, input.Name, input.Summary, input.Enabled)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminCreateSkillVersion(w http.ResponseWriter, r *http.Request, skillID string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.SkillDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.CreateOwnedSkillDraft(admin.ID, true, skillID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	version, packageValue, err := service.GetManagedSkillVersionPackage(admin.ID, id, true)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"version": version, "package": packageValue})
}

func AdminUpdateSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.SkillDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.UpdateOwnedSkillDraft(admin.ID, true, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.DeleteOwnedSkillVersion(admin.ID, true, id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]bool{"deleted": true})
}

func AdminDeleteSkill(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.DeleteOwnedSkillDefinition(admin.ID, true, id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]bool{"deleted": true})
}

func AdminValidateSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.ValidateOwnedSkillVersion(admin.ID, true, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminEvaluateSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.SkillEvaluationInput
	if !decodeWorkflowBody(w, r, &input, 128<<10) {
		return
	}
	result, err := service.EvaluateOwnedSkillVersion(admin.ID, true, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminTrialSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.SkillTrialInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.TrialOwnedSkillVersion(admin.ID, true, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSkillTrial(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetManagedSkillTrialResult(admin.ID, id, true)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSkillEvaluation(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetManagedSkillEvaluationResult(admin.ID, id, true)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminPublishSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.PublishOwnedSkillVersion(admin.ID, true, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminArchiveSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.ArchiveOwnedSkillVersion(admin.ID, true, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminRecommendSkillVersion(w http.ResponseWriter, r *http.Request, skillID string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input struct {
		SkillVersionID string `json:"skillVersionId"`
	}
	if !decodeWorkflowBody(w, r, &input, 32<<10) {
		return
	}
	result, err := service.RecommendOwnedSkillVersion(admin.ID, true, skillID, input.SkillVersionID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminWorkflowStageSkillBindings(w http.ResponseWriter, _ *http.Request, stageKey string) {
	items, err := service.ListWorkflowStageSkillBindings(stageKey)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func AdminUpdateWorkflowStageSkillBinding(w http.ResponseWriter, r *http.Request, stageKey string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.WorkflowStageSkillBindingInput
	if !decodeWorkflowBody(w, r, &input, 32<<10) {
		return
	}
	result, err := service.UpdateWorkflowStageSkillBinding(admin.ID, stageKey, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func skillAdmin(r *http.Request) (model.AuthUser, bool) {
	user, ok := service.UserFromContext(r.Context())
	return user, ok && model.IsAdminRole(user.Role)
}
