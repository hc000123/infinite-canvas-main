package service

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type UserActivityReport struct {
	Action        string         `json:"action"`
	TargetType    string         `json:"targetType"`
	TargetID      string         `json:"targetId"`
	TargetName    string         `json:"targetName"`
	Summary       string         `json:"summary"`
	ClientEventID string         `json:"clientEventId"`
	Metadata      map[string]any `json:"metadata"`
}
type clientActivityRule struct {
	category model.ActivityCategory
	metadata []string
}

var clientActivityRules = map[string]clientActivityRule{
	"project.created": {model.ActivityCategoryProject, []string{"projectId"}}, "project.renamed": {model.ActivityCategoryProject, []string{"projectId"}}, "project.deleted": {model.ActivityCategoryProject, []string{"projectId"}},
	"canvas.created": {model.ActivityCategoryCanvas, []string{"projectId", "canvasId"}}, "canvas.renamed": {model.ActivityCategoryCanvas, []string{"projectId", "canvasId"}}, "canvas.deleted": {model.ActivityCategoryCanvas, []string{"projectId", "canvasId"}},
	"asset.uploaded": {model.ActivityCategoryAsset, []string{"assetId", "assetType"}}, "asset.created": {model.ActivityCategoryAsset, []string{"assetId", "assetType"}}, "asset.renamed": {model.ActivityCategoryAsset, []string{"assetId"}}, "asset.deleted": {model.ActivityCategoryAsset, []string{"assetId"}},
	"transfer.import_completed": {model.ActivityCategoryTransfer, []string{"count", "format"}}, "transfer.export_completed": {model.ActivityCategoryTransfer, []string{"count", "format"}}, "transfer.download_completed": {model.ActivityCategoryTransfer, []string{"assetId", "format"}}, "account.logout": {model.ActivityCategoryAccount, nil},
}

func ReportUserActivity(ctx context.Context, report UserActivityReport) (model.UserActivityLog, error) {
	user, ok := UserFromContext(ctx)
	if !ok || user.ID == "" {
		return model.UserActivityLog{}, safeMessageError{message: "未登录"}
	}
	rule, ok := clientActivityRules[strings.TrimSpace(report.Action)]
	if !ok {
		return model.UserActivityLog{}, safeMessageError{message: "不支持的操作类型"}
	}
	if strings.TrimSpace(report.ClientEventID) == "" {
		return model.UserActivityLog{}, safeMessageError{message: "事件 ID 不能为空"}
	}
	meta := map[string]any{}
	for _, key := range rule.metadata {
		if value, exists := report.Metadata[key]; exists {
			meta[key] = value
		}
	}
	metadata, _ := json.Marshal(meta)
	requestMeta := RequestMetaFromContext(ctx)
	return repository.SaveUserActivity(model.UserActivityLog{ID: newID("activity"), UserID: user.ID, Category: rule.category, Action: model.ActivityAction(report.Action), Result: model.ActivityResultSuccess, TargetType: truncateRunes(report.TargetType, 120), TargetID: truncateRunes(report.TargetID, 120), TargetName: truncateRunes(report.TargetName, 120), Summary: truncateRunes(report.Summary, 240), IPAddress: requestMeta.IPAddress, IPAllowed: requestMeta.IPAllowed, SessionID: requestMeta.SessionID, LoginApprovalID: requestMeta.LoginApprovalID, UserAgent: truncateBytes(requestMeta.UserAgent, 512), ClientEventID: truncateRunes(report.ClientEventID, 120), Metadata: string(metadata), CreatedAt: now()})
}

func RecordServerActivity(ctx context.Context, userID string, action model.ActivityAction, result model.ActivityResult, targetType, targetID, targetName, summary string, metadata map[string]any) {
	requestMeta := RequestMetaFromContext(ctx)
	if requestMeta.IPAddress == "" {
		requestMeta.IPAllowed = true
	}
	payload, _ := json.Marshal(metadata)
	_, _ = repository.SaveUserActivity(model.UserActivityLog{ID: newID("activity"), UserID: userID, Category: categoryForActivity(action), Action: action, Result: result, TargetType: truncateRunes(targetType, 120), TargetID: truncateRunes(targetID, 120), TargetName: truncateRunes(targetName, 120), Summary: truncateRunes(summary, 240), IPAddress: requestMeta.IPAddress, IPAllowed: requestMeta.IPAllowed, SessionID: requestMeta.SessionID, LoginApprovalID: requestMeta.LoginApprovalID, UserAgent: truncateBytes(requestMeta.UserAgent, 512), Metadata: string(payload), CreatedAt: now()})
}

func ListAdminUserActivities(id string, q model.UserActivityQuery) (model.UserActivityList, error) {
	q.ExactUserID = strings.TrimSpace(id)
	items, total, err := repository.ListUserActivities(q)
	if err != nil {
		return model.UserActivityList{}, err
	}
	users, err := repository.ListUserSummariesByIDs([]string{q.ExactUserID})
	if err != nil {
		return model.UserActivityList{}, err
	}
	for i := range items {
		items[i].User = users[items[i].UserID]
	}
	return model.UserActivityList{Items: items, Total: int(total)}, nil
}

func categoryForActivity(action model.ActivityAction) model.ActivityCategory {
	value := string(action)
	switch {
	case strings.HasPrefix(value, "login."), strings.HasPrefix(value, "account."):
		return model.ActivityCategoryAccount
	case strings.HasPrefix(value, "security."):
		return model.ActivityCategorySecurity
	case strings.HasPrefix(value, "ai."):
		return model.ActivityCategoryAI
	case strings.HasPrefix(value, "credit."):
		return model.ActivityCategoryCredit
	case strings.HasPrefix(value, "project."):
		return model.ActivityCategoryProject
	case strings.HasPrefix(value, "canvas."):
		return model.ActivityCategoryCanvas
	case strings.HasPrefix(value, "asset."):
		return model.ActivityCategoryAsset
	default:
		return model.ActivityCategoryTransfer
	}
}
func truncateRunes(value string, max int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) > max {
		runes = runes[:max]
	}
	return string(runes)
}
func truncateBytes(value string, max int) string {
	value = strings.TrimSpace(value)
	for len(value) > max {
		runes := []rune(value)
		value = string(runes[:len(runes)-1])
	}
	return value
}
