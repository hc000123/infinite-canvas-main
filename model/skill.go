package model

type SkillOwnerType string
type SkillVersionStatus string

const (
	SkillOwnerSystem  SkillOwnerType = "system"
	SkillOwnerProject SkillOwnerType = "project"

	SkillVersionDraft     SkillVersionStatus = "draft"
	SkillVersionPublished SkillVersionStatus = "published"
	SkillVersionArchived  SkillVersionStatus = "archived"
)

type SkillDefinition struct {
	ID                   string         `json:"id" gorm:"primaryKey"`
	Name                 string         `json:"name" gorm:"index;index:idx_skill_owner_name,priority:4"`
	Summary              string         `json:"summary" gorm:"type:text"`
	OwnerType            SkillOwnerType `json:"ownerType" gorm:"index;index:idx_skill_owner_name,priority:1"`
	OwnerUserID          string         `json:"ownerUserId" gorm:"index;index:idx_skill_owner_name,priority:2"`
	OwnerProjectID       string         `json:"ownerProjectId" gorm:"index;index:idx_skill_owner_name,priority:3"`
	StageKey             string         `json:"stageKey" gorm:"index"`
	Enabled              bool           `json:"enabled" gorm:"index"`
	RecommendedVersionID string         `json:"recommendedVersionId" gorm:"index"`
	CreatedAt            string         `json:"createdAt"`
	UpdatedAt            string         `json:"updatedAt"`
}

type SkillVersion struct {
	ID                     string             `json:"id" gorm:"primaryKey"`
	SkillID                string             `json:"skillId" gorm:"index;uniqueIndex:idx_skill_version,priority:1"`
	Version                string             `json:"version" gorm:"uniqueIndex:idx_skill_version,priority:2"`
	Status                 SkillVersionStatus `json:"status" gorm:"index"`
	ManifestJSON           string             `json:"-" gorm:"type:text"`
	FilesJSON              string             `json:"-" gorm:"type:text"`
	InputContractJSON      string             `json:"-" gorm:"type:text"`
	OutputContractJSON     string             `json:"-" gorm:"type:text"`
	QualityGateProfileJSON string             `json:"-" gorm:"type:text"`
	ContentHash            string             `json:"contentHash" gorm:"index"`
	EvaluationSummaryJSON  string             `json:"evaluationSummaryJson" gorm:"type:text"`
	SourceKind             string             `json:"sourceKind" gorm:"index"`
	SourceHash             string             `json:"sourceHash" gorm:"index"`
	SourceArchiveBlob      []byte             `json:"-"`
	SourceFileIndexJSON    string             `json:"-" gorm:"type:text"`
	ImportMetadataJSON     string             `json:"-" gorm:"type:text"`
	CreatedBy              string             `json:"createdBy" gorm:"index"`
	PublishedAt            string             `json:"publishedAt"`
	CreatedAt              string             `json:"createdAt"`
	UpdatedAt              string             `json:"updatedAt"`
}

type SkillEvaluation struct {
	ID                string `json:"id" gorm:"primaryKey"`
	SkillVersionID    string `json:"skillVersionId" gorm:"index"`
	BaselineVersionID string `json:"baselineVersionId" gorm:"index"`
	ContentHash       string `json:"contentHash" gorm:"index"`
	ProjectID         string `json:"projectId" gorm:"index"`
	EpisodeID         string `json:"episodeId" gorm:"index"`
	InputHash         string `json:"inputHash" gorm:"index"`
	InputSnapshotJSON string `json:"-" gorm:"type:text"`
	ImageManifestJSON string `json:"-" gorm:"type:text"`
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

type SkillAuditLog struct {
	ID             string `json:"id" gorm:"primaryKey"`
	AdminID        string `json:"adminId" gorm:"index"`
	Action         string `json:"action" gorm:"index"`
	Scope          string `json:"scope" gorm:"index"`
	ScopeID        string `json:"scopeId" gorm:"index"`
	SkillVersionID string `json:"skillVersionId" gorm:"index"`
	DetailJSON     string `json:"detailJson" gorm:"type:text"`
	CreatedAt      string `json:"createdAt" gorm:"index"`
}
