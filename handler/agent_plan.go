package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func CreateAgentPlan(w http.ResponseWriter, r *http.Request) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.AgentPlanCreateInput
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.CreateAgentPlan(user.ID, input)
	agentPlanDetailResult(w, result, err)
}

func AgentPlan(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	result, err := service.GetAgentPlanDetail(user.ID, id)
	agentPlanDetailResult(w, result, err)
}

func CreateAgentPlanRevision(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.AgentPlanRevisionInput
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.CreateAgentPlanRevision(user.ID, id, input)
	agentPlanDetailResult(w, result, err)
}

func PreflightAgentPlan(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok || !decodeZeroByteBody(w, r, 32<<10) {
		return
	}
	result, err := service.PreflightAgentPlan(user.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, service.SafeAgentPlanPreflight(result))
}

func ConfirmAgentPlan(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.AgentPlanConfirmInput
	if !decodeStrictBody(w, r, &input, 128<<10) {
		return
	}
	result, err := service.ConfirmAgentPlan(user.ID, id, input)
	agentPlanDetailResult(w, result, err)
}

func ContinueAgentPlan(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok || !decodeZeroByteBody(w, r, 32<<10) {
		return
	}
	result, err := service.ContinueAgentPlan(user.ID, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, service.SafeAgentPlanContinue(result))
}

func CancelAgentPlan(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok || !decodeZeroByteBody(w, r, 32<<10) {
		return
	}
	result, err := service.CancelAgentPlan(user.ID, id)
	agentPlanDetailResult(w, result, err)
}

func agentPlanDetailResult(w http.ResponseWriter, result service.AgentPlanDetail, err error) {
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, service.SafeAgentPlanDetail(result))
}
