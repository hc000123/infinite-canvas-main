package model

const (
	WorkflowSkillScopeGlobal  = "global"
	WorkflowSkillScopeProject = "project"
)

type WorkflowStageSkillBinding struct {
	ID             string `json:"id" gorm:"primaryKey"`
	StageKey       string `json:"stageKey" gorm:"index;uniqueIndex:idx_workflow_skill_binding,priority:1"`
	Scope          string `json:"scope" gorm:"index;uniqueIndex:idx_workflow_skill_binding,priority:2"`
	ScopeID        string `json:"scopeId" gorm:"index;uniqueIndex:idx_workflow_skill_binding,priority:3"`
	SkillVersionID string `json:"skillVersionId" gorm:"index"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}
