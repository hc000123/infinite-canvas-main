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
}

func ListAIUsage(startAt, endAt string) ([]model.AIUsageRow, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var consumes []aiUsageConsumeGroup
	if err := db.Model(&model.CreditLog{}).
		Select("user_id, CASE WHEN related_id = '' THEN id ELSE related_id END AS usage_key, MIN(created_at) AS consumed_at, SUM(ABS(amount)) AS consumed_credits").
		Where("type = ?", model.CreditLogTypeAIConsume).
		Group("user_id, CASE WHEN related_id = '' THEN id ELSE related_id END").
		Scan(&consumes).Error; err != nil {
		return nil, err
	}
	var refunds []aiUsageRefundGroup
	if err := db.Model(&model.CreditLog{}).
		Select("user_id, related_id, SUM(ABS(amount)) AS refunded_credits").
		Where("type = ? AND related_id <> ''", model.CreditLogTypeAIRefund).
		Group("user_id, related_id").
		Scan(&refunds).Error; err != nil {
		return nil, err
	}
	refundByUsage := make(map[string]int, len(refunds))
	for _, refund := range refunds {
		refundByUsage[refund.UserID+"\x00"+refund.RelatedID] = refund.RefundedCredits
	}
	start, startErr := time.Parse(time.RFC3339, startAt)
	end, endErr := time.Parse(time.RFC3339, endAt)
	if startErr != nil {
		return nil, startErr
	}
	if endErr != nil {
		return nil, endErr
	}
	rows := make([]model.AIUsageRow, 0, len(consumes))
	for _, consume := range consumes {
		consumedAt, err := time.Parse(time.RFC3339, consume.ConsumedAt)
		if err != nil || consumedAt.Before(start) || !consumedAt.Before(end) {
			continue
		}
		net := consume.ConsumedCredits - refundByUsage[consume.UserID+"\x00"+consume.UsageKey]
		if net > 0 {
			rows = append(rows, model.AIUsageRow{UserID: consume.UserID, NetCredits: net})
		}
	}
	return rows, nil
}
