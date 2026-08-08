package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/basketikun/infinite-canvas/service"
)

type workflowCommandInput struct {
	IdempotencyKey string          `json:"idempotencyKey"`
	MediaBatchID   string          `json:"mediaBatchId"`
	SkillVersionID string          `json:"skillVersionId"`
	Context        json.RawMessage `json:"context"`
}

func WorkflowRuns(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	result, err := service.ListWorkflowRuns(user.ID, service.WorkflowRunListQuery{
		ProjectID: r.URL.Query().Get("projectId"),
		EpisodeID: r.URL.Query().Get("episodeId"),
		Status:    service.WorkflowRunListStatus(r.URL.Query().Get("status")),
		Page:      page,
		PageSize:  pageSize,
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func EnsureWorkflowRun(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.EnsureWorkflowRunInput
	if !decodeWorkflowBody(w, r, &input, 1<<20) {
		return
	}
	result, err := service.EnsureWorkflowRun(user.ID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func WorkflowRun(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetWorkflowRunDetail(user.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func WorkflowRunPoll(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	after, _ := strconv.ParseUint(r.URL.Query().Get("after"), 10, 64)
	result, err := service.GetWorkflowRunPoll(user.ID, id, after)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func StartWorkflowStage(w http.ResponseWriter, r *http.Request, workflowRunID string, stageID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input workflowCommandInput
	if !decodeWorkflowBody(w, r, &input, 320<<10) {
		return
	}
	result, err := service.StartWorkflowStageWithInput(user.ID, workflowRunID, stageID, service.WorkflowStageStartInput{IdempotencyKey: input.IdempotencyKey, MediaBatchID: input.MediaBatchID, SkillVersionID: input.SkillVersionID, Context: input.Context})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func CancelWorkflowStage(w http.ResponseWriter, r *http.Request, stageRunID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.CancelWorkflowStage(user.ID, stageRunID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func RetryWorkflowStage(w http.ResponseWriter, r *http.Request, stageRunID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input workflowCommandInput
	if !decodeWorkflowBody(w, r, &input, 32<<10) {
		return
	}
	result, err := service.RetryWorkflowStage(user.ID, stageRunID, input.IdempotencyKey)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ReviewWorkflowStage(w http.ResponseWriter, r *http.Request, stageRunID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.WorkflowReviewInput
	if !decodeWorkflowBody(w, r, &input, 128<<10) {
		return
	}
	result, err := service.ReviewWorkflowStage(user.ID, stageRunID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ApplyWorkflowStage(w http.ResponseWriter, r *http.Request, stageRunID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var input service.WorkflowApplyInput
	if !decodeWorkflowBody(w, r, &input, 512<<10) {
		return
	}
	result, err := service.ApplyWorkflowStage(user.ID, stageRunID, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func WorkflowEvents(w http.ResponseWriter, r *http.Request, workflowRunID string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	after, _ := strconv.ParseUint(r.URL.Query().Get("after"), 10, 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	result, err := service.ListUserWorkflowEvents(user.ID, workflowRunID, after, limit)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func WorkflowWorkerHealth(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.UserFromContext(r.Context()); !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetWorkflowWorkerHealth()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func decodeWorkflowBody(w http.ResponseWriter, r *http.Request, target any, limit int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(target); err != nil {
		Fail(w, "请求内容格式不正确或超过大小限制")
		return false
	}
	return true
}
