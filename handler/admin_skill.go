package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type skillCreateInput struct {
	Name           string               `json:"name"`
	Summary        string               `json:"summary"`
	OwnerType      model.SkillOwnerType `json:"ownerType"`
	OwnerProjectID string               `json:"ownerProjectId"`
	Version        string               `json:"version"`
	Package        service.SkillPackage `json:"package"`
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
	result, err := service.CreateSkill(admin.ID, input.OwnerType, input.OwnerProjectID, input.Name, input.Summary, service.SkillDraftInput{Version: input.Version, Package: input.Package})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUpdateSkill(w http.ResponseWriter, r *http.Request, id string) {
	var input skillUpdateInput
	if !decodeWorkflowBody(w, r, &input, 64<<10) {
		return
	}
	result, err := service.UpdateSkillDefinition(id, input.Name, input.Summary, input.Enabled)
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
	result, err := service.CreateSkillDraft(admin.ID, skillID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSkillVersion(w http.ResponseWriter, _ *http.Request, id string) {
	version, packageValue, err := service.GetSkillVersionPackage(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"version": version, "package": packageValue})
}

func AdminUpdateSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	var input service.SkillDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.UpdateSkillDraft(id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminValidateSkillVersion(w http.ResponseWriter, _ *http.Request, id string) {
	version, packageValue, err := service.GetSkillVersionPackage(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"valid": true, "versionId": version.ID, "contentHash": packageValue.ContentHash})
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
	result, err := service.EvaluateSkill(admin.ID, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSkillEvaluation(w http.ResponseWriter, _ *http.Request, id string) {
	result, err := service.GetSkillEvaluationResult(id)
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
	result, err := service.PublishSkillVersion(admin.ID, id)
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
	result, err := service.RecommendPublishedSkillVersion(admin.ID, skillID, input.SkillVersionID)
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
