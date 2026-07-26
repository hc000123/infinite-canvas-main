package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func CreateWorkflowRunAggregate(run model.WorkflowRun, stages []model.WorkflowStageRun, artifacts []model.WorkflowArtifact, gates []model.WorkflowQualityGateResult, events []model.WorkflowEvent) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&run).Error; err != nil {
			return err
		}
		if len(stages) > 0 {
			if err := tx.Create(&stages).Error; err != nil {
				return err
			}
		}
		if len(artifacts) > 0 {
			if err := tx.Create(&artifacts).Error; err != nil {
				return err
			}
		}
		if len(gates) > 0 {
			if err := tx.Create(&gates).Error; err != nil {
				return err
			}
		}
		if len(events) > 0 {
			if err := tx.Create(&events).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func SaveWorkflowRun(run model.WorkflowRun) (model.WorkflowRun, error) {
	db, err := DB()
	if err != nil {
		return run, err
	}
	return run, db.Save(&run).Error
}

func GetUserWorkflowRun(userID string, id string) (model.WorkflowRun, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowRun{}, false, err
	}
	var run model.WorkflowRun
	err = db.Where("id = ? AND user_id = ?", strings.TrimSpace(id), strings.TrimSpace(userID)).First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowRun{}, false, nil
	}
	return run, err == nil, err
}

func GetWorkflowRun(id string) (model.WorkflowRun, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowRun{}, false, err
	}
	var run model.WorkflowRun
	err = db.Where("id = ?", strings.TrimSpace(id)).First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return run, false, nil
	}
	return run, err == nil, err
}

func FindWorkflowRunByScope(userID string, projectID string, episodeID string, workflowID string, workflowVersion string, scriptHash string) (model.WorkflowRun, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowRun{}, false, err
	}
	var run model.WorkflowRun
	err = db.Where(
		"user_id = ? AND project_id = ? AND episode_id = ? AND workflow_id = ? AND workflow_version = ? AND script_hash = ?",
		strings.TrimSpace(userID), strings.TrimSpace(projectID), strings.TrimSpace(episodeID), strings.TrimSpace(workflowID), strings.TrimSpace(workflowVersion), strings.TrimSpace(scriptHash),
	).First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowRun{}, false, nil
	}
	return run, err == nil, err
}

func SaveWorkflowStageRun(stage model.WorkflowStageRun) (model.WorkflowStageRun, error) {
	db, err := DB()
	if err != nil {
		return stage, err
	}
	return stage, db.Save(&stage).Error
}

func CreateWorkflowStageWithEvent(stage model.WorkflowStageRun, event model.WorkflowEvent) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&stage).Error; err != nil {
			return err
		}
		return tx.Create(&event).Error
	})
}

func GetUserWorkflowStageRun(userID string, id string) (model.WorkflowStageRun, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowStageRun{}, false, err
	}
	var stage model.WorkflowStageRun
	err = db.Where("id = ? AND user_id = ?", strings.TrimSpace(id), strings.TrimSpace(userID)).First(&stage).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowStageRun{}, false, nil
	}
	return stage, err == nil, err
}

func GetWorkflowStageRunByAgentRunID(agentRunID string) (model.WorkflowStageRun, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowStageRun{}, false, err
	}
	var stage model.WorkflowStageRun
	err = db.Where("agent_run_id = ?", strings.TrimSpace(agentRunID)).First(&stage).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowStageRun{}, false, nil
	}
	return stage, err == nil, err
}

func GetWorkflowStageRunByInvocationID(invocationID string) (model.WorkflowStageRun, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowStageRun{}, false, err
	}
	invocationID = strings.TrimSpace(invocationID)
	if invocationID == "" {
		return model.WorkflowStageRun{}, false, nil
	}
	var stage model.WorkflowStageRun
	err = db.Where("invocation_id = ?", invocationID).Order("attempt desc, created_at desc").First(&stage).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowStageRun{}, false, nil
	}
	return stage, err == nil, err
}

func ListWorkflowStageRuns(userID string, workflowRunID string) ([]model.WorkflowStageRun, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var stages []model.WorkflowStageRun
	err = db.Where("user_id = ? AND workflow_run_id = ?", strings.TrimSpace(userID), strings.TrimSpace(workflowRunID)).Order("stage_id asc, attempt desc, created_at desc").Find(&stages).Error
	return stages, err
}

func LatestWorkflowStageRun(userID string, workflowRunID string, stageID string) (model.WorkflowStageRun, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowStageRun{}, false, err
	}
	var stage model.WorkflowStageRun
	err = db.Where("user_id = ? AND workflow_run_id = ? AND stage_id = ?", strings.TrimSpace(userID), strings.TrimSpace(workflowRunID), strings.TrimSpace(stageID)).Order("attempt desc, created_at desc").First(&stage).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowStageRun{}, false, nil
	}
	return stage, err == nil, err
}

func SaveWorkflowArtifact(artifact model.WorkflowArtifact) (model.WorkflowArtifact, error) {
	db, err := DB()
	if err != nil {
		return artifact, err
	}
	return artifact, db.Save(&artifact).Error
}

func GetUserWorkflowArtifact(userID string, id string) (model.WorkflowArtifact, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowArtifact{}, false, err
	}
	var artifact model.WorkflowArtifact
	err = db.Where("id = ? AND user_id = ?", strings.TrimSpace(id), strings.TrimSpace(userID)).First(&artifact).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowArtifact{}, false, nil
	}
	return artifact, err == nil, err
}

func ListWorkflowArtifacts(userID string, workflowRunID string) ([]model.WorkflowArtifact, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var artifacts []model.WorkflowArtifact
	err = db.Where("user_id = ? AND workflow_run_id = ?", strings.TrimSpace(userID), strings.TrimSpace(workflowRunID)).Order("created_at asc, version asc").Find(&artifacts).Error
	return artifacts, err
}

func LatestWorkflowArtifactForStage(userID string, workflowRunID string, stageID string) (model.WorkflowArtifact, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowArtifact{}, false, err
	}
	var artifact model.WorkflowArtifact
	err = db.Table("workflow_artifacts").
		Select("workflow_artifacts.*").
		Joins("JOIN workflow_stage_runs ON workflow_stage_runs.id = workflow_artifacts.stage_run_id").
		Where("workflow_artifacts.user_id = ? AND workflow_artifacts.workflow_run_id = ? AND workflow_stage_runs.stage_id = ?", strings.TrimSpace(userID), strings.TrimSpace(workflowRunID), strings.TrimSpace(stageID)).
		Order("workflow_artifacts.created_at desc, workflow_artifacts.version desc").First(&artifact).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowArtifact{}, false, nil
	}
	return artifact, err == nil, err
}

func SaveWorkflowQualityGateResult(gate model.WorkflowQualityGateResult) (model.WorkflowQualityGateResult, error) {
	db, err := DB()
	if err != nil {
		return gate, err
	}
	return gate, db.Save(&gate).Error
}

func GetWorkflowQualityGateForArtifact(userID string, artifactID string) (model.WorkflowQualityGateResult, bool, error) {
	db, err := DB()
	if err != nil {
		return model.WorkflowQualityGateResult{}, false, err
	}
	var gate model.WorkflowQualityGateResult
	err = db.Where("user_id = ? AND artifact_id = ?", strings.TrimSpace(userID), strings.TrimSpace(artifactID)).Order("created_at desc").First(&gate).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.WorkflowQualityGateResult{}, false, nil
	}
	return gate, err == nil, err
}

func ListWorkflowQualityGateResults(userID string, workflowRunID string) ([]model.WorkflowQualityGateResult, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var gates []model.WorkflowQualityGateResult
	err = db.Where("user_id = ? AND workflow_run_id = ?", strings.TrimSpace(userID), strings.TrimSpace(workflowRunID)).Order("created_at asc").Find(&gates).Error
	return gates, err
}

func AppendWorkflowEvent(event model.WorkflowEvent) (model.WorkflowEvent, error) {
	db, err := DB()
	if err != nil {
		return event, err
	}
	return event, db.Create(&event).Error
}

func ListWorkflowEvents(userID string, workflowRunID string, after uint64, limit int) ([]model.WorkflowEvent, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	var events []model.WorkflowEvent
	err = db.Where("user_id = ? AND workflow_run_id = ? AND id > ?", strings.TrimSpace(userID), strings.TrimSpace(workflowRunID), after).Order("id asc").Limit(limit).Find(&events).Error
	return events, err
}

func CompleteWorkflowStage(stage model.WorkflowStageRun, artifact model.WorkflowArtifact, gate model.WorkflowQualityGateResult, event model.WorkflowEvent) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&artifact).Error; err != nil {
			return err
		}
		if err := tx.Create(&gate).Error; err != nil {
			return err
		}
		if err := tx.Save(&stage).Error; err != nil {
			return err
		}
		return tx.Create(&event).Error
	})
}

func SaveWorkflowStageTransition(stage model.WorkflowStageRun, event model.WorkflowEvent) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&stage).Error; err != nil {
			return err
		}
		return tx.Create(&event).Error
	})
}
