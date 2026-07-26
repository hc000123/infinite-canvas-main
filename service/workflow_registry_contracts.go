package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
)

const (
	WorkflowExecutorSkill = "skill"
	WorkflowExecutorAgent = "agent"

	WorkflowSkillBindingFixed           = "fixed"
	WorkflowSkillBindingTagRoute        = "tag_route"
	WorkflowSkillBindingManualBeforeRun = "manual_before_run"

	WorkflowInputSource = "workflow_input"
	WorkflowNodeSource  = "node_output"
)

type WorkflowPackage struct {
	InputArtifactTypes []string           `json:"inputArtifactTypes"`
	Nodes              []WorkflowNodeSpec `json:"nodes"`
	ContentHash        string             `json:"contentHash"`
}

type WorkflowNodeSpec struct {
	NodeKey            string                     `json:"nodeKey"`
	Name               string                     `json:"name"`
	ExecutorType       string                     `json:"executorType"`
	AgentRef           *WorkflowAgentRef          `json:"agentRef,omitempty"`
	SkillBinding       *WorkflowSkillBinding      `json:"skillBinding,omitempty"`
	InputBindings      []WorkflowNodeInputBinding `json:"inputBindings"`
	OutputArtifactType string                     `json:"outputArtifactType"`
	DependsOn          []string                   `json:"dependsOn"`
	Condition          *WorkflowCondition         `json:"condition,omitempty"`
	ConfirmationPolicy WorkflowConfirmationPolicy `json:"confirmationPolicy"`
	RetryPolicy        WorkflowRetryPolicy        `json:"retryPolicy"`
}

type WorkflowSkillBinding struct {
	Mode                       string   `json:"mode"`
	SkillID                    string   `json:"skillId,omitempty"`
	SkillVersionID             string   `json:"skillVersionId,omitempty"`
	SkillVersionConstraint     string   `json:"skillVersionConstraint,omitempty"`
	Capability                 string   `json:"capability,omitempty"`
	ExpectedOutputArtifactType string   `json:"expectedOutputArtifactType,omitempty"`
	ProjectTags                []string `json:"projectTags"`
	CandidateSkillIDs          []string `json:"candidateSkillIds"`
}

type WorkflowAgentRef struct {
	AgentID                string `json:"agentId,omitempty"`
	AgentVersionID         string `json:"agentVersionId,omitempty"`
	AgentVersionConstraint string `json:"agentVersionConstraint,omitempty"`
}

type WorkflowNodeInputBinding struct {
	BindingName       string `json:"bindingName"`
	ArtifactType      string `json:"artifactType"`
	Source            string `json:"source"`
	WorkflowInputName string `json:"workflowInputName,omitempty"`
	FromNodeKey       string `json:"fromNodeKey,omitempty"`
	FromOutputBinding string `json:"fromOutputBinding,omitempty"`
	Required          bool   `json:"required"`
}

type WorkflowCondition struct {
	Source   string          `json:"source"`
	Key      string          `json:"key"`
	Operator string          `json:"operator"`
	Value    json.RawMessage `json:"value,omitempty"`
}

type WorkflowConfirmationPolicy struct {
	RequireBeforeRun bool `json:"requireBeforeRun"`
	RequireReview    bool `json:"requireReview"`
}

type WorkflowRetryPolicy struct {
	MaxAttempts int `json:"maxAttempts"`
}

type WorkflowCreateInput struct {
	ProjectID string          `json:"projectId"`
	Name      string          `json:"name"`
	Summary   string          `json:"summary"`
	Tags      []string        `json:"tags"`
	Version   string          `json:"version"`
	Package   WorkflowPackage `json:"package"`
}

type WorkflowDraftInput struct {
	Version string          `json:"version"`
	Package WorkflowPackage `json:"package"`
}

type WorkflowVersionDetail struct {
	Workflow model.WorkflowDefinition `json:"workflow"`
	Version  model.WorkflowVersion    `json:"version"`
	Package  WorkflowPackage          `json:"package"`
	Tags     []string                 `json:"tags"`
}

type WorkflowRegistryItem struct {
	Workflow           model.WorkflowDefinition `json:"workflow"`
	Tags               []string                 `json:"tags"`
	Versions           []model.WorkflowVersion  `json:"versions"`
	RecommendedPackage *WorkflowPackage         `json:"recommendedPackage"`
}

type ResolvedWorkflowNode struct {
	NodeKey          string `json:"nodeKey"`
	ExecutorType     string `json:"executorType"`
	AgentID          string `json:"agentId,omitempty"`
	AgentVersionID   string `json:"agentVersionId,omitempty"`
	SkillID          string `json:"skillId,omitempty"`
	SkillVersionID   string `json:"skillVersionId,omitempty"`
	SkillContentHash string `json:"skillContentHash,omitempty"`
}

type WorkflowValidationResult struct {
	ContentHash   string                 `json:"contentHash"`
	ResolvedNodes []ResolvedWorkflowNode `json:"resolvedNodes"`
}

type WorkflowPreviewInput struct {
	ProjectID         string             `json:"projectId"`
	EpisodeID         string             `json:"episodeId"`
	InputArtifactRefs []ArtifactRefInput `json:"inputArtifactRefs"`
	ManualSelections  map[string]string  `json:"manualSelections"`
	ProjectTags       []string           `json:"projectTags"`
	Parameters        json.RawMessage    `json:"parameters"`
}

type WorkflowNodeRoutePreview struct {
	NodeKey           string               `json:"nodeKey"`
	Name              string               `json:"name"`
	ExecutorType      string               `json:"executorType"`
	AgentVersionID    string               `json:"agentVersionId,omitempty"`
	SkillVersionID    string               `json:"skillVersionId,omitempty"`
	SkillContentHash  string               `json:"skillContentHash,omitempty"`
	RouteTrace        InvocationRouteTrace `json:"routeTrace"`
	EstimatedCredits  int                  `json:"estimatedCredits"`
	ConfirmationCodes []string             `json:"confirmationCodes"`
	BlockCode         string               `json:"blockCode,omitempty"`
	BlockMessage      string               `json:"blockMessage,omitempty"`
}

type WorkflowRoutePreview struct {
	WorkflowVersionID        string                     `json:"workflowVersionId"`
	ContentHash              string                     `json:"contentHash"`
	Executable               bool                       `json:"executable"`
	EstimatedCredits         int64                      `json:"estimatedCredits"`
	ConfirmationRequirements []string                   `json:"confirmationRequirements"`
	Nodes                    []WorkflowNodeRoutePreview `json:"nodes"`
}
