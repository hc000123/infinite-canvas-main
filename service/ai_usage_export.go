package service

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

type aiUsageExportGranularity string

const (
	aiUsageExportOverview aiUsageExportGranularity = "overview"
	aiUsageExportDay      aiUsageExportGranularity = "day"
	aiUsageExportWeek     aiUsageExportGranularity = "week"
	aiUsageExportMonth    aiUsageExportGranularity = "month"
)

func BuildAdminAIUsageExportData(q model.AIUsageExportQuery, current time.Time) (model.AIUsageExportData, error) {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return model.AIUsageExportData{}, err
	}
	start, err := time.Parse(time.RFC3339, strings.TrimSpace(q.StartAt))
	if err != nil {
		return model.AIUsageExportData{}, safeMessageError{message: "请选择有效的开始日期"}
	}
	end, err := time.Parse(time.RFC3339, strings.TrimSpace(q.EndAt))
	if err != nil || !end.After(start) {
		return model.AIUsageExportData{}, safeMessageError{message: "结束日期必须晚于开始日期"}
	}
	if end.After(start.AddDate(1, 0, 0)) {
		return model.AIUsageExportData{}, safeMessageError{message: "单次导出范围不能超过一年"}
	}
	records, err := listAllAIUsageRecords(model.AIUsageRecordQuery{
		User: strings.TrimSpace(q.User), Model: strings.TrimSpace(q.Model),
		StartAt: start.Format(time.RFC3339), EndAt: end.Format(time.RFC3339),
	})
	if err != nil {
		return model.AIUsageExportData{}, err
	}
	if len(records) == 0 {
		return model.AIUsageExportData{}, safeMessageError{message: "当前范围暂无可导出的用量记录"}
	}
	q.StartAt, q.EndAt = start.In(location).Format(time.RFC3339), end.In(location).Format(time.RFC3339)
	return buildAIUsageExportData(records, q, current.In(location), location)
}

func buildAIUsageExportData(records []model.AIUsageRecord, q model.AIUsageExportQuery, current time.Time, location *time.Location) (model.AIUsageExportData, error) {
	data := model.AIUsageExportData{
		ExportedAt: current.Format(time.RFC3339), StartAt: q.StartAt, EndAt: q.EndAt,
		UserFilter: strings.TrimSpace(q.User), ModelFilter: strings.TrimSpace(q.Model), Records: records,
	}
	var err error
	if data.Overview, err = aggregateAIUsageExport(records, aiUsageExportOverview, location); err != nil {
		return model.AIUsageExportData{}, err
	}
	if data.Daily, err = aggregateAIUsageExport(records, aiUsageExportDay, location); err != nil {
		return model.AIUsageExportData{}, err
	}
	if data.Weekly, err = aggregateAIUsageExport(records, aiUsageExportWeek, location); err != nil {
		return model.AIUsageExportData{}, err
	}
	if data.Monthly, err = aggregateAIUsageExport(records, aiUsageExportMonth, location); err != nil {
		return model.AIUsageExportData{}, err
	}
	return data, nil
}

func aggregateAIUsageExport(records []model.AIUsageRecord, granularity aiUsageExportGranularity, location *time.Location) ([]model.AIUsageExportSummaryRow, error) {
	rows := make(map[string]*model.AIUsageExportSummaryRow)
	for _, record := range records {
		start, end := time.Time{}, time.Time{}
		if granularity != aiUsageExportOverview {
			createdAt, err := time.Parse(time.RFC3339, record.CreatedAt)
			if err != nil {
				return nil, fmt.Errorf("parse AI usage time %q: %w", record.CreatedAt, err)
			}
			start, end = aiUsageExportPeriod(createdAt.In(location), granularity)
		}
		kind, modelName := record.Kind, record.Model
		if granularity == aiUsageExportOverview {
			kind, modelName = "", ""
		}
		key := strings.Join([]string{start.Format(time.RFC3339), record.UserID, kind, modelName}, "\x00")
		row := rows[key]
		if row == nil {
			row = &model.AIUsageExportSummaryRow{
				PeriodStart: start.Format(time.RFC3339), PeriodEnd: end.Format(time.RFC3339),
				UserID: record.UserID, User: record.User, Kind: kind, Model: modelName,
			}
			rows[key] = row
		}
		row.NetCredits += record.NetCredits
		if record.Kind == "video" && record.Status == string(model.AITaskStatusSucceeded) {
			row.SuccessfulVideoCount++
			row.GeneratedSeconds += record.GeneratedSeconds
		}
	}
	result := make([]model.AIUsageExportSummaryRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, *row)
	}
	sort.Slice(result, func(i, j int) bool {
		left, right := result[i], result[j]
		if left.PeriodStart != right.PeriodStart {
			return left.PeriodStart < right.PeriodStart
		}
		leftName, rightName := aiUsageExportUserName(left), aiUsageExportUserName(right)
		if leftName != rightName {
			return leftName < rightName
		}
		if left.Kind != right.Kind {
			return left.Kind < right.Kind
		}
		return left.Model < right.Model
	})
	return result, nil
}

func aiUsageExportPeriod(value time.Time, granularity aiUsageExportGranularity) (time.Time, time.Time) {
	day := time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, value.Location())
	switch granularity {
	case aiUsageExportWeek:
		start := day.AddDate(0, 0, -((int(day.Weekday()) + 6) % 7))
		return start, start.AddDate(0, 0, 7)
	case aiUsageExportMonth:
		start := time.Date(value.Year(), value.Month(), 1, 0, 0, 0, 0, value.Location())
		return start, start.AddDate(0, 1, 0)
	default:
		return day, day.AddDate(0, 0, 1)
	}
}

func aiUsageExportUserName(row model.AIUsageExportSummaryRow) string {
	if value := strings.TrimSpace(row.User.DisplayName); value != "" {
		return value
	}
	if value := strings.TrimSpace(row.User.Username); value != "" {
		return value
	}
	return row.UserID
}
