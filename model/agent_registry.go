package model

type AgentOwnerType string
type AgentVersionStatus string

const (
	AgentOwnerSystem  AgentOwnerType = "system"
	AgentOwnerProject AgentOwnerType = "project"

	AgentVersionDraft     AgentVersionStatus = "draft"
	AgentVersionPublished AgentVersionStatus = "published"
	AgentVersionRetired   AgentVersionStatus = "retired"
)

type AgentDefinition struct {
	ID                   string         `json:"id" gorm:"primaryKey"`
	Name                 string         `json:"name" gorm:"index;uniqueIndex:idx_agent_owner_name,priority:4"`
	Summary              string         `json:"summary" gorm:"type:text"`
	TagsJSON             string         `json:"-" gorm:"type:text"`
	OwnerType            AgentOwnerType `json:"ownerType" gorm:"index;uniqueIndex:idx_agent_owner_name,priority:1"`
	OwnerUserID          string         `json:"ownerUserId" gorm:"index;uniqueIndex:idx_agent_owner_name,priority:2"`
	OwnerProjectID       string         `json:"ownerProjectId" gorm:"index;uniqueIndex:idx_agent_owner_name,priority:3"`
	Enabled              bool           `json:"enabled" gorm:"index"`
	RecommendedVersionID string         `json:"recommendedVersionId" gorm:"index"`
	CreatedAt            string         `json:"createdAt"`
	UpdatedAt            string         `json:"updatedAt"`
}

type AgentVersion struct {
	ID                    string             `json:"id" gorm:"primaryKey"`
	AgentID               string             `json:"agentId" gorm:"index;uniqueIndex:idx_agent_version,priority:1"`
	Version               string             `json:"version" gorm:"uniqueIndex:idx_agent_version,priority:2"`
	Status                AgentVersionStatus `json:"status" gorm:"index"`
	RolePrompt            string             `json:"-" gorm:"type:text"`
	PlannerMode           string             `json:"plannerMode" gorm:"index"`
	DefaultSkillRefsJSON  string             `json:"-" gorm:"type:text"`
	SkillAccessPolicyJSON string             `json:"-" gorm:"type:text"`
	ModelPolicyJSON       string             `json:"-" gorm:"type:text"`
	ToolPolicyJSON        string             `json:"-" gorm:"type:text"`
	ExecutionPolicyJSON   string             `json:"-" gorm:"type:text"`
	ContentHash           string             `json:"contentHash" gorm:"index"`
	CreatedBy             string             `json:"createdBy" gorm:"index"`
	PublishedAt           string             `json:"publishedAt"`
	CreatedAt             string             `json:"createdAt"`
	UpdatedAt             string             `json:"updatedAt"`
}
