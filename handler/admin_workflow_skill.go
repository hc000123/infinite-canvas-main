package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type workflowSkillUpdateInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Enabled     *bool  `json:"enabled"`
}

func AdminWorkflowSkills(w http.ResponseWriter, r *http.Request) {
	items, err := service.ListWorkflowSkillAdminItems()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func AdminUpdateWorkflowSkill(w http.ResponseWriter, r *http.Request, id string) {
	var input workflowSkillUpdateInput
	if !decodeWorkflowBody(w, r, &input, 64<<10) {
		return
	}
	result, err := service.UpdateWorkflowSkill(id, input.Name, input.Description, input.Enabled)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminCreateWorkflowSkillVersion(w http.ResponseWriter, r *http.Request, skillID string) {
	admin, ok := service.UserFromContext(r.Context())
	if !ok || admin.Role != model.UserRoleAdmin {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.WorkflowSkillDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.CreateWorkflowSkillDraft(admin.ID, skillID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminWorkflowSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	version, packageValue, err := service.GetWorkflowSkillVersionPackage(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"version": version, "package": packageValue})
}

func AdminUpdateWorkflowSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	var input service.WorkflowSkillDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.UpdateWorkflowSkillDraft(id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminValidateWorkflowSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	version, packageValue, err := service.GetWorkflowSkillVersionPackage(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"valid": true, "versionId": version.ID, "contentHash": packageValue.ContentHash})
}

func AdminPublishWorkflowSkillVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := service.UserFromContext(r.Context())
	if !ok || admin.Role != model.UserRoleAdmin {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.WorkflowSkillPublishInput
	if !decodeWorkflowBody(w, r, &input, 32<<10) {
		return
	}
	result, err := service.PublishWorkflowSkillVersion(admin.ID, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminWorkflowStageSkillBindings(w http.ResponseWriter, r *http.Request, stageKey string) {
	items, err := service.ListWorkflowSkillAdminItems()
	if err != nil {
		FailError(w, err)
		return
	}
	for _, item := range items {
		if item.Skill.StageKey == stageKey {
			OK(w, item.Bindings)
			return
		}
	}
	Fail(w, "工作流阶段不存在")
}

func AdminUpdateWorkflowStageSkillBinding(w http.ResponseWriter, r *http.Request, stageKey string) {
	var input struct {
		Scope          string `json:"scope"`
		ScopeID        string `json:"scopeId"`
		SkillVersionID string `json:"skillVersionId"`
	}
	if !decodeWorkflowBody(w, r, &input, 32<<10) {
		return
	}
	result, err := service.RollbackWorkflowSkillBinding(stageKey, input.Scope, input.ScopeID, input.SkillVersionID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
