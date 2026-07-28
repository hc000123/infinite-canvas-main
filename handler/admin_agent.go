package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func AdminAgents(w http.ResponseWriter, _ *http.Request) {
	items, err := service.ListSystemAgentAdminItems()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func AdminAgentVersion(w http.ResponseWriter, _ *http.Request, id string) {
	result, err := service.GetSystemAgentVersion(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminCreateAgentVersion(w http.ResponseWriter, r *http.Request, agentID string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.AgentDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.CreateSystemAgentDraft(admin.ID, agentID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUpdateAgentVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.AgentDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.UpdateSystemAgentDraft(admin.ID, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminValidateAgentVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.ValidateSystemAgentVersion(admin.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminPublishAgentVersion(w http.ResponseWriter, r *http.Request, id string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.PublishSystemAgentVersion(admin.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminRecommendAgentVersion(w http.ResponseWriter, r *http.Request, agentID string) {
	admin, ok := skillAdmin(r)
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input struct {
		AgentVersionID string `json:"agentVersionId"`
	}
	if !decodeWorkflowBody(w, r, &input, 32<<10) {
		return
	}
	result, err := service.RecommendSystemAgentVersion(admin.ID, agentID, input.AgentVersionID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
