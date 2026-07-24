package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func UserActivityReport(w http.ResponseWriter, r *http.Request) {
	var request service.UserActivityReport
	_ = json.NewDecoder(r.Body).Decode(&request)
	item, err := service.ReportUserActivity(r.Context(), request)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}
func AdminUserActivities(w http.ResponseWriter, r *http.Request, id string) {
	base := parseQuery(r)
	outside, _ := strconv.ParseBool(r.URL.Query().Get("outsideIP"))
	q := model.UserActivityQuery{Query: base, Category: r.URL.Query().Get("category"), Action: r.URL.Query().Get("action"), Result: r.URL.Query().Get("result"), IPAddress: r.URL.Query().Get("ipAddress"), OutsideIPOnly: outside, StartAt: r.URL.Query().Get("startAt"), EndAt: r.URL.Query().Get("endAt")}
	result, err := service.ListAdminUserActivities(id, q)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
