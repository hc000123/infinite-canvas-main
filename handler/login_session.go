package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

type forceLogoutRequest struct {
	Reason string `json:"reason"`
}

func Logout(w http.ResponseWriter, r *http.Request) {
	if err := service.LogoutCurrentSession(r.Context()); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminUserSession(w http.ResponseWriter, r *http.Request, id string) {
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetCurrentLoginSession(actor, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminForceLogoutUser(w http.ResponseWriter, r *http.Request, id string) {
	var request forceLogoutRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.ForceLogout(r.Context(), actor, id, request.Reason)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminAccountSession(w http.ResponseWriter, r *http.Request, id string) {
	AdminUserSession(w, r, id)
}

func AdminForceLogoutAccount(w http.ResponseWriter, r *http.Request, id string) {
	AdminForceLogoutUser(w, r, id)
}
