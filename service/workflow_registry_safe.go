package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
)

type WorkflowRouteCandidateResponse struct {
	SkillID        string   `json:"skillId"`
	SkillVersionID string   `json:"skillVersionId"`
	Accepted       bool     `json:"accepted"`
	Score          int      `json:"score"`
	Reasons        []string `json:"reasons"`
}

type WorkflowRouteTraceResponse struct {
	Capability          string                           `json:"capability"`
	Candidates          []WorkflowRouteCandidateResponse `json:"candidates"`
	FinalSkillVersionID string                           `json:"finalSkillVersionId"`
	SelectedModel       string                           `json:"selectedModel"`
}

type WorkflowNodeRoutePreviewResponse struct {
	NodeKey           string                     `json:"nodeKey"`
	Name              string                     `json:"name"`
	ExecutorType      string                     `json:"executorType"`
	AgentVersionID    string                     `json:"agentVersionId,omitempty"`
	SkillVersionID    string                     `json:"skillVersionId,omitempty"`
	SkillContentHash  string                     `json:"skillContentHash,omitempty"`
	RouteTrace        WorkflowRouteTraceResponse `json:"routeTrace"`
	EstimatedCredits  int                        `json:"estimatedCredits"`
	ConfirmationCodes []string                   `json:"confirmationCodes"`
	BlockCode         string                     `json:"blockCode,omitempty"`
	BlockMessage      string                     `json:"blockMessage,omitempty"`
}

type WorkflowRoutePreviewResponse struct {
	WorkflowVersionID        string                             `json:"workflowVersionId"`
	ContentHash              string                             `json:"contentHash"`
	Executable               bool                               `json:"executable"`
	EstimatedCredits         int64                              `json:"estimatedCredits"`
	ConfirmationRequirements []string                           `json:"confirmationRequirements"`
	Nodes                    []WorkflowNodeRoutePreviewResponse `json:"nodes"`
}

type WorkflowExecutionRunSummary struct {
	ID                      string                        `json:"id"`
	ProjectID               string                        `json:"projectId"`
	EpisodeID               string                        `json:"episodeId"`
	WorkflowID              string                        `json:"workflowId"`
	WorkflowVersionID       string                        `json:"workflowVersionId"`
	WorkflowContentHash     string                        `json:"workflowContentHash"`
	Status                  model.WorkflowExecutionStatus `json:"status"`
	Revision                int                           `json:"revision"`
	EstimatedCredits        int64                         `json:"estimatedCredits"`
	ConfirmationFingerprint string                        `json:"confirmationFingerprint"`
	CreatedAt               string                        `json:"createdAt"`
	UpdatedAt               string                        `json:"updatedAt"`
}

type WorkflowExecutionRevisionResponse struct {
	ID                      string             `json:"id"`
	WorkflowExecutionID     string             `json:"workflowExecutionId"`
	Revision                int                `json:"revision"`
	WorkflowVersionID       string             `json:"workflowVersionId"`
	WorkflowContentHash     string             `json:"workflowContentHash"`
	InputArtifactRefs       []ArtifactRefInput `json:"inputArtifactRefs"`
	ManualSelections        map[string]string  `json:"manualSelections"`
	Parameters              json.RawMessage    `json:"parameters"`
	EstimatedCredits        int64              `json:"estimatedCredits"`
	ConfirmationFingerprint string             `json:"confirmationFingerprint"`
	CreatedAt               string             `json:"createdAt"`
}

type WorkflowNodeExecutionResponse struct {
	ID                  string                            `json:"id"`
	WorkflowExecutionID string                            `json:"workflowExecutionId"`
	Revision            int                               `json:"revision"`
	Ordinal             int                               `json:"ordinal"`
	NodeKey             string                            `json:"nodeKey"`
	ExecutorType        string                            `json:"executorType"`
	InvocationID        string                            `json:"invocationId,omitempty"`
	AgentPlanID         string                            `json:"agentPlanId,omitempty"`
	Status              model.WorkflowNodeExecutionStatus `json:"status"`
	OutputArtifactRefs  []ArtifactRefInput                `json:"outputArtifactRefs"`
	ErrorCode           string                            `json:"errorCode,omitempty"`
	ErrorMessage        string                            `json:"errorMessage,omitempty"`
	CreatedAt           string                            `json:"createdAt"`
	UpdatedAt           string                            `json:"updatedAt"`
}

type WorkflowExecutionConfirmationResponse struct {
	ID                  string `json:"id"`
	WorkflowExecutionID string `json:"workflowExecutionId"`
	Revision            int    `json:"revision"`
	Fingerprint         string `json:"fingerprint"`
	EstimatedCredits    int64  `json:"estimatedCredits"`
	ConfirmedAt         string `json:"confirmedAt"`
}

type WorkflowExecutionResponse struct {
	Run                      WorkflowExecutionRunSummary            `json:"run"`
	Revision                 WorkflowExecutionRevisionResponse      `json:"revision"`
	Nodes                    []WorkflowNodeExecutionResponse        `json:"nodes"`
	Preview                  WorkflowRoutePreviewResponse           `json:"preview"`
	ConfirmationRequirements []string                               `json:"confirmationRequirements"`
	Confirmation             *WorkflowExecutionConfirmationResponse `json:"confirmation,omitempty"`
}

func SafeWorkflowRoutePreview(preview WorkflowRoutePreview) WorkflowRoutePreviewResponse {
	result := WorkflowRoutePreviewResponse{
		WorkflowVersionID: preview.WorkflowVersionID, ContentHash: preview.ContentHash, Executable: preview.Executable,
		EstimatedCredits: preview.EstimatedCredits, ConfirmationRequirements: append([]string{}, preview.ConfirmationRequirements...),
		Nodes: make([]WorkflowNodeRoutePreviewResponse, len(preview.Nodes)),
	}
	for index, node := range preview.Nodes {
		candidates := make([]WorkflowRouteCandidateResponse, len(node.RouteTrace.Candidates))
		for candidateIndex, candidate := range node.RouteTrace.Candidates {
			candidates[candidateIndex] = WorkflowRouteCandidateResponse{SkillID: candidate.SkillID, SkillVersionID: candidate.SkillVersionID, Accepted: candidate.Accepted, Score: candidate.Score, Reasons: append([]string{}, candidate.Reasons...)}
		}
		result.Nodes[index] = WorkflowNodeRoutePreviewResponse{
			NodeKey: node.NodeKey, Name: node.Name, ExecutorType: node.ExecutorType, AgentVersionID: node.AgentVersionID,
			SkillVersionID: node.SkillVersionID, SkillContentHash: node.SkillContentHash,
			RouteTrace:       WorkflowRouteTraceResponse{Capability: node.RouteTrace.Capability, Candidates: candidates, FinalSkillVersionID: node.RouteTrace.FinalSkillVersionID, SelectedModel: node.RouteTrace.SelectedModel},
			EstimatedCredits: node.EstimatedCredits, ConfirmationCodes: append([]string{}, node.ConfirmationCodes...), BlockCode: node.BlockCode, BlockMessage: node.BlockMessage,
		}
	}
	return result
}

func SafeWorkflowExecution(detail WorkflowExecutionDetail) WorkflowExecutionResponse {
	run := detail.Run
	revision := detail.Revision
	inputRefs, manualSelections := []ArtifactRefInput{}, map[string]string{}
	parameters := json.RawMessage(`null`)
	_ = json.Unmarshal([]byte(revision.InputArtifactRefsJSON), &inputRefs)
	_ = json.Unmarshal([]byte(revision.ManualSelectionsJSON), &manualSelections)
	if json.Valid([]byte(revision.ParametersJSON)) {
		parameters = json.RawMessage(revision.ParametersJSON)
	}
	result := WorkflowExecutionResponse{
		Run: WorkflowExecutionRunSummary{
			ID: run.ID, ProjectID: run.ProjectID, EpisodeID: run.EpisodeID, WorkflowID: run.WorkflowID, WorkflowVersionID: run.WorkflowVersionID,
			WorkflowContentHash: run.WorkflowContentHash, Status: run.Status, Revision: run.Revision, EstimatedCredits: run.EstimatedCredits,
			ConfirmationFingerprint: run.ConfirmationFingerprint, CreatedAt: run.CreatedAt, UpdatedAt: run.UpdatedAt,
		},
		Revision: WorkflowExecutionRevisionResponse{
			ID: revision.ID, WorkflowExecutionID: revision.WorkflowExecutionID, Revision: revision.Revision, WorkflowVersionID: revision.WorkflowVersionID,
			WorkflowContentHash: revision.WorkflowContentHash, InputArtifactRefs: inputRefs, ManualSelections: manualSelections, Parameters: parameters,
			EstimatedCredits: revision.EstimatedCredits, ConfirmationFingerprint: revision.ConfirmationFingerprint, CreatedAt: revision.CreatedAt,
		},
		Nodes: make([]WorkflowNodeExecutionResponse, len(detail.Nodes)), Preview: SafeWorkflowRoutePreview(detail.Preview),
		ConfirmationRequirements: append([]string{}, detail.ConfirmationRequirements...),
	}
	for index, node := range detail.Nodes {
		outputRefs := []ArtifactRefInput{}
		_ = json.Unmarshal([]byte(node.OutputArtifactRefsJSON), &outputRefs)
		result.Nodes[index] = WorkflowNodeExecutionResponse{
			ID: node.ID, WorkflowExecutionID: node.WorkflowExecutionID, Revision: node.Revision, Ordinal: node.Ordinal, NodeKey: node.NodeKey,
			ExecutorType: node.ExecutorType, InvocationID: node.InvocationID, AgentPlanID: node.AgentPlanID, Status: node.Status,
			OutputArtifactRefs: outputRefs, ErrorCode: node.ErrorCode, ErrorMessage: node.ErrorMessage, CreatedAt: node.CreatedAt, UpdatedAt: node.UpdatedAt,
		}
	}
	if detail.Confirmation != nil {
		confirmation := detail.Confirmation
		result.Confirmation = &WorkflowExecutionConfirmationResponse{
			ID: confirmation.ID, WorkflowExecutionID: confirmation.WorkflowExecutionID, Revision: confirmation.Revision,
			Fingerprint: confirmation.Fingerprint, EstimatedCredits: confirmation.EstimatedCredits, ConfirmedAt: confirmation.ConfirmedAt,
		}
	}
	return result
}
