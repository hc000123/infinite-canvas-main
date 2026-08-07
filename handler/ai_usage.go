package handler

import (
	"net/http"
	"strconv"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func UserAIUsageSummary(w http.ResponseWriter, r *http.Request) {
	user, ok := aiUsageUser(w, r)
	if !ok {
		return
	}
	query := parseAIUsageRecordQuery(r)
	result, err := service.GetUserAIUsageSummary(user.ID, model.AIUsageQuery{
		Period:   query.Period,
		Page:     query.Page,
		PageSize: query.PageSize,
	})
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func UserAIUsageRecords(w http.ResponseWriter, r *http.Request) {
	user, ok := aiUsageUser(w, r)
	if !ok {
		return
	}
	result, err := service.ListUserAIUsageRecords(user.ID, parseAIUsageRecordQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func parseAIUsageRecordQuery(r *http.Request) model.AIUsageRecordQuery {
	values := r.URL.Query()
	page, _ := strconv.Atoi(values.Get("page"))
	pageSize, _ := strconv.Atoi(values.Get("pageSize"))
	return model.AIUsageRecordQuery{
		Period:   model.AIUsagePeriod(values.Get("period")),
		Kind:     values.Get("kind"),
		Model:    values.Get("model"),
		Status:   values.Get("status"),
		StartAt:  values.Get("startAt"),
		EndAt:    values.Get("endAt"),
		Page:     page,
		PageSize: pageSize,
	}
}

func aiUsageUser(w http.ResponseWriter, r *http.Request) (model.AuthUser, bool) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
	}
	return user, ok
}
