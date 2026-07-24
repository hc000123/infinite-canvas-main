package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type adminAccountRequest struct {
	model.AdminAccountUpdate
	Password string `json:"password"`
}

func AdminAccounts(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	q := model.AdminAccountQuery{Query: parseQuery(r), Role: r.URL.Query().Get("role"), Status: r.URL.Query().Get("status")}
	items, err := service.ListAdminAccounts(actor, q)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

func CreateAdminAccount(w http.ResponseWriter, r *http.Request) {
	var request adminAccountRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	item, err := service.CreateAdminAccount(actor, request.AdminAccountUpdate, request.Password)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}

func UpdateAdminAccount(w http.ResponseWriter, r *http.Request, id string) {
	var request model.AdminAccountUpdate
	_ = json.NewDecoder(r.Body).Decode(&request)
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	item, err := service.UpdateAdminAccount(actor, id, request)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}

func ResetAdminAccountPassword(w http.ResponseWriter, r *http.Request, id string) {
	var request model.AdminAccountPassword
	_ = json.NewDecoder(r.Body).Decode(&request)
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.ResetAdminAccountPassword(actor, id, request.Password); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func DeleteAdminAccount(w http.ResponseWriter, r *http.Request, id string) {
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	if err := service.DeleteAdminAccount(actor, id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
