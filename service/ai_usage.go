package service

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

var aiUsagePeriods = []model.AIUsagePeriod{model.AIUsagePeriodDay, model.AIUsagePeriodWeek, model.AIUsagePeriodMonth}

func GetUserAIUsageSummary(userID string, q model.AIUsageQuery) (model.UserAIUsageSummary, error) {
	return getUserAIUsageSummaryAt(userID, q, time.Now())
}

func getUserAIUsageSummaryAt(userID string, q model.AIUsageQuery, current time.Time) (model.UserAIUsageSummary, error) {
	q.Normalize()
	user, ok, err := repository.GetUserByID(strings.TrimSpace(userID))
	if err != nil {
		return model.UserAIUsageSummary{}, err
	}
	if !ok {
		return model.UserAIUsageSummary{}, errors.New("用户不存在")
	}
	result := model.UserAIUsageSummary{Balance: user.Credits, SelectedPeriod: q.Period, Kinds: []model.AIUsageKindSummary{}}
	var selectedStart, selectedEnd time.Time
	for _, period := range aiUsagePeriods {
		start, end, err := aiUsagePeriodRange(period, current)
		if err != nil {
			return model.UserAIUsageSummary{}, err
		}
		rows, err := repository.ListAIUsageLedger(start.Format(time.RFC3339), end.Format(time.RFC3339), user.ID)
		if err != nil {
			return model.UserAIUsageSummary{}, err
		}
		usageRows := make([]model.AIUsageRow, 0, len(rows))
		for _, row := range rows {
			net := row.ConsumedCredits - row.RefundedCredits
			if net > 0 {
				usageRows = append(usageRows, model.AIUsageRow{UserID: row.UserID, NetCredits: net})
			}
		}
		result.Periods = append(result.Periods, summarizeAIUsagePeriod(period, start, end, usageRows))
		if period == q.Period {
			selectedStart, selectedEnd = start, end
		}
	}
	records, err := listAllAIUsageRecords(model.AIUsageRecordQuery{
		ExactUserID: user.ID,
		StartAt:     selectedStart.Format(time.RFC3339),
		EndAt:       selectedEnd.Format(time.RFC3339),
	})
	if err != nil {
		return model.UserAIUsageSummary{}, err
	}
	kinds := make(map[string]*model.AIUsageKindSummary)
	selectedTotal := 0
	for _, record := range records {
		if record.NetCredits <= 0 {
			continue
		}
		selectedTotal += record.NetCredits
		item := kinds[record.Kind]
		if item == nil {
			item = &model.AIUsageKindSummary{Kind: record.Kind}
			kinds[record.Kind] = item
		}
		item.NetCredits += record.NetCredits
		item.UsageCount++
	}
	for _, item := range kinds {
		if selectedTotal > 0 {
			item.Ratio = float64(item.NetCredits) / float64(selectedTotal)
		}
		result.Kinds = append(result.Kinds, *item)
	}
	sort.Slice(result.Kinds, func(i, j int) bool {
		if result.Kinds[i].NetCredits != result.Kinds[j].NetCredits {
			return result.Kinds[i].NetCredits > result.Kinds[j].NetCredits
		}
		return result.Kinds[i].Kind < result.Kinds[j].Kind
	})
	return result, nil
}

func ListUserAIUsageRecords(userID string, q model.AIUsageRecordQuery) (model.AIUsageRecordList, error) {
	q.ExactUserID = strings.TrimSpace(userID)
	q.User = ""
	return ListAIUsageRecords(q)
}

func listAllAIUsageRecords(q model.AIUsageRecordQuery) ([]model.AIUsageRecord, error) {
	q.Page, q.PageSize = 1, model.MaxPageSize
	first, err := ListAIUsageRecords(q)
	if err != nil {
		return nil, err
	}
	items := append([]model.AIUsageRecord(nil), first.Items...)
	for len(items) < first.Total {
		q.Page++
		page, err := ListAIUsageRecords(q)
		if err != nil {
			return nil, err
		}
		if len(page.Items) == 0 {
			break
		}
		items = append(items, page.Items...)
	}
	return items, nil
}

func ListAIUsageRecords(q model.AIUsageRecordQuery) (model.AIUsageRecordList, error) {
	q.Normalize()
	startAt, endAt := strings.TrimSpace(q.StartAt), strings.TrimSpace(q.EndAt)
	if startAt == "" || endAt == "" {
		start, end, err := aiUsagePeriodRange(q.Period, time.Now())
		if err != nil {
			return model.AIUsageRecordList{}, err
		}
		startAt, endAt = start.Format(time.RFC3339), end.Format(time.RFC3339)
	}
	ledger, err := repository.ListAIUsageLedger(startAt, endAt, strings.TrimSpace(q.ExactUserID))
	if err != nil {
		return model.AIUsageRecordList{}, err
	}
	ids := make([]string, 0, len(ledger))
	for _, item := range ledger {
		ids = append(ids, item.UsageKey)
	}
	tasks, err := repository.ListAITasksByIDs(ids)
	if err != nil {
		return model.AIUsageRecordList{}, err
	}
	runs, err := repository.ListAgentRunsByIDs(ids)
	if err != nil {
		return model.AIUsageRecordList{}, err
	}
	userSummaries := map[string]model.UserSummary{}
	if strings.TrimSpace(q.User) != "" {
		userIDs := uniqueAIUsageUserIDs(ledger)
		userSummaries, err = repository.ListUserSummariesByIDs(userIDs)
		if err != nil {
			return model.AIUsageRecordList{}, err
		}
	}
	records := make([]model.AIUsageRecord, 0, len(ledger))
	for _, item := range ledger {
		record := model.AIUsageRecord{
			ID:              item.UsageKey,
			RelatedID:       item.UsageKey,
			UserID:          item.UserID,
			SourceType:      model.AIUsageSourceUnknown,
			Kind:            "other",
			Status:          "unknown",
			Credits:         item.ConsumedCredits,
			CreditsRefunded: item.RefundedCredits,
			NetCredits:      item.ConsumedCredits - item.RefundedCredits,
			CreatedAt:       item.ConsumedAt,
		}
		if record.NetCredits < 0 {
			record.NetCredits = 0
		}
		if task, ok := tasks[item.UsageKey]; ok {
			record.SourceType = model.AIUsageSourceAITask
			record.Kind = task.Kind
			record.Model = task.Model
			record.Status = string(task.Status)
			record.Provider = task.Provider
			record.UpstreamTaskID = task.UpstreamTaskID
			record.ErrorMessage = task.ErrorMessage
			if task.Kind == "video" && task.Status == model.AITaskStatusSucceeded {
				record.GeneratedSeconds = max(0, task.GeneratedSeconds)
				if record.GeneratedSeconds == 0 {
					record.DurationIssue = "missing_duration"
				}
			}
			_ = json.Unmarshal([]byte(task.FrontendTraceJSON), &record.FrontendTrace)
		} else if run, ok := runs[item.UsageKey]; ok {
			record.SourceType = model.AIUsageSourceAgentRun
			record.Kind = "agent"
			record.Model = run.Model
			record.Status = string(run.Status)
			record.Provider = run.Provider
			record.ErrorMessage = run.ErrorMessage
		}
		if matchesAIUsageRecord(record, userSummaries[item.UserID], q) {
			records = append(records, record)
		}
	}
	sort.Slice(records, func(i, j int) bool {
		if records[i].CreatedAt != records[j].CreatedAt {
			return records[i].CreatedAt > records[j].CreatedAt
		}
		return records[i].ID < records[j].ID
	})
	result := model.AIUsageRecordList{Items: []model.AIUsageRecord{}, Total: len(records), Page: q.Page, PageSize: q.PageSize}
	startIndex := q.Offset()
	if startIndex >= len(records) {
		return result, nil
	}
	endIndex := startIndex + q.PageSize
	if endIndex > len(records) {
		endIndex = len(records)
	}
	result.Items = records[startIndex:endIndex]
	pageUsers, err := repository.ListUserSummariesByIDs(aiUsageRecordUserIDs(result.Items))
	if err != nil {
		return model.AIUsageRecordList{}, err
	}
	for i := range result.Items {
		result.Items[i].User = pageUsers[result.Items[i].UserID]
	}
	return result, nil
}

func uniqueAIUsageUserIDs(rows []model.AIUsageLedgerRow) []string {
	seen := make(map[string]struct{}, len(rows))
	result := make([]string, 0, len(rows))
	for _, row := range rows {
		if _, ok := seen[row.UserID]; ok {
			continue
		}
		seen[row.UserID] = struct{}{}
		result = append(result, row.UserID)
	}
	return result
}

func aiUsageRecordUserIDs(records []model.AIUsageRecord) []string {
	rows := make([]model.AIUsageLedgerRow, len(records))
	for i, record := range records {
		rows[i].UserID = record.UserID
	}
	return uniqueAIUsageUserIDs(rows)
}

func matchesAIUsageRecord(record model.AIUsageRecord, user model.UserSummary, q model.AIUsageRecordQuery) bool {
	if value := strings.TrimSpace(q.Kind); value != "" && record.Kind != value {
		return false
	}
	if value := strings.TrimSpace(q.Model); value != "" && record.Model != value {
		return false
	}
	if value := strings.TrimSpace(q.Status); value != "" && record.Status != value {
		return false
	}
	if value := strings.ToLower(strings.TrimSpace(q.User)); value != "" {
		return strings.Contains(strings.ToLower(record.UserID), value) ||
			strings.Contains(strings.ToLower(user.Username), value) ||
			strings.Contains(strings.ToLower(user.DisplayName), value)
	}
	return true
}

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
