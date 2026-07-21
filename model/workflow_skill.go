package model

type WorkflowSkillVersionStatus string

const (
	WorkflowSkillVersionDraft     WorkflowSkillVersionStatus = "draft"
	WorkflowSkillVersionPublished WorkflowSkillVersionStatus = "published"
	WorkflowSkillVersionArchived  WorkflowSkillVersionStatus = "archived"
	WorkflowSkillScopeGlobal                                 = "global"
	WorkflowSkillScopeProject                                = "project"
)

type WorkflowSkill struct {
	ID          string `json:"id" gorm:"primaryKey"`
	Name        string `json:"name"`
	Description string `json:"description" gorm:"type:text"`
	StageKey    string `json:"stageKey" gorm:"uniqueIndex"`
	Enabled     bool   `json:"enabled" gorm:"index"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type WorkflowSkillVersion struct {
	ID           string                     `json:"id" gorm:"primaryKey"`
	SkillID      string                     `json:"skillId" gorm:"index;uniqueIndex:idx_workflow_skill_version,priority:1"`
	Version      string                     `json:"version" gorm:"uniqueIndex:idx_workflow_skill_version,priority:2"`
	Status       WorkflowSkillVersionStatus `json:"status" gorm:"index"`
	FilesJSON    string                     `json:"filesJson" gorm:"type:text"`
	ContractJSON string                     `json:"contractJson" gorm:"type:text"`
	ContentHash  string                     `json:"contentHash" gorm:"index"`
	CreatedBy    string                     `json:"createdBy" gorm:"index"`
	PublishedAt  string                     `json:"publishedAt"`
	CreatedAt    string                     `json:"createdAt"`
	UpdatedAt    string                     `json:"updatedAt"`
}

type WorkflowStageSkillBinding struct {
	ID             string `json:"id" gorm:"primaryKey"`
	StageKey       string `json:"stageKey" gorm:"index;uniqueIndex:idx_workflow_skill_binding,priority:1"`
	Scope          string `json:"scope" gorm:"index;uniqueIndex:idx_workflow_skill_binding,priority:2"`
	ScopeID        string `json:"scopeId" gorm:"index;uniqueIndex:idx_workflow_skill_binding,priority:3"`
	SkillVersionID string `json:"skillVersionId" gorm:"index"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type WorkflowSkillEvaluation struct {
	ID                string `json:"id" gorm:"primaryKey"`
	SkillVersionID    string `json:"skillVersionId" gorm:"index"`
	BaselineVersionID string `json:"baselineVersionId" gorm:"index"`
	ProjectID         string `json:"projectId" gorm:"index"`
	EpisodeID         string `json:"episodeId" gorm:"index"`
	InputHash         string `json:"inputHash" gorm:"index"`
	InputSnapshotJSON string `json:"inputSnapshotJson" gorm:"type:text"`
	ImageManifestJSON string `json:"imageManifestJson" gorm:"type:text"`
	ResultJSON        string `json:"resultJson" gorm:"type:text"`
	DiffJSON          string `json:"diffJson" gorm:"type:text"`
	GateJSON          string `json:"gateJson" gorm:"type:text"`
	Status            string `json:"status" gorm:"index"`
	ErrorMessage      string `json:"errorMessage" gorm:"type:text"`
	DurationMs        int64  `json:"durationMs"`
	CreatedBy         string `json:"createdBy" gorm:"index"`
	CreatedAt         string `json:"createdAt"`
	UpdatedAt         string `json:"updatedAt"`
}
