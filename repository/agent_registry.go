package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrAgentVersionTransitionConflict = errors.New("Agent 版本状态已变化")

func CreateAgentAggregate(agent model.AgentDefinition, version model.AgentVersion) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&agent).Error; err != nil {
			return err
		}
		return tx.Create(&version).Error
	})
}

func GetAgentDefinition(id string) (model.AgentDefinition, bool, error) {
	database, err := DB()
	if err != nil {
		return model.AgentDefinition{}, false, err
	}
	var agent model.AgentDefinition
	err = database.First(&agent, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return agent, false, nil
	}
	return agent, err == nil, err
}

func GetAgentVersion(id string) (model.AgentVersion, bool, error) {
	database, err := DB()
	if err != nil {
		return model.AgentVersion{}, false, err
	}
	var version model.AgentVersion
	err = database.First(&version, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return version, false, nil
	}
	return version, err == nil, err
}

func ListAgentVersions(agentID string) ([]model.AgentVersion, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.AgentVersion
	err = database.Where("agent_id = ?", strings.TrimSpace(agentID)).Order("created_at desc").Find(&items).Error
	return items, err
}

func ListVisibleAgentDefinitions(userID, projectID string) ([]model.AgentDefinition, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.AgentDefinition
	err = database.Where(
		"owner_type = ? OR (owner_type = ? AND owner_user_id = ? AND owner_project_id = ?)",
		model.AgentOwnerSystem,
		model.AgentOwnerProject,
		strings.TrimSpace(userID),
		strings.TrimSpace(projectID),
	).Order("owner_type desc, name asc").Find(&items).Error
	return items, err
}

func ListSystemAgentDefinitions() ([]model.AgentDefinition, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.AgentDefinition
	err = database.Where("owner_type = ?", model.AgentOwnerSystem).Order("name asc").Find(&items).Error
	return items, err
}

func CreateAgentVersion(version model.AgentVersion) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Create(&version).Error
}

func SaveAgentDraft(version model.AgentVersion) error {
	database, err := DB()
	if err != nil {
		return err
	}
	result := database.Model(&model.AgentVersion{}).
		Where("id = ? AND status = ?", strings.TrimSpace(version.ID), model.AgentVersionDraft).
		Updates(map[string]any{
			"version":                  version.Version,
			"role_prompt":              version.RolePrompt,
			"planner_mode":             version.PlannerMode,
			"default_skill_refs_json":  version.DefaultSkillRefsJSON,
			"skill_access_policy_json": version.SkillAccessPolicyJSON,
			"model_policy_json":        version.ModelPolicyJSON,
			"tool_policy_json":         version.ToolPolicyJSON,
			"execution_policy_json":    version.ExecutionPolicyJSON,
			"content_hash":             version.ContentHash,
			"updated_at":               version.UpdatedAt,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrAgentVersionTransitionConflict
	}
	return nil
}

func PublishAgentVersion(version model.AgentVersion) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		var current model.AgentVersion
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "id = ? AND status = ?", strings.TrimSpace(version.ID), model.AgentVersionDraft).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAgentVersionTransitionConflict
			}
			return err
		}
		if err := validateAgentSkillReferences(tx, current.DefaultSkillRefsJSON, current.SkillAccessPolicyJSON); err != nil {
			return err
		}
		result := tx.Model(&model.AgentVersion{}).
			Where("id = ? AND status = ?", current.ID, model.AgentVersionDraft).
			Updates(map[string]any{
				"status":       model.AgentVersionPublished,
				"published_at": version.PublishedAt,
				"updated_at":   version.UpdatedAt,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrAgentVersionTransitionConflict
		}
		return nil
	})
}

func SetRecommendedAgentVersion(agentID, versionID, updatedAt string) error {
	database, err := DB()
	if err != nil {
		return err
	}
	result := database.Model(&model.AgentDefinition{}).
		Where("id = ?", strings.TrimSpace(agentID)).
		Updates(map[string]any{
			"recommended_version_id": strings.TrimSpace(versionID),
			"updated_at":             updatedAt,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("Agent 不存在")
	}
	return nil
}
