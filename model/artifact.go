package model

type ArtifactSchema struct {
	ID           string `json:"id" gorm:"primaryKey"`
	ArtifactType string `json:"artifactType" gorm:"uniqueIndex:idx_artifact_schema_version,priority:1;index"`
	Version      string `json:"version" gorm:"uniqueIndex:idx_artifact_schema_version,priority:2"`
	SchemaJSON   string `json:"-" gorm:"type:text"`
	ContentHash  string `json:"contentHash" gorm:"index"`
	Core         bool   `json:"core" gorm:"index"`
	CreatedAt    string `json:"createdAt"`
}

type Artifact struct {
	ID                     string  `json:"id" gorm:"primaryKey"`
	UserID                 string  `json:"userId" gorm:"index"`
	ArtifactType           string  `json:"artifactType" gorm:"index"`
	SchemaID               string  `json:"schemaId" gorm:"index"`
	SchemaVersion          string  `json:"schemaVersion" gorm:"index"`
	SchemaContentHash      string  `json:"schemaContentHash" gorm:"index"`
	ProjectID              string  `json:"projectId" gorm:"index"`
	EpisodeID              string  `json:"episodeId" gorm:"index"`
	ParentArtifactRefsJSON string  `json:"-" gorm:"type:text"`
	ProducerInvocationID   *string `json:"producerInvocationId,omitempty" gorm:"index"`
	ProducerAttempt        int     `json:"producerAttempt,omitempty" gorm:"index"`
	PayloadJSON            string  `json:"-" gorm:"type:text"`
	ExtensionsJSON         string  `json:"-" gorm:"type:text"`
	ContentHash            string  `json:"contentHash" gorm:"index"`
	CreatedAt              string  `json:"createdAt"`
}
