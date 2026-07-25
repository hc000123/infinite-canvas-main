package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type approvalCredentialRequest struct {
	ID    string `json:"id"`
	Token string `json:"token"`
}
type approvalDecisionRequest struct {
	Approve bool                     `json:"approve"`
	Scope   model.LoginApprovalScope `json:"scope"`
}
type allowedIPRequest struct {
	CIDR string `json:"cidr"`
}
type ipPolicyRequest struct {
	Enabled bool `json:"enabled"`
}

func LoginApprovalStatus(w http.ResponseWriter, r *http.Request) {
	item, err := service.LoginApprovalStatus(r.URL.Query().Get("id"), r.URL.Query().Get("token"))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}
func ExchangeLoginApproval(w http.ResponseWriter, r *http.Request) {
	var request approvalCredentialRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	result, err := service.ExchangeLoginApproval(r.Context(), request.ID, request.Token)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
func AdminLoginApprovals(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "权限不足")
		return
	}
	q := model.LoginApprovalQuery{Query: parseQuery(r), Status: r.URL.Query().Get("status")}
	result, err := service.ListAdminLoginApprovals(actor, q)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
func AdminDecideLoginApproval(w http.ResponseWriter, r *http.Request, id string) {
	var request approvalDecisionRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "权限不足")
		return
	}
	item, err := service.DecideUserLoginApproval(actor, id, request.Approve, request.Scope)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}
func AdminUserAllowedIPs(w http.ResponseWriter, r *http.Request, userID string) {
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "权限不足")
		return
	}
	items, err := service.ListAdminUserAllowedIPs(actor, userID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}
func AdminAddUserAllowedIP(w http.ResponseWriter, r *http.Request, userID string) {
	var request allowedIPRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "权限不足")
		return
	}
	item, err := service.AddAdminUserAllowedIP(actor, userID, request.CIDR)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, item)
}
func AdminDeleteUserAllowedIP(w http.ResponseWriter, r *http.Request, userID, id string) {
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "权限不足")
		return
	}
	if err := service.DeleteAdminUserAllowedIP(actor, userID, id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
func AdminSetUserIPPolicy(w http.ResponseWriter, r *http.Request, userID string) {
	var request ipPolicyRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	actor, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "权限不足")
		return
	}
	user, err := service.SetAdminUserIPApproval(actor, userID, request.Enabled)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, user)
}
