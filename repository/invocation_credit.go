package repository

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func invocationCreditLogID(agentRunID, settlement string) string {
	return "agent-run:" + strings.TrimSpace(agentRunID) + ":" + settlement
}

func ReserveInvocationAttemptCreditsTx(agentRun model.AgentRun, stamp string) (model.AgentRun, error) {
	database, err := DB()
	if err != nil {
		return model.AgentRun{}, err
	}
	var result model.AgentRun
	err = database.Transaction(func(tx *gorm.DB) error {
		current, attempt, err := lockedInvocationCreditContext(tx, agentRun)
		if err != nil {
			return err
		}
		reserved, refunded, err := reserveInvocationCreditsTx(tx, current, stamp)
		if err != nil {
			return err
		}
		agentUpdate := tx.Model(&model.AgentRun{}).
			Where("id = ? AND status = ? AND lease_owner = ?", current.ID, model.AgentRunStatusRunning, current.LeaseOwner).
			Updates(map[string]any{"credits_reserved": reserved, "credits_refunded": refunded, "updated_at": stamp})
		wantedAgent := current
		wantedAgent.UpdatedAt = stamp
		if err := verifyInvocationAgentCreditUpdateTx(tx, agentUpdate, wantedAgent, reserved, refunded); err != nil {
			return err
		}
		if err := invokeRepositoryHook("credit", "agent_run"); err != nil {
			return err
		}
		attemptUpdate := tx.Model(&model.InvocationAttempt{}).
			Where("id = ? AND invocation_id = ? AND status = ? AND finished_at = ''", attempt.ID, attempt.InvocationID, string(model.AgentRunStatusRunning)).
			Updates(map[string]any{"credits_reserved": reserved, "credits_refunded": refunded, "updated_at": stamp})
		wantedAttempt := attempt
		wantedAttempt.UpdatedAt = stamp
		if err := verifyInvocationAttemptCreditUpdateTx(tx, attemptUpdate, wantedAttempt, reserved, refunded); err != nil {
			return err
		}
		if err := invokeRepositoryHook("credit", "attempt"); err != nil {
			return err
		}
		return tx.Where("id = ?", current.ID).First(&result).Error
	})
	return result, err
}

func verifyInvocationAgentCreditUpdateTx(tx, update *gorm.DB, wanted model.AgentRun, reserved, refunded int) error {
	if update.Error != nil {
		return update.Error
	}
	if update.RowsAffected == 1 {
		return nil
	}
	if update.RowsAffected != 0 {
		return ErrInvocationTransitionConflict
	}
	var count int64
	err := tx.Model(&model.AgentRun{}).Where(
		"id = ? AND user_id = ? AND invocation_id = ? AND invocation_revision = ? AND invocation_attempt = ? AND status = ? AND lease_owner = ? AND credits_reserved = ? AND credits_refunded = ? AND updated_at = ?",
		wanted.ID, wanted.UserID, wanted.InvocationID, wanted.InvocationRevision, wanted.InvocationAttempt, model.AgentRunStatusRunning, wanted.LeaseOwner, reserved, refunded, wanted.UpdatedAt,
	).Count(&count).Error
	if err != nil {
		return err
	}
	if count != 1 {
		return ErrInvocationTransitionConflict
	}
	return nil
}

func verifyInvocationAttemptCreditUpdateTx(tx, update *gorm.DB, wanted model.InvocationAttempt, reserved, refunded int) error {
	if update.Error != nil {
		return update.Error
	}
	if update.RowsAffected == 1 {
		return nil
	}
	if update.RowsAffected != 0 {
		return ErrInvocationTransitionConflict
	}
	var count int64
	err := tx.Model(&model.InvocationAttempt{}).Where(
		"id = ? AND user_id = ? AND invocation_id = ? AND agent_run_id = ? AND revision = ? AND attempt = ? AND status = ? AND finished_at = '' AND credits_reserved = ? AND credits_refunded = ? AND updated_at = ?",
		wanted.ID, wanted.UserID, wanted.InvocationID, wanted.AgentRunID, wanted.Revision, wanted.Attempt, string(model.AgentRunStatusRunning), reserved, refunded, wanted.UpdatedAt,
	).Count(&count).Error
	if err != nil {
		return err
	}
	if count != 1 {
		return ErrInvocationTransitionConflict
	}
	return nil
}

func invocationCreditContextLockQuery(tx *gorm.DB, value any) *gorm.DB {
	query := tx.Model(value)
	if tx.Dialector.Name() != "sqlite" {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	return query
}

func lockedInvocationCreditContext(tx *gorm.DB, wanted model.AgentRun) (model.AgentRun, model.InvocationAttempt, error) {
	var current model.AgentRun
	query := invocationCreditContextLockQuery(tx, &model.AgentRun{}).Where("id = ? AND user_id = ? AND invocation_id = ? AND invocation_revision = ? AND invocation_attempt = ? AND status = ? AND lease_owner = ?",
		wanted.ID, wanted.UserID, wanted.InvocationID, wanted.InvocationRevision, wanted.InvocationAttempt, model.AgentRunStatusRunning, wanted.LeaseOwner).Limit(1).Find(&current)
	if query.Error != nil {
		return current, model.InvocationAttempt{}, query.Error
	}
	if query.RowsAffected != 1 || current.InvocationID == "" || current.LeaseOwner == "" {
		return current, model.InvocationAttempt{}, ErrInvocationTransitionConflict
	}
	var attempt model.InvocationAttempt
	query = invocationCreditContextLockQuery(tx, &model.InvocationAttempt{}).Where("agent_run_id = ? AND invocation_id = ? AND revision = ? AND attempt = ? AND status = ? AND finished_at = ''",
		current.ID, current.InvocationID, current.InvocationRevision, current.InvocationAttempt, string(model.AgentRunStatusRunning)).Limit(1).Find(&attempt)
	if query.Error != nil {
		return current, attempt, query.Error
	}
	if query.RowsAffected != 1 {
		return current, attempt, ErrInvocationTransitionConflict
	}
	var run model.InvocationRun
	query = invocationCreditContextLockQuery(tx, &model.InvocationRun{}).Where("id = ? AND user_id = ? AND status = ? AND latest_revision = ? AND latest_attempt = ?",
		current.InvocationID, current.UserID, model.InvocationStatusRunning, current.InvocationRevision, current.InvocationAttempt).Limit(1).Find(&run)
	if query.Error != nil {
		return current, attempt, query.Error
	}
	if query.RowsAffected != 1 {
		return current, attempt, ErrInvocationTransitionConflict
	}
	return current, attempt, nil
}

func reserveInvocationCreditsTx(tx *gorm.DB, agentRun model.AgentRun, stamp string) (int, int, error) {
	reserved, refunded, err := invocationCreditTotalsTx(tx, agentRun)
	if err != nil {
		return reserved, refunded, err
	}
	if reserved > 0 {
		if reserved != agentRun.Credits || refunded != 0 {
			return 0, 0, ErrInvocationCompletionConflict
		}
		return reserved, refunded, nil
	}
	if agentRun.Credits <= 0 {
		return reserved, refunded, nil
	}
	var user model.User
	if err := tx.Where("id = ?", agentRun.UserID).First(&user).Error; err != nil {
		return 0, 0, err
	}
	if model.IsSuperAdminRole(user.Role) {
		return 0, 0, nil
	}
	extra, _ := json.Marshal(map[string]string{"model": agentRun.Model, "path": "/agent-runs"})
	log := model.CreditLog{
		ID: invocationCreditLogID(agentRun.ID, "consume"), UserID: agentRun.UserID, Type: model.CreditLogTypeAIConsume,
		Amount: -agentRun.Credits, Balance: user.Credits - agentRun.Credits, RelatedID: agentRun.ID,
		Remark: "调用模型 " + agentRun.Model, Extra: string(extra), CreatedAt: stamp,
	}
	created := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&log)
	if created.Error != nil {
		return 0, 0, created.Error
	}
	if created.RowsAffected == 0 {
		reserved, refunded, err = invocationCreditTotalsTx(tx, agentRun)
		if err != nil || reserved != agentRun.Credits || refunded != 0 {
			return 0, 0, ErrInvocationCompletionConflict
		}
		return reserved, refunded, nil
	}
	if err := invokeRepositoryHook("credit", "consume:log"); err != nil {
		return 0, 0, err
	}
	updated := tx.Model(&model.User{}).Where("id = ? AND credits >= ?", user.ID, agentRun.Credits).
		Updates(map[string]any{"credits": gorm.Expr("credits - ?", agentRun.Credits), "updated_at": stamp})
	if updated.Error != nil {
		return 0, 0, updated.Error
	}
	if updated.RowsAffected != 1 {
		return 0, 0, errors.New("算力点不足")
	}
	if err := invokeRepositoryHook("credit", "consume:balance"); err != nil {
		return 0, 0, err
	}
	if err := tx.Where("id = ?", user.ID).First(&user).Error; err != nil {
		return 0, 0, err
	}
	if err := tx.Model(&model.CreditLog{}).Where("id = ?", log.ID).Update("balance", user.Credits).Error; err != nil {
		return 0, 0, err
	}
	return agentRun.Credits, 0, nil
}

func settleInvocationCreditsTx(tx *gorm.DB, agentRun model.AgentRun, status model.AgentRunStatus, stamp, hookKind string) (int, int, error) {
	reserved, refunded, err := invocationCreditTotalsTx(tx, agentRun)
	if err != nil {
		return 0, 0, err
	}
	if reserved > 0 && agentRun.Credits > 0 && reserved != agentRun.Credits {
		return 0, 0, ErrInvocationCompletionConflict
	}
	refundRequired := status == model.AgentRunStatusFailed || status == model.AgentRunStatusCancelled
	if !refundRequired {
		if refunded != 0 {
			return 0, 0, ErrInvocationCompletionConflict
		}
		return reserved, refunded, nil
	}
	amount := reserved - refunded
	if amount <= 0 {
		return reserved, refunded, nil
	}
	var user model.User
	if err := tx.Where("id = ?", agentRun.UserID).First(&user).Error; err != nil {
		return 0, 0, err
	}
	extra, _ := json.Marshal(map[string]string{"model": agentRun.Model, "path": "/agent-runs"})
	log := model.CreditLog{
		ID: invocationCreditLogID(agentRun.ID, "refund"), UserID: agentRun.UserID, Type: model.CreditLogTypeAIRefund,
		Amount: amount, Balance: user.Credits + amount, RelatedID: agentRun.ID,
		Remark: "模型调用失败返还 " + agentRun.Model, Extra: string(extra), CreatedAt: stamp,
	}
	created := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&log)
	if created.Error != nil {
		return 0, 0, created.Error
	}
	if created.RowsAffected == 0 {
		reserved, refunded, err = invocationCreditTotalsTx(tx, agentRun)
		if err != nil || refunded != reserved {
			return 0, 0, ErrInvocationCompletionConflict
		}
		return reserved, refunded, nil
	}
	updated := tx.Model(&model.User{}).Where("id = ?", user.ID).
		Updates(map[string]any{"credits": gorm.Expr("credits + ?", amount), "updated_at": stamp})
	if updated.Error != nil {
		return 0, 0, updated.Error
	}
	if updated.RowsAffected != 1 {
		return 0, 0, ErrInvocationTransitionConflict
	}
	if hookKind != "" {
		if err := invokeRepositoryHook(hookKind, "refund:balance"); err != nil {
			return 0, 0, err
		}
	}
	if err := tx.Where("id = ?", user.ID).First(&user).Error; err != nil {
		return 0, 0, err
	}
	if err := tx.Model(&model.CreditLog{}).Where("id = ?", log.ID).Update("balance", user.Credits).Error; err != nil {
		return 0, 0, err
	}
	if hookKind != "" {
		if err := invokeRepositoryHook(hookKind, "refund:log"); err != nil {
			return 0, 0, err
		}
	}
	return reserved, refunded + amount, nil
}

func invocationCreditTotalsTx(tx *gorm.DB, agentRun model.AgentRun) (int, int, error) {
	reserved, refunded := 0, 0
	for _, item := range []struct {
		settlement string
		logType    model.CreditLogType
	}{
		{settlement: "consume", logType: model.CreditLogTypeAIConsume},
		{settlement: "refund", logType: model.CreditLogTypeAIRefund},
	} {
		var log model.CreditLog
		query := tx.Where("id = ?", invocationCreditLogID(agentRun.ID, item.settlement)).Limit(1).Find(&log)
		if query.Error != nil {
			return 0, 0, query.Error
		}
		if query.RowsAffected == 0 {
			continue
		}
		if log.UserID != agentRun.UserID || log.RelatedID != agentRun.ID || log.Type != item.logType {
			return 0, 0, fmt.Errorf("Invocation credit settlement %s 冲突", item.settlement)
		}
		if item.logType == model.CreditLogTypeAIConsume {
			reserved = -log.Amount
		} else {
			refunded = log.Amount
		}
	}
	if reserved < 0 || refunded < 0 || refunded > reserved {
		return 0, 0, ErrInvocationCompletionConflict
	}
	return reserved, refunded, nil
}
