package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func Workflows(w http.ResponseWriter, r *http.Request) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	result, err := service.ListVisibleWorkflows(user.ID, r.URL.Query().Get("projectId"))
	workflowRegistryResult(w, result, err)
}

func CreateWorkflowDefinition(w http.ResponseWriter, r *http.Request) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.WorkflowCreateInput
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.CreateProjectWorkflow(user.ID, input)
	workflowRegistryResult(w, result, err)
}

func WorkflowRegistryDetail(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	result, err := service.GetVisibleWorkflow(user.ID, r.URL.Query().Get("projectId"), id)
	workflowRegistryResult(w, result, err)
}

func CopyWorkflow(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input struct {
		ProjectID string `json:"projectId"`
		Name      string `json:"name"`
	}
	if !decodeStrictBody(w, r, &input, 128<<10) {
		return
	}
	result, err := service.CopyWorkflowToProject(user.ID, id, input.ProjectID, input.Name)
	workflowRegistryResult(w, result, err)
}

func CreateWorkflowVersion(w http.ResponseWriter, r *http.Request, workflowID string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.WorkflowDraftInput
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.CreateWorkflowDraft(user.ID, workflowID, input)
	workflowRegistryResult(w, result, err)
}

func WorkflowVersionDetail(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	result, err := service.GetVisibleWorkflowVersion(user.ID, id)
	workflowRegistryResult(w, result, err)
}

func UpdateWorkflowVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.WorkflowDraftInput
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.UpdateWorkflowDraft(user.ID, id, input)
	workflowRegistryResult(w, result, err)
}

func ValidateWorkflowVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok || !decodeZeroByteBody(w, r, 32<<10) {
		return
	}
	result, err := service.ValidateWorkflowVersion(user.ID, id)
	workflowRegistryResult(w, result, err)
}

func PreviewWorkflowVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.WorkflowPreviewInput
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.PreviewWorkflowVersion(user.ID, id, input)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, service.SafeWorkflowRoutePreview(result))
}

func PublishWorkflowVersion(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok || !decodeZeroByteBody(w, r, 32<<10) {
		return
	}
	result, err := service.PublishWorkflowVersion(user.ID, id)
	workflowRegistryResult(w, result, err)
}

func RecommendWorkflowVersion(w http.ResponseWriter, r *http.Request, workflowID string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input struct {
		WorkflowVersionID string `json:"workflowVersionId"`
	}
	if !decodeStrictBody(w, r, &input, 32<<10) {
		return
	}
	result, err := service.RecommendWorkflowVersion(user.ID, workflowID, input.WorkflowVersionID)
	workflowRegistryResult(w, result, err)
}

func PreflightWorkflowExecution(w http.ResponseWriter, r *http.Request) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.WorkflowExecutionPreflightInput
	if !decodeStrictBody(w, r, &input, 2<<20) {
		return
	}
	result, err := service.PreflightWorkflowExecution(user.ID, input)
	workflowExecutionResult(w, result, err)
}

func WorkflowExecutionDetail(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	result, err := service.GetWorkflowExecutionDetail(user.ID, id)
	workflowExecutionResult(w, result, err)
}

func ConfirmWorkflowExecution(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok {
		return
	}
	var input service.WorkflowExecutionConfirmationInput
	if !decodeStrictBody(w, r, &input, 128<<10) {
		return
	}
	result, err := service.ConfirmWorkflowExecution(user.ID, id, input)
	workflowExecutionResult(w, result, err)
}

func ContinueWorkflowExecution(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok || !decodeZeroByteBody(w, r, 32<<10) {
		return
	}
	result, err := service.ContinueWorkflowExecution(user.ID, id)
	workflowExecutionResult(w, result, err)
}

func CancelWorkflowExecution(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := invocationUser(w, r)
	if !ok || !decodeZeroByteBody(w, r, 32<<10) {
		return
	}
	result, err := service.CancelWorkflowExecution(user.ID, id)
	workflowExecutionResult(w, result, err)
}

func workflowRegistryResult(w http.ResponseWriter, result any, err error) {
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func workflowExecutionResult(w http.ResponseWriter, result service.WorkflowExecutionDetail, err error) {
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, service.SafeWorkflowExecution(result))
}
