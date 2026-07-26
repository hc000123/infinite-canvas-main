package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func Agents(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	items, err := service.ListVisibleAgents(user.ID, r.URL.Query().Get("projectId"))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func CreateAgent(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.AgentCreateInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.CreateProjectAgent(user.ID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AgentDetail(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetVisibleAgent(user.ID, r.URL.Query().Get("projectId"), id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AgentVersionDetail(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetVisibleAgentVersion(user.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func CreateAgentVersion(w http.ResponseWriter, r *http.Request, agentID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.AgentDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.CreateAgentDraft(user.ID, agentID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func UpdateAgentVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.AgentDraftInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.UpdateAgentDraft(user.ID, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ValidateAgentVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.ValidateAgentVersion(user.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func PublishAgentVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.PublishAgentVersion(user.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func RecommendAgentVersion(w http.ResponseWriter, r *http.Request, agentID string) {
	user, ok := service.UserFromContext(r.Context())
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
	result, err := service.RecommendAgentVersion(user.ID, agentID, input.AgentVersionID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
