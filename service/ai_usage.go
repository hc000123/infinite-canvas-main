package service

import (
	"sort"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

var aiUsagePeriods = []model.AIUsagePeriod{model.AIUsagePeriodDay, model.AIUsagePeriodWeek, model.AIUsagePeriodMonth}

func GetAdminAIUsageSummary(q model.AIUsageQuery) (model.AIUsageSummary, error) {
	return getAdminAIUsageSummaryAt(q, time.Now())
}

func getAdminAIUsageSummaryAt(q model.AIUsageQuery, current time.Time) (model.AIUsageSummary, error) {
	q.Normalize()
	result := model.AIUsageSummary{SelectedPeriod: q.Period, Page: q.Page, PageSize: q.PageSize, Users: []model.AIUsageUser{}}
	rowsByPeriod := make(map[model.AIUsagePeriod][]model.AIUsageRow, len(aiUsagePeriods))
	for _, period := range aiUsagePeriods {
		start, end, err := aiUsagePeriodRange(period, current)
		if err != nil {
			return model.AIUsageSummary{}, err
		}
		rows, err := repository.ListAIUsage(start.Format(time.RFC3339), end.Format(time.RFC3339))
		if err != nil {
			return model.AIUsageSummary{}, err
		}
		rowsByPeriod[period] = rows
		result.Periods = append(result.Periods, summarizeAIUsagePeriod(period, start, end, rows))
	}
	selectedRows := rowsByPeriod[q.Period]
	usersByID := make(map[string]*model.AIUsageUser)
	selectedTotal := 0
	for _, row := range selectedRows {
		selectedTotal += row.NetCredits
		item := usersByID[row.UserID]
		if item == nil {
			item = &model.AIUsageUser{UserID: row.UserID}
			usersByID[row.UserID] = item
		}
		item.NetCredits += row.NetCredits
		item.UsageCount++
	}
	users := make([]model.AIUsageUser, 0, len(usersByID))
	for _, item := range usersByID {
		if selectedTotal > 0 {
			item.Ratio = float64(item.NetCredits) / float64(selectedTotal)
		}
		users = append(users, *item)
	}
	sort.Slice(users, func(i, j int) bool {
		if users[i].NetCredits != users[j].NetCredits {
			return users[i].NetCredits > users[j].NetCredits
		}
		return users[i].UserID < users[j].UserID
	})
	result.UserTotal = len(users)
	startIndex := q.Offset()
	if startIndex >= len(users) {
		return result, nil
	}
	endIndex := startIndex + q.PageSize
	if endIndex > len(users) {
		endIndex = len(users)
	}
	pageUsers := users[startIndex:endIndex]
	ids := make([]string, len(pageUsers))
	for i := range pageUsers {
		ids[i] = pageUsers[i].UserID
	}
	summaries, err := repository.ListUserSummariesByIDs(ids)
	if err != nil {
		return model.AIUsageSummary{}, err
	}
	for i := range pageUsers {
		pageUsers[i].User = summaries[pageUsers[i].UserID]
	}
	result.Users = pageUsers
	return result, nil
}

func aiUsagePeriodRange(period model.AIUsagePeriod, current time.Time) (time.Time, time.Time, error) {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	local := current.In(location)
	day := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, location)
	switch period {
	case model.AIUsagePeriodDay:
		return day, day.AddDate(0, 0, 1), nil
	case model.AIUsagePeriodWeek:
		daysSinceMonday := (int(day.Weekday()) + 6) % 7
		start := day.AddDate(0, 0, -daysSinceMonday)
		return start, start.AddDate(0, 0, 7), nil
	default:
		start := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, location)
		return start, start.AddDate(0, 1, 0), nil
	}
}

func summarizeAIUsagePeriod(period model.AIUsagePeriod, start, end time.Time, rows []model.AIUsageRow) model.AIUsagePeriodSummary {
	users := map[string]struct{}{}
	result := model.AIUsagePeriodSummary{Key: period, StartAt: start.Format(time.RFC3339), EndAt: end.Format(time.RFC3339), UsageCount: len(rows)}
	for _, row := range rows {
		result.NetCredits += row.NetCredits
		users[row.UserID] = struct{}{}
	}
	result.UserCount = len(users)
	return result
}
