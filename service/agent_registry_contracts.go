package service

import (
	"encoding/json"

	"github.com/basketikun/infinite-canvas/model"
)

const (
	AgentPlannerConfiguredChain = "configured_chain"
	AgentPlannerCatalog         = "catalog_plan"
)

type AgentStepInputBinding struct {
	BindingName       string `json:"bindingName"`
	ArtifactID        string `json:"artifactId,omitempty"`
	ContentHash       string `json:"contentHash,omitempty"`
	FromStepKey       string `json:"fromStepKey,omitempty"`
	FromOutputBinding string `json:"fromOutputBinding,omitempty"`
}

type AgentSkillRef struct {
	StepKey                string                  `json:"stepKey"`
	Label                  string                  `json:"label"`
	Capability             string                  `json:"capability"`
	SkillID                string                  `json:"skillId"`
	SkillVersionID         string                  `json:"skillVersionId"`
	SkillVersionConstraint string                  `json:"skillVersionConstraint"`
	Required               bool                    `json:"required"`
	InputBindings          []AgentStepInputBinding `json:"inputBindings"`
	Parameters             json.RawMessage         `json:"parameters"`
	ExpectedOutputType     string                  `json:"expectedOutputType"`
}

type AgentSkillAccessPolicy struct {
	AllowedSkillIDs     []string               `json:"allowedSkillIds"`
	AllowedCapabilities []string               `json:"allowedCapabilities"`
	AllowedOwnerTypes   []model.SkillOwnerType `json:"allowedOwnerTypes"`
}

type AgentModelPolicy struct {
	PreferredModel  string   `json:"preferredModel"`
	AllowedModels   []string `json:"allowedModels"`
	ReasoningLevel  string   `json:"reasoningLevel"`
	Temperature     float64  `json:"temperature"`
	MaxOutputTokens int      `json:"maxOutputTokens"`
}

type AgentToolPolicy struct {
	AllowedTools []string `json:"allowedTools"`
}

type AgentExecutionPolicy struct {
	MaxSteps                  int  `json:"maxSteps"`
	AllowRuntimeSkillOverride bool `json:"allowRuntimeSkillOverride"`
	AllowBatch                bool `json:"allowBatch"`
}

type AgentPackage struct {
	RolePrompt        string                 `json:"rolePrompt"`
	PlannerMode       string                 `json:"plannerMode"`
	DefaultSkillRefs  []AgentSkillRef        `json:"defaultSkillRefs"`
	SkillAccessPolicy AgentSkillAccessPolicy `json:"skillAccessPolicy"`
	ModelPolicy       AgentModelPolicy       `json:"modelPolicy"`
	ToolPolicy        AgentToolPolicy        `json:"toolPolicy"`
	ExecutionPolicy   AgentExecutionPolicy   `json:"executionPolicy"`
	ContentHash       string                 `json:"contentHash"`
}

type AgentCreateInput struct {
	ProjectID string       `json:"projectId"`
	Name      string       `json:"name"`
	Summary   string       `json:"summary"`
	Tags      []string     `json:"tags"`
	Version   string       `json:"version"`
	Package   AgentPackage `json:"package"`
}

type AgentDraftInput struct {
	Version string       `json:"version"`
	Package AgentPackage `json:"package"`
}

type AgentVersionDetail struct {
	Agent   model.AgentDefinition `json:"agent"`
	Version model.AgentVersion    `json:"version"`
	Package AgentPackage          `json:"package"`
	Tags    []string              `json:"tags"`
}

type AgentRegistryItem struct {
	Agent              model.AgentDefinition `json:"agent"`
	Tags               []string              `json:"tags"`
	Versions           []model.AgentVersion  `json:"versions"`
	RecommendedPackage *AgentPackage         `json:"recommendedPackage"`
}

type ResolvedAgentSkillRef struct {
	StepKey          string        `json:"stepKey"`
	SkillID          string        `json:"skillId"`
	SkillVersionID   string        `json:"skillVersionId"`
	SkillVersion     string        `json:"skillVersion"`
	SkillContentHash string        `json:"skillContentHash"`
	Manifest         SkillManifest `json:"manifest"`
}

type AgentValidationResult struct {
	ContentHash    string                  `json:"contentHash"`
	ResolvedSkills []ResolvedAgentSkillRef `json:"resolvedSkills"`
}
