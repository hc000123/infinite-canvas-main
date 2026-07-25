package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func AdminUser(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.GetAdminUserOverview(id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUserAITasks(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.ListAdminUserAITasks(id, parseAITaskQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminUserCreditLogs(w http.ResponseWriter, r *http.Request, id string) {
	result, err := service.ListAdminUserCreditLogs(id, parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
