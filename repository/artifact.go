package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

var errArtifactSchemaVersionConflict = errors.New("Artifact Schema 版本内容冲突")

type ArtifactQuery struct {
	ProjectID            string
	EpisodeID            string
	ArtifactType         string
	ProducerInvocationID string
	ApprovalState        string
	Page                 int
	PageSize             int
}

func CreateArtifactSchema(schema model.ArtifactSchema) (model.ArtifactSchema, error) {
	database, err := DB()
	if err != nil {
		return schema, err
	}
	existing, ok, err := getArtifactSchemaByTypeVersion(database, schema.ArtifactType, schema.Version)
	if err != nil {
		return schema, err
	}
	if ok {
		if existing.ContentHash != schema.ContentHash {
			return schema, errArtifactSchemaVersionConflict
		}
		return existing, nil
	}
	if err := database.Create(&schema).Error; err != nil {
		existing, ok, lookupErr := getArtifactSchemaByTypeVersion(database, schema.ArtifactType, schema.Version)
		if lookupErr == nil && ok {
			if existing.ContentHash != schema.ContentHash {
				return schema, errArtifactSchemaVersionConflict
			}
			return existing, nil
		}
		return schema, err
	}
	return schema, nil
}

func GetArtifactSchema(id string) (model.ArtifactSchema, bool, error) {
	database, err := DB()
	if err != nil {
		return model.ArtifactSchema{}, false, err
	}
	var schema model.ArtifactSchema
	result := database.Where("id = ?", strings.TrimSpace(id)).Limit(1).Find(&schema)
	if result.Error != nil {
		return schema, false, result.Error
	}
	return schema, result.RowsAffected == 1, nil
}

func GetArtifactSchemaByTypeVersion(artifactType, version string) (model.ArtifactSchema, bool, error) {
	database, err := DB()
	if err != nil {
		return model.ArtifactSchema{}, false, err
	}
	return getArtifactSchemaByTypeVersion(database, artifactType, version)
}

func getArtifactSchemaByTypeVersion(database *gorm.DB, artifactType, version string) (model.ArtifactSchema, bool, error) {
	var schema model.ArtifactSchema
	result := database.Where("artifact_type = ? AND version = ?", strings.TrimSpace(artifactType), strings.TrimSpace(version)).Limit(1).Find(&schema)
	if result.Error != nil {
		return schema, false, result.Error
	}
	return schema, result.RowsAffected == 1, nil
}

func ListArtifactSchemas(artifactType string) ([]model.ArtifactSchema, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	query := database.Model(&model.ArtifactSchema{})
	if value := strings.TrimSpace(artifactType); value != "" {
		query = query.Where("artifact_type = ?", value)
	}
	var schemas []model.ArtifactSchema
	err = query.Order("artifact_type asc, version desc").Find(&schemas).Error
	return schemas, err
}

// CreateArtifact only inserts a new immutable Artifact row.
func CreateArtifact(item model.Artifact) (model.Artifact, error) {
	database, err := DB()
	if err != nil {
		return item, err
	}
	return item, database.Create(&item).Error
}

// CreateArtifacts inserts one immutable Artifact set atomically.
func CreateArtifacts(items []model.Artifact) error {
	if len(items) == 0 {
		return nil
	}
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		return tx.Create(&items).Error
	})
}

func GetUserArtifact(userID, id string) (model.Artifact, bool, error) {
	database, err := DB()
	if err != nil {
		return model.Artifact{}, false, err
	}
	var item model.Artifact
	result := database.Where("user_id = ? AND id = ?", strings.TrimSpace(userID), strings.TrimSpace(id)).Limit(1).Find(&item)
	if result.Error != nil {
		return item, false, result.Error
	}
	return item, result.RowsAffected == 1, nil
}

func GetUserArtifactsByIDs(userID string, ids []string) (map[string]model.Artifact, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	unique := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, rawID := range ids {
		id := strings.TrimSpace(rawID)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	result := make(map[string]model.Artifact, len(unique))
	if len(unique) == 0 {
		return result, nil
	}
	var items []model.Artifact
	if err := database.Where("user_id = ? AND id IN ?", strings.TrimSpace(userID), unique).Find(&items).Error; err != nil {
		return nil, err
	}
	for _, item := range items {
		result[item.ID] = item
	}
	return result, nil
}

func ListUserArtifacts(userID string, query ArtifactQuery) ([]model.Artifact, int64, error) {
	database, err := DB()
	if err != nil {
		return nil, 0, err
	}
	page := model.Query{Page: query.Page, PageSize: query.PageSize}
	page.Normalize()
	tx := database.Model(&model.Artifact{}).Where("user_id = ?", strings.TrimSpace(userID))
	if value := strings.TrimSpace(query.ProjectID); value != "" {
		tx = tx.Where("project_id = ?", value)
	}
	if value := strings.TrimSpace(query.EpisodeID); value != "" {
		tx = tx.Where("episode_id = ?", value)
	}
	if value := strings.TrimSpace(query.ArtifactType); value != "" {
		tx = tx.Where("artifact_type = ?", value)
	}
	if value := strings.TrimSpace(query.ProducerInvocationID); value != "" {
		tx = tx.Where("producer_invocation_id = ?", value)
	}
	approved := `(artifacts.artifact_type = 'source_text' AND artifacts.producer_invocation_id IS NULL) OR EXISTS (
		SELECT 1 FROM invocation_runs runs
		JOIN invocation_artifact_refs refs ON refs.user_id = artifacts.user_id
			AND refs.invocation_id = runs.id AND refs.direction = 'output'
			AND refs.attempt = runs.reviewed_attempt AND refs.artifact_id = artifacts.id
			AND refs.artifact_hash = artifacts.content_hash AND refs.artifact_type = artifacts.artifact_type
			AND refs.schema_version = artifacts.schema_version AND refs.schema_content_hash = artifacts.schema_content_hash
		JOIN invocation_reviews reviews ON reviews.user_id = runs.user_id
			AND reviews.invocation_id = runs.id AND reviews.attempt = runs.reviewed_attempt
			AND reviews.artifact_set_hash = runs.reviewed_artifact_set_hash AND reviews.decision = 'approved'
		WHERE runs.user_id = artifacts.user_id AND runs.id = artifacts.producer_invocation_id
			AND runs.status IN ('approved', 'applied') AND runs.reviewed_attempt > 0
			AND runs.reviewed_artifact_set_hash <> ''
	)`
	rejected := `EXISTS (
		SELECT 1 FROM invocation_runs runs
		JOIN invocation_artifact_refs refs ON refs.user_id = artifacts.user_id
			AND refs.invocation_id = runs.id AND refs.direction = 'output'
			AND refs.attempt = runs.reviewed_attempt AND refs.artifact_id = artifacts.id
			AND refs.artifact_hash = artifacts.content_hash AND refs.artifact_type = artifacts.artifact_type
			AND refs.schema_version = artifacts.schema_version AND refs.schema_content_hash = artifacts.schema_content_hash
		JOIN invocation_reviews reviews ON reviews.user_id = runs.user_id
			AND reviews.invocation_id = runs.id AND reviews.attempt = runs.reviewed_attempt
			AND reviews.artifact_set_hash = runs.reviewed_artifact_set_hash AND reviews.decision = 'rejected'
		WHERE runs.user_id = artifacts.user_id AND runs.id = artifacts.producer_invocation_id
			AND runs.status = 'rejected'
	)`
	switch strings.ToLower(strings.TrimSpace(query.ApprovalState)) {
	case "approved":
		tx = tx.Where(approved)
	case "rejected":
		tx = tx.Where(rejected)
	case "pending":
		tx = tx.Where("NOT (" + approved + ") AND NOT (" + rejected + ")")
	case "unapproved":
		tx = tx.Where("NOT (" + approved + ")")
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.Artifact
	err = tx.Order("created_at desc, id desc").Offset(page.Offset()).Limit(page.PageSize).Find(&items).Error
	return items, total, err
}
