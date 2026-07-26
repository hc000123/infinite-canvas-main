package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

var (
	ErrWorkflowVersionTransitionConflict    = errors.New("Workflow 版本状态已变化")
	ErrWorkflowExecutionTransitionConflict  = errors.New("Workflow execution 状态已变化")
	ErrWorkflowExecutionIdempotencyConflict = errors.New("workflow execution idempotency conflict")
)

func CreateWorkflowDefinitionAggregate(definition model.WorkflowDefinition, version model.WorkflowVersion) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&definition).Error; err != nil {
			return err
		}
		return tx.Create(&version).Error
	})
}

func GetWorkflowDefinition(id string) (model.WorkflowDefinition, bool, error) {
	database, err := DB()
	if err != nil {
		return model.WorkflowDefinition{}, false, err
	}
	var definition model.WorkflowDefinition
	err = database.First(&definition, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return definition, false, nil
	}
	return definition, err == nil, err
}

func GetWorkflowVersion(id string) (model.WorkflowVersion, bool, error) {
	database, err := DB()
	if err != nil {
		return model.WorkflowVersion{}, false, err
	}
	var version model.WorkflowVersion
	err = database.First(&version, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return version, false, nil
	}
	return version, err == nil, err
}

func ListVisibleWorkflowDefinitions(userID, projectID string) ([]model.WorkflowDefinition, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.WorkflowDefinition
	err = database.Where(
		"owner_type = ? OR (owner_type = ? AND owner_user_id = ? AND owner_project_id = ?)",
		model.WorkflowOwnerSystem, model.WorkflowOwnerProject, strings.TrimSpace(userID), strings.TrimSpace(projectID),
	).Order("owner_type desc, name asc").Find(&items).Error
	return items, err
}

func ListWorkflowVersions(workflowID string) ([]model.WorkflowVersion, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.WorkflowVersion
	err = database.Where("workflow_id = ?", strings.TrimSpace(workflowID)).Order("created_at desc").Find(&items).Error
	return items, err
}

func CreateWorkflowVersion(version model.WorkflowVersion) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Create(&version).Error
}

func SaveWorkflowDraft(version model.WorkflowVersion) error {
	database, err := DB()
	if err != nil {
		return err
	}
	result := database.Model(&model.WorkflowVersion{}).
		Where("id = ? AND status = ?", strings.TrimSpace(version.ID), model.WorkflowVersionDraft).
		Updates(map[string]any{"package_json": version.PackageJSON, "content_hash": version.ContentHash, "updated_at": version.UpdatedAt})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrWorkflowVersionTransitionConflict
	}
	return nil
}

func PublishWorkflowVersion(version model.WorkflowVersion) error {
	database, err := DB()
	if err != nil {
		return err
	}
	result := database.Model(&model.WorkflowVersion{}).
		Where("id = ? AND status = ?", strings.TrimSpace(version.ID), model.WorkflowVersionDraft).
		Updates(map[string]any{
			"package_json": version.PackageJSON, "content_hash": version.ContentHash,
			"status": model.WorkflowVersionPublished, "published_at": version.PublishedAt, "updated_at": version.UpdatedAt,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrWorkflowVersionTransitionConflict
	}
	return nil
}

func SetRecommendedWorkflowVersion(workflowID, versionID, updatedAt string) error {
	database, err := DB()
	if err != nil {
		return err
	}
	result := database.Model(&model.WorkflowDefinition{}).Where("id = ?", strings.TrimSpace(workflowID)).Updates(map[string]any{
		"recommended_version_id": strings.TrimSpace(versionID), "updated_at": updatedAt,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("Workflow 不存在")
	}
	return nil
}

func CreateWorkflowExecutionAggregateIdempotently(run model.WorkflowExecution, revision model.WorkflowExecutionRevision, nodes []model.WorkflowNodeExecution) (model.WorkflowExecution, bool, error) {
	database, err := DB()
	if err != nil {
		return run, false, err
	}
	key := ""
	if run.IdempotencyKey != nil {
		key = strings.TrimSpace(*run.IdempotencyKey)
	}
	if key == "" {
		run.IdempotencyKey = nil
	} else {
		run.IdempotencyKey = &key
	}
	lookup := func(db *gorm.DB) (model.WorkflowExecution, bool, error) {
		if key == "" {
			return model.WorkflowExecution{}, false, nil
		}
		var existing model.WorkflowExecution
		result := db.Where("user_id = ? AND idempotency_key = ?", strings.TrimSpace(run.UserID), key).Limit(1).Find(&existing)
		return existing, result.RowsAffected == 1, result.Error
	}
	if existing, ok, lookupErr := lookup(database); lookupErr != nil {
		return run, false, lookupErr
	} else if ok {
		if existing.RequestHash != run.RequestHash {
			return existing, false, ErrWorkflowExecutionIdempotencyConflict
		}
		return existing, false, nil
	}
	if err := validateWorkflowExecutionEnvelope(run, revision, nodes); err != nil {
		return run, false, err
	}
	err = database.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&run).Error; err != nil {
			return err
		}
		if err := tx.Create(&revision).Error; err != nil {
			return err
		}
		if len(nodes) > 0 {
			return tx.Create(&nodes).Error
		}
		return nil
	})
	if err == nil {
		return run, true, nil
	}
	if existing, ok, lookupErr := lookup(database); lookupErr == nil && ok {
		if existing.RequestHash != run.RequestHash {
			return existing, false, ErrWorkflowExecutionIdempotencyConflict
		}
		return existing, false, nil
	}
	return run, false, err
}

func GetUserWorkflowExecution(userID, id string) (model.WorkflowExecution, bool, error) {
	database, err := DB()
	if err != nil {
		return model.WorkflowExecution{}, false, err
	}
	var run model.WorkflowExecution
	result := database.Where("id = ? AND user_id = ?", strings.TrimSpace(id), strings.TrimSpace(userID)).Limit(1).Find(&run)
	return run, result.RowsAffected == 1, result.Error
}

func GetWorkflowExecutionRevision(userID, executionID string, revision int) (model.WorkflowExecutionRevision, bool, error) {
	database, err := DB()
	if err != nil {
		return model.WorkflowExecutionRevision{}, false, err
	}
	var item model.WorkflowExecutionRevision
	result := database.Where("user_id = ? AND workflow_execution_id = ? AND revision = ?", strings.TrimSpace(userID), strings.TrimSpace(executionID), revision).Limit(1).Find(&item)
	return item, result.RowsAffected == 1, result.Error
}

func ListWorkflowNodeExecutions(userID, executionID string, revision int) ([]model.WorkflowNodeExecution, error) {
	database, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.WorkflowNodeExecution
	err = database.Where("user_id = ? AND workflow_execution_id = ? AND revision = ?", strings.TrimSpace(userID), strings.TrimSpace(executionID), revision).Order("ordinal asc").Find(&items).Error
	return items, err
}

func AppendWorkflowExecutionRevision(run model.WorkflowExecution, revision model.WorkflowExecutionRevision, nodes []model.WorkflowNodeExecution, allowedFrom model.WorkflowExecutionStatus) error {
	if err := validateWorkflowExecutionEnvelope(run, revision, nodes); err != nil {
		return err
	}
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.WorkflowExecution{}).
			Where("id = ? AND user_id = ? AND status = ? AND revision = ?", run.ID, run.UserID, allowedFrom, revision.Revision-1).
			Updates(workflowExecutionUpdates(run))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrWorkflowExecutionTransitionConflict
		}
		if err := tx.Create(&revision).Error; err != nil {
			return err
		}
		if len(nodes) > 0 {
			return tx.Create(&nodes).Error
		}
		return nil
	})
}

func SaveWorkflowExecutionProjection(run model.WorkflowExecution, nodes []model.WorkflowNodeExecution) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.WorkflowExecution{}).
			Where("id = ? AND user_id = ? AND revision = ?", run.ID, run.UserID, run.Revision).
			Updates(workflowExecutionUpdates(run))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrWorkflowExecutionTransitionConflict
		}
		for index := range nodes {
			result = tx.Model(&model.WorkflowNodeExecution{}).
				Where("id = ? AND user_id = ? AND workflow_execution_id = ? AND revision = ?", nodes[index].ID, run.UserID, run.ID, run.Revision).
				Updates(map[string]any{
					"invocation_id": nodes[index].InvocationID, "agent_plan_id": nodes[index].AgentPlanID,
					"status": nodes[index].Status, "output_artifact_refs_json": nodes[index].OutputArtifactRefsJSON,
					"error_code": nodes[index].ErrorCode, "error_message": nodes[index].ErrorMessage, "updated_at": nodes[index].UpdatedAt,
				})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrWorkflowExecutionTransitionConflict
			}
		}
		return nil
	})
}

func CreateWorkflowExecutionConfirmation(item model.WorkflowExecutionConfirmation) error {
	database, err := DB()
	if err != nil {
		return err
	}
	return database.Create(&item).Error
}

func GetWorkflowExecutionConfirmation(userID, executionID string, revision int) (model.WorkflowExecutionConfirmation, bool, error) {
	database, err := DB()
	if err != nil {
		return model.WorkflowExecutionConfirmation{}, false, err
	}
	var item model.WorkflowExecutionConfirmation
	result := database.Where("user_id = ? AND workflow_execution_id = ? AND revision = ?", strings.TrimSpace(userID), strings.TrimSpace(executionID), revision).Limit(1).Find(&item)
	return item, result.RowsAffected == 1, result.Error
}

func validateWorkflowExecutionEnvelope(run model.WorkflowExecution, revision model.WorkflowExecutionRevision, nodes []model.WorkflowNodeExecution) error {
	if run.ID == "" || run.UserID == "" || run.Revision != revision.Revision || revision.WorkflowExecutionID != run.ID || revision.UserID != run.UserID {
		return errors.New("Workflow execution revision envelope 无效")
	}
	seen := map[string]bool{}
	for _, node := range nodes {
		if node.UserID != run.UserID || node.WorkflowExecutionID != run.ID || node.Revision != run.Revision || strings.TrimSpace(node.NodeKey) == "" || seen[node.NodeKey] {
			return errors.New("Workflow node execution envelope 无效")
		}
		seen[node.NodeKey] = true
	}
	return nil
}

func workflowExecutionUpdates(run model.WorkflowExecution) map[string]any {
	return map[string]any{
		"status": run.Status, "revision": run.Revision, "estimated_credits": run.EstimatedCredits,
		"confirmation_fingerprint": run.ConfirmationFingerprint, "request_hash": run.RequestHash, "updated_at": run.UpdatedAt,
	}
}
