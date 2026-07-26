package repository

import (
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

var (
	ErrAgentPlanIdempotencyConflict = errors.New("Agent Plan 幂等键冲突")
	ErrAgentPlanTransitionConflict  = errors.New("Agent Plan 状态已变化")
)

func CreateAgentPlanAggregateIdempotently(plan model.AgentPlan, revision model.AgentPlanRevision, steps []model.AgentPlanStep) (model.AgentPlan, bool, error) {
	database, err := DB()
	if err != nil {
		return plan, false, err
	}
	plan.IdempotencyKey = strings.TrimSpace(plan.IdempotencyKey)
	lookup := func(db *gorm.DB) (model.AgentPlan, bool, error) {
		var existing model.AgentPlan
		result := db.Where("user_id = ? AND idempotency_key = ?", strings.TrimSpace(plan.UserID), plan.IdempotencyKey).Limit(1).Find(&existing)
		return existing, result.RowsAffected == 1, result.Error
	}
	if existing, ok, lookupErr := lookup(database); lookupErr != nil {
		return plan, false, lookupErr
	} else if ok {
		if existing.RequestHash != plan.RequestHash {
			return existing, false, ErrAgentPlanIdempotencyConflict
		}
		return existing, false, nil
	}
	if err := validateAgentPlanAggregate(plan, revision, steps); err != nil {
		return plan, false, err
	}
	err = database.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&plan).Error; err != nil {
			return err
		}
		if err := tx.Create(&revision).Error; err != nil {
			return err
		}
		if len(steps) > 0 {
			return tx.Create(&steps).Error
		}
		return nil
	})
	if err == nil {
		return plan, true, nil
	}
	if existing, ok, lookupErr := lookup(database); lookupErr == nil && ok {
		if existing.RequestHash != plan.RequestHash {
			return existing, false, ErrAgentPlanIdempotencyConflict
		}
		return existing, false, nil
	}
	return plan, false, err
}

func GetUserAgentPlan(userID, id string) (model.AgentPlan, bool, error) {
	database, err := DB()
	if err != nil {
		return model.AgentPlan{}, false, err
	}
	var plan model.AgentPlan
	result := database.Where("id = ? AND user_id = ?", strings.TrimSpace(id), strings.TrimSpace(userID)).Limit(1).Find(&plan)
	return plan, result.RowsAffected == 1, result.Error
}

func GetAgentPlanRevision(planID string, revision int) (model.AgentPlanRevision, []model.AgentPlanStep, bool, error) {
	database, err := DB()
	if err != nil {
		return model.AgentPlanRevision{}, nil, false, err
	}
	var item model.AgentPlanRevision
	result := database.Where("agent_plan_id = ? AND revision = ?", strings.TrimSpace(planID), revision).Limit(1).Find(&item)
	if result.Error != nil || result.RowsAffected != 1 {
		return item, nil, false, result.Error
	}
	var steps []model.AgentPlanStep
	if err := database.Where("agent_plan_id = ? AND revision = ?", item.AgentPlanID, item.Revision).Order("ordinal asc").Find(&steps).Error; err != nil {
		return item, nil, false, err
	}
	return item, steps, true, nil
}

func GetAgentPlanConfirmation(planID string, revision int) (model.AgentPlanConfirmation, bool, error) {
	database, err := DB()
	if err != nil {
		return model.AgentPlanConfirmation{}, false, err
	}
	var item model.AgentPlanConfirmation
	result := database.Where("agent_plan_id = ? AND revision = ?", strings.TrimSpace(planID), revision).Limit(1).Find(&item)
	return item, result.RowsAffected == 1, result.Error
}

func AppendAgentPlanRevision(plan model.AgentPlan, revision model.AgentPlanRevision, steps []model.AgentPlanStep) error {
	if err := validateAgentPlanAggregate(plan, revision, steps); err != nil {
		return err
	}
	if revision.Revision < 2 || plan.CurrentRevision != revision.Revision {
		return ErrAgentPlanTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	for range 20 {
		err = database.Transaction(func(tx *gorm.DB) error {
			result := tx.Model(&model.AgentPlan{}).
				Where("id = ? AND user_id = ? AND current_revision = ? AND status IN ?", plan.ID, plan.UserID, revision.Revision-1,
					[]model.AgentPlanStatus{model.AgentPlanDraft, model.AgentPlanPreflight, model.AgentPlanAwaitingConfirmation, model.AgentPlanBlocked}).
				Updates(map[string]any{
					"agent_version_id": plan.AgentVersionID, "goal": plan.Goal, "status": plan.Status,
					"current_revision": plan.CurrentRevision, "estimated_credits": plan.EstimatedCredits,
					"confirmation_fingerprint": plan.ConfirmationFingerprint, "updated_at": plan.UpdatedAt,
				})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrAgentPlanTransitionConflict
			}
			if err := tx.Create(&revision).Error; err != nil {
				return err
			}
			if len(steps) > 0 {
				return tx.Create(&steps).Error
			}
			return nil
		})
		if !isSQLiteContention(database, err) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	return err
}

func ConfirmAgentPlanTx(plan model.AgentPlan, confirmation model.AgentPlanConfirmation) error {
	if plan.Status != model.AgentPlanRunning || confirmation.AgentPlanID != plan.ID || confirmation.UserID != plan.UserID ||
		confirmation.Revision != plan.CurrentRevision || confirmation.Fingerprint == "" || confirmation.Fingerprint != plan.ConfirmationFingerprint ||
		confirmation.EstimatedCredits != plan.EstimatedCredits {
		return ErrAgentPlanTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	for range 20 {
		err = database.Transaction(func(tx *gorm.DB) error {
			result := tx.Model(&model.AgentPlan{}).
				Where("id = ? AND user_id = ? AND status = ? AND current_revision = ? AND confirmation_fingerprint = ? AND estimated_credits = ?",
					plan.ID, plan.UserID, model.AgentPlanAwaitingConfirmation, plan.CurrentRevision, plan.ConfirmationFingerprint, plan.EstimatedCredits).
				Updates(map[string]any{"status": plan.Status, "updated_at": plan.UpdatedAt})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrAgentPlanTransitionConflict
			}
			return tx.Create(&confirmation).Error
		})
		if !isSQLiteContention(database, err) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	return err
}

func ApplyAgentPlanPreflight(plan model.AgentPlan, revision model.AgentPlanRevision, steps []model.AgentPlanStep) error {
	if plan.Status != model.AgentPlanAwaitingConfirmation || revision.AgentPlanID != plan.ID || revision.UserID != plan.UserID ||
		revision.Revision != plan.CurrentRevision || revision.AgentVersionID != plan.AgentVersionID ||
		revision.ConfirmationFingerprint == "" || revision.ConfirmationFingerprint != plan.ConfirmationFingerprint ||
		revision.EstimatedCredits != plan.EstimatedCredits || len(steps) == 0 {
		return ErrAgentPlanTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	for range 20 {
		err = database.Transaction(func(tx *gorm.DB) error {
			planResult := tx.Model(&model.AgentPlan{}).
				Where("id = ? AND user_id = ? AND current_revision = ? AND agent_version_id = ? AND status = ? AND confirmation_fingerprint = ''",
					plan.ID, plan.UserID, plan.CurrentRevision, plan.AgentVersionID, model.AgentPlanDraft).
				Updates(map[string]any{
					"status": plan.Status, "estimated_credits": plan.EstimatedCredits,
					"confirmation_fingerprint": plan.ConfirmationFingerprint, "updated_at": plan.UpdatedAt,
				})
			if planResult.Error != nil {
				return planResult.Error
			}
			if planResult.RowsAffected != 1 {
				return ErrAgentPlanTransitionConflict
			}
			revisionResult := tx.Model(&model.AgentPlanRevision{}).
				Where("id = ? AND user_id = ? AND agent_plan_id = ? AND revision = ? AND confirmation_fingerprint = ''",
					revision.ID, revision.UserID, revision.AgentPlanID, revision.Revision).
				Updates(map[string]any{
					"agent_content_hash": revision.AgentContentHash, "source_artifact_refs_json": revision.SourceArtifactRefsJSON,
					"plan_snapshot_json": revision.PlanSnapshotJSON, "confirmation_fingerprint": revision.ConfirmationFingerprint,
					"estimated_credits": revision.EstimatedCredits,
				})
			if revisionResult.Error != nil {
				return revisionResult.Error
			}
			if revisionResult.RowsAffected != 1 {
				return ErrAgentPlanTransitionConflict
			}
			for index := range steps {
				step := steps[index]
				result := tx.Model(&model.AgentPlanStep{}).
					Where("id = ? AND user_id = ? AND agent_plan_id = ? AND revision = ? AND ordinal = ? AND status = ? AND invocation_id = ''",
						step.ID, step.UserID, step.AgentPlanID, step.Revision, step.Ordinal, model.AgentPlanStepPending).
					Updates(map[string]any{
						"label": step.Label, "capability": step.Capability, "skill_id": step.SkillID,
						"skill_version_id": step.SkillVersionID, "skill_version": step.SkillVersion,
						"skill_content_hash": step.SkillContentHash, "input_bindings_json": step.InputBindingsJSON,
						"parameters_json": step.ParametersJSON, "expected_output_type": step.ExpectedOutputType,
						"status": step.Status, "updated_at": step.UpdatedAt,
					})
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return ErrAgentPlanTransitionConflict
				}
			}
			return nil
		})
		if !isSQLiteContention(database, err) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	return err
}

func BindAgentPlanStepInvocation(planID string, revision, ordinal int, invocationID, updatedAt string) error {
	database, err := DB()
	if err != nil {
		return err
	}
	for range 20 {
		result := database.Model(&model.AgentPlanStep{}).
			Where("agent_plan_id = ? AND revision = ? AND ordinal = ? AND status = ? AND invocation_id = '' AND EXISTS (SELECT 1 FROM agent_plans WHERE agent_plans.id = agent_plan_steps.agent_plan_id AND agent_plans.current_revision = ? AND agent_plans.status = ?)",
				strings.TrimSpace(planID), revision, ordinal, model.AgentPlanStepReady, revision, model.AgentPlanRunning).
			Updates(map[string]any{"invocation_id": strings.TrimSpace(invocationID), "status": model.AgentPlanStepQueued, "updated_at": updatedAt})
		if result.Error == nil {
			if result.RowsAffected != 1 {
				return ErrAgentPlanTransitionConflict
			}
			return nil
		}
		err = result.Error
		if !isSQLiteContention(database, err) {
			return err
		}
		time.Sleep(time.Millisecond)
	}
	return err
}

func UpdateAgentPlanStepResult(plan model.AgentPlan, step model.AgentPlanStep) error {
	if step.AgentPlanID != plan.ID || step.UserID != plan.UserID || step.Revision != plan.CurrentRevision || step.InvocationID == "" {
		return ErrAgentPlanTransitionConflict
	}
	stepPrevious := agentPlanStepPreviousStatuses(step.Status)
	planPrevious := agentPlanPreviousStatuses(plan.Status)
	if len(stepPrevious) == 0 || len(planPrevious) == 0 {
		return ErrAgentPlanTransitionConflict
	}
	database, err := DB()
	if err != nil {
		return err
	}
	for range 20 {
		err = database.Transaction(func(tx *gorm.DB) error {
			stepResult := tx.Model(&model.AgentPlanStep{}).
				Where("id = ? AND user_id = ? AND agent_plan_id = ? AND revision = ? AND invocation_id = ? AND status IN ?",
					step.ID, step.UserID, step.AgentPlanID, step.Revision, step.InvocationID, stepPrevious).
				Updates(map[string]any{
					"status": step.Status, "output_artifact_refs_json": step.OutputArtifactRefsJSON,
					"error_code": step.ErrorCode, "error_message": step.ErrorMessage, "updated_at": step.UpdatedAt,
				})
			if stepResult.Error != nil {
				return stepResult.Error
			}
			if stepResult.RowsAffected != 1 {
				return ErrAgentPlanTransitionConflict
			}
			planResult := tx.Model(&model.AgentPlan{}).
				Where("id = ? AND user_id = ? AND current_revision = ? AND status IN ?", plan.ID, plan.UserID, plan.CurrentRevision, planPrevious).
				Updates(map[string]any{"status": plan.Status, "updated_at": plan.UpdatedAt})
			if planResult.Error != nil {
				return planResult.Error
			}
			if planResult.RowsAffected != 1 {
				return ErrAgentPlanTransitionConflict
			}
			return nil
		})
		if !isSQLiteContention(database, err) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	return err
}

func validateAgentPlanAggregate(plan model.AgentPlan, revision model.AgentPlanRevision, steps []model.AgentPlanStep) error {
	if strings.TrimSpace(plan.ID) == "" || strings.TrimSpace(plan.UserID) == "" || strings.TrimSpace(plan.IdempotencyKey) == "" || strings.TrimSpace(plan.RequestHash) == "" ||
		revision.AgentPlanID != plan.ID || revision.UserID != plan.UserID || revision.Revision != plan.CurrentRevision || revision.AgentVersionID != plan.AgentVersionID || len(steps) == 0 {
		return ErrAgentPlanTransitionConflict
	}
	for index, step := range steps {
		if step.AgentPlanID != plan.ID || step.UserID != plan.UserID || step.Revision != revision.Revision || step.Ordinal != index+1 || strings.TrimSpace(step.StepKey) == "" {
			return ErrAgentPlanTransitionConflict
		}
	}
	return nil
}

func agentPlanStepPreviousStatuses(target model.AgentPlanStepStatus) []model.AgentPlanStepStatus {
	switch target {
	case model.AgentPlanStepRunning:
		return []model.AgentPlanStepStatus{model.AgentPlanStepQueued}
	case model.AgentPlanStepNeedsReview:
		return []model.AgentPlanStepStatus{model.AgentPlanStepQueued, model.AgentPlanStepRunning}
	case model.AgentPlanStepApproved:
		return []model.AgentPlanStepStatus{model.AgentPlanStepNeedsReview}
	case model.AgentPlanStepCompleted:
		return []model.AgentPlanStepStatus{model.AgentPlanStepApproved}
	case model.AgentPlanStepFailed:
		return []model.AgentPlanStepStatus{model.AgentPlanStepQueued, model.AgentPlanStepRunning, model.AgentPlanStepNeedsReview}
	case model.AgentPlanStepCancelled:
		return []model.AgentPlanStepStatus{model.AgentPlanStepPending, model.AgentPlanStepReady, model.AgentPlanStepQueued, model.AgentPlanStepRunning, model.AgentPlanStepNeedsReview}
	default:
		return nil
	}
}

func agentPlanPreviousStatuses(target model.AgentPlanStatus) []model.AgentPlanStatus {
	switch target {
	case model.AgentPlanRunning:
		return []model.AgentPlanStatus{model.AgentPlanRunning, model.AgentPlanNeedsReview}
	case model.AgentPlanNeedsReview:
		return []model.AgentPlanStatus{model.AgentPlanRunning}
	case model.AgentPlanCompleted:
		return []model.AgentPlanStatus{model.AgentPlanRunning, model.AgentPlanNeedsReview}
	case model.AgentPlanFailed:
		return []model.AgentPlanStatus{model.AgentPlanRunning, model.AgentPlanNeedsReview}
	case model.AgentPlanCancelled:
		return []model.AgentPlanStatus{model.AgentPlanDraft, model.AgentPlanPreflight, model.AgentPlanAwaitingConfirmation, model.AgentPlanRunning, model.AgentPlanNeedsReview, model.AgentPlanBlocked}
	default:
		return nil
	}
}
