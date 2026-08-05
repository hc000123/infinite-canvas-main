package handler

import (
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type projectSkillCreateInput struct {
	ProjectID string               `json:"projectId"`
	Name      string               `json:"name"`
	Summary   string               `json:"summary"`
	Version   string               `json:"version"`
	Package   service.SkillPackage `json:"package"`
}

func Skills(w http.ResponseWriter, r *http.Request) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	items, err := service.ListManagedSkillItems(user.ID, r.URL.Query().Get("projectId"), isAdmin)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func SkillStageTemplates(w http.ResponseWriter, _ *http.Request) {
	OK(w, service.ListSkillStageTemplates())
}

func ImportProjectSkillFolder(w http.ResponseWriter, r *http.Request) {
	user, _, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	snapshot, values, ok := decodeSkillFolderMultipart(w, r)
	if !ok {
		return
	}
	result, err := service.ImportManagedSkillFolder(user.ID, false, service.SkillFolderImportInput{
		OwnerType: model.SkillOwnerProject, ProjectID: values.Get("projectId"), StageKey: values.Get("stageKey"),
		Name: values.Get("name"), Summary: values.Get("summary"), SummaryProvided: values.Has("summary"),
		Version: values.Get("version"), VersionProvided: values.Has("version"), Snapshot: snapshot,
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ImportProjectSkillFolderVersion(w http.ResponseWriter, r *http.Request, skillID string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	snapshot, values, ok := decodeSkillFolderMultipart(w, r)
	if !ok {
		return
	}
	result, err := service.ImportOwnedSkillFolderVersion(user.ID, isAdmin, skillID, values.Get("version"), values.Has("version"), snapshot)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func CreateProjectSkill(w http.ResponseWriter, r *http.Request) {
	user, _, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input projectSkillCreateInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.CreateOwnedProjectSkill(user.ID, input.ProjectID, input.Name, input.Summary, service.SkillDraftInput{Version: input.Version, Package: input.Package})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func UpdateProjectSkill(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input skillUpdateInput
	if !decodeWorkflowBody(w, r, &input, 64<<10) {
		return
	}
	result, err := service.UpdateOwnedSkillDefinition(user.ID, isAdmin, id, input.Name, input.Summary, input.Enabled)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func DeleteProjectSkill(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.DeleteOwnedSkillDefinition(user.ID, isAdmin, id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]bool{"deleted": true})
}

func CopySystemSkill(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input struct {
		ProjectID string `json:"projectId"`
		Name      string `json:"name"`
		Version   string `json:"version"`
	}
	if !decodeWorkflowBody(w, r, &input, 32<<10) {
		return
	}
	result, err := service.CopySystemSkillToProject(user.ID, isAdmin, id, input.ProjectID, input.Name, input.Version)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func CreateProjectSkillVersion(w http.ResponseWriter, r *http.Request, skillID string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.SkillDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.CreateOwnedSkillDraft(user.ID, isAdmin, skillID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ProjectSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	version, packageValue, err := service.GetManagedSkillVersionPackage(user.ID, id, isAdmin)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"version": version, "package": packageValue})
}

func ProjectSkillSourceFiles(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetManagedSkillSourceFiles(user.ID, id, isAdmin)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ProjectSkillSourceFile(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	path := strings.TrimSpace(r.URL.Query().Get("path"))
	result, err := service.GetManagedSkillSourceText(user.ID, id, path, isAdmin)
	if err != nil {
		FailError(w, err)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'")
	OK(w, map[string]string{"path": path, "content": result})
}

func UpdateProjectSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.SkillDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.UpdateOwnedSkillDraft(user.ID, isAdmin, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func DeleteProjectSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.DeleteOwnedSkillVersion(user.ID, isAdmin, id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]bool{"deleted": true})
}

func ValidateProjectSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.ValidateOwnedSkillVersion(user.ID, isAdmin, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func EvaluateProjectSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.SkillEvaluationInput
	if !decodeWorkflowBody(w, r, &input, 128<<10) {
		return
	}
	result, err := service.EvaluateOwnedSkillVersion(user.ID, isAdmin, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func TrialProjectSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.SkillTrialInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.TrialOwnedSkillVersion(user.ID, isAdmin, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ProjectSkillTrial(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetManagedSkillTrialResult(user.ID, id, isAdmin)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func PublishProjectSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.PublishOwnedSkillVersion(user.ID, isAdmin, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ArchiveProjectSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, isAdmin, ok := skillActor(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.ArchiveOwnedSkillVersion(user.ID, isAdmin, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func RecommendProjectSkillVersion(w http.ResponseWriter, r *http.Request, skillID string) {
	user, isAdmin, ok := skillActor(r)
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
	result, err := service.RecommendOwnedSkillVersion(user.ID, isAdmin, skillID, input.SkillVersionID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func skillActor(r *http.Request) (model.AuthUser, bool, bool) {
	user, ok := service.UserFromContext(r.Context())
	return user, ok && model.IsAdminRole(user.Role), ok
}
