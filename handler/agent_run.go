package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func AgentConfigs(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	items, err := service.ListUserAgentConfigs(user.ID, r.URL.Query().Get("projectId"), r.URL.Query().Get("episodeId"))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func SaveAgentConfig(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.AgentConfigSaveInput
	_ = json.NewDecoder(r.Body).Decode(&input)
	item, err := service.SaveUserAgentConfig(user.ID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}

func AgentRuns(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	q := parseAgentRunQuery(r)
	result, err := service.ListUserAgentRuns(user.ID, q)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func CreateAgentRun(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.CreateAgentRunInput
	_ = json.NewDecoder(r.Body).Decode(&input)
	run, err := service.CreateUserAgentRun(user.ID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, run)
}

func ReviewAgentRun(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.AgentRunReviewInput
	_ = json.NewDecoder(r.Body).Decode(&input)
	run, err := service.ReviewUserAgentRun(user.ID, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, run)
}

func parseAgentRunQuery(r *http.Request) model.AgentRunQuery {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	pageSize, _ := strconv.Atoi(q.Get("pageSize"))
	return model.AgentRunQuery{
		ProjectID:     q.Get("projectId"),
		EpisodeID:     q.Get("episodeId"),
		WorkflowRunID: q.Get("workflowRunId"),
		StageID:       q.Get("stageId"),
		AgentKind:     q.Get("agentKind"),
		Status:        q.Get("status"),
		Page:          page,
		PageSize:      pageSize,
	}
}
