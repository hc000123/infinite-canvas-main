package repository

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

type aiUsageConsumeGroup struct {
	UserID          string
	UsageKey        string
	ConsumedAt      string
	ConsumedCredits int
}

type aiUsageRefundGroup struct {
	UserID          string
	RelatedID       string
	RefundedCredits int
	CreatedAt       string
}

func ListAIUsageLedger(startAt, endAt, userID string) ([]model.AIUsageLedgerRow, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var consumes []aiUsageConsumeGroup
	consumeQuery := db.Model(&model.CreditLog{}).
		Select("user_id, CASE WHEN related_id = '' THEN id ELSE related_id END AS usage_key, MIN(created_at) AS consumed_at, SUM(ABS(amount)) AS consumed_credits").
		Where("type = ?", model.CreditLogTypeAIConsume)
	if userID != "" {
		consumeQuery = consumeQuery.Where("user_id = ?", userID)
	}
	if err := consumeQuery.
		Group("user_id, CASE WHEN related_id = '' THEN id ELSE related_id END").
		Scan(&consumes).Error; err != nil {
		return nil, err
	}
	var refunds []aiUsageRefundGroup
	refundQuery := db.Model(&model.CreditLog{}).
		Select("user_id, related_id, ABS(amount) AS refunded_credits, created_at").
		Where("type = ? AND related_id <> ''", model.CreditLogTypeAIRefund)
	if userID != "" {
		refundQuery = refundQuery.Where("user_id = ?", userID)
	}
	if err := refundQuery.Scan(&refunds).Error; err != nil {
		return nil, err
	}
	consumeByUsage := make(map[string]time.Time, len(consumes))
	for _, consume := range consumes {
		consumedAt, parseErr := time.Parse(time.RFC3339, consume.ConsumedAt)
		if parseErr == nil {
			consumeByUsage[consume.UserID+"\x00"+consume.UsageKey] = consumedAt
		}
	}
	refundByUsage := make(map[string]int, len(refunds))
	for _, refund := range refunds {
		key := refund.UserID + "\x00" + refund.RelatedID
		consumedAt, ok := consumeByUsage[key]
		refundedAt, parseErr := time.Parse(time.RFC3339, refund.CreatedAt)
		if ok && parseErr == nil && !refundedAt.Before(consumedAt) {
			refundByUsage[key] += refund.RefundedCredits
		}
	}
	start, startErr := time.Parse(time.RFC3339, startAt)
	end, endErr := time.Parse(time.RFC3339, endAt)
	if startErr != nil {
		return nil, startErr
	}
	if endErr != nil {
		return nil, endErr
	}
	rows := make([]model.AIUsageLedgerRow, 0, len(consumes))
	for _, consume := range consumes {
		consumedAt, err := time.Parse(time.RFC3339, consume.ConsumedAt)
		if err != nil || consumedAt.Before(start) || !consumedAt.Before(end) {
			continue
		}
		rows = append(rows, model.AIUsageLedgerRow{
			UserID:          consume.UserID,
			UsageKey:        consume.UsageKey,
			ConsumedAt:      consume.ConsumedAt,
			ConsumedCredits: consume.ConsumedCredits,
			RefundedCredits: refundByUsage[consume.UserID+"\x00"+consume.UsageKey],
		})
	}
	return rows, nil
}

func ListAIUsage(startAt, endAt string) ([]model.AIUsageRow, error) {
	ledger, err := ListAIUsageLedger(startAt, endAt, "")
	if err != nil {
		return nil, err
	}
	rows := make([]model.AIUsageRow, 0, len(ledger))
	for _, item := range ledger {
		net := item.ConsumedCredits - item.RefundedCredits
		if net > 0 {
			rows = append(rows, model.AIUsageRow{UserID: item.UserID, NetCredits: net})
		}
	}
	return rows, nil
}
