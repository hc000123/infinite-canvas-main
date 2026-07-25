package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

var errArtifactSchemaVersionConflict = errors.New("Artifact Schema 版本内容冲突")

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
