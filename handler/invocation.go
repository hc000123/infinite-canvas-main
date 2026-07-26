package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func CreateInvocation(w http.ResponseWriter, r *http.Request) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.InvocationRequest
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.PreflightDirectInvocation(user.ID, input)
	invocationPreflightResult(w, result, err)
}

func Invocations(w http.ResponseWriter, r *http.Request) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	query := r.URL.Query()
	page, _ := strconv.Atoi(query.Get("page"))
	pageSize, _ := strconv.Atoi(query.Get("pageSize"))
	result, err := service.ListInvocations(user.ID, model.InvocationQuery{
		ProjectID: query.Get("project"), EpisodeID: query.Get("episode"), Source: query.Get("source"),
		Status: query.Get("status"), SkillID: query.Get("skillId"), Page: page, PageSize: pageSize,
	})
	invocationResult(w, result, err)
}

func Invocation(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	result, err := service.GetInvocationDetail(user.ID, id)
	invocationResult(w, result, err)
}

func RepreflightInvocation(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.InvocationRequest
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.RepreflightDirectInvocation(user.ID, id, input)
	invocationPreflightResult(w, result, err)
}

func ConfirmInvocation(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.InvocationConfirmation
	if !decodeStrictBody(w, r, &input, 128<<10) {
		return
	}
	result, err := service.ConfirmInvocation(user.ID, id, input)
	invocationLifecycleResult(w, result, err)
}

func CancelInvocation(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok || !decodeZeroByteBody(w, r, 32<<10) {
		return
	}
	result, err := service.CancelInvocation(user.ID, id)
	invocationLifecycleResult(w, result, err)
}

func RetryInvocation(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok || !decodeZeroByteBody(w, r, 32<<10) {
		return
	}
	result, err := service.RetryInvocation(user.ID, id)
	invocationLifecycleResult(w, result, err)
}

func RevalidateInvocation(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.InvocationCorrectionInput
	if !decodeStrictBody(w, r, &input, 4<<20) {
		return
	}
	result, err := service.RevalidateInvocationOutput(user.ID, id, input)
	invocationLifecycleResult(w, result, err)
}

func ReviewInvocation(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.InvocationReviewInput
	if !decodeStrictBody(w, r, &input, 128<<10) {
		return
	}
	result, err := service.ReviewInvocation(user.ID, id, input)
	invocationLifecycleResult(w, result, err)
}

func ApplyInvocation(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.InvocationApplyInput
	if !decodeStrictBody(w, r, &input, 128<<10) {
		return
	}
	result, err := service.ApplyInvocation(user.ID, id, input)
	invocationApplyResult(w, result, err)
}

func InvocationEvents(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	after, _ := strconv.ParseUint(r.URL.Query().Get("after"), 10, 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	result, err := service.ListInvocationEvents(user.ID, id, after, limit)
	invocationResult(w, result, err)
}

func invocationUser(w http.ResponseWriter, r *http.Request) (model.AuthUser, bool) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
	}
	return user, ok
}

func invocationResult(w http.ResponseWriter, result any, err error) {
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func invocationPreflightResult(w http.ResponseWriter, result service.InvocationPreflightSnapshot, err error) {
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, service.SafeInvocationPreflight(result))
}

func invocationLifecycleResult(w http.ResponseWriter, result service.InvocationResponse, err error) {
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, service.SafeInvocationLifecycle(result))
}

func invocationApplyResult(w http.ResponseWriter, result model.InvocationApplyAttempt, err error) {
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, service.SafeInvocationApplyAttempt(result))
}

func decodeStrictBody(w http.ResponseWriter, r *http.Request, target any, limit int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	decoder := json.NewDecoder(r.Body)
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		Fail(w, "请求内容格式不正确或超过大小限制")
		return false
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		Fail(w, "请求内容格式不正确或超过大小限制")
		return false
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		Fail(w, "请求内容格式不正确或超过大小限制")
		return false
	}
	strict := json.NewDecoder(bytes.NewReader(raw))
	strict.DisallowUnknownFields()
	if err := strict.Decode(target); err != nil {
		Fail(w, "请求内容格式不正确或超过大小限制")
		return false
	}
	return true
}

func decodeZeroByteBody(w http.ResponseWriter, r *http.Request, limit int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	raw, err := io.ReadAll(r.Body)
	if err != nil || len(raw) != 0 {
		Fail(w, "请求内容格式不正确或超过大小限制")
		return false
	}
	return true
}
